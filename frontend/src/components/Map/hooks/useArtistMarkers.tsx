import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl from 'maplibre-gl';
import Supercluster from 'supercluster';
import ArtistCard from '../../ArtistCard';
import { CLUSTER_CONFIG } from '../../../constants/mapCluster';
import type { Artist, LocationLanguage, LocationView } from '../../../types/artist';
import { makeArtistPoint, getSuperclusterZoom, isClusterFeature } from '../clusters/clusterIndex';
import { createArtistMarkerElement, preloadArtistMarkerImages } from '../markers/artistMarker';
import { createClusterMarkerElement, getClusterVisualRadius } from '../markers/clusterMarker';
import type {
    ArtistPointProperties,
    ClusterFeature,
    ClusterPoint,
    ClusterProperties,
    ExpandedClusterState,
    MarkerEntry,
    ArtistPopupLifecycleState,
} from '../types';

const markerMoveDuration = 260;
const mergedClusterAppearDelay = markerMoveDuration;
const markerMoveLinkMaxDistance = 360;
const clusterCollapseAfterPopupCloseGraceMs = 800;

const markerAnimations = new WeakMap<maplibregl.Marker, number>();

const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);
// Use the shortest path when longitude crosses the dateline
const getWrappedLngDelta = (from: number, to: number) => ((((to - from) + 540) % 360) - 180);

const getMarkerCoordinates = (marker: maplibregl.Marker): [number, number] => {
    const lngLat = marker.getLngLat();
    return [lngLat.lng, lngLat.lat];
};

const replaceMarkerElementContents = (target: HTMLElement, source: HTMLElement) => {
    target.setAttribute('aria-label', source.getAttribute('aria-label') ?? '');
    target.style.width = source.style.width;
    target.style.height = source.style.height;
    target.replaceChildren(...Array.from(source.childNodes));
};

const setClusterElementExpandedHidden = (element: HTMLElement, hidden: boolean) => {
    // MapLibre marker updates can rewrite opacity
    element.style.opacity = hidden ? '0' : '1';
    element.style.visibility = hidden ? 'hidden' : '';
    element.style.pointerEvents = hidden ? 'none' : '';
};

const bindClusterClick = (
    element: HTMLElement,
    feature: ClusterPoint,
    expandCluster: (feature: ClusterPoint, sourceElement?: HTMLElement) => void
) => {
    element.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();

        if (element.style.pointerEvents === 'none') return;
        expandCluster(feature, element);
    };
};

const getClusterLeafKey = (leaves: GeoJSON.Feature<GeoJSON.Point, ArtistPointProperties>[]) => (
    leaves
        .map((leaf) => leaf.properties.artistId)
        .sort()
        .join('|')
);

// Include only fields that change Supercluster output
const getArtistIndexSignature = (artists: Artist[], view: LocationView) => (
    `${view}|${artists.map((artist) => {
        const active = artist.activeLocation.coordinates;
        const original = artist.originalLocation.coordinates;
        return [
            artist.id,
            active.lat,
            active.lng,
            original.lat,
            original.lng,
            artist.updatedAt ? new Date(artist.updatedAt).getTime() : '',
        ].join(':');
    }).join('|')}`
);

interface UseArtistMarkersOptions {
    mapRef: RefObject<maplibregl.Map | null>;
    mapReady: boolean;
    displayArtists: Artist[];
    view: LocationView;
    locationLanguage: LocationLanguage;
    selectedCityIdRef: RefObject<string | null>;
    setSelectedCityId: Dispatch<SetStateAction<string | null>>;
    onEditArtist?: (artist: Artist) => void;
    onDeleteArtist?: (artist: Artist) => void;
    onArtistPopupOpenChange?: (open: boolean) => void;
    artistPopupLifecycleRef?: RefObject<ArtistPopupLifecycleState>;
}

export const useArtistMarkers = ({
    mapRef,
    mapReady,
    displayArtists,
    view,
    locationLanguage,
    selectedCityIdRef,
    setSelectedCityId,
    onEditArtist,
    onDeleteArtist,
    onArtistPopupOpenChange,
    artistPopupLifecycleRef,
}: UseArtistMarkersOptions) => {
    // Marker sets owned by this hook
    const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
    const expandedRef = useRef<Map<string, ExpandedClusterState>>(new Map());
    const collapsingClusterHidesRef = useRef<Map<string, Pick<ExpandedClusterState, 'hiddenClusterKey' | 'hiddenClusterLeafKey'>>>(new Map());
    const visibleClustersRef = useRef<ClusterPoint[]>([]);

    // Current map data and popup handles
    const clusterIndexRef = useRef<Supercluster<ArtistPointProperties, ClusterProperties> | null>(null);
    const artistsByIdRef = useRef<Map<string, Artist>>(new Map());
    const activePopupRef = useRef<maplibregl.Popup | null>(null);

    // Previous render state used to compare map changes
    const lastClusterZoomRef = useRef<number | null>(null);
    const lastMapZoomRef = useRef<number | null>(null);
    const clusterIndexSignatureRef = useRef<string | null>(null);

    // Merge timing and delayed cluster inserts
    const mergeHoldUntilRef = useRef(0);
    const mergeHoldTokenRef = useRef(0);
    const mergeHoldTargetKeysRef = useRef<Set<string>>(new Set());
    const pendingMergeTimersRef = useRef<Set<number>>(new Set());
    const clusterTransitionUntilRef = useRef(0);
    const [hasExpandedClusters, setHasExpandedClusters] = useState(false);

    const clearPendingMergeTimers = useCallback(() => {
        pendingMergeTimersRef.current.forEach((timer) => window.clearTimeout(timer));
        pendingMergeTimersRef.current.clear();
    }, []);

    const findNearestPosition = useCallback((
        target: [number, number],
        positions: [number, number][],
        maxPixelDistance = Infinity
    ): [number, number] | null => {
        const map = mapRef.current;
        if (!map || positions.length === 0) return null;

        const targetPixel = map.project(target);
        let nearest = positions[0];
        let nearestDistance = Infinity;

        positions.forEach((position) => {
            const pixel = map.project(position);
            const distance = (pixel.x - targetPixel.x) ** 2 + (pixel.y - targetPixel.y) ** 2;
            if (distance < nearestDistance) {
                nearest = position;
                nearestDistance = distance;
            }
        });

        return nearestDistance <= maxPixelDistance ** 2 ? nearest : null;
    }, [mapRef]);

    const animateMarkerTo = useCallback((
        marker: maplibregl.Marker,
        target: [number, number],
        onDone?: () => void
    ) => {
        const map = mapRef.current;
        if (!map) {
            // Finish immediately after map cleanup
            marker.setLngLat(target);
            onDone?.();
            return;
        }

        // One active animation per marker
        const previousFrame = markerAnimations.get(marker);
        if (previousFrame !== undefined) {
            window.cancelAnimationFrame(previousFrame);
        }

        // Longitude may wrap around the dateline
        const start = getMarkerCoordinates(marker);
        const lngDelta = getWrappedLngDelta(start[0], target[0]);
        const latDelta = target[1] - start[1];
        const startedAt = performance.now();

        const tick = (now: number) => {
            const progress = Math.min(1, (now - startedAt) / markerMoveDuration);
            const eased = easeOutCubic(progress);
            marker.setLngLat([
                start[0] + lngDelta * eased,
                start[1] + latDelta * eased,
            ]);

            if (progress < 1) {
                markerAnimations.set(marker, window.requestAnimationFrame(tick));
                return;
            }

            // End on the exact target coordinate
            markerAnimations.delete(marker);
            marker.setLngLat(target);
            onDone?.();
        };

        markerAnimations.set(marker, window.requestAnimationFrame(tick));
    }, [mapRef]);

    const animateLineSource = useCallback((
        sourceId: string,
        from: GeoJSON.FeatureCollection<GeoJSON.LineString>,
        to: GeoJSON.FeatureCollection<GeoJSON.LineString>
    ) => {
        const map = mapRef.current;
        // Each source line needs a matching target line
        if (!map || from.features.length !== to.features.length) return;

        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        if (!source) return;

        const startedAt = performance.now();
        const tick = (now: number) => {
            // Move all connector endpoints on the same clock
            const progress = Math.min(1, (now - startedAt) / markerMoveDuration);
            const eased = easeOutCubic(progress);

            source.setData({
                type: 'FeatureCollection',
                features: from.features.map((feature, index) => {
                    const targetFeature = to.features[index];
                    const [fromStart, fromEnd] = feature.geometry.coordinates;
                    const [toStart, toEnd] = targetFeature.geometry.coordinates;
                    const mix = (fromCoord: number, toCoord: number) => fromCoord + (toCoord - fromCoord) * eased;

                    return {
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: [
                                [mix(fromStart[0], toStart[0]), mix(fromStart[1], toStart[1])],
                                [mix(fromEnd[0], toEnd[0]), mix(fromEnd[1], toEnd[1])],
                            ],
                        },
                        properties: {},
                    };
                }),
            });

            if (progress < 1) {
                window.requestAnimationFrame(tick);
            }
        };

        window.requestAnimationFrame(tick);
    }, [mapRef]);

    // Marker callbacks read the latest artist records
    useEffect(() => {
        artistsByIdRef.current = new Map(displayArtists.map((artist) => [artist.id, artist]));
        preloadArtistMarkerImages(displayArtists);
    }, [displayArtists]);

    const removeMarkerEntry = useCallback((entry: MarkerEntry, destination?: [number, number], onDone?: () => void) => {
        // Active popup can outlive its marker while panning
        if (entry.popup && entry.popup !== activePopupRef.current) {
            entry.popup.remove();
        }
        if (destination) {
            entry.marker.getElement().style.pointerEvents = 'none';
            animateMarkerTo(entry.marker, destination, () => {
                entry.marker.remove();
                onDone?.();
            });
            return;
        }

        const previousFrame = markerAnimations.get(entry.marker);
        if (previousFrame !== undefined) {
            window.cancelAnimationFrame(previousFrame);
            markerAnimations.delete(entry.marker);
        }
        entry.marker.remove();
        onDone?.();
    }, [animateMarkerTo]);

    const clearMarkers = useCallback(() => {
        clearPendingMergeTimers();
        mergeHoldUntilRef.current = 0;
        mergeHoldTokenRef.current += 1;
        mergeHoldTargetKeysRef.current.clear();
        markersRef.current.forEach((entry) => removeMarkerEntry(entry));
        markersRef.current.clear();
        collapsingClusterHidesRef.current.clear();
    }, [clearPendingMergeTimers, removeMarkerEntry]);

    const setArtistPopupLifecycle = useCallback((open: boolean) => {
        if (artistPopupLifecycleRef?.current) {
            // Close time protects cluster expansion during popup rebuilds
            artistPopupLifecycleRef.current.open = open;
            artistPopupLifecycleRef.current.closedAt = open ? 0 : performance.now();
        }
        onArtistPopupOpenChange?.(open);
    }, [artistPopupLifecycleRef, onArtistPopupOpenChange]);

    const closeActiveArtistPopup = useCallback(() => {
        if (activePopupRef.current) {
            activePopupRef.current.remove();
            return;
        }

        // MapLibre can leave popup DOM after ref changes
        const popupElements = mapRef.current?.getContainer().querySelectorAll('.artist-popup');
        if (!popupElements?.length) return;

        popupElements.forEach((element) => element.remove());
        setArtistPopupLifecycle(false);
    }, [mapRef, setArtistPopupLifecycle]);

    const isClusterSourceHidden = useCallback((key: string, leafKey: string) => {
        // Supercluster ids can change while leaf membership stays the same
        const matches = (state: Pick<ExpandedClusterState, 'hiddenClusterKey' | 'hiddenClusterLeafKey'>) => (
            state.hiddenClusterKey === key || state.hiddenClusterLeafKey === leafKey
        );

        return Array.from(expandedRef.current.values()).some(matches)
            || Array.from(collapsingClusterHidesRef.current.values()).some(matches);
    }, []);

    // Keep expanded clusters during popup close and marker rebuild overlap
    const shouldKeepExpandedClusters = useCallback(() => (
        !!artistPopupLifecycleRef?.current?.open
        || (
            !!artistPopupLifecycleRef?.current?.closedAt
            && performance.now() - artistPopupLifecycleRef.current.closedAt < clusterCollapseAfterPopupCloseGraceMs
        )
    ), [artistPopupLifecycleRef]);

    // Remove expanded-cluster markers and connector lines
    const removeExpandedClusterArtifacts = useCallback((animate = true) => {
        const map = mapRef.current;
        if (!map) return;

        // Expanded markers are not part of the normal marker map
        expandedRef.current.forEach((state, clusterKey) => {
            collapsingClusterHidesRef.current.set(clusterKey, {
                hiddenClusterKey: state.hiddenClusterKey,
                hiddenClusterLeafKey: state.hiddenClusterLeafKey,
            });
            let remainingMarkers = state.markers.length;
            const restoreHiddenCluster = () => {
                collapsingClusterHidesRef.current.delete(clusterKey);
                markersRef.current.forEach((entry, key) => {
                    if (entry.kind !== 'cluster') return;
                    if (key !== state.hiddenClusterKey && entry.leafKey !== state.hiddenClusterLeafKey) return;
                    setClusterElementExpandedHidden(entry.marker.getElement(), false);
                });
            };

            if (remainingMarkers === 0) {
                restoreHiddenCluster();
            }
            state.markers.forEach((marker) => {
                marker.getElement().style.pointerEvents = 'none';
                if (!animate) {
                    // Zoom cleanup removes expanded markers immediately
                    marker.remove();
                    remainingMarkers -= 1;
                    if (remainingMarkers === 0) {
                        restoreHiddenCluster();
                    }
                    return;
                }
                animateMarkerTo(marker, state.clusterCenter, () => {
                    marker.remove();
                    remainingMarkers -= 1;
                    if (remainingMarkers === 0) {
                        restoreHiddenCluster();
                    }
                });
            });
            if (map.getLayer(state.layerId)) map.removeLayer(state.layerId);
            if (map.getSource(state.sourceId)) map.removeSource(state.sourceId);
        });
        expandedRef.current.clear();
    }, [animateMarkerTo, mapRef]);

    const collapseExpandedClusters = useCallback((animate = true) => {
        removeExpandedClusterArtifacts(animate);
        setHasExpandedClusters(false);
    }, [removeExpandedClusterArtifacts]);

    // Show ArtistCard in a MapLibre popup
    const openArtistPopup = useCallback((artist: Artist, marker: maplibregl.Marker) => {
        const map = mapRef.current;
        if (!map) return;

        setArtistPopupLifecycle(true);
        activePopupRef.current?.remove();
        activePopupRef.current = null;
        markersRef.current.forEach((entry) => entry.marker.getElement().classList.remove('marker-focused'));

        const popupContainer = document.createElement('div');
        const root = createRoot(popupContainer);
        const showActions = !!(onEditArtist || onDeleteArtist);
        // React renders the content, MapLibre places the popup
        root.render(
            <ArtistCard artist={artist} showActions={showActions} locationLanguage={locationLanguage} />
        );

        const popup = new maplibregl.Popup({
            closeButton: false,
            // MapView handles outside clicks together with cluster state
            closeOnClick: false,
            className: 'artist-popup',
            maxWidth: '320px',
            offset: 18,
        })
            .setDOMContent(popupContainer)
            .setLngLat(marker.getLngLat())
            .addTo(map);
        activePopupRef.current = popup;

        marker.getElement().classList.add('marker-focused');
        setSelectedCityId(view === 'active' ? artist.activeCityId : artist.originalCityId);

        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            const editButton = target.closest('[data-action="edit"]');
            const deleteButton = target.closest('[data-action="delete"]');

            if (editButton && onEditArtist) {
                event.preventDefault();
                event.stopPropagation();
                popup.remove();
                onEditArtist(artist);
            } else if (deleteButton && onDeleteArtist) {
                event.preventDefault();
                event.stopPropagation();
                onDeleteArtist(artist);
            }
        };

        popupContainer.addEventListener('click', handleClick);
        popup.on('close', () => {
            // Remove listeners and React state owned by this popup
            popupContainer.removeEventListener('click', handleClick);
            marker.getElement().classList.remove('marker-focused');
            root.unmount();
            markersRef.current.forEach((entry) => {
                if (entry.popup === popup) {
                    entry.popup = undefined;
                    entry.root = undefined;
                }
            });
            if (activePopupRef.current === popup) {
                activePopupRef.current = null;
            }
            setArtistPopupLifecycle(false);
            setSelectedCityId((current) => current === selectedCityIdRef.current ? null : current);
        });

        const key = `artist-${artist.id}`;
        const entry = markersRef.current.get(key);
        if (entry) {
            // Replace the previous popup handle for this marker
            entry.popup?.remove();
            entry.root?.unmount();
            entry.popup = popup;
            entry.root = root;
        }
    }, [locationLanguage, mapRef, onDeleteArtist, onEditArtist, selectedCityIdRef, setArtistPopupLifecycle, setSelectedCityId, view]);

    // Open a cluster into separate artist markers
    const expandCluster = useCallback((feature: ClusterPoint, sourceElement?: HTMLElement) => {
        const map = mapRef.current;
        const index = clusterIndexRef.current;
        if (!map || !index) return;

        const clusterId = feature.properties.cluster_id;
        const clusterKey = `expanded-${clusterId}`;

        if (expandedRef.current.has(clusterKey)) {
            collapseExpandedClusters();
            return;
        }

        const leaves = index.getLeaves(clusterId, Infinity);
        const expandedLeafKey = getClusterLeafKey(leaves);
        const clusterMarkerKey = `cluster-${clusterId}`;
        // Ignore clicks while zoom or merge work is still changing markers
        if (map.isZooming() || clusterTransitionUntilRef.current > performance.now()) {
            return;
        }

        // Manual expansion cancels delayed merge work
        mergeHoldUntilRef.current = 0;
        mergeHoldTokenRef.current += 1;
        mergeHoldTargetKeysRef.current.clear();
        clearPendingMergeTimers();
        clusterTransitionUntilRef.current = 0;

        if (sourceElement) {
            setClusterElementExpandedHidden(sourceElement, true);
        }
        // Hide rendered clusters that represent the same leaves
        markersRef.current.forEach((entry, key) => {
            if (entry.kind !== 'cluster') return;
            if (key !== clusterMarkerKey && entry.leafKey !== expandedLeafKey) return;
            setClusterElementExpandedHidden(entry.marker.getElement(), true);
        });

        const [clusterLng, clusterLat] = feature.geometry.coordinates;
        const clusterCenter: [number, number] = [clusterLng, clusterLat];
        const clusterPixel = map.project([clusterLng, clusterLat]);
        // Space expanded markers in screen pixels
        const rawOffsets = leaves.map((leaf) => {
            const [lng, lat] = leaf.geometry.coordinates;
            const pixel = map.project([lng, lat]);
            return { x: pixel.x - clusterPixel.x, y: pixel.y - clusterPixel.y };
        });

        const markerSpacing = CLUSTER_CONFIG.gridSpacing;
        const positions = rawOffsets.map((offset) => ({ ...offset }));

        // Separate markers that would overlap on screen
        for (let pass = 0; pass < 10; pass++) {
            for (let i = 0; i < positions.length; i++) {
                for (let j = 0; j < positions.length; j++) {
                    if (i === j) continue;
                    const dx = positions[i].x - positions[j].x;
                    const dy = positions[i].y - positions[j].y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < markerSpacing && dist > 0) {
                        const push = (markerSpacing - dist) / 2 + 2;
                        positions[i].x += (dx / dist) * push;
                        positions[i].y += (dy / dist) * push;
                    } else if (dist === 0) {
                        const angle = Math.random() * Math.PI * 2;
                        positions[i].x += Math.cos(angle) * markerSpacing / 2;
                        positions[i].y += Math.sin(angle) * markerSpacing / 2;
                    }
                }
            }
        }

        // Expanded marker and connector collections
        const lines: GeoJSON.Feature<GeoJSON.LineString>[] = [];
        const collapsedLines: GeoJSON.Feature<GeoJSON.LineString>[] = [];
        const expandedMarkers: maplibregl.Marker[] = [];

        // Build markers and connector lines in the same order
        leaves.forEach((leaf, index) => {
            const artist = artistsByIdRef.current.get(leaf.properties.artistId);
            if (!artist) return;

            // Convert screen position back to map coordinates
            const position = positions[index];
            const expandedLngLat = map.unproject([clusterPixel.x + position.x, clusterPixel.y + position.y]);
            const originalLngLat = leaf.geometry.coordinates as [number, number];

            // Start at the cluster center before moving outward
            const marker = new maplibregl.Marker({
                element: createArtistMarkerElement(artist),
                anchor: 'center',
            })
                .setLngLat(clusterCenter)
                .addTo(map);

            marker.getElement().classList.add('expanded-cluster-marker');
            animateMarkerTo(marker, [expandedLngLat.lng, expandedLngLat.lat]);
            marker.getElement().addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                openArtistPopup(artist, marker);
            });

            // Expanded line connects the display marker to the real location
            lines.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [[expandedLngLat.lng, expandedLngLat.lat], originalLngLat],
                },
                properties: {},
            });
            // Collapsed line starts from the cluster center
            collapsedLines.push({
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: [clusterCenter, originalLngLat],
                },
                properties: {},
            });
            expandedMarkers.push(marker);
        });

        const sourceId = `expanded-cluster-lines-${clusterId}`;
        const layerId = `expanded-cluster-lines-${clusterId}`;
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
        // Draw connector lines from the collapsed state first
        map.addSource(sourceId, {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: collapsedLines,
            },
        });
        map.addLayer({
            id: layerId,
            type: 'line',
            source: sourceId,
            paint: {
                'line-color': '#666',
                'line-width': 1.5,
                'line-opacity': 0.7,
                'line-dasharray': [2, 2],
            },
        });
        const collapsedLineCollection: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
            type: 'FeatureCollection',
            features: collapsedLines,
        };
        const expandedLineCollection: GeoJSON.FeatureCollection<GeoJSON.LineString> = {
            type: 'FeatureCollection',
            features: lines,
        };
        animateLineSource(sourceId, collapsedLineCollection, expandedLineCollection);

        expandedRef.current.set(clusterKey, {
            markers: expandedMarkers,
            sourceId,
            layerId,
            hiddenClusterKey: clusterMarkerKey,
            hiddenClusterLeafKey: expandedLeafKey,
            clusterCenter,
        });
        setHasExpandedClusters(true);
    }, [animateLineSource, animateMarkerTo, clearPendingMergeTimers, collapseExpandedClusters, mapRef, openArtistPopup]);

    // Sync visible Supercluster features with DOM markers
    const renderVisibleMarkers = useCallback(() => {
        const map = mapRef.current;
        const index = clusterIndexRef.current;
        if (!map || !index || !mapReady) return;

        // Query only the visible map bounds
        const bounds = map.getBounds();
        const mapZoom = map.getZoom();
        const zoom = getSuperclusterZoom(mapZoom);
        const clusters = index.getClusters(
            [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()],
            zoom
        ) as ClusterFeature[];

        // Counts and zooms from the previous render
        const nextMarkerKeys = new Set<string>();
        const previousMarkerCount = markersRef.current.size;
        const nextMarkerCount = clusters.length;
        const previousClusterZoom = lastClusterZoomRef.current;
        const previousMapZoom = lastMapZoomRef.current;

        // Compare Supercluster zoom and MapLibre zoom separately
        const isZoomSplit = previousClusterZoom !== null && zoom > previousClusterZoom;
        const isZoomMerge = previousClusterZoom !== null && zoom < previousClusterZoom;
        const isMapZoomIn = previousMapZoom !== null && mapZoom > previousMapZoom + 0.01;
        const isMapZoomChange = previousMapZoom !== null && Math.abs(mapZoom - previousMapZoom) > 0.01;
        lastClusterZoomRef.current = zoom;
        lastMapZoomRef.current = mapZoom;

        // Transition timing for split and merge animations
        const now = performance.now();
        const hasActiveMergeHold = mergeHoldUntilRef.current > now;

        // Only zoom changes link old marker positions to new ones
        const isMergeStart = isZoomMerge || (isMapZoomChange && nextMarkerCount < previousMarkerCount);
        const isSplit = !hasActiveMergeHold && (isMapZoomIn || isZoomSplit || (isMapZoomChange && nextMarkerCount > previousMarkerCount));
        const isMerge = hasActiveMergeHold || isMergeStart;
        const shouldLinkMarkerMotion = isSplit || isMerge;
        if (shouldLinkMarkerMotion) {
            clusterTransitionUntilRef.current = Math.max(clusterTransitionUntilRef.current, now + markerMoveDuration);
        } else if (clusterTransitionUntilRef.current < now) {
            clusterTransitionUntilRef.current = 0;
        }

        if (isSplit) {
            mergeHoldUntilRef.current = 0;
            mergeHoldTokenRef.current += 1;
            mergeHoldTargetKeysRef.current.clear();
        } else if (isMergeStart) {
            // Wait before showing clusters created by a merge
            mergeHoldUntilRef.current = Math.max(mergeHoldUntilRef.current, now + mergedClusterAppearDelay);
            mergeHoldTokenRef.current += 1;
        }

        const shouldDelayMergedClusters = mergeHoldUntilRef.current > now;
        if (!shouldDelayMergedClusters) {
            mergeHoldTargetKeysRef.current.clear();
        }

        // Clusters waiting for merge animation to finish
        const pendingMergeAdds: Array<{
            key: string;
            element: HTMLElement;
            center: [number, number];
            feature: ClusterPoint;
            leafKey: string;
            token: number;
        }> = [];
        let pendingMergeRemovalCount = 0;
        let pendingMergeFinalized = false;
        let pendingMergeTimer: number | null = null;
        const addPendingMergedClusters = () => {
            // Outgoing markers must finish moving first
            if (pendingMergeFinalized || pendingMergeRemovalCount > 0) return;

            // Merge hold keeps the new cluster hidden briefly
            const remainingHold = mergeHoldUntilRef.current - performance.now();
            if (remainingHold > 0) {
                if (pendingMergeTimer === null) {
                    pendingMergeTimer = window.setTimeout(() => {
                        pendingMergeTimersRef.current.delete(pendingMergeTimer!);
                        pendingMergeTimer = null;
                        addPendingMergedClusters();
                    }, remainingHold);
                    pendingMergeTimersRef.current.add(pendingMergeTimer);
                }
                return;
            }

            // Ignore inserts from older merge cycles
            pendingMergeFinalized = true;
            pendingMergeAdds.forEach(({ key, element, center, feature, leafKey, token }) => {
                if (mergeHoldTokenRef.current !== token || markersRef.current.has(key)) {
                    return;
                }
                bindClusterClick(element, feature, expandCluster);
                const marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(center).addTo(map);
                setClusterElementExpandedHidden(element, isClusterSourceHidden(key, leafKey));
                markersRef.current.set(key, { marker, kind: 'cluster', leafKey });
                mergeHoldTargetKeysRef.current.delete(key);
            });
        };
        // Count removals that a delayed cluster is waiting on
        const trackMergeRemoval = (remove: (onDone: () => void) => void) => {
            pendingMergeRemovalCount += 1;
            remove(() => {
                pendingMergeRemovalCount -= 1;
                addPendingMergedClusters();
            });
        };
        const isInsideCurrentBounds = (position: [number, number]) => bounds.contains(position);

        // Coordinates used to choose animation start and end points
        const previousPositions = Array.from(markersRef.current.values())
            .map((entry) => getMarkerCoordinates(entry.marker))
            .filter(isInsideCurrentBounds);
        const nextPositions = new Map<string, [number, number]>();

        // Split renders artists directly, so old cluster markers are removed
        if (isSplit) {
            markersRef.current.forEach((entry, key) => {
                if (entry.kind !== 'cluster') return;
                removeMarkerEntry(entry);
                markersRef.current.delete(key);
            });
        }

        const visibleClusters = clusters.filter((feature): feature is ClusterPoint => !!feature.properties.cluster);
        const clusterRadii = new Map<number, number>();
        const clusterPixels = new Map<number, ReturnType<maplibregl.Map['project']>>();

        // Measure cluster sizes before applying collision limits
        visibleClusters.forEach((cluster) => {
            const clusterId = cluster.properties.cluster_id;
            const radius = getClusterVisualRadius(cluster, index, map);
            clusterRadii.set(clusterId, radius);
            clusterPixels.set(clusterId, map.project(cluster.geometry.coordinates as [number, number]));
        });

        // Reduce cluster sizes that would overlap on screen
        visibleClusters.forEach((cluster) => {
            const clusterId = cluster.properties.cluster_id;
            const clusterPixel = clusterPixels.get(clusterId);
            const ownRadius = clusterRadii.get(clusterId) ?? CLUSTER_CONFIG.minClusterSize / 2;
            if (!clusterPixel) return;

            let cappedRadius = ownRadius;
            clusterRadii.forEach((otherRadius, otherClusterId) => {
                if (otherClusterId === clusterId) return;
                const otherPixel = clusterPixels.get(otherClusterId);
                if (!otherPixel) return;

                const distance = Math.sqrt(
                    (clusterPixel.x - otherPixel.x) ** 2
                    + (clusterPixel.y - otherPixel.y) ** 2
                );
                cappedRadius = Math.min(
                    cappedRadius,
                    Math.max(CLUSTER_CONFIG.minClusterSize / 2, distance - otherRadius - 4)
                );
            });
            clusterRadii.set(clusterId, cappedRadius);
        });

        visibleClustersRef.current = visibleClusters;
        // Store next marker positions before removing stale markers
        clusters.forEach((feature) => {
            const [lng, lat] = feature.geometry.coordinates;
            const key = isClusterFeature(feature)
                ? `cluster-${feature.properties.cluster_id}`
                : `artist-${feature.properties.artistId}`;
            nextPositions.set(key, [lng, lat]);
        });

        const mergeTargetKeys = new Set<string>();
        const staleMarkerDestinations = new Map<string, [number, number]>();
        if (shouldDelayMergedClusters) {
            // Send outgoing markers toward the nearest incoming cluster
            markersRef.current.forEach((entry, key) => {
                if (nextPositions.has(key)) return;
                const currentPosition = getMarkerCoordinates(entry.marker);
                if (!isInsideCurrentBounds(currentPosition)) return;

                let nearestKey: string | null = null;
                let nearestPosition: [number, number] | null = null;
                let nearestDistance = Infinity;
                const currentPixel = map.project(currentPosition);

                nextPositions.forEach((position, nextKey) => {
                    if (!nextKey.startsWith('cluster-')) return;
                    const pixel = map.project(position);
                    const distance = (pixel.x - currentPixel.x) ** 2 + (pixel.y - currentPixel.y) ** 2;
                    if (distance < nearestDistance) {
                        nearestKey = nextKey;
                        nearestPosition = position;
                        nearestDistance = distance;
                    }
                });

                if (!nearestKey || !nearestPosition || nearestDistance > markerMoveLinkMaxDistance ** 2) return;
                mergeTargetKeys.add(nearestKey);
                mergeHoldTargetKeysRef.current.add(nearestKey);
                staleMarkerDestinations.set(key, nearestPosition);
            });
        }

        clusters.forEach((feature) => {
            const [lng, lat] = feature.geometry.coordinates;

            if (isClusterFeature(feature)) {
                // Load images for artists inside this cluster
                const { element, center } = createClusterMarkerElement(
                    feature,
                    index,
                    map,
                    clusterRadii.get(feature.properties.cluster_id)
                );
                const leaves = index.getLeaves(feature.properties.cluster_id, Infinity);
                const clusterArtists = leaves
                    .map((leaf) => artistsByIdRef.current.get(leaf.properties.artistId))
                    .filter((artist): artist is Artist => !!artist);
                preloadArtistMarkerImages(clusterArtists);
                const key = `cluster-${feature.properties.cluster_id}`;
                const existingEntry = markersRef.current.get(key);
                const leafKey = getClusterLeafKey(leaves);
                const canReuseClusterEntry = existingEntry?.kind === 'cluster' && existingEntry.leafKey === leafKey;
                const isExpandedSourceCluster = isClusterSourceHidden(key, leafKey);

                if (shouldDelayMergedClusters && (mergeTargetKeys.has(key) || mergeHoldTargetKeysRef.current.has(key))) {
                    // Add merged clusters after outgoing markers arrive
                    if (existingEntry) {
                        trackMergeRemoval((onDone) => removeMarkerEntry(existingEntry, center, onDone));
                        markersRef.current.delete(key);
                    }
                    pendingMergeAdds.push({
                        key,
                        element,
                        center,
                        feature,
                        leafKey,
                        token: mergeHoldTokenRef.current,
                    });
                    nextMarkerKeys.add(key);
                    return;
                }

                if (canReuseClusterEntry) {
                    // Keep the marker instance when leaf membership is unchanged
                    const existingElement = existingEntry.marker.getElement();
                    replaceMarkerElementContents(existingElement, element);
                    setClusterElementExpandedHidden(existingElement, isExpandedSourceCluster);
                    bindClusterClick(existingElement, feature, expandCluster);
                    animateMarkerTo(existingEntry.marker, center);
                    nextMarkerKeys.add(key);
                    return;
                } else if (existingEntry?.kind === 'cluster') {
                    // Same cluster id can refer to different leaves after zoom changes
                    removeMarkerEntry(existingEntry, isMerge ? center : undefined);
                    markersRef.current.delete(key);
                }

                bindClusterClick(element, feature, expandCluster);
                const start = shouldLinkMarkerMotion
                    ? findNearestPosition(center, previousPositions, markerMoveLinkMaxDistance) ?? center
                    : center;

                const marker = new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(start).addTo(map);
                setClusterElementExpandedHidden(element, isExpandedSourceCluster);
                if (shouldLinkMarkerMotion) {
                    animateMarkerTo(marker, center);
                }

                markersRef.current.set(key, { marker, kind: 'cluster', leafKey });
                nextMarkerKeys.add(key);
                return;
            }

            // Reuse artist markers so popup state can stay attached
            const artist = artistsByIdRef.current.get(feature.properties.artistId);
            if (!artist) return;
            const key = `artist-${artist.id}`;
            const existingEntry = markersRef.current.get(key);
            const target: [number, number] = [lng, lat];
            const marker = existingEntry?.kind === 'artist'
                ? existingEntry.marker
                : new maplibregl.Marker({
                    element: createArtistMarkerElement(artist),
                    anchor: 'center',
                }).setLngLat(
                    shouldLinkMarkerMotion
                        ? findNearestPosition(target, previousPositions, markerMoveLinkMaxDistance) ?? target
                        : target
                ).addTo(map);

            if (existingEntry?.kind === 'artist') {
                animateMarkerTo(marker, target);
            } else if (shouldLinkMarkerMotion) {
                animateMarkerTo(marker, target);
            }
            marker.getElement().onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                openArtistPopup(artist, marker);
            };

            markersRef.current.set(key, {
                marker,
                kind: 'artist',
                popup: existingEntry?.popup,
                root: existingEntry?.root,
            });
            nextMarkerKeys.add(key);
        });

        // Remove markers missing from the current Supercluster result
        markersRef.current.forEach((entry, key) => {
            if (nextMarkerKeys.has(key)) return;
            const currentPosition = getMarkerCoordinates(entry.marker);
            const destination = shouldLinkMarkerMotion || shouldDelayMergedClusters
                ? staleMarkerDestinations.get(key) ?? (isInsideCurrentBounds(currentPosition)
                    ? findNearestPosition(
                        currentPosition,
                        Array.from(nextPositions.values()),
                        markerMoveLinkMaxDistance
                    )
                    : null)
                : null;
            const removalDestination = isSplit && entry.kind === 'cluster' ? undefined : destination ?? undefined;
            if (shouldDelayMergedClusters && removalDestination) {
                trackMergeRemoval((onDone) => removeMarkerEntry(entry, removalDestination, onDone));
            } else {
                removeMarkerEntry(entry, removalDestination);
            }
            markersRef.current.delete(key);
        });
        addPendingMergedClusters();
    }, [animateMarkerTo, expandCluster, findNearestPosition, isClusterSourceHidden, mapReady, mapRef, openArtistPopup, removeMarkerEntry]);

    useEffect(() => {
        // Compare only fields used by the spatial index
        const nextSignature = getArtistIndexSignature(displayArtists, view);
        if (clusterIndexSignatureRef.current === nextSignature) {
            // Same index inputs keep expanded clusters intact
            renderVisibleMarkers();
            return;
        }

        // New index inputs need a new Supercluster instance
        clusterIndexSignatureRef.current = nextSignature;

        lastClusterZoomRef.current = null;
        lastMapZoomRef.current = null;
        mergeHoldUntilRef.current = 0;
        mergeHoldTokenRef.current += 1;
        mergeHoldTargetKeysRef.current.clear();
        clearPendingMergeTimers();
        clusterIndexRef.current = new Supercluster<ArtistPointProperties, ClusterProperties>({
            radius: CLUSTER_CONFIG.maxClusterRadius,
            maxZoom: CLUSTER_CONFIG.disableClusteringAtZoomLevel - 1,
        }).load(displayArtists.map((artist) => makeArtistPoint(artist, view)));

        // Popup close can happen just before this rebuild
        if (!shouldKeepExpandedClusters()) {
            removeExpandedClusterArtifacts();
            window.setTimeout(() => setHasExpandedClusters(false), 0);
        }

        renderVisibleMarkers();
    }, [clearPendingMergeTimers, displayArtists, removeExpandedClusterArtifacts, renderVisibleMarkers, shouldKeepExpandedClusters, view]);

    // Toolbar action for visible clusters
    const expandAllVisibleClusters = useCallback(() => {
        visibleClustersRef.current.forEach((cluster) => expandCluster(cluster));
    }, [expandCluster]);

    return {
        clearMarkers,
        closeActiveArtistPopup,
        collapseExpandedClusters,
        expandAllVisibleClusters,
        expandedRef,
        hasExpandedClusters,
        markersRef,
        openArtistPopup,
        renderVisibleMarkers,
    };
};

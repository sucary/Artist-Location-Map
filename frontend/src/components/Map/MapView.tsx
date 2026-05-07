import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useQuery } from '@tanstack/react-query';
import { MapControls } from './MapControls';
import { MapErrorOverlay } from './MapErrorOverlay';
import { SelectionPrompt } from './SelectionPrompt';
import {
    canUseDarkTiles,
    getMapStyleUrl,
    hasMapTilerKey,
    isMapTilerTileLayer,
    type MapTileLayer,
    type MapTileTheme,
} from './config/mapStyles';
import { defaultCenter, defaultZoom, scrollWheelZoomRate, trackpadZoomRate } from './config/mapConstants';
import { getStoredTileTheme, storeTileLayer, storeTileTheme } from './config/mapStorage';
import { useArtistMarkers } from './hooks/useArtistMarkers';
import { patchMapLabelLanguage } from './layers/labelLanguage';
import { syncCityBoundaryLayers } from './layers/cityBoundaryLayers';
import { syncChinaClaimedBorderLayers } from './layers/chinaClaimedBorderLayers';
import { getZoomForLocationType, isInteractiveTarget } from './utils/coordinates';
import { getArtists, getArtistsByUsername, getCityById, getFeaturedArtists } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLocationLanguage } from '../../context/LocationLanguageContext';
import type { LocationView } from '../../types/artist';
import type { MapViewProps } from './types';

type MarkerWithUpdate = maplibregl.Marker & {
    // Reach MapLibre's private updater to follow inertial tile movement.
    _update?: (event?: { type: 'move' | 'moveend' | 'terrain' | 'render' }) => void;
};

export default function MapView({
    username,
    viewingFeatured,
    selectionMode,
    onLocationPick,
    onEditArtist,
    onDeleteArtist,
    onEmptyClick,
    focusedArtist,
    onFocusedArtistHandled,
    focusedLocation,
    onFocusedLocationHandled,
    focusedCityId,
    isAuthenticated = true,
}: MapViewProps) {
    const { profile } = useAuth();
    const { locationLanguage } = useLocationLanguage();
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const selectedCityIdRef = useRef<string | null>(null);
    const currentStyleUrlRef = useRef<string | null>(null);
    const lastGoodStyleUrlRef = useRef<string | null>(null);
    const lastGoodTileLayerRef = useRef<MapTileLayer>('voyager');
    const lastGoodTileThemeRef = useRef<MapTileTheme>('light');
    const pendingStyleUrlRef = useRef<string | null>(null);
    const revertingStyleRef = useRef(false);
    const locationLanguageRef = useRef(locationLanguage);
    const attributionButtonRef = useRef<HTMLButtonElement | null>(null);

    const isAdmin = profile?.isAdmin ?? false;
    const [mapReady, setMapReady] = useState(false);
    const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
    const [view, setView] = useState<LocationView>('active');
    const [tileLayer, setTileLayer] = useState<MapTileLayer>('voyager');
    const [tileTheme, setTileTheme] = useState<MapTileTheme>(getStoredTileTheme);
    const [mapError, setMapError] = useState<string | null>(null);
    const [attributionOpen, setAttributionOpen] = useState(false);
    const [mobileControlsOpen, setMobileControlsOpen] = useState(true);
    const [canResetMapView, setCanResetMapView] = useState(false);

    // Keep async map callbacks reading the latest label language.
    useEffect(() => {
        locationLanguageRef.current = locationLanguage;
    }, [locationLanguage]);

    // Persist tile layer changes for the next map visit.
    useEffect(() => {
        storeTileLayer(tileLayer);
    }, [tileLayer]);

    // Persist tile theme changes for the next map visit.
    useEffect(() => {
        storeTileTheme(tileTheme);
    }, [tileTheme]);

    const { data: artists } = useQuery({
        queryKey: ['artists', username, viewingFeatured],
        queryFn: () => {
            if (viewingFeatured) return getFeaturedArtists();
            if (username) return getArtistsByUsername(username);
            return getArtists();
        },
    });

    const displayArtists = useMemo(() => artists || [], [artists]);

    const { data: selectedCity } = useQuery({
        queryKey: ['city', selectedCityId],
        queryFn: () => selectedCityId ? getCityById(selectedCityId) : null,
        enabled: !!selectedCityId,
    });

    // Keep popup close handlers comparing against the latest selected city.
    useEffect(() => {
        selectedCityIdRef.current = selectedCityId;
    }, [selectedCityId]);

    // Mirror externally focused cities into the map boundary state.
    useEffect(() => {
        if (focusedCityId) {
            setSelectedCityId(focusedCityId);
        }
    }, [focusedCityId]);

    const {
        clearMarkers,
        collapseExpandedClusters,
        expandAllVisibleClusters,
        expandedRef,
        hasExpandedClusters,
        markersRef,
        openArtistPopup,
        popupJustClosedRef,
        renderVisibleMarkers,
    } = useArtistMarkers({
        mapRef,
        mapReady,
        displayArtists,
        view,
        locationLanguage,
        selectedCityIdRef,
        setSelectedCityId,
        onEditArtist,
        onDeleteArtist,
    });

    // Create the MapLibre instance once and bind persistent map controls.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const supported = (maplibregl as unknown as { supported?: () => boolean }).supported;
        if (supported && !supported()) {
            setMapError('Map rendering is not supported in this browser.');
            return;
        }

        const map = new maplibregl.Map({
            container,
            style: getMapStyleUrl(tileLayer, tileTheme),
            center: defaultCenter,
            zoom: defaultZoom,
            attributionControl: false,
        });

        // MapLibre owns the canvas lifecycle after this point.
        mapRef.current = map;
        currentStyleUrlRef.current = getMapStyleUrl(tileLayer, tileTheme);
        pendingStyleUrlRef.current = currentStyleUrlRef.current;
        map.scrollZoom.setWheelZoomRate(scrollWheelZoomRate);
        map.scrollZoom.setZoomRate(trackpadZoomRate);
        const attributionControl = new maplibregl.AttributionControl({
            compact: true,
            customAttribution: '<a class="achizu-attribution-link" href="/about">About Achizu</a>',
        });
        map.addControl(attributionControl, 'bottom-left');
        const compactAttributionControl = attributionControl as unknown as { _updateCompactMinimize?: () => void };
        if (compactAttributionControl._updateCompactMinimize) {
            // Keep compact attribution under user control instead of letting map drags reopen it.
            map.off('drag', compactAttributionControl._updateCompactMinimize);
        }
        map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
        const attributionContainer = container.querySelector('.maplibregl-ctrl-attrib');
        attributionButtonRef.current = attributionContainer?.querySelector<HTMLButtonElement>('.maplibregl-ctrl-attrib-button') ?? null;
        const syncAttributionOpen = () => {
            const isOpen = attributionContainer?.classList.contains('maplibregl-compact-show') ?? false;
            setAttributionOpen(isOpen);
            if (isOpen) {
                // Keep one bottom control group expanded at a time.
                setMobileControlsOpen(false);
            }
        };
        let attributionObserver: MutationObserver | null = null;
        if (attributionContainer) {
            attributionObserver = new MutationObserver(syncAttributionOpen);
            attributionObserver.observe(attributionContainer, {
                attributes: true,
                attributeFilter: ['class'],
            });
        }
        syncAttributionOpen();

        const handleLoad = () => {
            setMapError(null);
            lastGoodStyleUrlRef.current = currentStyleUrlRef.current;
            lastGoodTileLayerRef.current = tileLayer;
            lastGoodTileThemeRef.current = tileTheme;
            pendingStyleUrlRef.current = null;
            syncChinaClaimedBorderLayers(map);
            patchMapLabelLanguage(map, locationLanguageRef.current);
            setMapReady(true);
        };
        const handleError = (event: maplibregl.ErrorEvent) => {
            console.error('MapLibre failed:', event.error);
            const lastGoodStyleUrl = lastGoodStyleUrlRef.current;
            const pendingStyleUrl = pendingStyleUrlRef.current;

            if (!lastGoodStyleUrl || !pendingStyleUrl) {
                setMapError('Map failed to load. Please refresh and try again.');
                return;
            }

            if (!revertingStyleRef.current && currentStyleUrlRef.current !== lastGoodStyleUrl) {
                // Style load failures should recover to the last working basemap instead of blanking the map.
                revertingStyleRef.current = true;
                pendingStyleUrlRef.current = lastGoodStyleUrl;
                currentStyleUrlRef.current = lastGoodStyleUrl;
                setTileLayer(lastGoodTileLayerRef.current);
                setTileTheme(lastGoodTileThemeRef.current);
                map.setStyle(lastGoodStyleUrl);
                map.once('style.load', () => {
                    if (currentStyleUrlRef.current !== lastGoodStyleUrl) return;
                    pendingStyleUrlRef.current = null;
                    revertingStyleRef.current = false;
                    syncChinaClaimedBorderLayers(map);
                    patchMapLabelLanguage(map, locationLanguageRef.current);
                    setMapReady(true);
                });
            }
        };

        map.on('load', handleLoad);
        map.on('error', handleError);

        return () => {
            attributionObserver?.disconnect();
            attributionButtonRef.current = null;
            clearMarkers();
            collapseExpandedClusters();
            map.remove();
            mapRef.current = null;
        };
        // The MapLibre map is intentionally created once. Style changes are handled below.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Swap the basemap style without recreating the MapLibre instance.
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const styleUrl = getMapStyleUrl(tileLayer, tileTheme);
        if (currentStyleUrlRef.current === styleUrl) return;

        // Mark the map unavailable while MapLibre swaps source and layer state.
        currentStyleUrlRef.current = styleUrl;
        pendingStyleUrlRef.current = styleUrl;
        revertingStyleRef.current = false;
        setMapReady(false);
        map.setStyle(styleUrl);
        map.once('style.load', () => {
            if (currentStyleUrlRef.current !== styleUrl) return;
            lastGoodStyleUrlRef.current = styleUrl;
            lastGoodTileLayerRef.current = tileLayer;
            lastGoodTileThemeRef.current = tileTheme;
            pendingStyleUrlRef.current = null;
            revertingStyleRef.current = false;
            syncChinaClaimedBorderLayers(map);
            patchMapLabelLanguage(map, locationLanguage);
            setMapReady(true);
        });
    }, [locationLanguage, tileLayer, tileTheme]);

    // Reset unavailable provider selections after environment changes.
    useEffect(() => {
        if (!hasMapTilerKey && isMapTilerTileLayer(tileLayer)) {
            // Keep runtime state aligned with the currently available tile providers.
            setTileLayer('voyager');
        }
    }, [tileLayer]);

    // Reapply label language after the current style is ready.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;
        patchMapLabelLanguage(map, locationLanguage);
    }, [locationLanguage, mapReady]);

    // Reconcile marker DOM after map movement or zoom changes.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;

        const syncMarkerPositions = () => {
            if (!map.isMoving()) return;

            // Force DOM markers to follow tiles during drag and fly inertia.
            markersRef.current.forEach(({ marker }) => {
                (marker as MarkerWithUpdate)._update?.({ type: 'move' });
            });
            expandedRef.current.forEach(({ markers }) => {
                markers.forEach((marker) => {
                    (marker as MarkerWithUpdate)._update?.({ type: 'move' });
                });
            });
        };
        const handleRender = () => {
            collapseExpandedClusters();
            renderVisibleMarkers();
        };
        const handleZoomStart = () => collapseExpandedClusters();

        map.on('render', syncMarkerPositions);
        map.on('moveend', handleRender);
        map.on('zoomend', handleRender);
        map.on('zoomstart', handleZoomStart);
        return () => {
            map.off('render', syncMarkerPositions);
            map.off('moveend', handleRender);
            map.off('zoomend', handleRender);
            map.off('zoomstart', handleZoomStart);
        };
    }, [collapseExpandedClusters, expandedRef, mapReady, markersRef, renderVisibleMarkers]);

    // Track when north reset can change the current map orientation.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;

        const syncResetAvailability = () => {
            setCanResetMapView(Math.abs(map.getBearing()) > 0.5 || Math.abs(map.getPitch()) > 0.5);
        };

        syncResetAvailability();
        map.on('rotate', syncResetAvailability);
        map.on('pitch', syncResetAvailability);
        map.on('moveend', syncResetAvailability);
        return () => {
            map.off('rotate', syncResetAvailability);
            map.off('pitch', syncResetAvailability);
            map.off('moveend', syncResetAvailability);
        };
    }, [mapReady]);

    // Route plain map clicks into selection, cluster collapse, or empty-map handling.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;

        const handleMapClick = (event: maplibregl.MapMouseEvent) => {
            if (isInteractiveTarget(event.originalEvent?.target)) return;

            if (selectionMode?.active) {
                // Selection mode turns plain map clicks into picked coordinates.
                onLocationPick?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
                return;
            }

            if (expandedRef.current.size > 0 && !popupJustClosedRef.current) {
                collapseExpandedClusters();
                return;
            }

            onEmptyClick?.();
        };

        map.on('click', handleMapClick);
        return () => {
            map.off('click', handleMapClick);
        };
    }, [collapseExpandedClusters, expandedRef, mapReady, onEmptyClick, onLocationPick, popupJustClosedRef, selectionMode?.active]);

    // Reflect location-pick mode in the MapLibre canvas cursor.
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const canvas = map.getCanvas();
        if (selectionMode?.active) {
            canvas.classList.add('location-selection-mode');
            canvas.style.cursor = 'crosshair';
        } else {
            canvas.classList.remove('location-selection-mode');
            canvas.style.cursor = '';
        }
    }, [selectionMode?.active]);

    // Fly to a search or form-selected location.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady || !focusedLocation) return;

        map.flyTo({
            center: [focusedLocation.lng, focusedLocation.lat],
            zoom: getZoomForLocationType(focusedLocation.locationType),
            duration: 1500,
        });
        onFocusedLocationHandled?.();
    }, [focusedLocation, mapReady, onFocusedLocationHandled]);

    // Fly to a focused artist and reopen its popup after the animation.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady || !focusedArtist) return;

        const location = view === 'active' ? focusedArtist.activeLocation : focusedArtist.originalLocation;
        map.flyTo({
            center: [location.coordinates.lng, location.coordinates.lat],
            zoom: 11,
            duration: 2000,
        });

        // Wait for the fly animation before reopening the artist popup.
        window.setTimeout(() => {
            renderVisibleMarkers();
            const marker = markersRef.current.get(`artist-${focusedArtist.id}`)?.marker;
            if (marker) {
                openArtistPopup(focusedArtist, marker);
            }
            onFocusedArtistHandled?.();
        }, 1700);
    }, [focusedArtist, mapReady, markersRef, onFocusedArtistHandled, openArtistPopup, renderVisibleMarkers, view]);

    // Sync selected-city GeoJSON overlays into MapLibre layers.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;
        syncCityBoundaryLayers(map, selectedCity, isAdmin);
    }, [isAdmin, mapReady, selectedCity]);

    // Center the map on the browser geolocation result.
    const handleLocate = useCallback(() => {
        if (!navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition((position) => {
            mapRef.current?.flyTo({
                center: [position.coords.longitude, position.coords.latitude],
                zoom: 15,
                duration: 1000,
            });
        });
    }, []);

    const handleResetMapView = useCallback(() => {
        mapRef.current?.easeTo({
            bearing: 0,
            pitch: 0,
            duration: 500,
        });
        setCanResetMapView(false);
    }, []);

    const activeCanUseDarkTiles = canUseDarkTiles(tileLayer);

    // Collapse attribution before opening the mobile control drawer.
    const closeAttribution = useCallback(() => {
        if (!attributionOpen) return;
        attributionButtonRef.current?.click();
    }, [attributionOpen]);

    // Force light mode when the active tile layer lacks a dark style.
    useEffect(() => {
        if (!activeCanUseDarkTiles && tileTheme === 'dark') {
            setTileTheme('light');
        }
    }, [activeCanUseDarkTiles, tileTheme]);

    return (
        <div role="application" aria-label="Achizu, Artist Map" className="relative h-full w-full overflow-hidden">
            <div ref={containerRef} className="h-full w-full" />

            <MapControls
                view={view}
                setView={setView}
                tileTheme={tileTheme}
                setTileTheme={setTileTheme}
                canUseDarkTiles={activeCanUseDarkTiles}
                hasExpandedClusters={hasExpandedClusters}
                onToggleClusters={() => hasExpandedClusters ? collapseExpandedClusters() : expandAllVisibleClusters()}
                canResetMapView={canResetMapView}
                onResetMapView={handleResetMapView}
                onLocate={handleLocate}
                onZoomIn={() => mapRef.current?.zoomIn()}
                onZoomOut={() => mapRef.current?.zoomOut()}
                mobileControlsOpen={mobileControlsOpen}
                setMobileControlsOpen={setMobileControlsOpen}
                forceMobileControlsClosed={attributionOpen}
                onRequestMobileOpen={closeAttribution}
                showViewToggle={isAuthenticated && !viewingFeatured}
            />

            {selectionMode?.active && <SelectionPrompt onCancel={onLocationPick} />}
            {mapError && <MapErrorOverlay message={mapError} />}
        </div>
    );
}

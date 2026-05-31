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
import {
    CLUSTER_DEBUG_CONTROLS_STORAGE_EVENT,
    defaultCenter,
    defaultZoom,
    scrollWheelZoomRate,
    trackpadZoomRate,
} from './config/mapConstants';
import {
    getStoredClusterDebugControlsEnabled,
    getStoredTileTheme,
    storeTileLayer,
    storeTileTheme,
} from './config/mapStorage';
import { useArtistMarkers } from './hooks/useArtistMarkers';
import { getClusterZoom } from './clusters/clusterIndex';
import { patchMapLabelLanguage } from './layers/labelLanguage';
import { syncCityBoundaryLayers } from './layers/cityBoundaryLayers';
import { syncChinaClaimedBorderLayers } from './layers/chinaClaimedBorderLayers';
import { getZoomForLocationType, isInteractiveTarget } from './utils/coordinates';
import { getArtists, getArtistsByUsername, getCityById, getFeaturedArtists, getGigs } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLocationLanguage } from '../../context/LocationLanguageContext';
import { useArtistNameDisplay } from '../../context/ArtistNameDisplayContext';
import type { Artist, LocationView } from '../../types/artist';
import type { GigMarkerArtist } from '../../types/gig';
import type { ArtistPopupLifecycleState, MapViewProps } from './types';
import { useTranslation } from 'react-i18next';
import { GigCard } from '../Tour/GigCard';

// Interactive artist map shell and control wiring

type MarkerWithUpdate = maplibregl.Marker & {
    // Reach MapLibre's private updater to follow inertial tile movement.
    _update?: (event?: { type: 'move' | 'moveend' | 'terrain' | 'render' }) => void;
};

export default function MapView({
    username,
    viewingFeatured,
    tourMode,
    selectionMode,
    onLocationPick,
    onEditArtist,
    onDeleteArtist,
    onEditGig,
    onDeleteGig,
    onEmptyClick,
    focusedArtist,
    onFocusedArtistHandled,
    focusedGigId,
    onFocusedGigHandled,
    focusedLocation,
    onFocusedLocationHandled,
    focusedCityId,
    isAuthenticated = true,
    suppressArtistPopup = false,
    onArtistPopupOpenChange,
    interactionsDisabled = false,
    canAdjustDisplayCoordinates = false,
    tourControlSlot,
    onDisplayCoordinateChange,
}: MapViewProps) {
    const { profile } = useAuth();
    const { locationLanguage } = useLocationLanguage();
    const { artistNameDisplayMode } = useArtistNameDisplay();
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
    const artistPopupLifecycleRef = useRef<ArtistPopupLifecycleState>({ open: false, openedAt: 0, closedAt: 0 });
    const mobileControlsOpenRef = useRef(true);
    const attributionOpenRef = useRef(false);
    const popupControlsSnapshotRef = useRef<{ mobileControlsOpen: boolean; attributionOpen: boolean } | null>(null);
    const suppressClusterCollapseUntilRef = useRef(0);
    const restoreDoubleClickZoomTimerRef = useRef<number | null>(null);
    const interactionsDisabledRef = useRef(interactionsDisabled);
    const desktopViewportRef = useRef(false);
    const previousTourModeActiveRef = useRef(false);

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
    const [clusterColorDebugEnabled, setClusterColorDebugEnabled] = useState(false);
    const [clusterDebugControlsEnabled, setClusterDebugControlsEnabled] = useState(getStoredClusterDebugControlsEnabled);
    const [rawClusterDebugExpanded, setRawClusterDebugExpanded] = useState(false);
    const [activeAdjustmentCityId, setActiveAdjustmentCityId] = useState<string | null>(null);
    const { t } = useTranslation();
    const canUseClusterDebugControls = isAdmin && clusterDebugControlsEnabled;
    const activeClusterColorDebugEnabled = canUseClusterDebugControls && clusterColorDebugEnabled;
    const tourModeActive = tourMode?.active ?? false;

    const isArtistPopupActive = useCallback(() => {
        const lifecycle = artistPopupLifecycleRef.current;
        // DOM fallback covers MapLibre popup refs that desync during fast touch gestures.
        return lifecycle.open || !!containerRef.current?.querySelector('.artist-popup');
    }, []);

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
        document.documentElement.dataset.theme = tileTheme;
    }, [tileTheme]);

    // Admin map debug visibility follows the browser-local settings toggle.
    useEffect(() => {
        const syncClusterDebugControls = (event: Event) => {
            const enabled = event instanceof CustomEvent && typeof event.detail?.enabled === 'boolean'
                ? event.detail.enabled
                : getStoredClusterDebugControlsEnabled();
            setClusterDebugControlsEnabled(enabled);
        };

        window.addEventListener(CLUSTER_DEBUG_CONTROLS_STORAGE_EVENT, syncClusterDebugControls);
        return () => window.removeEventListener(CLUSTER_DEBUG_CONTROLS_STORAGE_EVENT, syncClusterDebugControls);
    }, []);

    const { data: artists, isError: artistsError } = useQuery({
        queryKey: ['artists', username, viewingFeatured],
        queryFn: () => {
            if (viewingFeatured) return getFeaturedArtists();
            if (username) return getArtistsByUsername(username);
            return getArtists();
        },
        enabled: !tourModeActive,
    });

    const gigQueryParams = tourMode?.interval
        ? { from: tourMode.interval.from, to: tourMode.interval.to }
        : undefined;

    const { data: gigs, isError: gigsError } = useQuery({
        queryKey: ['gigs', gigQueryParams],
        queryFn: () => getGigs(gigQueryParams),
        enabled: tourModeActive,
    });

    const gigMarkerArtists = useMemo<GigMarkerArtist[]>(() => (gigs || []).map((gig) => ({
        id: gig.id,
        userId: gig.userId,
        name: gig.artist.name,
        romanizedName: gig.artist.romanizedName,
        sourceImage: gig.artist.sourceImage,
        avatarCrop: gig.artist.avatarCrop,
        originalLocation: gig.location,
        activeLocation: gig.location,
        socialLinks: gig.externalUrl ? { website: gig.externalUrl } : undefined,
        createdAt: gig.createdAt,
        updatedAt: gig.updatedAt,
        originalLocationDisplayCoordinates: gig.displayCoordinates,
        activeLocationDisplayCoordinates: gig.displayCoordinates,
        originalCityId: gig.locationCityId ?? '',
        activeCityId: gig.locationCityId ?? '',
        gig,
    })), [gigs]);

    const displayArtists = useMemo(() => (
        tourModeActive ? gigMarkerArtists : artists || []
    ), [artists, gigMarkerArtists, tourModeActive]);

    const highlightedGigIds = useMemo(() => {
        if (!tourMode?.selectedDay) return undefined;
        const selectedDay = tourMode.selectedDay;
        return new Set((gigs || [])
            .filter((gig) => gig.date === selectedDay)
            .map((gig) => gig.id));
    }, [gigs, tourMode?.selectedDay]);

    const handleMarkerEdit = useCallback((artist: Artist) => {
        if (tourModeActive) {
            onEditGig?.((artist as GigMarkerArtist).gig);
            return;
        }
        onEditArtist?.(artist);
    }, [onEditArtist, onEditGig, tourModeActive]);

    const handleMarkerDelete = useCallback((artist: Artist) => {
        if (tourModeActive) {
            onDeleteGig?.((artist as GigMarkerArtist).gig);
            return;
        }
        onDeleteArtist?.(artist);
    }, [onDeleteArtist, onDeleteGig, tourModeActive]);

    const renderPopupContent = useCallback((artist: Artist, showActions: boolean) => {
        if (!tourModeActive) return undefined;
        const gig = (artist as GigMarkerArtist).gig;
        return (
            <GigCard
                gig={gig}
                showActions={showActions}
                locationLanguage={locationLanguage}
            />
        );
    }, [locationLanguage, tourModeActive]);

    const { data: selectedCity } = useQuery({
        queryKey: ['city', selectedCityId],
        queryFn: () => selectedCityId ? getCityById(selectedCityId) : null,
        enabled: !!selectedCityId,
    });

    const { data: activeAdjustmentCity } = useQuery({
        queryKey: ['city', activeAdjustmentCityId],
        queryFn: () => activeAdjustmentCityId ? getCityById(activeAdjustmentCityId) : null,
        enabled: !!activeAdjustmentCityId,
    });

    useEffect(() => {
        attributionOpenRef.current = attributionOpen;
    }, [attributionOpen]);

    useEffect(() => {
        mobileControlsOpenRef.current = mobileControlsOpen;
    }, [mobileControlsOpen]);

    const handleArtistPopupOpenChange = useCallback((open: boolean) => {
        const wasOpen = artistPopupLifecycleRef.current.open;
        onArtistPopupOpenChange?.(open);

        if (open) {
            if (!wasOpen) {
                // Restore the user's mobile controls state after the popup closes.
                popupControlsSnapshotRef.current = {
                    mobileControlsOpen: mobileControlsOpenRef.current,
                    attributionOpen: attributionOpenRef.current,
                };
            }

            if (mobileControlsOpenRef.current) {
                setMobileControlsOpen(false);
            }
            if (attributionOpenRef.current) {
                attributionButtonRef.current?.click();
            }
            return;
        }

        const snapshot = popupControlsSnapshotRef.current;
        popupControlsSnapshotRef.current = null;
        if (!snapshot) return;

        setMobileControlsOpen(snapshot.mobileControlsOpen);
        if (snapshot.attributionOpen && !attributionOpenRef.current) {
            window.setTimeout(() => attributionButtonRef.current?.click(), 0);
        }
    }, [onArtistPopupOpenChange]);

    useEffect(() => {
        interactionsDisabledRef.current = interactionsDisabled;
    }, [interactionsDisabled]);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(min-width: 640px)');
        const syncDesktopViewport = () => {
            desktopViewportRef.current = mediaQuery.matches;
        };

        syncDesktopViewport();
        mediaQuery.addEventListener('change', syncDesktopViewport);
        return () => mediaQuery.removeEventListener('change', syncDesktopViewport);
    }, []);

    const suppressDoubleClickZoomBriefly = useCallback(() => {
        const map = mapRef.current;
        if (!map) return;

        // Prevent close-card and close-cluster taps from becoming a double-click zoom.
        map.doubleClickZoom.disable();
        if (restoreDoubleClickZoomTimerRef.current !== null) {
            window.clearTimeout(restoreDoubleClickZoomTimerRef.current);
        }
        restoreDoubleClickZoomTimerRef.current = window.setTimeout(() => {
            restoreDoubleClickZoomTimerRef.current = null;
            if (!interactionsDisabledRef.current) {
                map.doubleClickZoom.enable();
            }
        }, 500);
    }, []);

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const controls = [
            map.dragPan,
            map.scrollZoom,
            map.boxZoom,
            map.dragRotate,
            map.keyboard,
            map.doubleClickZoom,
            map.touchZoomRotate,
        ];

        // Panels that own pointer input block map gestures underneath.
        if (interactionsDisabled) {
            controls.forEach((control) => control.disable());
        } else {
            controls.forEach((control) => control.enable());
        }
    }, [interactionsDisabled, mapReady]);

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
        closeActiveArtistPopup,
        collapseExpandedClusters,
        expandAllVisibleClusters,
        expandAllVisibleClustersAtLocations,
        expandedRef,
        hasExpandedClusters,
        markersRef,
        openArtistPopup,
        renderVisibleMarkers,
    } = useArtistMarkers({
        mapRef,
        mapReady,
        displayArtists,
        view: tourModeActive ? 'active' : view,
        locationLanguage,
        artistNameDisplayMode,
        clusterColorDebugEnabled: activeClusterColorDebugEnabled,
        selectedCityIdRef,
        setSelectedCityId,
        onEditArtist: tourModeActive ? onEditGig ? handleMarkerEdit : undefined : onEditArtist,
        onDeleteArtist: tourModeActive ? onDeleteGig ? handleMarkerDelete : undefined : onDeleteArtist,
        onArtistPopupOpenChange: handleArtistPopupOpenChange,
        artistPopupLifecycleRef,
        canAdjustDisplayCoordinates: tourModeActive ? false : canAdjustDisplayCoordinates,
        onDisplayCoordinateEditStart: setActiveAdjustmentCityId,
        onDisplayCoordinateEditEnd: () => setActiveAdjustmentCityId(null),
        onDisplayCoordinateChange,
        highlightedArtistIds: highlightedGigIds,
        renderPopupContent: tourModeActive ? renderPopupContent : undefined,
        keepCollisionClustersAtMaxZoom: tourModeActive,
    });

    useEffect(() => {
        if (previousTourModeActiveRef.current && !tourModeActive) {
            // Gig popup content must not survive the Tour Mode boundary
            closeActiveArtistPopup();
        }
        previousTourModeActiveRef.current = tourModeActive;
    }, [closeActiveArtistPopup, tourModeActive]);

    useEffect(() => {
        if (canUseClusterDebugControls) return;

        setClusterColorDebugEnabled(false);
        if (!rawClusterDebugExpanded) return;

        // Hidden debug mode cannot leave center-only markers active.
        collapseExpandedClusters(false);
        setRawClusterDebugExpanded(false);
    }, [canUseClusterDebugControls, collapseExpandedClusters, rawClusterDebugExpanded]);

    useEffect(() => {
        if (suppressArtistPopup) {
            // Mobile panels are exclusive with the floating artist card.
            closeActiveArtistPopup();
        }
    }, [closeActiveArtistPopup, suppressArtistPopup]);

    // Create the MapLibre instance once and bind persistent map controls.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const supported = (maplibregl as unknown as { supported?: () => boolean }).supported;
        if (supported && !supported()) {
            setMapError(t('map.error.renderMapError'));
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
            customAttribution: `<a class="achizu-attribution-link" href="/about">${t('map.attribution.aboutAchizu')}</a>`,
        });
        map.addControl(attributionControl, 'bottom-left');
        const compactAttributionControl = attributionControl as unknown as { _updateCompactMinimize?: () => void };
        if (compactAttributionControl._updateCompactMinimize) {
            // Keep compact attribution under user control instead of letting map drags reopen it.
            map.off('drag', compactAttributionControl._updateCompactMinimize);
        }
        map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
        const attributionContainer = container.querySelector('.maplibregl-ctrl-attrib');
        attributionContainer?.classList.remove('maplibregl-compact-show');
        attributionButtonRef.current = attributionContainer?.querySelector<HTMLButtonElement>('.maplibregl-ctrl-attrib-button') ?? null;
        attributionButtonRef.current?.setAttribute('aria-expanded', 'false');
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
                setMapError(t('map.error.loadMapError'));
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
            if (restoreDoubleClickZoomTimerRef.current !== null) {
                window.clearTimeout(restoreDoubleClickZoomTimerRef.current);
                restoreDoubleClickZoomTimerRef.current = null;
            }
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
            expandedRef.current.forEach(({ markers, debugRingMarkers }) => {
                markers.forEach((marker) => {
                    (marker as MarkerWithUpdate)._update?.({ type: 'move' });
                });
                debugRingMarkers.forEach((marker) => {
                    (marker as MarkerWithUpdate)._update?.({ type: 'move' });
                });
            });
        };
        const handleMoveEnd = () => {
            // Panning keeps expanded clusters; only visible marker membership changes.
            renderVisibleMarkers();
        };
        const handleDragStart = () => {
            // Ignore the synthetic click that MapLibre can emit after a drag.
            suppressClusterCollapseUntilRef.current = performance.now() + 600;
        };
        const handleDragEnd = () => {
            // Keep the cluster open while drag inertia settles.
            suppressClusterCollapseUntilRef.current = performance.now() + 600;
        };
        const logZoomLevel = () => {
            const mapZoom = map.getZoom();
            // Debug zoom pair after a completed zoom gesture
            console.log('[cluster-debug] zoom level', {
                mapZoom,
                clusterZoom: getClusterZoom(mapZoom),
            });
        };
        const handleZoomEnd = () => {
            logZoomLevel();
            // Zoom changes cluster membership, so stale expanded markers are cleared.
            collapseExpandedClusters(false);
            renderVisibleMarkers();
        };
        const handleZoomStart = () => {
            if (desktopViewportRef.current && isArtistPopupActive()) {
                closeActiveArtistPopup();
            }
            // Clear expansion artifacts before zoom reshapes clusters.
            collapseExpandedClusters(false);
        };

        map.on('render', syncMarkerPositions);
        map.on('dragstart', handleDragStart);
        map.on('dragend', handleDragEnd);
        map.on('moveend', handleMoveEnd);
        map.on('zoomend', handleZoomEnd);
        map.on('zoomstart', handleZoomStart);
        return () => {
            map.off('render', syncMarkerPositions);
            map.off('dragstart', handleDragStart);
            map.off('dragend', handleDragEnd);
            map.off('moveend', handleMoveEnd);
            map.off('zoomend', handleZoomEnd);
            map.off('zoomstart', handleZoomStart);
        };
    }, [closeActiveArtistPopup, collapseExpandedClusters, expandedRef, isArtistPopupActive, mapReady, markersRef, renderVisibleMarkers]);

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
            const target = event.originalEvent?.target as HTMLElement | null;
            const interactiveTarget = isInteractiveTarget(target);

            if (interactiveTarget) return;

            if (selectionMode?.active) {
                // Selection mode turns plain map clicks into picked coordinates.
                onLocationPick?.({ lat: event.lngLat.lat, lng: event.lngLat.lng });
                return;
            }

            if (isArtistPopupActive()) {
                if (performance.now() - artistPopupLifecycleRef.current.openedAt < 150) {
                    return;
                }
                suppressDoubleClickZoomBriefly();
                closeActiveArtistPopup();
                return;
            }

            if (performance.now() < suppressClusterCollapseUntilRef.current) {
                // Drag-generated map clicks should not collapse expanded clusters.
                onEmptyClick?.();
                return;
            }

            if (expandedRef.current.size > 0 && !isArtistPopupActive()) {
                collapseExpandedClusters();
                return;
            }

            onEmptyClick?.();
        };

        map.on('click', handleMapClick);
        return () => {
            map.off('click', handleMapClick);
        };
    }, [closeActiveArtistPopup, collapseExpandedClusters, expandedRef, isArtistPopupActive, mapReady, onEmptyClick, onLocationPick, selectionMode?.active, suppressDoubleClickZoomBriefly]);

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

    // Fly to a focused artist marker and reopen its popup after the animation.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady || !focusedArtist) return;

        const markerCoordinates = view === 'active'
            ? focusedArtist.activeLocationDisplayCoordinates
            : focusedArtist.originalLocationDisplayCoordinates;
        map.flyTo({
            center: [markerCoordinates.lng, markerCoordinates.lat],
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

    // Fly to a focused gig marker and reopen its popup after the animation.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady || !focusedGigId || !tourModeActive) return;

        const gigArtist = gigMarkerArtists.find((artist) => artist.gig.id === focusedGigId);
        if (!gigArtist) return;

        const markerCoordinates = gigArtist.activeLocationDisplayCoordinates;
        map.flyTo({
            center: [markerCoordinates.lng, markerCoordinates.lat],
            zoom: 11,
            duration: 2000,
        });

        // Wait for the fly animation before reopening the gig popup.
        window.setTimeout(() => {
            renderVisibleMarkers();
            const marker = markersRef.current.get(`artist-${focusedGigId}`)?.marker;
            if (marker) {
                openArtistPopup(gigArtist, marker);
            }
            onFocusedGigHandled?.();
        }, 1700);
    }, [focusedGigId, gigMarkerArtists, mapReady, markersRef, onFocusedGigHandled, openArtistPopup, renderVisibleMarkers, tourModeActive]);

    // Sync selected-city GeoJSON overlays into MapLibre layers.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;
        syncCityBoundaryLayers(map, selectedCity, isAdmin);
    }, [isAdmin, mapReady, selectedCity]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReady) return;
        syncCityBoundaryLayers(map, activeAdjustmentCity ?? selectedCity, isAdmin);
    }, [activeAdjustmentCity, isAdmin, mapReady, selectedCity]);

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

    const handleToggleClusters = useCallback(() => {
        setRawClusterDebugExpanded(false);
        if (hasExpandedClusters) {
            collapseExpandedClusters();
            return;
        }

        expandAllVisibleClusters();
    }, [collapseExpandedClusters, expandAllVisibleClusters, hasExpandedClusters]);

    const handleToggleRawClusters = useCallback(() => {
        if (!canUseClusterDebugControls) return;

        const mapZoom = mapRef.current?.getZoom() ?? null;
        // Debug zoom pair for checking rendered radius against cluster buckets
        console.log('[cluster-debug] zoom level', {
            mapZoom,
            clusterZoom: mapZoom === null ? null : getClusterZoom(mapZoom),
        });

        if (hasExpandedClusters) {
            collapseExpandedClusters();
            setRawClusterDebugExpanded(false);
            return;
        }

        expandAllVisibleClustersAtLocations();
        setRawClusterDebugExpanded(true);
    }, [canUseClusterDebugControls, collapseExpandedClusters, expandAllVisibleClustersAtLocations, hasExpandedClusters]);

    const handleToggleClusterColorDebug = useCallback(() => {
        if (!canUseClusterDebugControls) return;
        setClusterColorDebugEnabled((enabled) => !enabled);
    }, [canUseClusterDebugControls]);

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
        <div role="application" aria-label={t('map.achizu')} className="relative h-full w-full overflow-hidden">
            <div ref={containerRef} className="h-full w-full" />
            {/* Blocks canvas and marker input while higher-priority panels are open. */}
            {interactionsDisabled && <div aria-hidden="true" className="absolute inset-0 z-[1040]" />}

            <MapControls
                view={view}
                setView={setView}
                tileTheme={tileTheme}
                setTileTheme={setTileTheme}
                canUseDarkTiles={activeCanUseDarkTiles}
                hasExpandedClusters={hasExpandedClusters}
                clusterColorDebugEnabled={activeClusterColorDebugEnabled}
                showClusterDebugControls={canUseClusterDebugControls}
                onToggleClusters={handleToggleClusters}
                onToggleRawClusters={handleToggleRawClusters}
                onToggleClusterColorDebug={handleToggleClusterColorDebug}
                canResetMapView={canResetMapView}
                onResetMapView={handleResetMapView}
                onLocate={handleLocate}
                onZoomIn={() => mapRef.current?.zoomIn()}
                onZoomOut={() => mapRef.current?.zoomOut()}
                mobileControlsOpen={mobileControlsOpen}
                setMobileControlsOpen={setMobileControlsOpen}
                forceMobileControlsClosed={attributionOpen}
                onRequestMobileOpen={closeAttribution}
                showViewToggle={isAuthenticated && !viewingFeatured && !tourModeActive}
                tourControlSlot={tourControlSlot}
            />

            {selectionMode?.active && <SelectionPrompt onCancel={onLocationPick} />}
            {(mapError || artistsError || gigsError) && (
                <MapErrorOverlay message={mapError || t(tourModeActive ? 'tour.errors.loadGigs' : 'map.error.loadArtistsError')} />
            )}
        </div>
    );
}

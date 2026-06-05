import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode, TouchEvent } from 'react';
import type { LocationView } from '../../types/artist';
import type { MapTileTheme } from './config/mapStyles';
import { LocationIcon, NorthIcon, ExpandIcon, CollapseIcon } from '../icons/MapIcons';
import { FilterIcon } from '../icons/GeneralIcons';
import { TourSelect } from '../Tour/TourSelect';
import { useTranslation } from 'react-i18next';

// Floating map control drawer and map actions

interface MapControlsProps {
    view: LocationView;
    setView: (view: LocationView) => void;
    tileTheme: MapTileTheme;
    setTileTheme: (theme: MapTileTheme) => void;
    canUseDarkTiles: boolean;
    hasExpandedClusters: boolean;
    clusterColorDebugEnabled: boolean;
    showClusterDebugControls: boolean;
    onToggleClusters: () => void;
    onToggleRawClusters: () => void;
    onToggleClusterColorDebug: () => void;
    canResetMapView: boolean;
    onResetMapView: () => void;
    onLocate: () => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    mobileControlsOpen: boolean;
    setMobileControlsOpen: (open: boolean) => void;
    forceMobileControlsClosed?: boolean;
    onRequestMobileOpen?: () => void;
    showViewToggle?: boolean;
    tourControlSlot?: ReactNode;
    gigFilter?: GigMapFilterState;
    gigFilterOptions?: GigMapFilterOptions;
    onGigFilterChange?: (filter: GigMapFilterState) => void;
}

export interface GigMapFilterState {
    starredOnly: boolean;
    tourId: string;
    artistId: string;
}

export interface GigMapFilterOption {
    id: string;
    name: string;
}

export interface GigMapFilterOptions {
    tours: GigMapFilterOption[];
    artists: GigMapFilterOption[];
}

export function MapControls({
    view,
    setView,
    tileTheme,
    setTileTheme,
    canUseDarkTiles,
    hasExpandedClusters,
    clusterColorDebugEnabled,
    showClusterDebugControls,
    onToggleClusters,
    onToggleRawClusters,
    onToggleClusterColorDebug,
    canResetMapView,
    onResetMapView,
    onLocate,
    onZoomIn,
    onZoomOut,
    mobileControlsOpen,
    setMobileControlsOpen,
    forceMobileControlsClosed = false,
    onRequestMobileOpen,
    showViewToggle = true,
    tourControlSlot,
    gigFilter,
    gigFilterOptions,
    onGigFilterChange,
}: MapControlsProps) {
    const [isMobile, setIsMobile] = useState(false);
    const [gigFilterOpen, setGigFilterOpen] = useState(false);
    const gigFilterButtonRef = useRef<HTMLButtonElement>(null);
    const gigFilterDropdownRef = useRef<HTMLDivElement>(null);
    const [gigFilterDropdownPosition, setGigFilterDropdownPosition] = useState({
        top: null as number | null,
        right: 0,
        bottom: null as number | null,
        width: 288,
        maxHeight: 420,
        opensAbove: true,
    });
    const [closedOffset, setClosedOffset] = useState(0);
    const drawerRef = useRef<HTMLDivElement>(null);
    const touchStartXRef = useRef<number | null>(null);
    const touchStartOffsetRef = useRef<number>(0);
    const [dragOffset, setDragOffset] = useState<number | null>(null);
    const mobileVisibleTipWidth = 3.8; // Visible portion of the map controls when closed on mobile view
    const mapButtonClass = 'bg-surface w-10 h-10 flex items-center justify-center hover:text-primary transition-colors text-text';
    const showGigFilter = !!gigFilter && !!gigFilterOptions && !!onGigFilterChange;
    const gigFilterActive = !!gigFilter && (gigFilter.starredOnly || !!gigFilter.tourId || !!gigFilter.artistId);

    const { t } = useTranslation();

    // Shared tile theme switch for map and tour controls
    const mapThemeToggle = (
        <div role="group" aria-label={t('map.buttons.mapControls.toggleMapTheme')} className="relative inline-grid w-32 grid-cols-2 overflow-hidden rounded-md bg-surface shadow-md">
            <span
                aria-hidden="true"
                className={`absolute inset-y-0 z-0 w-1/2 rounded-md bg-primary-contrast shadow-sm transition-transform duration-200 ease-out ${tileTheme === 'dark' ? 'translate-x-full' : 'translate-x-0'}`}
            />
            <button
                type="button"
                aria-pressed={tileTheme === 'light'}
                onClick={() => setTileTheme('light')}
                className={`relative z-10 flex h-9 min-w-0 items-center justify-center px-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${tileTheme === 'light' ? 'text-white' : 'text-text hover:bg-surface-muted app-dark:hover:bg-transparent app-dark:hover:text-primary'}`}
            >
                <span className="truncate">{t('map.buttons.mapControls.light')}</span>
            </button>
            <button
                type="button"
                aria-pressed={tileTheme === 'dark'}
                disabled={!canUseDarkTiles}
                title={canUseDarkTiles ? t('map.buttons.mapControls.useDarkTiles') : t('map.buttons.mapControls.cannotUseDarkTiles')}
                onClick={() => {
                    if (canUseDarkTiles) setTileTheme('dark');
                }}
                className={`relative z-10 flex h-9 min-w-0 items-center justify-center px-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset disabled:cursor-not-allowed disabled:opacity-40 ${
                    tileTheme === 'dark' && canUseDarkTiles ? 'text-white' : 'text-text hover:bg-surface-muted app-dark:hover:bg-transparent app-dark:hover:text-primary disabled:hover:bg-transparent'
                }`}
            >
                <span className="truncate">{t('map.buttons.mapControls.dark')}</span>
            </button>
        </div>
    );

    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 639px)');
        const syncMobileState = () => setIsMobile(mediaQuery.matches);

        syncMobileState();
        mediaQuery.addEventListener('change', syncMobileState);
        return () => mediaQuery.removeEventListener('change', syncMobileState);
    }, []);

    const measureClosedOffset = () => (
        // Leave a narrow pull handle visible when the drawer is closed.
        Math.max(0, (drawerRef.current?.offsetWidth ?? mobileVisibleTipWidth) - mobileVisibleTipWidth)
    );

    const getCurrentOffset = () => (
        dragOffset ?? (!forceMobileControlsClosed && mobileControlsOpen ? 0 : closedOffset)
    );

    const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
        const nextClosedOffset = measureClosedOffset();
        setClosedOffset(nextClosedOffset);
        touchStartXRef.current = event.touches[0]?.clientX ?? null;
        touchStartOffsetRef.current = dragOffset ?? (!forceMobileControlsClosed && mobileControlsOpen ? 0 : nextClosedOffset);
    };

    const handleTouchMove = (event: TouchEvent<HTMLDivElement>) => {
        if (touchStartXRef.current === null) return;

        const currentX = event.touches[0]?.clientX;
        if (currentX === undefined) return;

        const nextOffset = Math.min(
            closedOffset,
            Math.max(0, touchStartOffsetRef.current + currentX - touchStartXRef.current)
        );
        setDragOffset(nextOffset);
    };

    const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
        if (touchStartXRef.current === null) return;

        const endX = event.changedTouches[0]?.clientX;
        if (endX === undefined) return;

        const deltaX = endX - touchStartXRef.current;
        const finalOffset = dragOffset ?? touchStartOffsetRef.current + deltaX;
        touchStartXRef.current = null;
        setDragOffset(null);

        // Snap open or closed from midpoint and fling direction.
        if (finalOffset < closedOffset / 2 || deltaX < -40) {
            onRequestMobileOpen?.();
            setMobileControlsOpen(true);
        } else if (finalOffset >= closedOffset / 2 || deltaX > 40) {
            setMobileControlsOpen(false);
        }
    };

    const drawerTransform = isMobile ? `translateX(${getCurrentOffset()}px)` : undefined;
    const mobileSwipeZoneVisible = isMobile && getCurrentOffset() > 0;

    useEffect(() => {
        if (!isMobile) return;

        const syncClosedOffset = () => setClosedOffset(measureClosedOffset());
        syncClosedOffset();

        window.addEventListener('resize', syncClosedOffset);
        return () => window.removeEventListener('resize', syncClosedOffset);
    }, [isMobile, showViewToggle]);

    useEffect(() => {
        if (showGigFilter) return;
        setGigFilterOpen(false);
    }, [showGigFilter]);

    useEffect(() => {
        if (!gigFilterOpen) return;

        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (target instanceof Element && target.closest('[data-tour-select-dropdown="true"]')) return;
            if (drawerRef.current?.contains(target) || gigFilterDropdownRef.current?.contains(target)) return;
            setGigFilterOpen(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [gigFilterOpen]);

    useEffect(() => {
        if (!gigFilterOpen || !gigFilterButtonRef.current) return;

        const rect = gigFilterButtonRef.current.getBoundingClientRect();
        const gap = 10;
        const availableBelow = window.innerHeight - rect.bottom - gap;
        const availableAbove = rect.top - gap;
        const opensAbove = availableBelow < 300 && availableAbove > availableBelow;
        const maxHeight = Math.max(280, Math.min(420, opensAbove ? availableAbove : availableBelow));
        const width = Math.min(window.innerWidth - 16, 288);
        const right = Math.max(8, window.innerWidth - rect.right);

        // Edge anchoring keeps the panel physically attached to the trigger
        setGigFilterDropdownPosition({
            top: opensAbove ? null : rect.bottom + gap,
            right,
            bottom: opensAbove ? window.innerHeight - rect.top + gap : null,
            width,
            maxHeight,
            opensAbove,
        });
    }, [gigFilterOpen]);

    const updateGigFilter = (updates: Partial<GigMapFilterState>) => {
        if (!gigFilter || !onGigFilterChange) return;
        onGigFilterChange({ ...gigFilter, ...updates });
    };

    return (
        <>
            {mobileSwipeZoneVisible && (
                // Narrow swipe edge keeps nearby markers tappable.
                <div
                    aria-hidden="true"
                    className="absolute bottom-0 right-0 z-[999] h-64 w-8 bg-transparent sm:hidden"
                    style={{ touchAction: 'pan-y' }}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                />
            )}

        <div
            ref={drawerRef}
            className={`absolute bottom-2 right-2 z-[1000] flex items-end gap-2 font-sans ease-out sm:translate-x-0 ${
                dragOffset === null ? 'transition-transform duration-200' : ''
            }`}
            style={{ transform: drawerTransform, touchAction: 'pan-y' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div className="flex items-end gap-2">
                <div className="relative flex flex-col gap-2 items-end">
                    {showGigFilter && gigFilter && gigFilterOptions && (
                        <div className="relative">
                            <button
                                ref={gigFilterButtonRef}
                                aria-pressed={gigFilterActive}
                                aria-expanded={gigFilterOpen}
                                aria-label={t('map.buttons.mapControls.gigFilter.open')}
                                onClick={() => setGigFilterOpen((open) => !open)}
                                className="flex h-9 w-32 items-center justify-center gap-2 rounded-md bg-surface text-sm font-medium text-text shadow-md transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                                title={t('map.buttons.mapControls.gigFilter.open')}
                            >
                                <FilterIcon className="h-4 w-4" />
                                <span className="truncate">{t('map.buttons.mapControls.gigFilter.title')}</span>
                            </button>

                            {gigFilterOpen && createPortal(
                                <div
                                    ref={gigFilterDropdownRef}
                                    className="fixed z-[9999] overflow-y-auto rounded-lg border border-border-strong bg-surface px-3 pb-3 pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12),0_0_12px_rgba(15,23,42,0.08)] app-dark:shadow-[0_-10px_28px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)]"
                                    style={{
                                        top: gigFilterDropdownPosition.top === null ? undefined : `${gigFilterDropdownPosition.top}px`,
                                        right: `${gigFilterDropdownPosition.right}px`,
                                        bottom: gigFilterDropdownPosition.bottom === null ? undefined : `${gigFilterDropdownPosition.bottom}px`,
                                        width: `${gigFilterDropdownPosition.width}px`,
                                        maxHeight: `${gigFilterDropdownPosition.maxHeight}px`,
                                    }}
                                >
                                    <div className="mb-2 text-sm font-semibold text-text">
                                        {t('map.buttons.mapControls.gigFilter.title')}
                                    </div>

                                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary" htmlFor="map-gig-filter-artist">
                                        {t('map.buttons.mapControls.gigFilter.artistLabel')}
                                    </label>
                                    <div className="mb-3 grid grid-cols-[minmax(0,1fr)_3.5rem] gap-2">
                                        <div className="min-w-0">
                                            <TourSelect
                                                id="map-gig-filter-artist"
                                                tours={gigFilterOptions.artists}
                                                value={gigFilter.artistId}
                                                placeholder={t('map.buttons.mapControls.gigFilter.allArtists')}
                                                ariaLabel={t('map.buttons.mapControls.gigFilter.artistLabel')}
                                                emptyLabel={t('tour.form.noArtistsFound')}
                                                dropdownMaxHeight={160}
                                                onChange={(artistId) => updateGigFilter({ artistId })}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => updateGigFilter({ artistId: '' })}
                                            className="w-14 shrink-0 rounded-md bg-surface-muted px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                                        >
                                            {t('map.buttons.mapControls.gigFilter.all')}
                                        </button>
                                    </div>

                                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary" htmlFor="map-gig-filter-tour">
                                        {t('map.buttons.mapControls.gigFilter.tourLabel')}
                                    </label>
                                    <div className="mb-3 grid grid-cols-[minmax(0,1fr)_3.5rem] gap-2">
                                        <div className="min-w-0">
                                            <TourSelect
                                                id="map-gig-filter-tour"
                                                tours={gigFilterOptions.tours}
                                                value={gigFilter.tourId}
                                                placeholder={t('map.buttons.mapControls.gigFilter.allTours')}
                                                ariaLabel={t('map.buttons.mapControls.gigFilter.tourLabel')}
                                                dropdownMaxHeight={160}
                                                onChange={(tourId) => updateGigFilter({ tourId })}
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => updateGigFilter({ tourId: '' })}
                                            className="w-14 shrink-0 rounded-md bg-surface-muted px-3 py-2 text-sm font-medium text-text transition-colors hover:bg-border focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                                        >
                                            {t('map.buttons.mapControls.gigFilter.all')}
                                        </button>
                                    </div>

                                    <div role="group" aria-label={t('map.buttons.mapControls.gigFilter.starredLabel')} className="relative grid grid-cols-2 overflow-hidden rounded-md bg-surface">
                                        <span
                                            aria-hidden="true"
                                            className={`absolute inset-y-0 z-0 w-1/2 rounded-md bg-primary-contrast transition-transform duration-200 ease-out ${gigFilter.starredOnly ? 'translate-x-full' : 'translate-x-0'}`}
                                        />
                                        <button
                                            type="button"
                                            aria-pressed={!gigFilter.starredOnly}
                                            onClick={() => updateGigFilter({ starredOnly: false })}
                                            className={`relative z-10 flex h-9 min-w-0 items-center justify-center px-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${!gigFilter.starredOnly ? 'text-white' : 'text-text hover:bg-surface-muted app-dark:hover:bg-transparent app-dark:hover:text-primary'}`}
                                        >
                                            <span className="truncate">{t('map.buttons.mapControls.gigFilter.allGigs')}</span>
                                        </button>
                                        <button
                                            type="button"
                                            aria-pressed={gigFilter.starredOnly}
                                            onClick={() => updateGigFilter({ starredOnly: true })}
                                            className={`relative z-10 flex h-9 min-w-0 items-center justify-center px-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${gigFilter.starredOnly ? 'text-white' : 'text-text hover:bg-surface-muted app-dark:hover:bg-transparent app-dark:hover:text-primary'}`}
                                        >
                                            <span className="truncate">{t('map.buttons.mapControls.gigFilter.starredGigs')}</span>
                                        </button>
                                    </div>

                                </div>,
                                document.body
                            )}
                        </div>
                    )}

                    {tourControlSlot}

                    {showViewToggle && (
                        <div role="group" aria-label={t('map.buttons.mapControls.toggleLocationView')} className="relative inline-grid w-32 grid-cols-2 overflow-hidden rounded-md bg-surface shadow-md">
                            <span
                                aria-hidden="true"
                                className={`absolute inset-y-0 z-0 w-1/2 rounded-md bg-primary-contrast shadow-sm transition-transform duration-200 ease-out ${view === 'active' ? 'translate-x-full' : 'translate-x-0'}`}
                            />
                            <button
                                aria-pressed={view === 'original'}
                                onClick={() => setView('original')}
                                className={`relative z-10 flex h-9 min-w-0 items-center justify-center px-2 text-sm font-medium transition-colors ${view === 'original' ? 'text-white' : 'text-text hover:bg-surface-muted app-dark:hover:bg-transparent app-dark:hover:text-primary'}`}
                            >
                                <span className="truncate">{t('map.buttons.mapControls.origin')}</span>
                            </button>
                            <button
                                aria-pressed={view === 'active'}
                                onClick={() => setView('active')}
                                className={`relative z-10 flex h-9 min-w-0 items-center justify-center px-2 text-sm font-medium transition-colors ${view === 'active' ? 'text-white' : 'text-text hover:bg-surface-muted app-dark:hover:bg-transparent app-dark:hover:text-primary'}`}
                            >
                                <span className="truncate">{t('map.buttons.mapControls.active')}</span>
                            </button>
                        </div>
                    )}

                    {mapThemeToggle}

                </div>

                <div className="flex flex-col items-end justify-end gap-2">
                    <button
                        aria-label={hasExpandedClusters ? t('map.buttons.mapControls.collapseAllClusters') : t('map.buttons.mapControls.expandAllClusters')}
                        onClick={onToggleClusters}
                        className={`${mapButtonClass} rounded-md shadow-md`}
                        title={hasExpandedClusters ? t('map.buttons.mapControls.collapseAllClusters') : t('map.buttons.mapControls.expandAllClusters')}
                    >
                        {hasExpandedClusters ? <CollapseIcon className="w-5 h-5" /> : <ExpandIcon className="w-5 h-5" />}
                    </button>

                    {showClusterDebugControls && (
                        <>
                            {/* Admin-only cluster inspection controls */}
                            <button
                                aria-label={hasExpandedClusters ? 'Collapse raw cluster debug' : 'Expand raw cluster debug'}
                                onClick={onToggleRawClusters}
                                className={`${mapButtonClass} rounded-md shadow-md border border-warning/70 text-warning hover:text-warning`}
                                title={hasExpandedClusters ? 'Collapse raw cluster debug' : 'Expand raw cluster debug'}
                            >
                                <span aria-hidden="true" className="text-[10px] font-bold leading-none">DBG1</span>
                            </button>

                            <button
                                aria-pressed={clusterColorDebugEnabled}
                                aria-label={clusterColorDebugEnabled ? 'Disable cluster color debug' : 'Enable cluster color debug'}
                                onClick={onToggleClusterColorDebug}
                                className={`${mapButtonClass} rounded-md shadow-md border border-warning/70 text-warning hover:text-warning ${clusterColorDebugEnabled ? 'bg-warning/10' : ''}`}
                                title={clusterColorDebugEnabled ? 'Disable cluster color debug' : 'Enable cluster color debug'}
                            >
                                <span aria-hidden="true" className="text-[10px] font-bold leading-none">DBG2</span>
                            </button>
                        </>
                    )}

                    <button
                        aria-label={t('map.buttons.mapControls.resetMapDirection')}
                        onClick={onResetMapView}
                        disabled={!canResetMapView}
                        className={`${mapButtonClass} rounded-md shadow-md disabled:cursor-default`}
                        title={t('map.buttons.mapControls.resetMapDirection')}
                    >
                        <NorthIcon />
                    </button>

                    <button aria-label={t('map.buttons.mapControls.locateMe')} onClick={onLocate} className={`${mapButtonClass} rounded-md shadow-md`} title={t('map.buttons.mapControls.locateMe')}>
                        <LocationIcon />
                    </button>

                    <div className="flex flex-col rounded-md shadow-md overflow-hidden">
                        <button aria-label={t('map.buttons.mapControls.zoomIn')} onClick={onZoomIn} className={`${mapButtonClass} border-b border-border`} title={t('map.buttons.mapControls.zoomIn')}>
                            <span className="text-lg font-medium">+</span>
                        </button>
                        <button aria-label={t('map.buttons.mapControls.zoomOut')} onClick={onZoomOut} className={mapButtonClass} title={t('map.buttons.mapControls.zoomOut')}>
                            <span className="text-lg font-medium">-</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
        </>
    );
}

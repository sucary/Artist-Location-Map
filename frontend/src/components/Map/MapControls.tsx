import { useEffect, useRef, useState } from 'react';
import type { TouchEvent } from 'react';
import type { LocationView } from '../../types/artist';
import type { MapTileTheme } from './config/mapStyles';
import { LocationIcon, NorthIcon, ExpandIcon, CollapseIcon } from '../icons/MapIcons';
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
}: MapControlsProps) {
    const [isMobile, setIsMobile] = useState(false);
    const [closedOffset, setClosedOffset] = useState(0);
    const drawerRef = useRef<HTMLDivElement>(null);
    const touchStartXRef = useRef<number | null>(null);
    const touchStartOffsetRef = useRef<number>(0);
    const [dragOffset, setDragOffset] = useState<number | null>(null);
    const mobileVisibleTipWidth = 3.8; // Visible portion of the map controls when closed on mobile view
    const mapButtonClass = 'bg-surface w-10 h-10 flex items-center justify-center hover:text-primary transition-colors text-text';

    const { t } = useTranslation();

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
            <div className="flex gap-2 items-end">
                <div className="relative flex flex-col gap-2 items-end">
                    {showViewToggle && (
                        <div role="group" aria-label={t('map.buttons.mapControls.toggleLocationView')} className="flex bg-surface rounded-md overflow-hidden shadow-md">
                            <button
                                aria-pressed={view === 'original'}
                                onClick={() => setView('original')}
                                className={`w-16 py-2 text-sm font-medium transition-colors ${view === 'original' ? 'bg-primary-contrast text-white' : 'text-text hover:bg-surface-muted app-dark:hover:bg-transparent app-dark:hover:text-primary'}`}
                            >
                                {t('map.buttons.mapControls.origin')}
                            </button>
                            <button
                                aria-pressed={view === 'active'}
                                onClick={() => setView('active')}
                                className={`w-16 py-2 text-sm font-medium transition-colors ${view === 'active' ? 'bg-primary-contrast text-white' : 'text-text hover:bg-surface-muted app-dark:hover:bg-transparent app-dark:hover:text-primary'}`}
                            >
                                {t('map.buttons.mapControls.active')}
                            </button>
                        </div>
                    )}

                    <div role="group" aria-label={t('map.buttons.mapControls.toggleMapTheme')} className="flex bg-surface rounded-md overflow-hidden shadow-md">
                        <button
                            aria-pressed={tileTheme === 'light'}
                            onClick={() => setTileTheme('light')}
                            className={`w-16 py-2 text-sm font-medium transition-colors ${tileTheme === 'light' ? 'bg-primary-contrast text-white' : 'text-text hover:bg-surface-muted app-dark:hover:bg-transparent app-dark:hover:text-primary'}`}
                        >
                            {t('map.buttons.mapControls.light')}
                        </button>
                        <button
                            aria-pressed={tileTheme === 'dark'}
                            disabled={!canUseDarkTiles}
                            title={canUseDarkTiles ? t('map.buttons.mapControls.useDarkTiles') : t('map.buttons.mapControls.cannotUseDarkTiles')}
                            onClick={() => {
                                if (canUseDarkTiles) setTileTheme('dark');
                            }}
                            className={`w-16 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                tileTheme === 'dark' && canUseDarkTiles ? 'bg-primary-contrast text-white' : 'text-text hover:bg-surface-muted app-dark:hover:bg-transparent app-dark:hover:text-primary disabled:hover:bg-transparent'
                            }`}
                        >
                            {t('map.buttons.mapControls.dark')}
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-2 items-end">
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

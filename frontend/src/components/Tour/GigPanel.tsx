import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Gig, Tour } from '../../types/gig';
import { CloseButton, InlineActionMenu, Input, IconButton } from '../ui';
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, CloseIcon, PlusIcon, SearchIcon, StarIcon, SwitchHorizontalIcon, TrashIcon } from '../icons/GeneralIcons';
import { useTranslation } from 'react-i18next';
import { formatLocalizedTimeValue, getBrowserDateLocale } from '../../utils/dateFormatting';
import { getSearchableLocationText } from '../../utils/locationUtils';

type GigPanelSort = 'date' | 'artist' | 'location';
type TourPanelSort = 'date' | 'artist' | 'gigs';
type GigPanelSortDirection = 'asc' | 'desc';

interface GigPanelProps {
    gigs: Gig[];
    tours: Tour[];
    managementGigs: Gig[];
    onClose: () => void;
    onEditGig?: (gig: Gig) => void;
    onDeleteGig?: (gig: Gig) => void;
    onDeleteTour?: (tour: Tour) => void;
    onAddGigToTour?: (tour: Tour, artistId?: string) => void;
    onLocateGig?: (gig: Gig) => void;
    starredGigIds?: Set<string>;
    onToggleGigStar?: (gig: Gig) => void;
}

const getArtistNames = (gig: Gig) => gig.artists.map((artist) => artist.name).join(', ') || gig.artist.name;

const getProvinceLabel = (gig: Gig) => {
    const parts = [gig.location.province, gig.location.country].filter(Boolean);
    return parts.join(', ') || gig.location.displayName || gig.location.city;
};

const getCityLabel = (gig: Gig) => gig.location.city || gig.location.displayName || getProvinceLabel(gig);

const getMostDetailedAdministrativeLabel = (gig: Gig) => (
    gig.location.city || gig.location.province || gig.location.country || ''
);

// Expanded tour rows omit inherited tour names
const getTourGigLocationMeta = (gig: Gig) => {
    const gigLocation = gig.venueName || gig.placeLocation?.name || getCityLabel(gig);
    const administrativeLocation = getMostDetailedAdministrativeLabel(gig);
    const locationParts = [gigLocation, administrativeLocation].filter((part, index, parts) => (
        part && parts.indexOf(part) === index
    ));

    return locationParts.join(' \u00b7 ');
};

export function GigPanel({
    gigs,
    tours,
    managementGigs,
    onClose,
    onEditGig,
    onDeleteGig,
    onDeleteTour,
    onAddGigToTour,
    onLocateGig,
    starredGigIds,
    onToggleGigStar,
}: GigPanelProps) {
    const { i18n, t } = useTranslation();
    const [filterQuery, setFilterQuery] = useState('');
    const [tourFilterQuery, setTourFilterQuery] = useState('');
    const [sortMode, setSortMode] = useState<GigPanelSort>('date');
    const [tourSortMode, setTourSortMode] = useState<TourPanelSort>('date');
    const [sortDirection, setSortDirection] = useState<GigPanelSortDirection>('asc');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [isManagingTours, setIsManagingTours] = useState(false);
    const [expandedTourId, setExpandedTourId] = useState<string | null>(null);
    const [sortDropdownPos, setSortDropdownPos] = useState({ top: 0, left: 0, width: 0 });
    const [expandedArtistRows, setExpandedArtistRows] = useState<Set<string>>(() => new Set());
    const [artistFitCounts, setArtistFitCounts] = useState<Record<string, number>>({});
    const sortRef = useRef<HTMLDivElement>(null);
    const sortDropdownRef = useRef<HTMLDivElement>(null);
    const artistRowRefs = useRef(new Map<string, HTMLDivElement>());
    const tourRowRefs = useRef(new Map<string, HTMLLIElement>());
    const pendingTourScrollRef = useRef<string | null>(null);
    const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const sortListboxId = 'gig-panel-sort-options';
    const dateFallback = i18n.resolvedLanguage || i18n.language || undefined;
    const dateLocale = useMemo(() => getBrowserDateLocale(dateFallback), [dateFallback]);
    const tourMonthFormatter = useMemo(() => new Intl.DateTimeFormat(dateLocale, { year: 'numeric', month: 'short' }), [dateLocale]);
    const tourMonthOnlyFormatter = useMemo(() => new Intl.DateTimeFormat(dateLocale, { month: 'short' }), [dateLocale]);

    useEffect(() => {
        if (!isSortOpen || !sortRef.current) return;

        const rect = sortRef.current.getBoundingClientRect();
        setSortDropdownPos({
            top: rect.bottom + window.scrollY + 4,
            left: rect.left + window.scrollX,
            width: rect.width,
        });
    }, [isSortOpen]);

    useEffect(() => {
        // Scrolling the panel behind the open sort menu dismisses it.
        if (!isSortOpen) return;

        const handleScroll = (event: Event) => {
            const target = event.target as Node | null;
            if (target && sortDropdownRef.current?.contains(target)) return;
            setIsSortOpen(false);
        };
        window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
        return () => window.removeEventListener('scroll', handleScroll, { capture: true } as EventListenerOptions);
    }, [isSortOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (sortRef.current?.contains(target) || sortDropdownRef.current?.contains(target)) return;
            setIsSortOpen(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const formatDateTile = (date: string) => {
        const parsedDate = new Date(`${date}T00:00:00`);
        if (Number.isNaN(parsedDate.getTime())) {
            return { month: '', day: date, weekday: '' };
        }

        const month = new Intl.DateTimeFormat(dateLocale, { month: 'short' }).format(parsedDate);
        const day = new Intl.DateTimeFormat(dateLocale, { day: 'numeric' }).format(parsedDate).replace(/\u65e5$/, '');
        const weekday = new Intl.DateTimeFormat(dateLocale, { weekday: 'short' }).format(parsedDate).replace(/^\u5468/, '\u661f\u671f');

        // Japanese day suffix stays outside compact date tiles
        return {
            month: month.toUpperCase(),
            day,
            weekday,
        };
    };

    const formatTourMonth = (date?: string | null) => {
        if (!date) return '';
        const parsedDate = new Date(`${date}T00:00:00`);
        if (Number.isNaN(parsedDate.getTime())) return '';

        return tourMonthFormatter.format(parsedDate);
    };

    const formatTourMonthOnly = (date?: string | null) => {
        if (!date) return '';
        const parsedDate = new Date(`${date}T00:00:00`);
        if (Number.isNaN(parsedDate.getTime())) return '';

        return tourMonthOnlyFormatter.format(parsedDate);
    };

    // Tour range uses boundary gig months only
    const formatTourDateRange = (startDate?: string, endDate?: string) => {
        const startMonth = formatTourMonth(startDate);
        const endMonth = formatTourMonth(endDate);
        if (!startMonth && !endMonth) return '';
        if (!startMonth || !endMonth || startDate?.slice(0, 7) === endDate?.slice(0, 7)) return startMonth || endMonth;
        if (startDate?.slice(0, 4) === endDate?.slice(0, 4)) return `${startMonth} - ${formatTourMonthOnly(endDate)}`;

        return `${startMonth} - ${endMonth}`;
    };

    const filteredGigs = useMemo(() => {
        const normalizedQuery = filterQuery.trim().toLowerCase();
        if (!normalizedQuery) return gigs;

        return gigs.filter((gig) => {
            const searchText = [
                getArtistNames(gig),
                gig.gigName,
                gig.tour?.name,
                gig.venueName,
                gig.location.displayName,
                getSearchableLocationText(gig.location),
                gig.date,
                gig.time,
            ].filter(Boolean).join(' ').toLowerCase();

            return searchText.includes(normalizedQuery);
        });
    }, [filterQuery, gigs]);

    const sortedGigs = useMemo(() => {
        const sorted = [...filteredGigs];
        sorted.sort((a, b) => {
            let result: number;

            if (sortMode === 'artist') {
                result = getArtistNames(a).localeCompare(getArtistNames(b)) || a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '');
            } else if (sortMode === 'location') {
                result = getCityLabel(a).localeCompare(getCityLabel(b)) || a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '');
            } else {
                result = a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || getArtistNames(a).localeCompare(getArtistNames(b));
            }

            // Direction toggle mirrors Artist List sorting
            return sortDirection === 'asc' ? result : -result;
        });
        return sorted;
    }, [filteredGigs, sortDirection, sortMode]);

    const managedTours = useMemo(() => {
        const gigsByTour = new Map<string, Gig[]>();
        managementGigs.forEach((gig) => {
            if (!gig.tourId) return;
            const tourGigs = gigsByTour.get(gig.tourId) ?? [];
            tourGigs.push(gig);
            gigsByTour.set(gig.tourId, tourGigs);
        });

        // Complete tour data remains independent from the active map date range
        return tours.map((tour) => {
            const tourGigs = (gigsByTour.get(tour.id) ?? []).sort((a, b) => (
                a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '')
            ));
            const artistCounts = new Map<string, { count: number; name: string }>();
            tourGigs.forEach((gig) => {
                gig.artists.forEach((artist) => {
                    const current = artistCounts.get(artist.id);
                    artistCounts.set(artist.id, {
                        count: (current?.count ?? 0) + 1,
                        name: artist.name,
                    });
                });
            });
            const mainArtist = [...artistCounts.entries()].sort((a, b) => (
                b[1].count - a[1].count || a[1].name.localeCompare(b[1].name)
            ))[0];
            const fallbackArtist = tour.artists[0];

            return {
                tour,
                gigs: tourGigs,
                startDate: tourGigs[0]?.date ?? tour.startDate,
                endDate: tourGigs[tourGigs.length - 1]?.date ?? tour.endDate,
                mainArtistId: mainArtist?.[0] ?? fallbackArtist?.id,
                mainArtistName: mainArtist?.[1].name ?? fallbackArtist?.name ?? '',
            };
        });
    }, [managementGigs, tours]);

    const filteredSortedTours = useMemo(() => {
        const normalizedQuery = tourFilterQuery.trim().toLowerCase();
        const filtered = normalizedQuery
            ? managedTours.filter(({ tour }) => (
                [tour.name, ...tour.artists.map((artist) => artist.name)]
                    .join(' ')
                    .toLowerCase()
                    .includes(normalizedQuery)
            ))
            : managedTours;
        const sorted = [...filtered];

        sorted.sort((a, b) => {
            let result = 0;

            if (tourSortMode === 'date') {
                // Undated tours remain after dated tours in either direction
                if (!a.startDate && !b.startDate) return a.tour.name.localeCompare(b.tour.name);
                if (!a.startDate) return 1;
                if (!b.startDate) return -1;
                result = a.startDate.localeCompare(b.startDate);
            } else if (tourSortMode === 'artist') {
                if (!a.mainArtistName && !b.mainArtistName) return a.tour.name.localeCompare(b.tour.name);
                if (!a.mainArtistName) return 1;
                if (!b.mainArtistName) return -1;
                result = a.mainArtistName.localeCompare(b.mainArtistName);
            } else {
                result = a.tour.gigCount - b.tour.gigCount;
            }

            result ||= a.tour.name.localeCompare(b.tour.name);
            return sortDirection === 'asc' ? result : -result;
        });

        return sorted;
    }, [managedTours, sortDirection, tourFilterQuery, tourSortMode]);

    useEffect(() => {
        if (!expandedTourId || pendingTourScrollRef.current !== expandedTourId) return;
        const animationFrame = window.requestAnimationFrame(() => {
            pendingTourScrollRef.current = null;
            tourRowRefs.current.get(expandedTourId)?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        });

        return () => window.cancelAnimationFrame(animationFrame);
    }, [expandedTourId, filteredSortedTours]);

    useEffect(() => {
        const measureArtistText = (text: string) => {
            measureCanvasRef.current ??= document.createElement('canvas');
            const context = measureCanvasRef.current.getContext('2d');
            if (!context) return text.length * 8;

            context.font = '600 14px Arial, sans-serif';
            return context.measureText(text).width;
        };

        const updateArtistFitCounts = () => {
            const nextCounts: Record<string, number> = {};

            sortedGigs.forEach((gig) => {
                const row = artistRowRefs.current.get(gig.id);
                const artists = gig.artists.length ? gig.artists : [gig.artist];
                if (!row || artists.length <= 1) return;

                const availableWidth = row.clientWidth;
                const toggleWidth = 38;
                const gapWidth = 6;
                let fitCount = artists.length;

                for (let count = artists.length; count > 1; count -= 1) {
                    const label = artists.slice(0, count).map((artist) => artist.name).join(', ');
                    const hiddenCount = artists.length - count;
                    const requiredWidth = measureArtistText(label) + (hiddenCount > 0 ? toggleWidth + gapWidth : 0);

                    // Collapse only when measured labels exceed actual row width
                    if (requiredWidth <= availableWidth) {
                        fitCount = count;
                        break;
                    }

                    fitCount = count - 1;
                }

                nextCounts[gig.id] = Math.max(1, fitCount);
            });

            setArtistFitCounts((currentCounts) => {
                const currentKeys = Object.keys(currentCounts);
                const nextKeys = Object.keys(nextCounts);
                if (currentKeys.length === nextKeys.length && nextKeys.every((key) => currentCounts[key] === nextCounts[key])) {
                    return currentCounts;
                }

                return nextCounts;
            });
        };

        updateArtistFitCounts();

        const resizeObserver = new ResizeObserver(updateArtistFitCounts);
        artistRowRefs.current.forEach((row) => resizeObserver.observe(row));

        return () => resizeObserver.disconnect();
    }, [sortedGigs]);

    const toggleArtistRow = (gigId: string) => {
        // Expanded state is keyed by gig so sorting and filtering keep row intent
        setExpandedArtistRows((currentRows) => {
            const nextRows = new Set(currentRows);
            if (nextRows.has(gigId)) {
                nextRows.delete(gigId);
            } else {
                nextRows.add(gigId);
            }

            return nextRows;
        });
    };

    const toggleTour = (tourId: string) => {
        setExpandedTourId((currentTourId) => {
            if (currentTourId === tourId) return null;

            // Opening a tour should reveal its header as high as the panel can scroll
            pendingTourScrollRef.current = tourId;
            return tourId;
        });
    };

    const renderManagedTour = ({
        tour,
        gigs: managedGigs,
        mainArtistId,
        startDate,
        endDate,
    }: {
        tour: Tour;
        gigs: Gig[];
        mainArtistId?: string;
        mainArtistName: string;
        startDate?: string;
        endDate?: string;
    }) => {
        const isExpanded = expandedTourId === tour.id;
        const tourDateRange = formatTourDateRange(startDate, endDate);

        return (
            <li
                key={tour.id}
                ref={(node) => {
                    if (node) {
                        tourRowRefs.current.set(tour.id, node);
                    } else {
                        tourRowRefs.current.delete(tour.id);
                    }
                }}
            >
                <div className={`group relative flex min-h-14 items-center px-4 py-2 transition-colors duration-150 focus-within:bg-surface-secondary/30 ${isExpanded ? '!bg-primary text-white hover:!bg-primary focus-within:!bg-primary' : 'hover:bg-surface-secondary/30'}`}>
                    <button
                        type="button"
                        aria-expanded={isExpanded}
                        aria-label={t(isExpanded ? 'tour.management.collapseTour' : 'tour.management.expandTour', { name: tour.name })}
                        onClick={() => toggleTour(tour.id)}
                        className="flex min-w-0 flex-1 py-1 pr-20 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                    >
                        <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="flex min-w-0 items-center gap-2">
                                <span className={`min-w-0 truncate text-sm font-semibold ${isExpanded ? 'text-white' : 'text-text'}`}>{tour.name}</span>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold leading-4 ${isExpanded ? 'bg-white text-primary shadow-sm' : 'bg-surface-muted text-text-secondary'}`}>
                                    {tour.gigCount}
                                </span>
                            </span>
                            {tourDateRange && (
                                <span className={`truncate text-xs font-medium ${isExpanded ? 'text-white/80' : 'text-text-secondary'}`}>
                                    {tourDateRange}
                                </span>
                            )}
                        </span>
                    </button>
                    <ChevronDownIcon className={`pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 transition-transform duration-150 ${isExpanded ? 'rotate-0 text-white' : '-rotate-90 text-text-secondary'}`} />
                </div>
                {isExpanded && (
                    <div className="border-t border-border/60 bg-surface-secondary/20">
                        <div className="grid grid-cols-[minmax(8.5rem,1fr)_minmax(0,2fr)] gap-2 border-b border-border/60 px-4 py-3">
                            {onDeleteTour && (
                                <button
                                    type="button"
                                    aria-label={t('tour.management.deleteTour', { name: tour.name })}
                                    onClick={() => onDeleteTour(tour)}
                                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-surface-muted px-3 text-sm font-semibold text-text transition-colors duration-150 hover:bg-[rgb(220,38,38)] hover:!text-white app-dark:bg-surface-secondary app-dark:hover:bg-[rgb(220,38,38)] app-dark:hover:!text-white"
                                >
                                    <TrashIcon className="h-4 w-4" />
                                    <span className="whitespace-nowrap">{t('tour.management.deleteAction')}</span>
                                </button>
                            )}
                            {onAddGigToTour && (
                                <button
                                    type="button"
                                    onClick={() => onAddGigToTour(tour, mainArtistId)}
                                    className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-surface-muted px-3 text-sm font-semibold text-text transition-colors duration-150 hover:border-primary hover:bg-primary hover:text-white app-dark:bg-surface-secondary app-dark:hover:border-primary app-dark:hover:bg-primary app-dark:hover:text-white"
                                >
                                    <PlusIcon className="h-4 w-4" />
                                    {t('tour.actions.addGig')}
                                </button>
                            )}
                        </div>
                        <ul className="divide-y divide-border">
                            {managedGigs.map((gig) => renderGigRow(gig, { useTourLocationMeta: true }))}
                            {managedGigs.length === 0 && (
                                <li className="px-5 py-4 text-center text-sm text-text-secondary">
                                    {t('tour.management.noGigs')}
                                </li>
                            )}
                        </ul>
                    </div>
                )}
            </li>
        );
    };

    const renderGigRow = (gig: Gig, options?: { useTourLocationMeta?: boolean }) => {
        const dateParts = formatDateTile(gig.date);
        const formattedTime = formatLocalizedTimeValue(gig.time, dateFallback);
        const artistNames = gig.artists.length ? gig.artists : [gig.artist];
        const isArtistRowExpanded = expandedArtistRows.has(gig.id);
        const collapsedArtistCount = artistFitCounts[gig.id] ?? Math.min(artistNames.length, 2);
        const visibleArtists = isArtistRowExpanded ? artistNames : artistNames.slice(0, collapsedArtistCount);
        const hiddenArtistCount = artistNames.length - visibleArtists.length;
        const canToggleArtistRow = hiddenArtistCount > 0 || (isArtistRowExpanded && collapsedArtistCount < artistNames.length);
        const visibleArtistLabel = visibleArtists.map((artist) => artist.name).join(', ');
        const title = gig.gigName || gig.tour?.name;
        const isStarred = starredGigIds?.has(gig.id) ?? false;

        // Venue rows avoid full-address display names
        const locationParts = gig.venueName
            ? [title, gig.venueName]
            : [title, getCityLabel(gig)];
        const locationMeta = options?.useTourLocationMeta
            ? getTourGigLocationMeta(gig)
            : locationParts.filter(Boolean).join(' \u00b7 ');

        return (
            <li
                key={gig.id}
                tabIndex={0}
                onClick={(event) => event.currentTarget.focus({ preventScroll: true })}
                className="group relative transition-colors duration-150 hover:bg-surface-secondary/30 focus:bg-surface-secondary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary focus-within:bg-surface-secondary/30"
            >
                {onToggleGigStar && (
                    <button
                        type="button"
                        aria-label={isStarred ? t('tour.actions.unstarGig') : t('tour.actions.starGig')}
                        title={isStarred ? t('tour.actions.unstarGig') : t('tour.actions.starGig')}
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggleGigStar(gig);
                        }}
                        className={`absolute right-4 top-2 z-10 grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-surface-muted ${isStarred ? 'text-primary-contrast app-dark:text-primary' : 'text-text-muted hover:text-text'}`}
                    >
                        <StarIcon className="h-3.5 w-3.5" filled={isStarred} />
                    </button>
                )}
                <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-start gap-4 px-5 py-2">
                    <div className="grid min-h-14 w-12 shrink-0 grid-rows-[auto_auto_auto_1fr_auto] justify-items-center text-center">
                        <span className="text-[10px] font-semibold uppercase leading-none text-primary-contrast app-dark:text-primary-text-dark">{dateParts.month}</span>
                        <span className="text-[1.7rem] font-light leading-none text-text-secondary">{dateParts.day}</span>
                        <span className="text-[10px] font-medium leading-none text-text-secondary">{dateParts.weekday}</span>
                        <span aria-hidden="true" />
                        {formattedTime && (
                            <span className="text-[10px] font-semibold leading-none text-text-secondary">{formattedTime}</span>
                        )}
                    </div>

                    <div className="flex min-w-0 flex-col justify-center gap-1 pr-8">
                        <div
                            ref={(node) => {
                                if (node) {
                                    artistRowRefs.current.set(gig.id, node);
                                } else {
                                    artistRowRefs.current.delete(gig.id);
                                }
                            }}
                            className={`flex min-w-0 items-center gap-2 ${isArtistRowExpanded ? 'flex-wrap' : 'overflow-hidden'}`}
                        >
                            <span className={isArtistRowExpanded ? 'text-sm font-semibold leading-5 text-text' : 'min-w-0 truncate text-sm font-semibold leading-5 text-text'}>
                                {visibleArtistLabel}
                            </span>
                            {canToggleArtistRow && !isArtistRowExpanded && (
                                <button
                                    type="button"
                                    onClick={() => toggleArtistRow(gig.id)}
                                    className="shrink-0 rounded-full border border-border-strong bg-transparent px-2 py-1 text-[11px] font-semibold leading-4 text-text-secondary transition-colors hover:border-transparent hover:bg-surface-muted hover:text-text"
                                >
                                    {isArtistRowExpanded ? '-' : `+${hiddenArtistCount}`}
                                </button>
                            )}
                        </div>
                        {canToggleArtistRow && isArtistRowExpanded && (
                            <button
                                type="button"
                                onClick={() => toggleArtistRow(gig.id)}
                                className="inline-flex h-6 w-7 shrink-0 items-center justify-center rounded-full border border-border-strong bg-transparent text-[11px] font-semibold leading-none text-text-secondary transition-colors hover:border-transparent hover:bg-surface-muted hover:text-text"
                            >
                                -
                            </button>
                        )}
                        <div className="relative flex min-h-8 min-w-0 items-center">
                            <p className="min-w-0 truncate text-xs text-text-secondary group-hover:pr-28 group-focus-within:pr-28">{locationMeta}</p>
                            <InlineActionMenu
                                actions={[
                                    ...(onLocateGig ? [{
                                        key: 'locate' as const,
                                        label: t('tour.actions.locateGig'),
                                        title: t('tour.actions.locateGig'),
                                        onClick: () => onLocateGig(gig),
                                    }] : []),
                                    ...(onEditGig ? [{
                                        key: 'edit' as const,
                                        label: t('common.edit'),
                                        onClick: () => onEditGig(gig),
                                    }] : []),
                                    ...(onDeleteGig ? [{
                                        key: 'delete' as const,
                                        label: t('common.delete'),
                                        title: t('common.delete'),
                                        onClick: () => onDeleteGig(gig),
                                    }] : []),
                                ]}
                            />
                        </div>
                    </div>
                </div>
            </li>
        );
    };

    return (
        <div className="absolute top-20 left-1/2 z-[1050] w-[calc(100vw-1rem)] max-w-sm -translate-x-1/2 font-sans sm:top-28 sm:right-2 sm:left-auto sm:translate-x-0">
            <div role="region" aria-label={t('tour.panel.title')} className="flex max-h-[calc(100vh-6rem)] w-full flex-col overflow-hidden rounded-xl bg-surface shadow-xl shadow-black/5 ring-1 ring-border/40 sm:max-h-[calc(100vh-8rem)]">
                <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
                    <h2 className="text-base font-semibold tracking-tight text-text">
                        <button
                            type="button"
                            aria-pressed={isManagingTours}
                            aria-label={isManagingTours ? t('tour.panel.title') : t('tour.management.open')}
                            title={isManagingTours ? t('tour.panel.title') : t('tour.management.open')}
                            onClick={() => {
                                setIsManagingTours((current) => !current);
                                setIsSortOpen(false);
                            }}
                            className="group -ml-2 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-left transition-colors duration-150 hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                        >
                            <span className="whitespace-nowrap">
                                {isManagingTours
                                    ? `${t('tour.management.title')} (${tours.length})`
                                    : `${t('tour.panel.title')} (${gigs.length})`}
                            </span>
                            <SwitchHorizontalIcon className="h-4 w-4 shrink-0 text-text-secondary transition-colors group-hover:text-text" />
                        </button>
                    </h2>
                    <CloseButton onClick={onClose} size="md" />
                </div>

                <div className="px-4 py-3">
                    <div className="flex items-center gap-2">
                        <div className="relative min-w-0 flex-1">
                            <Input
                                aria-label={t(isManagingTours ? 'tour.management.search.ariaLabel' : 'tour.panel.search.ariaLabel')}
                                type="text"
                                name={isManagingTours ? 'tour-list-search' : 'gig-list-search'}
                                autoComplete="off"
                                autoCorrect="off"
                                spellCheck={false}
                                placeholder={t(isManagingTours ? 'tour.management.search.placeholder' : 'tour.panel.search.placeholder')}
                                value={isManagingTours ? tourFilterQuery : filterQuery}
                                onChange={(event) => {
                                    if (isManagingTours) {
                                        setTourFilterQuery(event.target.value);
                                    } else {
                                        setFilterQuery(event.target.value);
                                    }
                                }}
                                rightIcon={(isManagingTours ? tourFilterQuery : filterQuery) ? undefined : <SearchIcon className="w-4 h-4" />}
                                className="w-full rounded-lg !pr-9"
                            />
                            {(isManagingTours ? tourFilterQuery : filterQuery) && (
                                <IconButton
                                    aria-label={t('tour.panel.search.clear')}
                                    onClick={() => (isManagingTours ? setTourFilterQuery('') : setFilterQuery(''))}
                                    size="sm"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded hover:bg-surface-muted"
                                >
                                    <CloseIcon className="w-4 h-4" />
                                </IconButton>
                            )}
                        </div>
                        <div ref={sortRef} className="relative shrink-0">
                            <button
                                type="button"
                                aria-label={t(isManagingTours ? 'tour.management.sort.ariaLabel' : 'tour.panel.sort.ariaLabel')}
                                aria-haspopup="listbox"
                                aria-expanded={isSortOpen}
                                aria-controls={isSortOpen ? sortListboxId : undefined}
                                onClick={() => setIsSortOpen((open) => !open)}
                                className="flex min-w-[6.5rem] items-center justify-between gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2 text-left text-sm text-text transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
                            >
                                <span className="block truncate">
                                    {t(isManagingTours
                                        ? `tour.management.sort.${tourSortMode}`
                                        : `tour.panel.sort.${sortMode}`)}
                                </span>
                                <ChevronDownIcon className={`absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isSortOpen && createPortal(
                                <div
                                    id={sortListboxId}
                                    role="listbox"
                                    ref={sortDropdownRef}
                                    aria-label={t(isManagingTours ? 'tour.management.sort.optionsLabel' : 'tour.panel.sort.optionsLabel')}
                                    className="fixed z-[9999] rounded-lg border border-border-strong bg-surface shadow-lg app-dark:shadow-[0_16px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)]"
                                    style={{
                                        top: `${sortDropdownPos.top}px`,
                                        left: `${sortDropdownPos.left}px`,
                                        width: `${sortDropdownPos.width}px`,
                                    }}
                                >
                                {(isManagingTours
                                    ? (['date', 'artist', 'gigs'] as const)
                                    : (['date', 'artist', 'location'] as const)
                                ).map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        role="option"
                                        aria-selected={isManagingTours ? tourSortMode === option : sortMode === option}
                                        onClick={() => {
                                            if (isManagingTours) {
                                                setTourSortMode(option as TourPanelSort);
                                            } else {
                                                setSortMode(option as GigPanelSort);
                                            }
                                            setIsSortOpen(false);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-surface-muted ${
                                            (isManagingTours ? tourSortMode === option : sortMode === option)
                                                ? 'text-primary-contrast app-dark:text-primary font-medium'
                                                : 'text-text'
                                        }`}
                                    >
                                        {t(isManagingTours
                                            ? `tour.management.sort.${option}`
                                            : `tour.panel.sort.${option}`)}
                                    </button>
                                ))}
                                </div>,
                                document.body
                            )}
                        </div>
                        <button
                            type="button"
                            aria-label={sortDirection === 'asc' ? t('artistList.sort.ascending') : t('artistList.sort.descending')}
                            title={sortDirection === 'asc' ? t('artistList.sort.ascendingShort') : t('artistList.sort.descendingShort')}
                            onClick={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}
                            className="shrink-0 rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-muted transition-colors duration-150 p-2"
                        >
                            {sortDirection === 'asc' ? (
                                <ArrowUpIcon className="w-5 h-5" />
                            ) : (
                                <ArrowDownIcon className="w-5 h-5" />
                            )}
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {(isManagingTours ? tourFilterQuery.trim() : filterQuery.trim()) && (
                        <div className="mx-4 mb-1 rounded-md bg-surface-muted px-3 py-1.5 text-sm font-semibold text-text-secondary" role="status" aria-live="polite">
                            {isManagingTours
                                ? t('tour.management.search.resultCount', { count: filteredSortedTours.length })
                                : t('tour.panel.search.resultCount', { count: filteredGigs.length })}
                        </div>
                    )}
                    {isManagingTours ? (
                        filteredSortedTours.length === 0 ? (
                            <div className="px-4 py-8 text-center text-sm text-text-secondary">
                                {tourFilterQuery ? t('tour.management.noResults') : t('tour.management.empty')}
                            </div>
                        ) : (
                            <ul className="divide-y divide-border">
                                {filteredSortedTours.map(renderManagedTour)}
                            </ul>
                        )
                    ) : filteredGigs.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-text-secondary">
                            {filterQuery ? t('tour.panel.noResults') : t('tour.panel.empty')}
                        </div>
                    ) : (
                        <ul className="divide-y divide-border">
                            {sortedGigs.map((gig) => renderGigRow(gig))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

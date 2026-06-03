import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Gig } from '../../types/gig';
import { CloseButton, InlineActionMenu, Input } from '../ui';
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, SearchIcon, StarIcon } from '../icons/GeneralIcons';
import { useTranslation } from 'react-i18next';
import { formatLocalizedTimeValue, getBrowserDateLocale } from '../../utils/dateFormatting';

type GigPanelSort = 'date' | 'artist' | 'location' | 'tour';
type GigPanelSortDirection = 'asc' | 'desc';

interface GigPanelProps {
    gigs: Gig[];
    onClose: () => void;
    onEditGig?: (gig: Gig) => void;
    onDeleteGig?: (gig: Gig) => void;
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

export function GigPanel({ gigs, onClose, onEditGig, onDeleteGig, onLocateGig, starredGigIds, onToggleGigStar }: GigPanelProps) {
    const { i18n, t } = useTranslation();
    const [filterQuery, setFilterQuery] = useState('');
    const [sortMode, setSortMode] = useState<GigPanelSort>('date');
    const [sortDirection, setSortDirection] = useState<GigPanelSortDirection>('asc');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [sortDropdownPos, setSortDropdownPos] = useState({ top: 0, left: 0, width: 0 });
    const [expandedArtistRows, setExpandedArtistRows] = useState<Set<string>>(() => new Set());
    const [artistFitCounts, setArtistFitCounts] = useState<Record<string, number>>({});
    const sortRef = useRef<HTMLDivElement>(null);
    const sortDropdownRef = useRef<HTMLDivElement>(null);
    const artistRowRefs = useRef(new Map<string, HTMLDivElement>());
    const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const sortListboxId = 'gig-panel-sort-options';
    const dateFallback = i18n.resolvedLanguage || i18n.language || undefined;
    const dateLocale = useMemo(() => getBrowserDateLocale(dateFallback), [dateFallback]);

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

    const filteredGigs = useMemo(() => {
        const normalizedQuery = filterQuery.trim().toLowerCase();
        if (!normalizedQuery) return gigs;

        return gigs.filter((gig) => {
            const searchText = [
                getArtistNames(gig),
                gig.gigName,
                gig.tour?.name,
                gig.venueName,
                gig.location.city,
                gig.location.province,
                gig.location.country,
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
            } else if (sortMode === 'tour') {
                result = (a.tour?.name ?? '').localeCompare(b.tour?.name ?? '') || a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '');
            } else {
                result = a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? '') || getArtistNames(a).localeCompare(getArtistNames(b));
            }

            // Direction toggle mirrors Artist List sorting
            return sortDirection === 'asc' ? result : -result;
        });
        return sorted;
    }, [filteredGigs, sortDirection, sortMode]);

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

    const renderGigRow = (gig: Gig) => {
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
        const locationMeta = locationParts.filter(Boolean).join(' \u00b7 ');

        return (
            <li key={gig.id} className="group relative transition-colors duration-150 hover:bg-surface-secondary/30">
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
                        <span className="text-[10px] font-semibold uppercase leading-none text-primary-contrast">{dateParts.month}</span>
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
                            <p className="min-w-0 truncate text-xs text-text-secondary group-hover:pr-28">{locationMeta}</p>
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
                        {t('tour.panel.title')} ({gigs.length})
                    </h2>
                    <CloseButton onClick={onClose} size="md" />
                </div>

                <div className="px-4 py-3">
                    <div className="flex items-center gap-2">
                        <Input
                            aria-label={t('tour.panel.search.ariaLabel')}
                            type="text"
                            name="gig-list-search"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            placeholder={t('tour.panel.search.placeholder')}
                            value={filterQuery}
                            onChange={(event) => setFilterQuery(event.target.value)}
                            rightIcon={<SearchIcon className="w-4 h-4" />}
                            className="min-w-0 flex-1 rounded-lg"
                        />
                        <div ref={sortRef} className="relative shrink-0">
                            <button
                                type="button"
                                aria-label={t('tour.panel.sort.ariaLabel')}
                                aria-haspopup="listbox"
                                aria-expanded={isSortOpen}
                                aria-controls={isSortOpen ? sortListboxId : undefined}
                                onClick={() => setIsSortOpen((open) => !open)}
                                className="flex min-w-[6.5rem] items-center justify-between gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2 text-left text-sm text-text transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
                            >
                                <span className="block truncate">{t(`tour.panel.sort.${sortMode}`)}</span>
                                <ChevronDownIcon className={`absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isSortOpen && createPortal(
                                <div
                                    id={sortListboxId}
                                    role="listbox"
                                    ref={sortDropdownRef}
                                    aria-label={t('tour.panel.sort.optionsLabel')}
                                    className="fixed z-[9999] rounded-lg border border-border-strong bg-surface shadow-lg"
                                    style={{
                                        top: `${sortDropdownPos.top}px`,
                                        left: `${sortDropdownPos.left}px`,
                                        width: `${sortDropdownPos.width}px`,
                                    }}
                                >
                                {(['date', 'artist', 'location', 'tour'] as const).map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        role="option"
                                        aria-selected={sortMode === option}
                                        onClick={() => {
                                            setSortMode(option);
                                            setIsSortOpen(false);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-surface-muted ${
                                            sortMode === option ? 'text-primary-contrast app-dark:text-primary font-medium' : 'text-text'
                                        }`}
                                    >
                                        {t(`tour.panel.sort.${option}`)}
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
                    {filteredGigs.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-text-secondary">
                            {filterQuery ? t('tour.panel.noResults') : t('tour.panel.empty')}
                        </div>
                    ) : (
                        <ul className="divide-y divide-border">
                            {sortedGigs.map(renderGigRow)}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
}

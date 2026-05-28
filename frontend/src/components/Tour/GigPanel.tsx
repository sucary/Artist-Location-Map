import { useEffect, useMemo, useRef, useState } from 'react';
import type { Gig } from '../../types/gig';
import { CloseButton, IconButton, Input } from '../ui';
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, EditIcon, SearchIcon, TrashIcon } from '../icons/GeneralIcons';
import { MapPinIcon } from '../icons/MapIcons';
import { useTranslation } from 'react-i18next';
import { getBrowserDateLocale } from '../../utils/dateFormatting';

type GigPanelSort = 'date' | 'artist' | 'location' | 'tour';
type GigPanelSortDirection = 'asc' | 'desc';

interface GigPanelProps {
    gigs: Gig[];
    onClose: () => void;
    onEditGig?: (gig: Gig) => void;
    onDeleteGig?: (gig: Gig) => void;
    onLocateGig?: (gig: Gig) => void;
}

const getArtistNames = (gig: Gig) => gig.artists.map((artist) => artist.name).join(', ') || gig.artist.name;

const getProvinceLabel = (gig: Gig) => {
    const parts = [gig.location.province, gig.location.country].filter(Boolean);
    return parts.join(', ') || gig.location.displayName || gig.location.city;
};

const getCityLabel = (gig: Gig) => gig.location.city || gig.location.displayName || getProvinceLabel(gig);

export function GigPanel({ gigs, onClose, onEditGig, onDeleteGig, onLocateGig }: GigPanelProps) {
    const { i18n, t } = useTranslation();
    const [filterQuery, setFilterQuery] = useState('');
    const [sortMode, setSortMode] = useState<GigPanelSort>('date');
    const [sortDirection, setSortDirection] = useState<GigPanelSortDirection>('asc');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [expandedArtistRows, setExpandedArtistRows] = useState<Set<string>>(() => new Set());
    const sortRef = useRef<HTMLDivElement>(null);
    const sortListboxId = 'gig-panel-sort-options';
    const dateLocale = useMemo(() => getBrowserDateLocale(i18n.resolvedLanguage || i18n.language || undefined), [i18n.language, i18n.resolvedLanguage]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (!sortRef.current?.contains(target)) {
                setIsSortOpen(false);
            }
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
            ].filter(Boolean).join(' ').toLowerCase();

            return searchText.includes(normalizedQuery);
        });
    }, [filterQuery, gigs]);

    const sortedGigs = useMemo(() => {
        const sorted = [...filteredGigs];
        sorted.sort((a, b) => {
            let result: number;

            if (sortMode === 'artist') {
                result = getArtistNames(a).localeCompare(getArtistNames(b)) || a.date.localeCompare(b.date);
            } else if (sortMode === 'location') {
                result = getCityLabel(a).localeCompare(getCityLabel(b)) || a.date.localeCompare(b.date);
            } else if (sortMode === 'tour') {
                result = (a.tour?.name ?? '').localeCompare(b.tour?.name ?? '') || a.date.localeCompare(b.date);
            } else {
                result = a.date.localeCompare(b.date) || getArtistNames(a).localeCompare(getArtistNames(b));
            }

            // Direction toggle mirrors Artist List sorting
            return sortDirection === 'asc' ? result : -result;
        });
        return sorted;
    }, [filteredGigs, sortDirection, sortMode]);

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
        const artistNames = gig.artists.length ? gig.artists : [gig.artist];
        const isArtistRowExpanded = expandedArtistRows.has(gig.id);
        const visibleArtists = isArtistRowExpanded ? artistNames : artistNames.slice(0, 2);
        const hiddenArtistCount = artistNames.length - visibleArtists.length;
        const visibleArtistLabel = visibleArtists.map((artist) => artist.name).join(' \u00b7 ');
        const title = gig.gigName || gig.tour?.name;

        // Venue rows avoid full-address display names
        const locationParts = gig.venueName
            ? [title, gig.venueName]
            : [title, getCityLabel(gig)];
        const locationMeta = locationParts.filter(Boolean).join(' \u00b7 ');

        return (
            <li key={gig.id} className="group">
                <div className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-4 px-4 py-3">
                    <div className="flex shrink-0 flex-col items-center justify-center text-center">
                        <span className="text-xs font-semibold uppercase leading-none text-primary-contrast">{dateParts.month}</span>
                        <span className="text-3xl font-light leading-none text-text-secondary">{dateParts.day}</span>
                        <span className="mt-0.5 text-[10px] font-medium leading-none text-text-secondary">{dateParts.weekday}</span>
                    </div>

                    <div className="flex min-w-0 flex-col justify-center">
                        <div className={`flex min-w-0 items-center gap-1.5 ${isArtistRowExpanded ? 'flex-wrap' : 'overflow-hidden'}`}>
                            <span className={isArtistRowExpanded ? 'text-sm font-semibold leading-5 text-text' : 'min-w-0 truncate text-sm font-semibold leading-5 text-text'}>
                                {visibleArtistLabel}
                            </span>
                            {(hiddenArtistCount > 0 || isArtistRowExpanded) && (
                                <button
                                    type="button"
                                    onClick={() => toggleArtistRow(gig.id)}
                                    className="shrink-0 rounded-full border border-border-strong bg-transparent px-2 py-0.5 text-[11px] font-semibold leading-4 text-text-secondary transition-colors hover:border-transparent hover:bg-[#F3F4F6] hover:text-text app-dark:hover:bg-[#2C2C2E] app-dark:hover:text-text"
                                >
                                    {isArtistRowExpanded ? '-' : `+${hiddenArtistCount}`}
                                </button>
                            )}
                        </div>
                        <div className="relative mt-2 min-w-0">
                            <p className="truncate text-xs text-text-secondary">{locationMeta}</p>
                            {(onLocateGig || onEditGig || onDeleteGig) && (
                                <div className="absolute right-0 top-1/2 flex -translate-y-1/2 gap-1 bg-surface opacity-0 transition-opacity group-hover:opacity-100">
                                    {onLocateGig && (
                                        <IconButton
                                            aria-label={t('tour.actions.locateGig')}
                                            onClick={() => onLocateGig(gig)}
                                            size="sm"
                                            className="rounded text-text-secondary hover:bg-surface-muted hover:!text-text app-dark:hover:!text-text"
                                            title={t('tour.actions.locateGig')}
                                        >
                                            <MapPinIcon className="w-4 h-4" />
                                        </IconButton>
                                    )}
                                    {onEditGig && (
                                        <IconButton
                                            aria-label={t('common.edit')}
                                            onClick={() => onEditGig(gig)}
                                            size="sm"
                                            className="rounded text-text-secondary hover:bg-surface-muted hover:!text-text app-dark:hover:!text-text"
                                            title={t('common.edit')}
                                        >
                                            <EditIcon className="h-4 w-4" />
                                        </IconButton>
                                    )}
                                    {onDeleteGig && (
                                        <IconButton
                                            aria-label={t('common.delete')}
                                            onClick={() => onDeleteGig(gig)}
                                            size="sm"
                                            className="rounded text-text-secondary hover:bg-[rgb(220,38,38)] hover:!text-white app-dark:hover:!text-white"
                                            title={t('common.delete')}
                                        >
                                            <TrashIcon className="h-4 w-4" />
                                        </IconButton>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </li>
        );
    };

    return (
        <div className="absolute top-20 left-1/2 z-[1050] w-[calc(100vw-1rem)] max-w-80 -translate-x-1/2 font-sans sm:top-28 sm:right-2 sm:left-auto sm:w-80 sm:translate-x-0">
            <div role="region" aria-label={t('tour.panel.title')} className="flex max-h-[calc(100vh-6rem)] w-full flex-col overflow-hidden rounded-lg bg-surface shadow-xl sm:max-h-[calc(100vh-8rem)]">
                <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h2 className="text-lg font-semibold text-text">
                        {t('tour.panel.title')} ({gigs.length})
                    </h2>
                    <CloseButton onClick={onClose} size="md" />
                </div>

                <div className="px-4 py-2">
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
                    />
                    <div className="mt-2 flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-sm font-medium text-text-secondary">{t('tour.panel.sort.label')}</span>
                        <div ref={sortRef} className="relative min-w-0 flex-1">
                            <button
                                type="button"
                                aria-label={t('tour.panel.sort.ariaLabel')}
                                aria-haspopup="listbox"
                                aria-expanded={isSortOpen}
                                aria-controls={isSortOpen ? sortListboxId : undefined}
                                onClick={() => setIsSortOpen((open) => !open)}
                                className="relative w-full rounded-md border border-border-strong bg-surface px-3 py-2 pr-8 text-left text-sm text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-inset focus:ring-primary"
                            >
                                <span className="block truncate">{t(`tour.panel.sort.${sortMode}`)}</span>
                                <ChevronDownIcon className={`absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isSortOpen && (
                                <div
                                    id={sortListboxId}
                                    role="listbox"
                                    aria-label={t('tour.panel.sort.optionsLabel')}
                                    className="absolute left-0 top-full z-[1200] mt-1 w-full rounded-md border border-border-strong bg-surface shadow-lg"
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
                                        className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-secondary ${
                                            sortMode === option ? 'text-primary-contrast app-dark:text-primary font-medium' : 'text-text'
                                        }`}
                                    >
                                        {t(`tour.panel.sort.${option}`)}
                                    </button>
                                ))}
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            aria-label={sortDirection === 'asc' ? t('artistList.sort.ascending') : t('artistList.sort.descending')}
                            title={sortDirection === 'asc' ? t('artistList.sort.ascendingShort') : t('artistList.sort.descendingShort')}
                            onClick={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}
                            className="rounded text-text-muted hover:text-text-secondary hover:bg-surface-muted transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary focus-visible:ring-offset-surface p-2"
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

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Gig } from '../../types/gig';
import { CloseButton, IconButton } from '../ui';
import { ChevronDownIcon, EditIcon, SearchIcon, TrashIcon } from '../icons/GeneralIcons';
import { useTranslation } from 'react-i18next';

type GigPanelView = 'gig' | 'tour' | 'artist' | 'location';
type GigPanelSort = 'dateAsc' | 'dateDesc' | 'artist' | 'location' | 'tour';

interface GigPanelProps {
    gigs: Gig[];
    onClose: () => void;
    onEditGig?: (gig: Gig) => void;
    onDeleteGig?: (gig: Gig) => void;
}

const sortByDate = (gigs: Gig[]) => (
    [...gigs].sort((a, b) => a.date.localeCompare(b.date) || a.artist.name.localeCompare(b.artist.name))
);

const getArtistNames = (gig: Gig) => gig.artists.map((artist) => artist.name).join(', ') || gig.artist.name;

const getProvinceLabel = (gig: Gig) => {
    const parts = [gig.location.province, gig.location.country].filter(Boolean);
    return parts.join(', ') || gig.location.displayName || gig.location.city;
};

const getCityLabel = (gig: Gig) => gig.location.city || gig.location.displayName || getProvinceLabel(gig);

export function GigPanel({ gigs, onClose, onEditGig, onDeleteGig }: GigPanelProps) {
    const { i18n, t } = useTranslation();
    const [view, setView] = useState<GigPanelView>('gig');
    const [filterQuery, setFilterQuery] = useState('');
    const [sortMode, setSortMode] = useState<GigPanelSort>('dateAsc');
    const [isViewOpen, setIsViewOpen] = useState(false);
    const [isSortOpen, setIsSortOpen] = useState(false);
    const viewRef = useRef<HTMLDivElement>(null);
    const sortRef = useRef<HTMLDivElement>(null);
    const viewListboxId = 'gig-panel-view-options';
    const sortListboxId = 'gig-panel-sort-options';

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (!viewRef.current?.contains(target)) {
                setIsViewOpen(false);
            }
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

        return {
            month: new Intl.DateTimeFormat(i18n.language, { month: 'short' }).format(parsedDate).toUpperCase(),
            day: new Intl.DateTimeFormat(i18n.language, { day: 'numeric' }).format(parsedDate),
            weekday: new Intl.DateTimeFormat(i18n.language, { weekday: 'short' }).format(parsedDate),
        };
    };

    const filteredGigs = useMemo(() => {
        const normalizedQuery = filterQuery.trim().toLowerCase();
        if (!normalizedQuery) return gigs;

        return gigs.filter((gig) => {
            const searchText = [
                getArtistNames(gig),
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
            if (sortMode === 'dateDesc') {
                return b.date.localeCompare(a.date) || getArtistNames(a).localeCompare(getArtistNames(b));
            }
            if (sortMode === 'artist') {
                return getArtistNames(a).localeCompare(getArtistNames(b)) || a.date.localeCompare(b.date);
            }
            if (sortMode === 'location') {
                return getCityLabel(a).localeCompare(getCityLabel(b)) || a.date.localeCompare(b.date);
            }
            if (sortMode === 'tour') {
                return (a.tour?.name ?? '').localeCompare(b.tour?.name ?? '') || a.date.localeCompare(b.date);
            }
            return a.date.localeCompare(b.date) || getArtistNames(a).localeCompare(getArtistNames(b));
        });
        return sorted;
    }, [filteredGigs, sortMode]);

    const groupedGigs = useMemo(() => {
        if (view === 'gig') return [];

        const groups = new Map<string, { label: string; gigs: Gig[] }>();
        sortedGigs.forEach((gig) => {
            const entries = view === 'artist'
                ? gig.artists.map((artist) => ({ key: artist.id, label: artist.name }))
                : [{
                    key: view === 'tour'
                        ? gig.tour?.id ?? 'no-tour'
                        : `${gig.location.province || gig.location.city}-${gig.location.country || ''}`,
                    label: view === 'tour'
                        ? gig.tour?.name ?? t('tour.panel.noTour')
                        : getProvinceLabel(gig),
                }];

            entries.forEach((entry) => {
                const group = groups.get(entry.key) ?? { label: entry.label, gigs: [] };
                group.gigs.push(gig);
                groups.set(entry.key, group);
            });
        });

        return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
    }, [sortedGigs, t, view]);

    const renderGigRow = (gig: Gig) => {
        const dateParts = formatDateTile(gig.date);

        return (
            <li key={gig.id} className="group">
                <div className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted">
                    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md border border-border bg-surface text-center">
                        <span className="text-[10px] font-semibold uppercase leading-none text-text-secondary">{dateParts.month}</span>
                        <span className="text-2xl font-semibold leading-tight text-text">{dateParts.day}</span>
                        <span className="text-[10px] font-medium leading-none text-text-muted">{dateParts.weekday}</span>
                    </div>

                    <div className="flex min-h-14 min-w-0 flex-col justify-center">
                        <p className="truncate text-sm font-semibold text-text">{getArtistNames(gig)}</p>
                        <p className="mt-1 truncate text-xs text-text-secondary">{getCityLabel(gig)}</p>
                    </div>

                    <div className="flex min-h-14 w-14 shrink-0 items-center justify-end">
                        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                            {onEditGig && (
                                <IconButton
                                    aria-label={t('common.edit')}
                                    onClick={() => onEditGig(gig)}
                                    size="sm"
                                    className="rounded text-text-secondary hover:bg-primary hover:!text-white app-dark:hover:!text-white"
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

                <div className="space-y-2 border-b border-border px-4 py-3">
                    <div className="grid grid-cols-2 gap-2">
                        <div ref={viewRef} className="relative">
                            <span className="mb-1 block text-xs font-medium text-text-secondary">{t('tour.panel.controls.selection')}</span>
                            <button
                                type="button"
                                aria-label={t('tour.panel.controls.selection')}
                                aria-haspopup="listbox"
                                aria-expanded={isViewOpen}
                                aria-controls={isViewOpen ? viewListboxId : undefined}
                                onClick={() => setIsViewOpen((open) => !open)}
                                className="relative w-full rounded-md border border-border-strong bg-surface px-3 py-2 pr-8 text-left text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
                            >
                                <span className="block truncate">{t(`tour.panel.views.${view}`)}</span>
                                <ChevronDownIcon className={`absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary transition-transform ${isViewOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isViewOpen && (
                                <div
                                    id={viewListboxId}
                                    role="listbox"
                                    aria-label={t('tour.panel.controls.selection')}
                                    className="absolute left-0 top-full z-[1200] mt-1 w-full rounded-md border border-border-strong bg-surface shadow-lg"
                                >
                                {(['gig', 'tour', 'artist', 'location'] as const).map((option) => (
                                    <button
                                        key={option}
                                        type="button"
                                        role="option"
                                        aria-selected={view === option}
                                        onClick={() => {
                                            setView(option);
                                            setIsViewOpen(false);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-secondary ${
                                            view === option ? 'font-medium text-primary-contrast app-dark:text-primary' : 'text-text'
                                        }`}
                                    >
                                        {t(`tour.panel.views.${option}`)}
                                    </button>
                                ))}
                                </div>
                            )}
                        </div>
                        <div ref={sortRef} className="relative">
                            <span className="mb-1 block text-xs font-medium text-text-secondary">{t('tour.panel.controls.sort')}</span>
                            <button
                                type="button"
                                aria-label={t('tour.panel.controls.sort')}
                                aria-haspopup="listbox"
                                aria-expanded={isSortOpen}
                                aria-controls={isSortOpen ? sortListboxId : undefined}
                                onClick={() => setIsSortOpen((open) => !open)}
                                className="relative w-full rounded-md border border-border-strong bg-surface px-3 py-2 pr-8 text-left text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
                            >
                                <span className="block truncate">{t(`tour.panel.sort.${sortMode}`)}</span>
                                <ChevronDownIcon className={`absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
                            </button>
                            {isSortOpen && (
                                <div
                                    id={sortListboxId}
                                    role="listbox"
                                    aria-label={t('tour.panel.controls.sort')}
                                    className="absolute left-0 top-full z-[1200] mt-1 w-full rounded-md border border-border-strong bg-surface shadow-lg"
                                >
                                {(['dateAsc', 'dateDesc', 'artist', 'location', 'tour'] as const).map((option) => (
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
                                            sortMode === option ? 'font-medium text-primary-contrast app-dark:text-primary' : 'text-text'
                                        }`}
                                    >
                                        {t(`tour.panel.sort.${option}`)}
                                    </button>
                                ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="relative">
                        <input
                            aria-label={t('tour.panel.controls.filter')}
                            type="text"
                            autoComplete="off"
                            value={filterQuery}
                            onChange={(event) => setFilterQuery(event.target.value)}
                            placeholder={t('tour.panel.controls.filterPlaceholder')}
                            className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 pr-9 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
                        />
                        <SearchIcon className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {filteredGigs.length === 0 ? (
                        <div className="px-4 py-8 text-center text-sm text-text-secondary">
                            {filterQuery ? t('tour.panel.noResults') : t('tour.panel.empty')}
                        </div>
                    ) : view === 'gig' ? (
                        <ul className="divide-y divide-border">
                            {sortedGigs.map(renderGigRow)}
                        </ul>
                    ) : (
                        <div className="divide-y divide-border">
                            {groupedGigs.map((group) => (
                                <section key={group.label}>
                                    <div className="bg-surface-secondary px-4 py-2">
                                        <h3 className="truncate text-sm font-semibold text-text">
                                            {group.label} <span className="font-normal text-text-secondary">({group.gigs.length})</span>
                                        </h3>
                                    </div>
                                    <ul className="divide-y divide-border">
                                        {sortByDate(group.gigs).map(renderGigRow)}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

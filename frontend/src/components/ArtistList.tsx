import { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { getArtists, getArtistsByUsername, getFeaturedArtists } from '../services/api';
import { SearchIcon, EditIcon, TrashIcon, CopyIcon, ArrowUpIcon, ArrowDownIcon, ChevronDownIcon } from './icons/GeneralIcons';
import { MapPinIcon } from './icons/MapIcons';
import { getAvatarUrl } from '../utils/cloudinaryUrl';
import { formatLocationLocalized, getSearchableLocationText } from '../utils/locationUtils';
import { Input, Spinner, CloseButton } from './ui';
import ArtistCard from './ArtistCard';
import type { Artist } from '../types/artist';
import { useLocationLanguage } from '../context/LocationLanguageContext';
import { useArtistNameDisplay } from '../context/ArtistNameDisplayContext';
import { getArtistDisplayNameParts } from '../utils/artistNameDisplay';
import { useTranslation } from 'react-i18next';

interface ArtistListProps {
    username?: string;
    viewingFeatured?: boolean;
    onClose: () => void;
    closeSelectedSignal?: number;
    onSelectedArtistChange?: (open: boolean) => void;
    onNavigateToArtist?: (artist: Artist) => void;
    onEditArtist?: (artist: Artist) => void;
    onDeleteArtist?: (artist: Artist) => void;
    onAddGig?: (artist: Artist) => void;
    onCopyCollection?: (artistCount: number) => void;
    isCopyingCollection?: boolean;
}

const getPlaceholderUrl = (name: string) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=150&background=e5e7eb&color=9ca3af`;

type SortKey = 'dateAdded' | 'recentlyUpdated' | 'name' | 'activeLocation' | 'originLocation' | 'debutYear';
type SortDirection = 'asc' | 'desc';
type SelectedArtistState = {
    artist: Artist | null;
    closeSignal: number | undefined;
};

const sortOptions: Array<{ value: SortKey; labelKey: string; togglable: boolean }> = [
    { value: 'dateAdded', labelKey: 'artistList.sort.options.dateAdded', togglable: true },
    { value: 'recentlyUpdated', labelKey: 'artistList.sort.options.recentlyUpdated', togglable: true },
    { value: 'name', labelKey: 'artistList.sort.options.name', togglable: true },
    { value: 'activeLocation', labelKey: 'artistList.sort.options.activeLocation', togglable: true },
    { value: 'originLocation', labelKey: 'artistList.sort.options.originLocation', togglable: true },
    { value: 'debutYear', labelKey: 'artistList.sort.options.debutYear', togglable: true },
];

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

const getTimeValue = (value: Date | string | undefined) => {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
};

const ArtistList = ({
    username,
    viewingFeatured,
    onClose,
    closeSelectedSignal,
    onSelectedArtistChange,
    onNavigateToArtist,
    onEditArtist,
    onDeleteArtist,
    onAddGig,
    onCopyCollection,
    isCopyingCollection = false
}: ArtistListProps) => {
    const { t } = useTranslation();
    const { locationLanguage } = useLocationLanguage();
    const { artistNameDisplayMode } = useArtistNameDisplay();
    const [searchQuery, setSearchQuery] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('dateAdded');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [sortDropdownPos, setSortDropdownPos] = useState({ top: 0, left: 0, width: 0 });
    const [selectedArtistState, setSelectedArtistState] = useState<SelectedArtistState>({
        artist: null,
        closeSignal: closeSelectedSignal
    });
    const [cardPosition, setCardPosition] = useState<number>(0);
    const listRef = useRef<HTMLDivElement>(null);
    const sortRef = useRef<HTMLDivElement>(null);
    const sortDropdownRef = useRef<HTMLDivElement>(null);
    const sortListboxId = 'artist-list-sort-options';

    const { data: artists = [], isLoading } = useQuery({
        queryKey: ['artists', username, viewingFeatured],
        queryFn: () => {
            if (viewingFeatured) return getFeaturedArtists();
            if (username) return getArtistsByUsername(username);
            return getArtists();
        },
    });

    const selectedSortOption = sortOptions.find((option) => option.value === sortKey);
    const selectedArtist = selectedArtistState.closeSignal === closeSelectedSignal
        ? selectedArtistState.artist
        : null;

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
        const handleClickOutside = (e: MouseEvent) => {
            if (sortRef.current?.contains(e.target as Node) || sortDropdownRef.current?.contains(e.target as Node)) return;
            setIsSortOpen(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        // On mobile the list behaves like a dismissible overlay.
        const handlePointerDownOutside = (e: PointerEvent) => {
            if (!window.matchMedia('(max-width: 639px)').matches) return;
            if (listRef.current?.contains(e.target as Node)) return;
            onClose();
        };

        document.addEventListener('pointerdown', handlePointerDownOutside);
        return () => document.removeEventListener('pointerdown', handlePointerDownOutside);
    }, [onClose]);

    useEffect(() => {
        onSelectedArtistChange?.(!!selectedArtist);
    }, [onSelectedArtistChange, selectedArtist]);

    const filteredArtists = useMemo(() => artists.filter((artist) => {
        const q = searchQuery.toLowerCase();
        return artist.name.toLowerCase().includes(q) ||
            artist.romanizedName?.toLowerCase().includes(q) ||
            getSearchableLocationText(artist.activeLocation).includes(q) ||
            getSearchableLocationText(artist.originalLocation).includes(q);
    }), [artists, searchQuery]);

    const sortedArtists = useMemo(() => {
        const direction = sortDirection === 'asc' ? 1 : -1;

        return [...filteredArtists].sort((a, b) => {
            let result = 0;

            if (sortKey === 'dateAdded') {
                result = getTimeValue(a.createdAt) - getTimeValue(b.createdAt);
            } else if (sortKey === 'recentlyUpdated') {
                result = getTimeValue(a.updatedAt) - getTimeValue(b.updatedAt);
            } else if (sortKey === 'name') {
                result = collator.compare(
                    getArtistDisplayNameParts(a, artistNameDisplayMode).primary,
                    getArtistDisplayNameParts(b, artistNameDisplayMode).primary
                ) || collator.compare(a.name, b.name);
            } else if (sortKey === 'activeLocation') {
                result = collator.compare(
                    formatLocationLocalized(a.activeLocation, locationLanguage),
                    formatLocationLocalized(b.activeLocation, locationLanguage)
                ) || collator.compare(a.name, b.name);
            } else if (sortKey === 'originLocation') {
                result = collator.compare(
                    formatLocationLocalized(a.originalLocation, locationLanguage),
                    formatLocationLocalized(b.originalLocation, locationLanguage)
                ) || collator.compare(a.name, b.name);
            } else if (sortKey === 'debutYear') {
                const aYear = a.debutYear;
                const bYear = b.debutYear;
                const aMissing = aYear == null;
                const bMissing = bYear == null;
                if (aMissing || bMissing) {
                    result = aMissing === bMissing ? 0 : aMissing ? 1 : -1;
                    return result || collator.compare(a.name, b.name);
                }
                result = aYear - bYear;
            }

            return (result * direction) || collator.compare(a.name, b.name);
        });
    }, [artistNameDisplayMode, filteredArtists, locationLanguage, sortDirection, sortKey]);

    const positionArtistCard = (rowElement: HTMLElement) => {
        // Get the row's position relative to the wrapper
        const rowRect = rowElement.getBoundingClientRect();
        const wrapperRect = listRef.current?.getBoundingClientRect();
        if (wrapperRect) {
            // Calculate position relative to wrapper, centered on the row
            const rowCenterY = rowRect.top - wrapperRect.top + rowRect.height / 2;
            setCardPosition(rowCenterY);
        }
    };

    const handleRowClick = (artist: Artist, e: React.MouseEvent<HTMLElement>) => {
        positionArtistCard(e.currentTarget);
        setSelectedArtistState({
            artist: selectedArtist?.id === artist.id ? null : artist,
            closeSignal: closeSelectedSignal
        });
    };

    const handleRowKeyDown = (artist: Artist, e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key !== 'Enter' && e.key !== ' ') {
            return;
        }

        e.preventDefault();
        positionArtistCard(e.currentTarget);
        setSelectedArtistState({
            artist: selectedArtist?.id === artist.id ? null : artist,
            closeSignal: closeSelectedSignal
        });
    };

    const handleArtistCardClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!selectedArtist) return;

        // ArtistCard owns the overlay UI; the list owns edit/delete routing.
        const target = e.target as HTMLElement;
        const addGigButton = target.closest('[data-action="add-gig"]');
        const editButton = target.closest('[data-action="edit"]');
        const deleteButton = target.closest('[data-action="delete"]');

        if (addGigButton && onAddGig) {
            e.preventDefault();
            e.stopPropagation();
            onAddGig(selectedArtist);
            return;
        }

        if (editButton && onEditArtist) {
            e.preventDefault();
            e.stopPropagation();
            onEditArtist(selectedArtist);
            return;
        }

        if (deleteButton && onDeleteArtist) {
            e.preventDefault();
            e.stopPropagation();
            onDeleteArtist(selectedArtist);
        }
    };

    return (
        <div ref={listRef} className="absolute top-20 left-1/2 z-[1050] w-[calc(100vw-1rem)] max-w-sm -translate-x-1/2 font-sans sm:top-28 sm:right-2 sm:left-auto sm:translate-x-0">
            {/* Artist card - positioned to the left of the list */}
            {selectedArtist && (
                <div
                    className="absolute right-full mr-2 hidden sm:block"
                    style={{ top: cardPosition, transform: 'translateY(-50%)' }}
                    onClick={handleArtistCardClick}
                >
                    <ArtistCard
                        artist={selectedArtist}
                        showActions={!!(onEditArtist || onDeleteArtist)}
                        onAddGig={onAddGig}
                        locationLanguage={locationLanguage}
                        artistNameDisplayMode={artistNameDisplayMode}
                    />
                </div>
            )}

            {/* Main list panel */}
            <div
                role="region"
                aria-label={t('artistList.aria.region')}
                className="w-full bg-surface rounded-xl shadow-xl shadow-black/5 ring-1 ring-border/40 overflow-hidden flex flex-col max-h-[calc(100vh-6rem)] sm:max-h-[calc(100vh-8rem)]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60">
                <h2 className="text-base font-semibold tracking-tight text-text">
                    {viewingFeatured ? t('artistList.title.featured') : t('artistList.title.default')} ({artists.length})
                </h2>
                <div className="flex items-center gap-2">
                    {onCopyCollection && (
                        <button
                            type="button"
                            aria-label={t('artistList.actions.copyAll')}
                            title={t('artistList.actions.copyAll')}
                            disabled={isLoading || artists.length === 0}
                            onClick={() => onCopyCollection(artists.length)}
                            className="rounded-lg text-text-muted hover:text-text-secondary hover:bg-surface-muted transition-colors duration-150 p-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-text-muted disabled:hover:bg-transparent"
                        >
                            {isCopyingCollection ? (
                                <Spinner size="sm" className="w-5 h-5" />
                            ) : (
                                <CopyIcon className="w-5 h-5" />
                            )}
                        </button>
                    )}
                    <CloseButton onClick={onClose} size="md" />
                </div>
            </div>

            {/* Search & Sort */}
            <div className="px-4 py-3">
                <div className="flex items-center gap-2">
                <Input
                    aria-label={t('artistList.search.ariaLabel')}
                    type="text"
                    name="artist-list-search"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder={t('artistList.search.placeholder')}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    rightIcon={<SearchIcon className="w-4 h-4" />}
                    className="min-w-0 flex-1 rounded-lg"
                />
                    <div ref={sortRef} className="relative shrink-0">
                        <button
                            type="button"
                            aria-label={t('artistList.sort.ariaLabel')}
                            aria-haspopup="listbox"
                            aria-expanded={isSortOpen}
                            aria-controls={isSortOpen ? sortListboxId : undefined}
                            onClick={() => setIsSortOpen((open) => !open)}
                            className="flex min-w-[6.5rem] items-center justify-between gap-1.5 rounded-lg border border-border-strong bg-surface px-3 py-2 text-left text-sm text-text transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
                        >
                            <span className="block truncate">
                                {selectedSortOption ? t(selectedSortOption.labelKey) : t('artistList.sort.options.dateAdded')}
                            </span>
                            <ChevronDownIcon className={`absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isSortOpen && createPortal(
                            <div
                                id={sortListboxId}
                                role="listbox"
                                ref={sortDropdownRef}
                                aria-label={t('artistList.sort.optionsLabel')}
                                className="fixed z-[9999] overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-lg"
                                style={{
                                    top: `${sortDropdownPos.top}px`,
                                    left: `${sortDropdownPos.left}px`,
                                    width: `${sortDropdownPos.width}px`,
                                }}
                            >
                                {sortOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        role="option"
                                        aria-selected={option.value === sortKey}
                                        onClick={() => {
                                            setSortKey(option.value);
                                            setIsSortOpen(false);
                                        }}
                                        className={`w-full px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-surface-secondary ${
                                            option.value === sortKey ? 'text-primary-contrast app-dark:text-primary font-medium' : 'text-text'
                                        }`}
                                    >
                                        {t(option.labelKey)}
                                    </button>
                                ))}
                            </div>,
                            document.body
                        )}
                    </div>
                    {selectedSortOption?.togglable && (
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
                    )}
                </div>
            </div>

            {/* Artist list - max 8 rows visible */}
            <div className="overflow-y-auto flex-1 max-h-128">
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Spinner className="text-primary" />
                        </div>
                    ) : sortedArtists.length === 0 ? (
                        <div className="text-center py-8 text-text-secondary">
                            {searchQuery ? t('artistList.empty.noResults') : t('artistList.empty.noneAdded')}
                        </div>
                    ) : (
                        <ul className="divide-y divide-border">
                            {sortedArtists.map((artist) => {
                                const isActive = selectedArtist?.id === artist.id;
                                const displayName = getArtistDisplayNameParts(artist, artistNameDisplayMode);

                                return (
                                <li key={artist.id} className="group transition-colors duration-150 hover:bg-surface-secondary/60">
                                    <div
                                        role="button"
                                        aria-current={isActive ? 'true' : undefined}
                                        tabIndex={0}
                                        onClick={(e) => handleRowClick(artist, e)}
                                        onKeyDown={(e) => handleRowKeyDown(artist, e)}
                                        className={`w-full flex items-center gap-3 px-5 py-3 focus:outline-none cursor-pointer ${isActive ? 'bg-surface-secondary/50' : ''}`}
                                    >
                                        {/* Avatar */}
                                        <img
                                            src={getAvatarUrl(artist.sourceImage, artist.avatarCrop) || getPlaceholderUrl(artist.name)}
                                            alt={artist.name}
                                            className="w-10 h-10 rounded-full object-cover border border-border"
                                        />
                                        {/* Info */}
                                        <div className="flex-1 min-w-0 text-left overflow-hidden">
                                            <p
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-fit max-w-full truncate whitespace-nowrap text-sm font-medium text-text select-text cursor-text"
                                            >
                                                {displayName.primary}
                                            </p>
                                            {displayName.secondary && (
                                                <p
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-fit max-w-full truncate whitespace-nowrap text-xs text-text-secondary select-text cursor-text"
                                                >
                                                    {displayName.secondary}
                                                </p>
                                            )}
                                            <p
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-fit max-w-full truncate whitespace-nowrap text-xs text-text-secondary select-text cursor-text"
                                            >
                                                {formatLocationLocalized(artist.activeLocation, locationLanguage)}
                                            </p>
                                        </div>
                                        {/* Actions */}
                                        {(onNavigateToArtist || onEditArtist || onDeleteArtist) && (
                                            <div className="inline-flex shrink-0 items-center rounded-full bg-surface-muted p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                                                {onNavigateToArtist && (
                                                    <button
                                                        type="button"
                                                        aria-label={t('artistList.actions.goToLocation')}
                                                        onClick={(e) => { e.stopPropagation(); onNavigateToArtist(artist); }}
                                                        title={t('artistList.actions.goToLocation')}
                                                        className="grid h-8 w-8 place-items-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-border hover:text-text"
                                                    >
                                                        <MapPinIcon className="h-4 w-4" />
                                                    </button>
                                                )}
                                                {onEditArtist && (
                                                    <button
                                                        type="button"
                                                        aria-label={t('artistList.actions.edit')}
                                                        onClick={(e) => { e.stopPropagation(); onEditArtist(artist); }}
                                                        className="grid h-8 w-8 place-items-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-border hover:text-text"
                                                    >
                                                        <EditIcon className="h-4 w-4" />
                                                    </button>
                                                )}
                                                {onDeleteArtist && (
                                                    <button
                                                        type="button"
                                                        aria-label={t('artistList.actions.delete')}
                                                        onClick={(e) => { e.stopPropagation(); onDeleteArtist(artist); }}
                                                        title={t('artistList.actions.deleteShort')}
                                                        className="grid h-8 w-8 place-items-center rounded-full text-text-secondary transition-colors duration-150 hover:bg-[rgb(220,38,38)] hover:!text-white"
                                                    >
                                                        <TrashIcon className="h-4 w-4" />
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </li>
                                );
                            })}
                        </ul>
                    )}
            </div>
            </div>
        </div>
    );
};

export default ArtistList;

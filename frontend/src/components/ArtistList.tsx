import { useEffect, useMemo, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getArtists, getArtistsByUsername, getFeaturedArtists } from '../services/api';
import { SearchIcon, EditIcon, TrashIcon, CopyIcon, ArrowUpIcon, ArrowDownIcon, ChevronDownIcon } from './icons/GeneralIcons';
import { MapPinIcon } from './icons/MapIcons';
import { getAvatarUrl } from '../utils/cloudinaryUrl';
import { formatLocationLocalized, getSearchableLocationText } from '../utils/locationUtils';
import { Input, IconButton, Spinner, CloseButton } from './ui';
import ArtistProfile from './ArtistProfile';
import type { Artist } from '../types/artist';
import { useLocationLanguage } from '../context/LocationLanguageContext';

interface ArtistListProps {
    username?: string;
    viewingFeatured?: boolean;
    onClose: () => void;
    onNavigateToArtist?: (artist: Artist) => void;
    onEditArtist?: (artist: Artist) => void;
    onDeleteArtist?: (artist: Artist) => void;
    onCopyCollection?: (artistCount: number) => void;
    isCopyingCollection?: boolean;
}

const getPlaceholderUrl = (name: string) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=150&background=e5e7eb&color=9ca3af`;

type SortKey = 'dateAdded' | 'recentlyUpdated' | 'name' | 'activeLocation' | 'originLocation' | 'debutYear';
type SortDirection = 'asc' | 'desc';

const sortOptions: Array<{ value: SortKey; label: string; togglable: boolean }> = [
    { value: 'dateAdded', label: 'Date added', togglable: true },
    { value: 'recentlyUpdated', label: 'Recently updated', togglable: true },
    { value: 'name', label: 'Name', togglable: true },
    { value: 'activeLocation', label: 'Active location', togglable: true },
    { value: 'originLocation', label: 'Origin location', togglable: true },
    { value: 'debutYear', label: 'Debut year', togglable: true },
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
    onNavigateToArtist,
    onEditArtist,
    onDeleteArtist,
    onCopyCollection,
    isCopyingCollection = false
}: ArtistListProps) => {
    const { locationLanguage } = useLocationLanguage();
    const [searchQuery, setSearchQuery] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('dateAdded');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [isSortOpen, setIsSortOpen] = useState(false);
    const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
    const [cardPosition, setCardPosition] = useState<number>(0);
    const listRef = useRef<HTMLDivElement>(null);
    const sortRef = useRef<HTMLDivElement>(null);

    const { data: artists = [], isLoading } = useQuery({
        queryKey: ['artists', username, viewingFeatured],
        queryFn: () => {
            if (viewingFeatured) return getFeaturedArtists();
            if (username) return getArtistsByUsername(username);
            return getArtists();
        },
    });

    const selectedSortOption = sortOptions.find((option) => option.value === sortKey);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (sortRef.current && !sortRef.current.contains(e.target as Node)) {
                setIsSortOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

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
                result = collator.compare(a.romanizedName || a.name, b.romanizedName || b.name)
                    || collator.compare(a.name, b.name);
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
    }, [filteredArtists, locationLanguage, sortDirection, sortKey]);

    const positionProfileCard = (rowElement: HTMLElement) => {
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
        positionProfileCard(e.currentTarget);
        setSelectedArtist(selectedArtist?.id === artist.id ? null : artist);
    };

    const handleRowKeyDown = (artist: Artist, e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key !== 'Enter' && e.key !== ' ') {
            return;
        }

        e.preventDefault();
        positionProfileCard(e.currentTarget);
        setSelectedArtist(selectedArtist?.id === artist.id ? null : artist);
    };

    return (
        <div ref={listRef} className="absolute top-28 right-2 z-[1050] font-sans">
            {/* Artist card - positioned to the left of the list */}
            {selectedArtist && (
                <div
                    className="absolute right-full mr-2"
                    style={{ top: cardPosition, transform: 'translateY(-50%)' }}
                >
                    <ArtistProfile artist={selectedArtist} showActions={!!(onEditArtist || onDeleteArtist)} locationLanguage={locationLanguage} />
                </div>
            )}

            {/* Main list panel */}
            <div 
                role="region" 
                aria-label="artist list"
                className="w-80 bg-surface rounded-lg shadow-xl overflow-hidden flex flex-col max-h-[calc(100vh-8rem)]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <h2 className="text-lg font-semibold text-text">{viewingFeatured ? 'Featured Artists' : 'Artists'} ({artists.length})</h2>
                <div className="flex items-center gap-2">
                    {onCopyCollection && (
                        <button
                            type="button"
                            aria-label="Copy all artists to my map"
                            title="Copy all artists to my map"
                            disabled={isLoading || artists.length === 0}
                            onClick={() => onCopyCollection(artists.length)}
                            className="rounded text-text-muted hover:text-text-secondary hover:bg-surface-muted transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary p-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-text-muted disabled:hover:bg-transparent"
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

            {/* Search */}
            <div className="px-4 py-2">
                <Input
                    aria-label="Search artists or locations"
                    type="text"
                    name="artist-list-search"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Search artists or locations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    rightIcon={<SearchIcon className="w-4 h-4" />}
                />
                <div className="mt-2 flex min-w-0 items-center gap-2">
                    <span className="shrink-0 text-sm font-medium text-text-secondary">Sort by</span>
                    <div ref={sortRef} className="relative min-w-0 flex-1">
                        <button
                            type="button"
                            aria-label="Sort artists"
                            aria-haspopup="listbox"
                            aria-expanded={isSortOpen}
                            onClick={() => setIsSortOpen((open) => !open)}
                            className="relative w-full rounded-md border border-border-strong bg-surface px-3 py-2 pr-8 text-left text-sm text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-inset focus:ring-primary"
                        >
                            <span className="block truncate">{selectedSortOption?.label || 'Date added'}</span>
                            <ChevronDownIcon className={`absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary transition-transform ${isSortOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isSortOpen && (
                            <div
                                role="listbox"
                                className="absolute left-0 top-full z-[1200] mt-1 w-full rounded-md border border-border-strong bg-surface shadow-lg"
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
                                        className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-secondary ${
                                            option.value === sortKey ? 'bg-primary/5 text-primary font-medium' : 'text-text'
                                        }`}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {selectedSortOption?.togglable && (
                        <button
                            type="button"
                            aria-label={sortDirection === 'asc' ? 'Sort ascending' : 'Sort descending'}
                            title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
                            onClick={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}
                            className="rounded text-text-muted hover:text-text-secondary hover:bg-surface-muted transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary p-2"
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
                            {searchQuery ? 'No artists found' : 'No artists added yet'}
                        </div>
                    ) : (
                        <ul className="divide-y divide-border">
                            {sortedArtists.map((artist) => (
                                <li key={artist.id} className="group">
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={(e) => handleRowClick(artist, e)}
                                        onKeyDown={(e) => handleRowKeyDown(artist, e)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-muted transition-colors cursor-pointer ${selectedArtist?.id === artist.id ? 'bg-surface-muted' : ''}`}
                                    >
                                        {/* Avatar */}
                                        <img
                                            src={getAvatarUrl(artist.sourceImage, artist.avatarCrop) || getPlaceholderUrl(artist.name)}
                                            alt={artist.name}
                                            className="w-10 h-10 rounded-full object-cover border border-border"
                                        />
                                        {/* Info */}
                                        <div className="flex-1 min-w-0 text-left">
                                            <p
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-sm font-medium text-text select-text cursor-text whitespace-nowrap group-hover:truncate"
                                            >
                                                {artist.name}
                                            </p>
                                            <p
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-xs text-text-secondary select-text cursor-text whitespace-nowrap group-hover:truncate"
                                            >
                                                {formatLocationLocalized(artist.activeLocation, locationLanguage)}
                                            </p>
                                        </div>
                                        {/* Actions */}
                                        <div className="hidden group-hover:flex group-focus-within:flex gap-1 shrink-0">
                                            {onNavigateToArtist && (
                                                <IconButton
                                                    aria-label="Go to location"
                                                    onClick={(e) => { e.stopPropagation(); onNavigateToArtist(artist); }}
                                                    size="sm"
                                                    className="rounded hover:bg-primary hover:text-white text-text-secondary"
                                                    title="Go to location"
                                                >
                                                    <MapPinIcon className="w-4 h-4" />
                                                </IconButton>
                                            )}
                                            {onEditArtist && (
                                                <IconButton
                                                    aria-label="Edit artist"
                                                    onClick={(e) => { e.stopPropagation(); onEditArtist(artist); }}
                                                    size="sm"
                                                    className="rounded hover:bg-primary hover:text-white text-text-secondary"
                                                    title="Edit"
                                                >
                                                    <EditIcon className="w-4 h-4" />
                                                </IconButton>
                                            )}
                                            {onDeleteArtist && (
                                                <IconButton
                                                    aria-label="Delete artist"
                                                    onClick={(e) => { e.stopPropagation(); onDeleteArtist(artist); }}
                                                    size="sm"
                                                    className="rounded hover:bg-error hover:text-white text-text-secondary"
                                                    title="Delete"
                                                >
                                                    <TrashIcon className="w-4 h-4" />
                                                </IconButton>
                                            )}
                                        </div>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
            </div>
            </div>
        </div>
    );
};

export default ArtistList;

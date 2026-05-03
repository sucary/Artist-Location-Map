import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getArtists, getArtistsByUsername, getFeaturedArtists } from '../services/api';
import { SearchIcon, EditIcon, TrashIcon, CopyIcon } from './icons/GeneralIcons';
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
    const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
    const [cardPosition, setCardPosition] = useState<number>(0);
    const listRef = useRef<HTMLDivElement>(null);

    const { data: artists = [], isLoading } = useQuery({
        queryKey: ['artists', username, viewingFeatured],
        queryFn: () => {
            if (viewingFeatured) return getFeaturedArtists();
            if (username) return getArtistsByUsername(username);
            return getArtists();
        },
    });

    const filteredArtists = artists.filter((artist) => {
        const q = searchQuery.toLowerCase();
        return artist.name.toLowerCase().includes(q) ||
            artist.romanizedName?.toLowerCase().includes(q) ||
            getSearchableLocationText(artist.activeLocation).includes(q) ||
            getSearchableLocationText(artist.originalLocation).includes(q);
    });

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
                    placeholder="Search artists or locations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    rightIcon={<SearchIcon className="w-4 h-4" />}
                />
            </div>

            {/* Artist list - max 8 rows visible */}
            <div className="overflow-y-auto flex-1 max-h-128">
                {isLoading ? (
                    <div className="flex items-center justify-center py-8">
                        <Spinner className="text-primary" />
                    </div>
                ) : filteredArtists.length === 0 ? (
                    <div className="text-center py-8 text-text-secondary">
                        {searchQuery ? 'No artists found' : 'No artists added yet'}
                    </div>
                ) : (
                    <ul className="divide-y divide-border">
                        {filteredArtists.map((artist) => (
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

import { useState, type MouseEvent } from 'react';
import type { Artist, LocationLanguage } from '../types/artist';
import { HomeIcon, MusicIcon, YoutubeIcon, InstagramIcon, XIcon } from './icons/SocialIcons';
import { EditIcon, TrashIcon } from './icons/GeneralIcons';
import { getProfileUrl } from '../utils/cloudinaryUrl';
import { formatLocationLocalized } from '../utils/locationUtils';

interface ArtistProfileProps {
    artist: Artist;
    showActions?: boolean;
    locationLanguage?: LocationLanguage;
}

// URL sanitizer
const safeUrl = (url: string): string => {
    const trimmed = url.trim().toLowerCase();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        return url;
    }
    // Auto-prepend https:// for lazy users
    if (trimmed.includes('.') && !trimmed.includes(':')) {
        return `https://${url.trim()}`;
    }
    return '#';
};

// Placeholder for artists without profile picture
const getPlaceholderUrl = (name: string) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=320&background=e5e7eb&color=9ca3af`;

const ArtistProfile = ({ artist, showActions = true, locationLanguage = 'en' }: ArtistProfileProps) => {
    const [actionsVisible, setActionsVisible] = useState(false);
    // Use Cloudinary transformation for profile banner
    const backgroundImageUrl = getProfileUrl(artist.sourceImage, artist.profileCrop) || getPlaceholderUrl(artist.name);

    const handleCoverClick = (event: MouseEvent<HTMLDivElement>) => {
        if (!showActions || actionsVisible) return;
        if ((event.target as HTMLElement).closest('[data-action]')) return;

        // First touch reveals actions without firing edit or delete.
        event.preventDefault();
        event.stopPropagation();
        setActionsVisible(true);
    };
    
    return (
        <div className="w-80 flex flex-col rounded-lg bg-surface shadow-lg overflow-hidden font-sans">
            <style>{`
                .artist-cover:hover .artist-action-bar,
                .artist-cover.artist-actions-visible .artist-action-bar {
                    opacity: 1 !important;
                }
                @media (hover: hover) and (pointer: fine) {
                    .artist-cover:hover .artist-action-bar {
                        pointer-events: auto !important;
                    }
                }
                .artist-cover.artist-actions-visible .artist-action-bar {
                    pointer-events: auto !important;
                }
                .artist-action-edit:hover {
                    background-color: rgba(0, 0, 0, 0.65) !important;
                }
                .artist-action-delete:hover {
                    background-color: rgba(220, 38, 38, 0.95) !important;
                }
            `}</style>
            {/* Header with cover image */}
            <div
                className={`artist-cover relative w-full h-28 bg-surface-muted bg-cover bg-center ${actionsVisible ? 'artist-actions-visible' : ''}`}
                style={{ backgroundImage: `url(${backgroundImageUrl})` }}
                onClick={handleCoverClick}
            >
                {/* Bottom gradient for name readability */}
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-black/40 via-black/20 to-transparent pointer-events-none" />

                {/* Action bar: hover on desktop, first tap on touch screens. */}
                {showActions && (
                    <div
                        className="artist-action-bar absolute inset-0 flex"
                        style={{
                            opacity: 0,
                            pointerEvents: actionsVisible ? 'auto' : 'none',
                            transition: 'opacity 0.2s ease-in-out'
                        }}
                    >
                        {/* Edit */}
                        <div
                            className="artist-action-edit flex items-center justify-center cursor-pointer"
                            style={{ width: '80%', backgroundColor: 'rgba(0, 0, 0, 0.5)', transition: 'background-color 0.15s' }}
                            data-action="edit"
                            data-artist-id={artist.id}
                        >
                            <EditIcon className="w-6 h-6 text-white" />
                        </div>
                        {/* Delete */}
                        <div
                            className="artist-action-delete flex items-center justify-center cursor-pointer"
                            style={{ width: '20%', backgroundColor: 'rgba(239, 68, 68, 0.85)', transition: 'background-color 0.15s' }}
                            data-action="delete"
                            data-artist-id={artist.id}
                        >
                            <TrashIcon className="w-5 h-5 text-white" />
                        </div>
                    </div>
                )}

                {/* Artist Name */}
                <h3
                    className="absolute bottom-3 left-4 text-lg font-semibold text-white z-10 select-text cursor-text leading-none"
                    style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
                >
                    {artist.name}
                </h3>
            </div>

            {/* Content section */}
            <div className="px-4 pt-3 pb-2.5 flex flex-col gap-2.5">
                {/* Origin row */}
                <div className="flex items-center gap-4">
                    <span className="px-1 py-0.5 text-xs font-semibold bg-primary-light text-white border border-primary-light rounded">
                        Origin
                    </span>
                    <span className="text-sm text-text-secondary">
                        {formatLocationLocalized(artist.originalLocation, locationLanguage)}
                    </span>
                </div>

                {/* Active row */}
                <div className="flex items-center gap-4">
                    <span className="px-1 py-0.5 text-xs font-bold bg-primary-light text-white border border-primary-light rounded">
                        Active
                    </span>
                    <span className="text-sm text-text-secondary">
                        {formatLocationLocalized(artist.activeLocation, locationLanguage)}
                    </span>
                </div>

                {/* Divider */}
                <div className="h-px w-full bg-border" />

                {/* Footer row */}
                <div className="flex items-center justify-between min-h-7">
                    {/* Year */}
                    {artist.debutYear && (
                        <div className="flex items-center gap-0.5 text-sm text-text-secondary font-sans">
                            <span className="font-medium">{artist.debutYear}</span>
                            <svg aria-hidden="true" focusable="false" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                            <span className="px-3 py-1 text-sm font-medium text-text-secondary bg-surface-muted rounded-full">
                                {artist.inactiveYear || 'Present'}
                            </span>
                        </div>
                    )}
                    {/* Social icons */}
                    <div className="flex gap-3">
                        {artist.socialLinks?.website && (
                            <a href={safeUrl(artist.socialLinks.website)} target="_blank" rel="noopener noreferrer" className="!text-text-muted hover:!text-primary visited:!text-text-muted transition-colors">
                                <HomeIcon className="w-5 h-5" />
                            </a>
                        )}
                        {artist.socialLinks?.appleMusic && (
                            <a href={safeUrl(artist.socialLinks.appleMusic)} target="_blank" rel="noopener noreferrer" className="!text-text-muted hover:!text-primary visited:!text-text-muted transition-colors">
                                <MusicIcon className="w-5 h-5" />
                            </a>
                        )}
                        {artist.socialLinks?.youtube && (
                            <a href={safeUrl(artist.socialLinks.youtube)} target="_blank" rel="noopener noreferrer" className="!text-text-muted hover:!text-primary visited:!text-text-muted transition-colors">
                                <YoutubeIcon className="w-5 h-5" />
                            </a>
                        )}
                        {artist.socialLinks?.instagram && (
                            <a href={safeUrl(artist.socialLinks.instagram)} target="_blank" rel="noopener noreferrer" className="!text-text-muted hover:!text-primary visited:!text-text-muted transition-colors">
                                <InstagramIcon className="w-5 h-5" />
                            </a>
                        )}
                        {artist.socialLinks?.twitter && (
                            <a href={safeUrl(artist.socialLinks.twitter)} target="_blank" rel="noopener noreferrer" className="!text-text-muted hover:!text-primary visited:!text-text-muted transition-colors">
                                <XIcon className="w-5 h-5" />
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ArtistProfile;

import { useState, type MouseEvent } from 'react';
import type { Artist, LocationLanguage } from '../types/artist';
import { HomeIcon, MusicIcon, YoutubeIcon, InstagramIcon, XIcon } from './icons/SocialIcons';
import { CalendarIcon, EditIcon, TrashIcon } from './icons/GeneralIcons';
import { getProfileUrl } from '../utils/cloudinaryUrl';
import { formatLocationLocalized } from '../utils/locationUtils';
import { useTranslation } from 'react-i18next';
import { DEFAULT_ARTIST_NAME_DISPLAY_MODE, getArtistDisplayNameParts } from '../utils/artistNameDisplay';
import type { ArtistNameDisplayMode } from '../types/profile';

// Artist profile card display

interface ArtistCardProps {
    artist: Artist;
    showActions?: boolean;
    onAddGig?: (artist: Artist) => void;
    locationLanguage?: LocationLanguage;
    artistNameDisplayMode?: ArtistNameDisplayMode;
    hideWebsite?: boolean;
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

const ArtistCard = ({
    artist,
    showActions = true,
    onAddGig,
    locationLanguage = 'en',
    artistNameDisplayMode = DEFAULT_ARTIST_NAME_DISPLAY_MODE,
    hideWebsite = false
}: ArtistCardProps) => {
    const { t } = useTranslation();
    const [actionsVisible, setActionsVisible] = useState(false);
    const profileUrl = getProfileUrl(artist.sourceImage, artist.profileCrop);
    const displayName = getArtistDisplayNameParts(artist, artistNameDisplayMode);

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
                className={`artist-cover relative w-full h-28 bg-surface-muted bg-cover bg-center ${profileUrl ? '' : 'artist-banner-placeholder'} ${actionsVisible ? 'artist-actions-visible' : ''}`}
                style={profileUrl ? { backgroundImage: `url(${profileUrl})` } : undefined}
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
                        <button
                            type="button"
                            className="artist-action-edit flex appearance-none items-center justify-center border-0 p-0 cursor-pointer"
                            style={{ width: onAddGig ? '60%' : '80%', backgroundColor: 'rgba(0, 0, 0, 0.5)', transition: 'background-color 0.15s' }}
                            data-action="edit"
                            data-artist-id={artist.id}
                            aria-label={t('artistCard.actions.edit')}
                            title={t('artistCard.actions.edit')}
                        >
                            <EditIcon className="w-6 h-6 text-white" />
                        </button>
                        {onAddGig && (
                            <button
                                type="button"
                                className="artist-action-edit flex appearance-none items-center justify-center border-0 p-0 cursor-pointer"
                                style={{ width: '20%', backgroundColor: 'rgba(0, 0, 0, 0.55)', transition: 'background-color 0.15s' }}
                                data-action="add-gig"
                                data-artist-id={artist.id}
                                aria-label={t('tour.actions.addGig')}
                                title={t('tour.actions.addGig')}
                            >
                                <CalendarIcon className="w-5 h-5 text-white" />
                            </button>
                        )}
                        {/* Delete */}
                        <button
                            type="button"
                            className="artist-action-delete flex appearance-none items-center justify-center border-0 p-0 cursor-pointer"
                            style={{ width: '20%', backgroundColor: 'rgba(239, 68, 68, 0.85)', transition: 'background-color 0.15s' }}
                            data-action="delete"
                            data-artist-id={artist.id}
                            aria-label={t('artistCard.actions.delete')}
                            title={t('artistCard.actions.delete')}
                        >
                            <TrashIcon className="w-5 h-5 text-white" />
                        </button>
                    </div>
                )}

                {/* Artist Name */}
                <div
                    className="pointer-events-none absolute bottom-3 left-4 right-4 z-10"
                    style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
                >
                    <h3
                        className="pointer-events-auto w-fit max-w-full cursor-text select-text truncate text-lg font-semibold leading-tight text-white"
                        onClick={(event) => event.stopPropagation()}
                    >
                        {displayName.primary}
                    </h3>
                    {displayName.secondary && (
                        <p
                            className="pointer-events-auto mt-1 w-fit max-w-full cursor-text select-text truncate pb-px text-xs font-medium leading-snug text-white/90"
                            onClick={(event) => event.stopPropagation()}
                        >
                            {displayName.secondary}
                        </p>
                    )}
                </div>
            </div>

            {/* Content section */}
            <div className="flex flex-col gap-2 px-4 pb-3 pt-3">
                {/* Origin row */}
                <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-2">
                    <span className="w-11 justify-self-start whitespace-nowrap px-0.5 py-0.5 text-center text-xs font-semibold leading-tight bg-primary-contrast text-white border border-primary-contrast rounded">
                        {t('artistCard.fields.origin')}
                    </span>
                    <span className="min-w-0 text-sm text-text-secondary">
                        {formatLocationLocalized(artist.originalLocation, locationLanguage)}
                    </span>
                </div>

                {/* Active row */}
                <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-2">
                    <span className="w-11 justify-self-start whitespace-nowrap px-0.5 py-0.5 text-center text-xs font-bold leading-tight bg-primary-contrast text-white border border-primary-contrast rounded">
                        {t('artistCard.fields.active')}
                    </span>
                    <span className="min-w-0 text-sm text-text-secondary">
                        {formatLocationLocalized(artist.activeLocation, locationLanguage)}
                    </span>
                </div>

                {/* Divider */}
                <div className="h-px w-full bg-border" />

                {/* Footer row */}
                <div className="flex items-center justify-between min-h-7">
                    {/* Year */}
                    {artist.debutYear && (
                        <div className="flex items-center gap-1 text-sm text-text-secondary font-sans">
                            <span className="font-medium">{artist.debutYear}</span>
                            <svg aria-hidden="true" focusable="false" className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 18 15 12 9 6" />
                            </svg>
                            <span className="px-3 py-1 text-sm font-medium text-text-secondary bg-surface-muted rounded-full">
                                {artist.inactiveYear || t('artistCard.years.present')}
                            </span>
                        </div>
                    )}
                    {/* Social icons */}
                    <div className="flex gap-3">
                        {!hideWebsite && artist.socialLinks?.website && (
                            <a href={safeUrl(artist.socialLinks.website)} target="_blank" rel="noopener noreferrer" aria-label={t('artistCard.social.website')} className="!text-text-muted hover:!text-primary visited:!text-text-muted transition-colors">
                                <HomeIcon className="w-5 h-5" />
                            </a>
                        )}
                        {artist.socialLinks?.appleMusic && (
                            <a href={safeUrl(artist.socialLinks.appleMusic)} target="_blank" rel="noopener noreferrer" aria-label={t('artistCard.social.appleMusic')} className="!text-text-muted hover:!text-primary visited:!text-text-muted transition-colors">
                                <MusicIcon className="w-5 h-5" />
                            </a>
                        )}
                        {artist.socialLinks?.youtube && (
                            <a href={safeUrl(artist.socialLinks.youtube)} target="_blank" rel="noopener noreferrer" aria-label={t('artistCard.social.youtube')} className="!text-text-muted hover:!text-primary visited:!text-text-muted transition-colors">
                                <YoutubeIcon className="w-5 h-5" />
                            </a>
                        )}
                        {artist.socialLinks?.instagram && (
                            <a href={safeUrl(artist.socialLinks.instagram)} target="_blank" rel="noopener noreferrer" aria-label={t('artistCard.social.instagram')} className="!text-text-muted hover:!text-primary visited:!text-text-muted transition-colors">
                                <InstagramIcon className="w-5 h-5" />
                            </a>
                        )}
                        {artist.socialLinks?.twitter && (
                            <a href={safeUrl(artist.socialLinks.twitter)} target="_blank" rel="noopener noreferrer" aria-label={t('artistCard.social.twitter')} className="!text-text-muted hover:!text-primary visited:!text-text-muted transition-colors">
                                <XIcon className="w-5 h-5" />
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ArtistCard;

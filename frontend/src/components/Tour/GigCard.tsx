import { useEffect, useState, type MouseEvent } from 'react';
import type { Gig } from '../../types/gig';
import type { LocationLanguage } from '../../types/artist';
import { getAvatarUrl } from '../../utils/cloudinaryUrl';
import { formatLocationLocalized } from '../../utils/locationUtils';
import { useTranslation } from 'react-i18next';
import { formatGigDateTimeValue } from '../../utils/dateFormatting';
import { InlineActionMenu } from '../ui';
import { StarIcon } from '../icons/GeneralIcons';

// Gig marker popup display

interface GigCardProps {
    gig: Gig;
    locationLanguage?: LocationLanguage;
    showActions?: boolean;
    isStarred?: boolean;
    onToggleStar?: (gig: Gig) => void;
}

const getInitial = (name: string) => Array.from(name.trim())[0]?.toUpperCase();

const stripVenuePrefix = (label: string, venueName?: string | null) => {
    if (!venueName) return label;

    const normalizedVenue = venueName.trim();
    if (!normalizedVenue) return label;

    // Provider formatted addresses often repeat the venue name first
    const escapedVenue = normalizedVenue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return label.replace(new RegExp(`^${escapedVenue}\\s*,\\s*`, 'i'), '');
};

// Artist overflow toggle size invariant
const artistToggleButtonClass = 'inline-flex h-7 w-9 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-bold leading-none text-text transition-colors hover:bg-surface-secondary';
const COLLAPSED_CHIP_LIMIT = 2;
const COLLAPSED_STACK_LIMIT = 6;
// Dense counts fit fixed toggle capsules
const getArtistToggleButtonClass = (isStackToggle: boolean, hiddenCount: number) => {
    const sizeClass = isStackToggle ? 'h-11 w-11' : 'h-7 w-9';
    const textClass = hiddenCount >= 1000 ? 'text-[10px]' : hiddenCount >= 100 ? 'text-[11px]' : hiddenCount >= 10 ? 'text-xs' : 'text-base';

    return `inline-flex ${sizeClass} shrink-0 items-center justify-center rounded-full bg-surface-muted ${textClass} font-bold leading-none text-text transition-colors hover:bg-surface-secondary`;
};

export const GigCard = ({ gig, locationLanguage = 'en', showActions = true, isStarred = false, onToggleStar }: GigCardProps) => {
    const { i18n, t } = useTranslation();
    const [artistsExpanded, setArtistsExpanded] = useState(false);
    const [optimisticStarred, setOptimisticStarred] = useState(isStarred);
    const artists = gig.artists.length ? gig.artists : [gig.artist];
    const topSectionBackgroundUrl = getAvatarUrl(artists[0]?.sourceImage, artists[0]?.avatarCrop) || artists[0]?.sourceImage;
    const dateFallback = i18n.resolvedLanguage || i18n.language || undefined;
    const showArtistAvatarStack = !artistsExpanded && artists.length > COLLAPSED_CHIP_LIMIT;
    const collapsedVisibleCount = showArtistAvatarStack
        ? Math.min(COLLAPSED_STACK_LIMIT, artists.length - 1)
        : COLLAPSED_CHIP_LIMIT;
    const visibleArtists = artistsExpanded ? artists : artists.slice(0, collapsedVisibleCount);
    const hiddenArtistCount = artists.length - visibleArtists.length;
    const formattedDate = formatGigDateTimeValue(gig.date, gig.time, dateFallback);
    const locationLabel = stripVenuePrefix(formatLocationLocalized(gig.location, locationLanguage), gig.venueName);
    const hasTitleSection = Boolean(gig.gigName || gig.tour);
    const topSectionGapClass = 'gap-3';

    useEffect(() => {
        setOptimisticStarred(isStarred);
    }, [isStarred]);

    const renderArtistChip = (artist: typeof artists[number]) => {
        const avatarUrl = getAvatarUrl(artist.sourceImage, artist.avatarCrop);

        return (
            <span
                key={artist.id}
                className="inline-flex max-w-full shrink-0 items-center gap-1.5 overflow-hidden rounded-full bg-surface-muted py-1 pl-3 pr-1 text-sm font-medium text-text-secondary"
            >
                <span className="min-w-0 truncate">{artist.name}</span>
                {avatarUrl ? (
                    <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full">
                        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    </span>
                ) : (
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-secondary text-[10px] font-semibold text-text-secondary">
                        {getInitial(artist.name)}
                    </span>
                )}
            </span>
        );
    };

    const renderArtistAvatar = (artist: typeof artists[number], index: number) => {
        const avatarUrl = getAvatarUrl(artist.sourceImage, artist.avatarCrop);

        return (
            <span
                key={artist.id}
                title={artist.name}
                className={`grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border-0 text-sm font-bold text-white ${avatarUrl ? 'bg-transparent' : 'bg-primary'} ${index > 0 ? '-ml-3' : ''}`}
            >
                {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                    getInitial(artist.name)
                )}
            </span>
        );
    };

    const renderPrimaryArtist = (artist: typeof artists[number]) => {
        const avatarUrl = getAvatarUrl(artist.sourceImage, artist.avatarCrop);

        return (
            <div className="flex min-w-0 items-center justify-between gap-3">
                <span className="min-w-0 truncate text-lg font-semibold leading-7 text-text">{artist.name}</span>
                <span className={`grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border-0 text-sm font-bold text-white ${avatarUrl ? 'bg-transparent' : 'bg-primary'}`}>
                    {avatarUrl ? (
                        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                        getInitial(artist.name)
                    )}
                </span>
            </div>
        );
    };

    const renderSecondaryArtistName = (artist: typeof artists[number]) => (
        <span key={artist.id} className="min-w-0 truncate text-lg font-semibold leading-7 text-text">{artist.name}</span>
    );

    const renderSecondaryArtistAvatar = (artist: typeof artists[number], index: number) => {
        const avatarUrl = getAvatarUrl(artist.sourceImage, artist.avatarCrop);

        return (
            <span
                key={artist.id}
                className={`grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full border-0 text-sm font-bold text-white ${avatarUrl ? 'bg-transparent' : 'bg-primary'} ${index > 0 ? '-ml-3' : ''}`}
            >
                {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                    getInitial(artist.name)
                )}
            </span>
        );
    };

    const renderInfoBadge = (value: string) => (
        <span className="inline-flex max-w-full items-center rounded-lg bg-surface-muted px-3 py-1 text-sm font-medium leading-5 text-text-secondary">
            <span className="min-w-0 truncate">{value}</span>
        </span>
    );

    const expandArtists = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        setArtistsExpanded(true);
    };

    const collapseArtists = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        setArtistsExpanded(false);
    };

    const handleToggleStar = (event: MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        setOptimisticStarred((currentStarred) => !currentStarred);
        onToggleStar?.(gig);
    };

    return (
        <div className="flex w-80 flex-col overflow-hidden rounded-lg bg-surface font-sans shadow-lg ring-1 ring-border/40">
            <div className="relative overflow-hidden bg-surface">
                {onToggleStar && (
                    <button
                        type="button"
                        aria-label={optimisticStarred ? t('tour.actions.unstarGig') : t('tour.actions.starGig')}
                        title={optimisticStarred ? t('tour.actions.unstarGig') : t('tour.actions.starGig')}
                        onClick={handleToggleStar}
                        className={`absolute right-2 top-2 z-10 grid h-5 w-5 place-items-center rounded-full transition-colors hover:bg-surface-muted ${optimisticStarred ? 'text-text-secondary' : 'text-text-muted hover:text-text'}`}
                    >
                        <StarIcon className="h-3.5 w-3.5" filled={optimisticStarred} />
                    </button>
                )}
                {topSectionBackgroundUrl && (
                    <>
                        <img
                            aria-hidden="true"
                            src={topSectionBackgroundUrl}
                            alt=""
                            className="absolute inset-0 h-full w-full scale-125 object-cover opacity-60 blur-2xl"
                        />
                        <div aria-hidden="true" className="absolute inset-0 bg-surface/40" />
                    </>
                )}
                <div className={`relative flex flex-col px-5 pb-3 pt-5 ${topSectionGapClass}`}>
                {hasTitleSection && (
                    <div className="flex flex-col gap-1">
                        <h3 className="min-w-0 truncate text-xs font-medium leading-tight text-text-secondary">
                            {gig.tour?.name || gig.gigName}
                        </h3>
                        {gig.tour && gig.gigName && (
                            <p className="min-w-0 truncate text-[11px] font-medium text-text-muted">{gig.gigName}</p>
                        )}
                    </div>
                )}
                {artists.length === 1 && !artistsExpanded ? (
                    renderPrimaryArtist(artists[0])
                ) : artists.length === 2 && !artistsExpanded ? (
                    <div className="flex min-w-0 items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-col gap-2">
                            {artists.map(renderSecondaryArtistName)}
                        </div>
                        <div className="flex shrink-0 items-center">
                            {artists.map(renderSecondaryArtistAvatar)}
                        </div>
                    </div>
                ) : (
                    <div className={artistsExpanded ? 'flex flex-wrap gap-2' : `flex min-w-0 flex-nowrap items-center gap-2 overflow-hidden ${!hasTitleSection ? 'min-h-11' : ''}`}>
                        {showArtistAvatarStack ? (
                            <div className="flex min-w-0 shrink-0 items-center">
                                <button
                                    type="button"
                                    onClick={expandArtists}
                                    aria-label={t('common.expand', { defaultValue: 'Expand' })}
                                    className="flex min-w-0 shrink-0 items-center border-0 bg-transparent p-0"
                                >
                                    {visibleArtists.map(renderArtistAvatar)}
                                </button>
                                {hiddenArtistCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={expandArtists}
                                        className={`${getArtistToggleButtonClass(showArtistAvatarStack, hiddenArtistCount)} -ml-3`}
                                    >
                                        +{hiddenArtistCount}
                                    </button>
                                )}
                            </div>
                        ) : (
                            visibleArtists.map(renderArtistChip)
                        )}
                        {hiddenArtistCount > 0 && !showArtistAvatarStack && (
                            <button
                                type="button"
                                onClick={expandArtists}
                                className={getArtistToggleButtonClass(showArtistAvatarStack, hiddenArtistCount)}
                            >
                                +{hiddenArtistCount}
                            </button>
                        )}
                        {artistsExpanded && artists.length > 2 && (
                            <button
                                type="button"
                                onClick={collapseArtists}
                                aria-label={t('common.close', { defaultValue: 'Close' })}
                                className={artistToggleButtonClass}
                            >
                                -
                            </button>
                        )}
                    </div>
                )}
                </div>
            </div>

            <div className="group relative overflow-hidden rounded-b-lg">
                <div className="flex flex-col gap-3 border-t border-border/40 px-5 pb-4 pt-3">
                    <div className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-start gap-2 text-sm text-text-secondary">
                        <svg aria-hidden="true" focusable="false" className="mt-0.5 h-4 w-4 text-text-muted" viewBox="0 0 24 24" fill="none">
                            <path d="M12 21s7-5.1 7-11a7 7 0 10-14 0c0 5.9 7 11 7 11z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="2" />
                        </svg>
                        <span className="flex min-w-0 flex-col">
                            <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                                {gig.venueName && (
                                    <span className="min-w-0 break-words font-semibold leading-5 text-text">{gig.venueName}</span>
                                )}
                                <span className={`flex shrink-0 items-start justify-end transition-opacity ${showActions ? 'group-hover:opacity-0' : ''}`}>
                                    {renderInfoBadge(formattedDate)}
                                </span>
                            </span>
                            <span className="min-w-0 break-words leading-5">{locationLabel}</span>
                        </span>
                    </div>
                </div>
                {showActions && (
                    <InlineActionMenu
                        className="right-5 top-3"
                        actions={[
                            {
                                key: 'edit',
                                label: t('artistCard.actions.edit'),
                                title: t('artistCard.actions.edit'),
                                dataAction: 'edit',
                            },
                            {
                                key: 'delete',
                                label: t('artistCard.actions.delete'),
                                title: t('artistCard.actions.delete'),
                                dataAction: 'delete',
                            },
                        ]}
                    />
                )}
            </div>
        </div>
    );
};

import type { Gig } from '../../types/gig';
import type { LocationLanguage } from '../../types/artist';
import { getAvatarUrl } from '../../utils/cloudinaryUrl';
import { formatLocationLocalized } from '../../utils/locationUtils';
import { EditIcon, TrashIcon } from '../icons/GeneralIcons';
import { useTranslation } from 'react-i18next';
import { formatLocalizedDateValue } from '../../utils/dateFormatting';

interface GigCardProps {
    gig: Gig;
    locationLanguage?: LocationLanguage;
    showActions?: boolean;
}

export const GigCard = ({ gig, locationLanguage = 'en', showActions = true }: GigCardProps) => {
    const { i18n, t } = useTranslation();
    const avatarUrl = getAvatarUrl(gig.artist.sourceImage, gig.artist.avatarCrop);
    const artistNames = gig.artists.map((artist) => artist.name).join(', ');
    const title = gig.gigName || artistNames || gig.artist.name;
    const dateFallback = i18n.resolvedLanguage || i18n.language || undefined;

    return (
        <div className="w-80 overflow-hidden rounded-lg bg-surface font-sans shadow-lg">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                {avatarUrl ? (
                    <img src={avatarUrl} alt={gig.artist.name} className="h-11 w-11 rounded-full border border-border object-cover" />
                ) : (
                    <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-muted text-sm font-semibold text-text-muted">
                        {Array.from(gig.artist.name.trim())[0]?.toUpperCase()}
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-semibold text-text">{title}</h3>
                    {(gig.gigName || gig.artist.romanizedName) && (
                        <p className="truncate text-xs text-text-secondary">
                            {gig.gigName ? artistNames || gig.artist.name : gig.artist.romanizedName}
                        </p>
                    )}
                </div>
            </div>
            <div className="space-y-2 px-4 py-3 text-sm">
                <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('tour.fields.date')}</span>
                    <p className="font-medium text-text">{formatLocalizedDateValue(gig.date, { year: 'numeric', month: '2-digit', day: '2-digit' }, dateFallback)}</p>
                </div>
                {gig.tour && (
                    <div>
                        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('tour.fields.tour')}</span>
                        <p className="text-text">{gig.tour.name}</p>
                    </div>
                )}
                {gig.venueName && (
                    <div>
                        <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('tour.fields.venue')}</span>
                        <p className="text-text">{gig.venueName}</p>
                    </div>
                )}
                <div>
                    <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">{t('tour.fields.location')}</span>
                    <p className="text-text-secondary">{formatLocationLocalized(gig.location, locationLanguage)}</p>
                </div>
                {gig.externalUrl && (
                    <a href={gig.externalUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-medium text-primary-contrast hover:underline">
                        {t('tour.actions.viewEvent')}
                    </a>
                )}
            </div>
            {showActions && (
                <div className="flex border-t border-border">
                    <button
                        type="button"
                        data-action="edit"
                        className="flex flex-1 items-center justify-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-primary hover:text-white"
                    >
                        <EditIcon className="h-4 w-4" />
                        {t('common.edit', { defaultValue: 'Edit' })}
                    </button>
                    <button
                        type="button"
                        data-action="delete"
                        className="flex w-16 items-center justify-center px-3 py-2 text-error hover:bg-error hover:text-white"
                        aria-label={t('common.delete')}
                        title={t('common.delete')}
                    >
                        <TrashIcon className="h-4 w-4" />
                    </button>
                </div>
            )}
        </div>
    );
};

import type { TourModeState } from '../../types/gig';
import { Banner, HomeIcon } from '../Banner';
import { Trans, useTranslation } from 'react-i18next';
import { TransSpan } from '../i18n/TransComponents';
import { formatLocalizedDateValue } from '../../utils/dateFormatting';

interface TourBannerProps {
    tourMode: TourModeState;
    gigCount: number;
    highlightedCount: number;
    onExit: () => void;
}

const FUTURE_GIG_DATES_END = '9999-12-31';

export function TourBanner({ tourMode, gigCount, highlightedCount, onExit }: TourBannerProps) {
    const { i18n, t } = useTranslation();
    const showsAllFutureGigs = tourMode.interval?.to === FUTURE_GIG_DATES_END && !tourMode.selectedDay;
    const i18nKey = tourMode.selectedDay
        ? 'tour.banner.day'
        : tourMode.interval && !showsAllFutureGigs
            ? 'tour.banner.interval'
            : 'tour.banner.default';
    const count = tourMode.selectedDay ? highlightedCount : gigCount;
    const dateFallback = i18n.resolvedLanguage || i18n.language || undefined;

    return (
        <Banner
            label={t('tour.banner.label')}
            content={
                <Trans
                    i18nKey={i18nKey}
                    values={{
                        count,
                        from: tourMode.interval?.from ? formatLocalizedDateValue(tourMode.interval.from, { year: 'numeric', month: '2-digit', day: '2-digit' }, dateFallback) : undefined,
                        to: tourMode.interval?.to ? formatLocalizedDateValue(tourMode.interval.to, { year: 'numeric', month: '2-digit', day: '2-digit' }, dateFallback) : undefined,
                        day: tourMode.selectedDay ? formatLocalizedDateValue(tourMode.selectedDay, { year: 'numeric', month: '2-digit', day: '2-digit' }, dateFallback) : undefined,
                    }}
                    components={{
                        count: <TransSpan className="font-semibold text-primary-contrast app-dark:text-primary-text-dark" />,
                    }}
                />
            }
            action={{ type: 'icon', icon: <HomeIcon />, onClick: onExit, title: t('tour.actions.exitTourMode') }}
        />
    );
}

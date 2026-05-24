import type { TourModeState } from '../../types/gig';
import { Banner, HomeIcon } from '../Banner';
import { Trans, useTranslation } from 'react-i18next';
import { TransSpan } from '../i18n/TransComponents';

interface TourBannerProps {
    tourMode: TourModeState;
    gigCount: number;
    highlightedCount: number;
    onExit: () => void;
}

export function TourBanner({ tourMode, gigCount, highlightedCount, onExit }: TourBannerProps) {
    const { t } = useTranslation();
    const i18nKey = tourMode.selectedDay
        ? 'tour.banner.day'
        : tourMode.interval
            ? 'tour.banner.interval'
            : 'tour.banner.default';
    const count = tourMode.selectedDay ? highlightedCount : gigCount;

    return (
        <Banner
            label={t('tour.banner.label')}
            content={
                <Trans
                    i18nKey={i18nKey}
                    values={{
                        count,
                        from: tourMode.interval?.from,
                        to: tourMode.interval?.to,
                        day: tourMode.selectedDay,
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

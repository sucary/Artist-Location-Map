import type { TourModeState } from '../../types/gig';
import { Banner, HomeIcon } from '../Banner';
import { useTranslation } from 'react-i18next';
import { formatLocalizedDateValue } from '../../utils/dateFormatting';

interface TourBannerProps {
    tourMode: TourModeState;
    gigCount: number;
    highlightedCount: number;
    onExit: () => void;
}

const FUTURE_GIG_DATES_END = '9999-12-31';

function getDateYear(value?: string): string | null {
    if (!value) return null;
    return value.slice(0, 4);
}

function getDateDisplayOptions(value: string): Intl.DateTimeFormatOptions {
    // Current-year dates stay compact in the tour banner
    const currentYear = String(new Date().getFullYear());
    const dateYear = getDateYear(value);
    return dateYear === currentYear
        ? { month: 'short', day: 'numeric' }
        : { year: 'numeric', month: 'short', day: 'numeric' };
}

function getSameYearRangeLabel(from: string, to: string, fallback?: string): string {
    const fromDate = formatLocalizedDateValue(from, getDateDisplayOptions(from), fallback);
    const toDate = formatLocalizedDateValue(to, { month: 'short', day: 'numeric' }, fallback);
    return `${fromDate} - ${toDate}`;
}

export function TourBanner({ tourMode, gigCount, highlightedCount, onExit }: TourBannerProps) {
    const { i18n, t } = useTranslation();
    const showsAllFutureGigs = tourMode.interval?.to === FUTURE_GIG_DATES_END && !tourMode.selectedDay;
    const showsAllDates = !tourMode.interval && !tourMode.selectedDay;
    const showsSingleDate = Boolean(tourMode.interval?.from && tourMode.interval.to && tourMode.interval.from === tourMode.interval.to);
    const sameIntervalYear = getDateYear(tourMode.interval?.from) === getDateYear(tourMode.interval?.to);
    const count = tourMode.selectedDay ? highlightedCount : gigCount;
    const dateFallback = i18n.resolvedLanguage || i18n.language || undefined;
    const intervalLabel = tourMode.interval?.from && tourMode.interval.to
        ? sameIntervalYear
            ? getSameYearRangeLabel(tourMode.interval.from, tourMode.interval.to, dateFallback)
            : `${formatLocalizedDateValue(tourMode.interval.from, getDateDisplayOptions(tourMode.interval.from), dateFallback)} - ${formatLocalizedDateValue(tourMode.interval.to, getDateDisplayOptions(tourMode.interval.to), dateFallback)}`
        : '';
    const scopeLabel = tourMode.selectedDay
        ? formatLocalizedDateValue(tourMode.selectedDay, getDateDisplayOptions(tourMode.selectedDay), dateFallback)
        : showsAllDates
            ? t('tour.banner.scope.allTime', { defaultValue: 'All time' })
            : showsAllFutureGigs
                ? ''
                : showsSingleDate && tourMode.interval?.from
                    ? formatLocalizedDateValue(tourMode.interval.from, getDateDisplayOptions(tourMode.interval.from), dateFallback)
                    : intervalLabel;
    const countLabel = showsAllFutureGigs
        ? t('tour.banner.countLabelUpcoming', { count, defaultValue: count === 1 ? 'upcoming gig' : 'upcoming gigs' })
        : t('tour.banner.countLabel', { count, defaultValue: count === 1 ? 'gig' : 'gigs' });

    return (
        <Banner
            label={t('tour.banner.label')}
            className="min-w-40"
            centerContent
            contentClassName="text-text"
            content={
                <div className="flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap text-sm leading-5 text-text">
                    <span className="inline-flex h-5 min-w-7 items-center justify-center rounded-full bg-primary-contrast px-2 text-xs font-bold leading-5 tabular-nums text-white">
                        {count}
                    </span>
                    <span className="inline-flex h-5 items-center leading-5 text-text">
                        {countLabel}
                    </span>
                    {scopeLabel && (
                        <>
                            <span aria-hidden="true" className="inline-flex h-5 items-center text-xs leading-5 text-text-muted">
                                ·
                            </span>
                            <span className="inline-flex h-5 min-w-0 items-center truncate text-xs leading-5 text-text-secondary">
                                {scopeLabel}
                            </span>
                        </>
                    )}
                </div>
            }
            action={{ type: 'icon', icon: <HomeIcon />, onClick: onExit, title: t('tour.actions.exitTourMode') }}
        />
    );
}

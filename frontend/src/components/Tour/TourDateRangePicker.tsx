import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CalendarIcon, ChevronDownIcon } from '../icons/GeneralIcons';
import { getBrowserDateLocale, getLocalizedWeekdayLabels } from '../../utils/dateFormatting';
import {
    addMonths,
    getCalendarDays,
    getMonthStart,
    toDateValue,
} from './GigDatePicker';

interface TourDateRangePickerProps {
    from: string;
    to: string;
    visibleMonth: Date;
    onChange: (from: string, to: string) => void;
    onVisibleMonthChange: (month: Date) => void;
    onReset: () => void;
}

function isBetween(dateValue: string, from: string, to: string): boolean {
    return Boolean(from && to && dateValue > from && dateValue < to);
}

const FUTURE_GIG_DATES_END = '9999-12-31';
const ALL_GIG_DATES_START = '0001-01-01';

const getIsMobileDateRangeLayout = () => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
);

function getRangeFillClass(
    isStart: boolean,
    isEnd: boolean,
    isInRange: boolean,
    dayIndex: number
): string {
    if (!isStart && !isEnd && !isInRange) return '';

    const startsVisualRow = dayIndex % 7 === 0;
    const endsVisualRow = dayIndex % 7 === 6;
    const leftRadius = startsVisualRow ? 'rounded-l-md' : '';
    const rightRadius = endsVisualRow ? 'rounded-r-md' : '';

    if (isStart && isEnd) return 'inset-x-0 rounded-md';
    if (isStart && endsVisualRow) return '';
    if (isEnd && startsVisualRow) return '';
    if (isStart) return `right-0 w-1/2 ${rightRadius}`;
    if (isEnd) return `left-0 w-1/2 ${leftRadius}`;
    if (isInRange) return `inset-x-0 ${leftRadius} ${rightRadius}`;
    return '';
}

export function TourDateRangePicker({ from, to, visibleMonth, onChange, onVisibleMonthChange, onReset }: TourDateRangePickerProps) {
    const { i18n, t } = useTranslation();
    const rootRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const clickStartedInsideRef = useRef(false);
    const [isOpen, setIsOpen] = useState(false);
    const [isMobileLayout, setIsMobileLayout] = useState(getIsMobileDateRangeLayout);
    const [dropdownPosition, setDropdownPosition] = useState({
        top: null as number | null,
        left: 8,
        bottom: null as number | null,
        width: 0,
        maxHeight: 560,
        opensAbove: true,
    });
    const dateFallback = i18n.resolvedLanguage || i18n.language || undefined;
    const locale = useMemo(() => getBrowserDateLocale(dateFallback), [dateFallback]);

    const closePicker = useCallback(() => {
        if (from && !to) {
            onChange(from, from);
        }
        setIsOpen(false);
    }, [from, onChange, to]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (clickStartedInsideRef.current) {
                clickStartedInsideRef.current = false;
                return;
            }
            if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
            closePicker();
        };

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [closePicker]);

    useEffect(() => {
        const media = window.matchMedia('(max-width: 639px)');
        const handleChange = () => setIsMobileLayout(media.matches);

        // Date range layout follows the same breakpoint as map controls
        handleChange();
        media.addEventListener('change', handleChange);
        return () => media.removeEventListener('change', handleChange);
    }, []);

    const markInternalPointerDown = () => {
        clickStartedInsideRef.current = true;
    };

    useEffect(() => {
        if (!isOpen || !rootRef.current) return;

        const updateDropdownPosition = () => {
            const rect = rootRef.current?.getBoundingClientRect();
            if (!rect) return;

            const gap = 8;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const availableBelow = Math.max(0, viewportHeight - rect.bottom - gap);
            const availableAbove = Math.max(0, rect.top - gap);
            const opensAbove = availableBelow < 380 && availableAbove > availableBelow;
            const availableHeight = opensAbove ? availableAbove : availableBelow;
            const pickerWidth = isMobileLayout ? 380 : 680;
            const width = Math.min(viewportWidth - gap * 2, pickerWidth);
            const maxLeft = Math.max(gap, viewportWidth - width - gap);
            const preferredLeft = rect.left + rect.width / 2 - width / 2;
            const left = Math.min(Math.max(gap, preferredLeft), maxLeft);
            const maxHeight = Math.min(500, Math.max(0, availableHeight), Math.max(0, viewportHeight - gap * 2));

            // Viewport clamp keeps the floating picker inside narrow map screens
            setDropdownPosition({
                top: opensAbove ? null : rect.bottom + gap,
                left,
                bottom: opensAbove ? viewportHeight - rect.top + gap : null,
                width,
                maxHeight,
                opensAbove,
            });
        };

        updateDropdownPosition();
        window.addEventListener('resize', updateDropdownPosition);
        window.addEventListener('orientationchange', updateDropdownPosition);
        return () => {
            window.removeEventListener('resize', updateDropdownPosition);
            window.removeEventListener('orientationchange', updateDropdownPosition);
        };
    }, [isMobileLayout, isOpen, visibleMonth]);

    const weekdays = useMemo(() => getLocalizedWeekdayLabels(dateFallback, locale, 'narrow'), [dateFallback, locale]);

    const months = useMemo(() => (
        isMobileLayout ? [visibleMonth] : [visibleMonth, addMonths(visibleMonth, 1)]
    ), [isMobileLayout, visibleMonth]);
    const calendarId = 'tour-date-range-calendar';
    const todayValue = toDateValue(new Date());
    const isAllDates = !from && !to;

    const togglePicker = () => {
        if (isOpen) {
            closePicker();
            return;
        }
        setIsOpen(true);
    };

    const selectDate = (date: Date) => {
        const dateValue = toDateValue(date);
        if (!from || to || dateValue < from) {
            onChange(dateValue, '');
            onVisibleMonthChange(getMonthStart(date));
            return;
        }

        onChange(from, dateValue);
    };

    const selectAllFutureDates = () => {
        onChange(todayValue, FUTURE_GIG_DATES_END);
    };

    const selectAllDates = () => {
        onReset();
    };

    return (
        <div className="relative min-w-0 overflow-hidden rounded-md bg-surface shadow-md" ref={rootRef}>
            <button
                id="tour-date-range"
                type="button"
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                aria-controls={isOpen ? calendarId : undefined}
                onPointerDown={markInternalPointerDown}
                onClick={togglePicker}
                className="group grid h-9 w-32 grid-cols-[18px_minmax(0,1fr)] items-center gap-1 rounded-md px-2 text-left text-sm font-medium text-text transition-colors hover:bg-surface-muted focus:outline-none app-dark:hover:bg-transparent app-dark:hover:text-primary"
            >
                <CalendarIcon className="h-4 w-4 justify-self-start text-text-secondary transition-colors app-dark:group-hover:text-primary" />
                <span className="min-w-0 truncate">
                    {t('tour.calendar.dateRange', { defaultValue: 'Date range' })}
                </span>
            </button>

            {isOpen && createPortal(
                <div
                    id={calendarId}
                    ref={dropdownRef}
                    role="dialog"
                    aria-label={t('tour.calendar.dateRange', { defaultValue: 'Date range' })}
                    onPointerDown={markInternalPointerDown}
                    className="fixed z-[9999] flex flex-col overflow-y-auto rounded-lg border border-border-strong bg-surface px-3 pb-4 pt-4 shadow-[0_-8px_24px_rgba(15,23,42,0.12),0_0_12px_rgba(15,23,42,0.08)] app-dark:shadow-[0_-10px_28px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)] sm:px-5 sm:pb-5"
                    style={{
                        top: dropdownPosition.top === null ? undefined : `${dropdownPosition.top}px`,
                        left: `${dropdownPosition.left}px`,
                        bottom: dropdownPosition.bottom === null ? undefined : `${dropdownPosition.bottom}px`,
                        width: `${dropdownPosition.width}px`,
                        maxHeight: `${dropdownPosition.maxHeight}px`,
                    }}
                >
                    <div className="grid min-h-0 grid-cols-1 gap-6 overflow-hidden sm:grid-cols-2">
                        {months.map((month, monthIndex) => {
                            const showPreviousMonthButton = monthIndex === 0;
                            const showNextMonthButton = isMobileLayout ? monthIndex === 0 : monthIndex === months.length - 1;

                            return (
                                <div key={toDateValue(month)} className="min-w-0">
                                    <div className="relative mb-3 flex h-8 items-center justify-center text-center text-base font-bold text-text">
                                        {showPreviousMonthButton && (
                                            <button
                                                type="button"
                                                aria-label={t('tour.calendar.previousMonth')}
                                                onClick={() => onVisibleMonthChange(addMonths(visibleMonth, -1))}
                                                className="absolute left-0 top-0 grid h-8 w-8 place-items-center rounded-full text-text transition-colors hover:bg-surface-muted"
                                            >
                                                <ChevronDownIcon className="h-4 w-4 rotate-90" />
                                            </button>
                                        )}
                                        {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month)}
                                        {showNextMonthButton && (
                                            <button
                                                type="button"
                                                aria-label={t('tour.calendar.nextMonth')}
                                                onClick={() => onVisibleMonthChange(addMonths(visibleMonth, 1))}
                                                className="absolute right-0 top-0 grid h-8 w-8 place-items-center rounded-full text-text transition-colors hover:bg-surface-muted"
                                            >
                                                <ChevronDownIcon className="h-4 w-4 -rotate-90" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-7 text-center text-xs font-normal text-text-secondary">
                                        {weekdays.map((weekday, index) => (
                                            <div key={`${weekday}-${index}`} className="h-8 leading-8">
                                                {weekday}
                                            </div>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-7">
                                        {getCalendarDays(month).map((date, dayIndex) => {
                                            const dateValue = toDateValue(date);
                                            // All-time mode uses sentinel bounds for visual range coverage
                                            const visualFrom = isAllDates ? ALL_GIG_DATES_START : from;
                                            const visualTo = isAllDates ? FUTURE_GIG_DATES_END : to;
                                            const hasCompleteRange = Boolean(visualFrom && visualTo);
                                            const isStart = hasCompleteRange && dateValue === visualFrom;
                                            const isEnd = hasCompleteRange && dateValue === visualTo;
                                            const isPendingStart = !hasCompleteRange && dateValue === from;
                                            const inRange = isBetween(dateValue, visualFrom, visualTo);
                                            const isCurrentMonth = date.getMonth() === month.getMonth();
                                            const rangeClass = isStart && isEnd ? '' : getRangeFillClass(isStart, isEnd, inRange, dayIndex);
                                            const isSelectedInterval = isStart || isEnd || isPendingStart || inRange;

                                            return (
                                                <div key={dateValue} className="relative grid h-10 place-items-center">
                                                    {rangeClass && (
                                                        <span className={`absolute top-1/2 h-9 -translate-y-1/2 bg-primary-contrast/10 ${rangeClass}`} />
                                                    )}
                                                    <button
                                                        type="button"
                                                        aria-label={new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(date)}
                                                        aria-pressed={isStart || isEnd || isPendingStart}
                                                        onClick={() => selectDate(date)}
                                                        className={`relative z-10 grid h-9 w-9 place-items-center rounded-full text-sm font-medium transition-colors ${
                                                            isStart || isEnd || isPendingStart
                                                                ? 'bg-primary-contrast text-white'
                                                                : isSelectedInterval
                                                                    ? 'text-text'
                                                                    : isCurrentMonth
                                                                    ? 'text-text hover:bg-surface-muted'
                                                                    : 'text-text-muted hover:bg-surface-muted hover:text-text-secondary'
                                                        }`}
                                                    >
                                                        {date.getDate()}
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-4 flex shrink-0 items-center justify-between gap-3 border-t border-border pt-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <button
                                type="button"
                                onClick={selectAllFutureDates}
                                className="rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-muted hover:text-text"
                            >
                                {t('tour.actions.upcomingGigs', { defaultValue: 'Upcoming gigs' })}
                            </button>
                            <button
                                type="button"
                                onClick={selectAllDates}
                                className="rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-muted hover:text-text"
                            >
                                {t('tour.actions.allDates', { defaultValue: 'All dates' })}
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={closePicker}
                            className="rounded-lg bg-primary-contrast px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                        >
                            {t('common.apply', { defaultValue: 'Apply' })}
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

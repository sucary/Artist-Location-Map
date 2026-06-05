import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon } from '../icons/GeneralIcons';
import { formatLocalizedDate, getBrowserDateLocale } from '../../utils/dateFormatting';
import {
    addMonths,
    getCalendarDays,
    getMonthStart,
    parseDateValue,
    toDateValue,
    WEEK_START,
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

function formatNumericDate(value: string, fallback?: string): string {
    const date = parseDateValue(value);
    if (!date) return '';
    return formatLocalizedDate(date, { month: '2-digit', day: '2-digit' }, fallback);
}

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
    const [dropdownPosition, setDropdownPosition] = useState({
        top: null as number | null,
        right: 0,
        bottom: null as number | null,
        width: 0,
        maxHeight: 560,
        opensAbove: true,
    });
    const locale = useMemo(() => getBrowserDateLocale(i18n.resolvedLanguage || i18n.language || undefined), [i18n.language, i18n.resolvedLanguage]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (clickStartedInsideRef.current) {
                clickStartedInsideRef.current = false;
                return;
            }
            if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
            setIsOpen(false);
        };

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const markInternalPointerDown = () => {
        clickStartedInsideRef.current = true;
    };

    useEffect(() => {
        if (!isOpen || !rootRef.current) return;

        const rect = rootRef.current.getBoundingClientRect();
        const gap = 8;
        const availableBelow = window.innerHeight - rect.bottom - gap;
        const availableAbove = rect.top - gap;
        const opensAbove = availableBelow < 380 && availableAbove > availableBelow;
        const maxHeight = Math.max(320, Math.min(500, opensAbove ? availableAbove : availableBelow));
        const width = Math.min(window.innerWidth - 16, 680);
        const right = Math.max(8, window.innerWidth - rect.right);

        // Edge anchoring keeps the panel physically attached to the trigger
        setDropdownPosition({
            top: opensAbove ? null : rect.bottom + gap,
            right,
            bottom: opensAbove ? window.innerHeight - rect.top + gap : null,
            width,
            maxHeight,
            opensAbove,
        });
    }, [isOpen, visibleMonth]);

    const weekdays = useMemo(() => {
        const base = new Date(2024, 0, WEEK_START);
        return Array.from({ length: 7 }, (_, index) => {
            const day = new Date(base);
            day.setDate(base.getDate() + index);
            return new Intl.DateTimeFormat(locale, { weekday: 'narrow' }).format(day);
        });
    }, [locale]);

    const months = useMemo(() => [visibleMonth, addMonths(visibleMonth, 1)], [visibleMonth]);
    const startDisplayValue = from ? formatNumericDate(from, i18n.resolvedLanguage || i18n.language || undefined) : '--/--';
    const endDisplayValue = to ? formatNumericDate(to, i18n.resolvedLanguage || i18n.language || undefined) : '--/--';
    const hasCompleteRange = Boolean(from && to);

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
        onChange(toDateValue(new Date()), '9999-12-31');
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
                onPointerDown={markInternalPointerDown}
                onClick={() => setIsOpen((open) => !open)}
                className="grid h-9 w-32 grid-cols-[48px_16px_48px] items-center justify-center text-center text-sm font-medium text-text transition-colors hover:bg-surface-muted focus:outline-none app-dark:hover:bg-transparent app-dark:hover:text-primary"
            >
                {from ? (
                    <span className="tabular-nums">
                        {startDisplayValue}
                    </span>
                ) : (
                    <span className="col-span-3 text-text-muted">
                        {t('tour.calendar.selectDate')}
                    </span>
                )}
                {hasCompleteRange && (
                    <>
                        <span className="text-text-secondary">-</span>
                        <span className="tabular-nums">
                            {endDisplayValue}
                        </span>
                    </>
                )}
            </button>

            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    onPointerDown={markInternalPointerDown}
                    className="fixed z-[9999] overflow-y-auto rounded-lg border border-border-strong bg-surface px-5 pb-5 pt-4 shadow-[0_-8px_24px_rgba(15,23,42,0.12),0_0_12px_rgba(15,23,42,0.08)] app-dark:shadow-[0_-10px_28px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)]"
                    style={{
                        top: dropdownPosition.top === null ? undefined : `${dropdownPosition.top}px`,
                        right: `${dropdownPosition.right}px`,
                        bottom: dropdownPosition.bottom === null ? undefined : `${dropdownPosition.bottom}px`,
                        width: `${dropdownPosition.width}px`,
                        maxHeight: `${dropdownPosition.maxHeight}px`,
                    }}
                >
                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                        {months.map((month, monthIndex) => (
                            <div key={toDateValue(month)} className="min-w-0">
                                <div className="relative mb-3 text-center text-base font-bold text-text">
                                    {monthIndex === 0 && (
                                        <button
                                            type="button"
                                            aria-label={t('tour.calendar.previousMonth')}
                                            onClick={() => onVisibleMonthChange(addMonths(visibleMonth, -1))}
                                            className="absolute left-0 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-text transition-colors hover:bg-surface-muted"
                                        >
                                            <ChevronDownIcon className="h-4 w-4 rotate-90" />
                                        </button>
                                    )}
                                    {new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(month)}
                                    {monthIndex === 1 && (
                                        <button
                                            type="button"
                                            aria-label={t('tour.calendar.nextMonth')}
                                            onClick={() => onVisibleMonthChange(addMonths(visibleMonth, 1))}
                                            className="absolute right-0 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-text transition-colors hover:bg-surface-muted"
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
                                        const hasCompleteRange = Boolean(from && to);
                                        const isStart = hasCompleteRange && dateValue === from;
                                        const isEnd = hasCompleteRange && dateValue === to;
                                        const isPendingStart = !hasCompleteRange && dateValue === from;
                                        const inRange = isBetween(dateValue, from, to);
                                        const isCurrentMonth = date.getMonth() === month.getMonth();
                                        const rangeClass = getRangeFillClass(isStart, isEnd, inRange, dayIndex);
                                        const isSelectedInterval = isStart || isEnd || isPendingStart || inRange;

                                        return (
                                            <div key={dateValue} className="relative grid h-10 place-items-center">
                                                {rangeClass && (
                                                    <span className={`absolute top-1/2 h-9 -translate-y-1/2 bg-primary-contrast/10 ${rangeClass}`} />
                                                )}
                                                <button
                                                    type="button"
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
                        ))}
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
                        <div className="flex min-w-0 items-center gap-2">
                            <button
                                type="button"
                                onClick={selectAllFutureDates}
                                className="rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-surface-muted hover:text-text"
                            >
                                {t('tour.actions.todayOnward', { defaultValue: 'Today onward' })}
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
                            onClick={() => setIsOpen(false)}
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

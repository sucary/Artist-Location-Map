import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CalendarIcon, ChevronDownIcon } from '../icons/GeneralIcons';
import { getBrowserDateLocale, getLocalizedWeekdayLabels } from '../../utils/dateFormatting';

// Single-date picker and shared calendar primitives

interface GigDatePickerProps {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

export const WEEK_START = 1;
const DAY_COUNT = 42;

export function parseDateValue(value: string): Date | null {
    // Persisted gig dates stay timezone-free
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
}

export function toDateValue(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function getMonthStart(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function addMonths(date: Date, amount: number): Date {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function getCalendarDays(monthDate: Date): Date[] {
    const monthStart = getMonthStart(monthDate);
    const offset = (monthStart.getDay() - WEEK_START + 7) % 7;
    const firstDay = new Date(monthStart);
    firstDay.setDate(monthStart.getDate() - offset);

    // Six-week grid prevents layout jumps between months
    return Array.from({ length: DAY_COUNT }, (_, index) => {
        const day = new Date(firstDay);
        day.setDate(firstDay.getDate() + index);
        return day;
    });
}

export function formatDisplayDate(value: string, locale?: Intl.LocalesArgument): string {
    const date = parseDateValue(value);
    if (!date) return '';
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

export function GigDatePicker({ id, label, value, onChange, disabled = false }: GigDatePickerProps) {
    const { i18n, t } = useTranslation();
    const rootRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const selectedDate = useMemo(() => parseDateValue(value), [value]);
    const today = useMemo(() => new Date(), []);
    const [isOpen, setIsOpen] = useState(false);
    const [visibleMonth, setVisibleMonth] = useState(() => getMonthStart(selectedDate ?? today));
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 420 });
    const dateFallback = i18n.resolvedLanguage || i18n.language || undefined;
    const locale = useMemo(() => getBrowserDateLocale(dateFallback), [dateFallback]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
            setIsOpen(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!isOpen || !rootRef.current) return;
        if (disabled) return;

        const rect = rootRef.current.getBoundingClientRect();
        const gap = 10;
        const availableBelow = window.innerHeight - rect.bottom - gap;
        const availableAbove = rect.top - gap;
        const opensAbove = availableBelow < 380 && availableAbove > availableBelow;
        const maxHeight = Math.max(320, Math.min(500, opensAbove ? availableAbove : availableBelow));
        const width = Math.min(window.innerWidth - 16, 340);
        const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);

        // Fixed portal avoids clipping inside the gig form scroller
        setDropdownPosition({
            top: opensAbove ? rect.top - maxHeight - gap : rect.bottom + gap,
            left,
            width,
            maxHeight,
        });
    }, [disabled, isOpen, visibleMonth]);

    const weekdays = useMemo(() => getLocalizedWeekdayLabels(dateFallback, locale, 'narrow'), [dateFallback, locale]);

    const calendarDays = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);
    const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(visibleMonth);
    const displayValue = formatDisplayDate(value, locale);
    const selectedValue = selectedDate ? toDateValue(selectedDate) : '';
    const calendarId = `${id}-calendar`;

    const selectDate = (date: Date) => {
        onChange(toDateValue(date));
        setIsOpen(false);
    };

    const toggleCalendar = () => {
        if (!isOpen) {
            setVisibleMonth(getMonthStart(selectedDate ?? today));
        }
        setIsOpen((open) => !open);
    };

    return (
        <div className="relative" ref={rootRef}>
            <label htmlFor={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {label}
            </label>
            <button
                id={id}
                type="button"
                aria-expanded={isOpen}
                aria-haspopup="dialog"
                aria-controls={isOpen ? calendarId : undefined}
                disabled={disabled}
                onClick={toggleCalendar}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border-strong bg-surface px-3 py-2 text-left text-sm text-text transition-colors duration-150 hover:bg-surface-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 app-dark:hover:bg-surface-muted"
            >
                <span className="flex min-w-0 items-center gap-2">
                    <CalendarIcon className="h-4 w-4 shrink-0 text-text-secondary" />
                    <span className={displayValue ? 'truncate tabular-nums' : 'truncate text-text-muted'}>
                        {displayValue || t('tour.calendar.selectDate')}
                    </span>
                </span>
                <ChevronDownIcon className={`h-4 w-4 shrink-0 text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && !disabled && createPortal(
                <div
                    id={calendarId}
                    ref={dropdownRef}
                    role="dialog"
                    aria-label={label}
                    className="fixed z-[9999] overflow-y-auto rounded-lg border border-border-strong bg-surface px-3 pb-3 pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12),0_0_12px_rgba(15,23,42,0.08)] app-dark:shadow-[0_-10px_28px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)]"
                    style={{
                        top: `${dropdownPosition.top}px`,
                        left: `${dropdownPosition.left}px`,
                        width: `${dropdownPosition.width}px`,
                        maxHeight: `${dropdownPosition.maxHeight}px`,
                    }}
                >
                    <div className="relative mb-3 text-center text-base font-bold text-text">
                        <button
                            type="button"
                            aria-label={t('tour.calendar.previousMonth')}
                            onClick={() => setVisibleMonth((month) => addMonths(month, -1))}
                            className="absolute left-0 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-text transition-colors hover:bg-surface-muted"
                        >
                            <ChevronDownIcon className="h-4 w-4 rotate-90" />
                        </button>
                        {monthLabel}
                        <button
                            type="button"
                            aria-label={t('tour.calendar.nextMonth')}
                            onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
                            className="absolute right-0 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-text transition-colors hover:bg-surface-muted"
                        >
                            <ChevronDownIcon className="h-4 w-4 -rotate-90" />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 text-center text-xs font-normal text-text-secondary">
                        {weekdays.map((weekday, index) => (
                            <div key={`${weekday}-${index}`} className="h-8 leading-8">
                                {weekday}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7">
                        {calendarDays.map((date) => {
                            const dateValue = toDateValue(date);
                            const isSelected = dateValue === selectedValue;
                            const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();

                            return (
                                <div key={dateValue} className="relative grid h-10 place-items-center">
                                    <button
                                        type="button"
                                        aria-label={new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(date)}
                                        aria-pressed={isSelected}
                                        onClick={() => selectDate(date)}
                                        className={`relative z-10 grid h-9 w-9 place-items-center rounded-full text-sm font-medium transition-colors ${
                                            isSelected
                                                ? 'bg-primary-contrast text-white'
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
                </div>,
                document.body
            )}
        </div>
    );
}

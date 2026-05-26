import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { CalendarIcon, ChevronDownIcon } from '../icons/GeneralIcons';

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

export function formatDisplayDate(value: string, locale?: string): string {
    const date = parseDateValue(value);
    if (!date) return '';
    return new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        weekday: 'short',
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
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 360 });
    const locale = i18n.resolvedLanguage || i18n.language || undefined;

    useEffect(() => {
        if (selectedDate) setVisibleMonth(getMonthStart(selectedDate));
    }, [selectedDate]);

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
        const gap = 8;
        const availableBelow = window.innerHeight - rect.bottom - gap;
        const availableAbove = rect.top - gap;
        const opensAbove = availableBelow < 330 && availableAbove > availableBelow;
        const maxHeight = Math.max(280, Math.min(520, opensAbove ? availableAbove : availableBelow));
        const width = Math.min(window.innerWidth - 16, 640);
        const left = Math.min(Math.max(8, rect.left + 4), window.innerWidth - width - 8);

        // Fixed portal avoids clipping inside the gig form scroller
        setDropdownPosition({
            top: opensAbove ? rect.top - maxHeight - gap : rect.bottom + gap,
            left,
            width,
            maxHeight,
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

    const calendarDays = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);
    const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(visibleMonth);
    const displayValue = formatDisplayDate(value, locale);
    const selectedValue = selectedDate ? toDateValue(selectedDate) : '';

    const selectDate = (date: Date) => {
        onChange(toDateValue(date));
        setIsOpen(false);
    };

    return (
        <div className="relative rounded-md p-1" ref={rootRef}>
            <label htmlFor={id} className="mb-1 block text-sm font-bold text-text">
                {label}
            </label>
            <button
                id={id}
                type="button"
                aria-haspopup="dialog"
                aria-expanded={isOpen}
                disabled={disabled}
                onClick={() => setIsOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-border-strong bg-surface px-3 py-2 text-left text-sm text-text transition-colors hover:border-primary focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border-strong"
            >
                <span className="flex min-w-0 items-center gap-2">
                    <CalendarIcon className="h-4 w-4 shrink-0 text-text-secondary" />
                    <span className={displayValue ? 'truncate' : 'truncate text-text-muted'}>
                        {displayValue || t('tour.calendar.selectDate')}
                    </span>
                </span>
                <ChevronDownIcon className={`h-4 w-4 shrink-0 text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && !disabled && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-[9999] overflow-y-auto rounded-md border border-border-strong bg-surface p-3 shadow-xl"
                    style={{
                        top: `${dropdownPosition.top}px`,
                        left: `${dropdownPosition.left}px`,
                        width: `${dropdownPosition.width}px`,
                        maxHeight: `${dropdownPosition.maxHeight}px`,
                    }}
                >
                    <div className="mb-3 flex items-center justify-between gap-2">
                        <button
                            type="button"
                            aria-label={t('tour.calendar.previousMonth')}
                            onClick={() => setVisibleMonth((month) => addMonths(month, -1))}
                            className="grid h-8 w-8 place-items-center rounded text-text-secondary transition-colors hover:bg-surface-muted hover:text-text"
                        >
                            <ChevronDownIcon className="h-4 w-4 rotate-90" />
                        </button>
                        <div className="min-w-0 truncate text-sm font-bold text-text">{monthLabel}</div>
                        <button
                            type="button"
                            aria-label={t('tour.calendar.nextMonth')}
                            onClick={() => setVisibleMonth((month) => addMonths(month, 1))}
                            className="grid h-8 w-8 place-items-center rounded text-text-secondary transition-colors hover:bg-surface-muted hover:text-text"
                        >
                            <ChevronDownIcon className="h-4 w-4 -rotate-90" />
                        </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-bold text-text-secondary">
                        {weekdays.map((weekday, index) => (
                            <div key={`${weekday}-${index}`} className="h-6 leading-6">
                                {weekday}
                            </div>
                        ))}
                    </div>

                    <div className="mt-1 grid grid-cols-7 gap-1">
                        {calendarDays.map((date) => {
                            const dateValue = toDateValue(date);
                            const isSelected = dateValue === selectedValue;
                            const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();

                            return (
                                <button
                                    key={dateValue}
                                    type="button"
                                    onClick={() => selectDate(date)}
                                    className={`grid h-8 place-items-center rounded text-sm transition-colors ${
                                        isSelected
                                            ? 'bg-primary text-white'
                                            : isCurrentMonth
                                                ? 'text-text hover:bg-surface-muted'
                                                : 'text-text-muted hover:bg-surface-muted hover:text-text-secondary'
                                    }`}
                                >
                                    {date.getDate()}
                                </button>
                            );
                        })}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

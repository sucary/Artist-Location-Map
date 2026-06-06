import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Gig } from '../../types/gig';
import { CloseButton } from '../ui';
import { ArrowDownIcon, ArrowUpIcon, ChevronDownIcon, PlusIcon, StarIcon } from '../icons/GeneralIcons';
import { useTranslation } from 'react-i18next';
import { getBrowserDateLocale, getLocalizedWeekdayLabels } from '../../utils/dateFormatting';
import { getGigProvinceColor, getGigProvinceColorMap } from '../../utils/gigProvinceColors';

// Month calendar for gig events

interface GigCalendarProps {
    gigs: Gig[];
    selectedDay: string | null;
    onSelectDay: (date: string | null) => void;
    onClose: () => void;
    onAddGig?: (date: string) => void;
    starredGigIds?: Set<string>;
    onToggleGigStar?: (gig: Gig) => void;
}

interface CalendarDay {
    date: Date;
    value: string;
    inMonth: boolean;
}

interface DayPopoverState {
    dateValue: string;
    top: number;
    left: number;
    width: number;
    maxHeight: number;
}

const dayKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
};

const parseDateValue = (value?: string | null) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    // Reject rollover dates from invalid API values
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;

    return date;
};

const getArtistNames = (gig: Gig) => gig.artists.map((artist) => artist.name).join(', ') || gig.artist.name;

const getGigMeta = (gig: Gig) => {
    // Venue hides broader location labels
    return gig.venueName || gig.location.city || gig.location.province || gig.location.country || gig.location.displayName || '';
};

export const JAPAN_PROVINCE_COLOR_ALIASES: Record<string, string> = {
    tokyo: 'tokyo',
    'tokyo metropolis': 'tokyo',
    東京都: 'tokyo',
    東京: 'tokyo',
};

export const normalizeProvinceColorKey = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return JAPAN_PROVINCE_COLOR_ALIASES[normalized] ?? normalized;
};

export const getProvinceColorKey = (gig: Gig) => {
    const provinceNames = gig.location.localizedChain?.province;
    const provinceKey = provinceNames?.en || provinceNames?.native || provinceNames?.ja || gig.location.province;
    const fallbackKey = gig.location.country || gig.location.city || gig.location.displayName || 'unknown';

    return normalizeProvinceColorKey(provinceKey || fallbackKey);
};

const getCalendarDays = (monthDate: Date): CalendarDay[] => {
    const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const startDate = new Date(firstDay);
    const mondayOffset = (firstDay.getDay() + 6) % 7;
    startDate.setDate(firstDay.getDate() - mondayOffset);

    // Five-week month surface keeps the calendar panel compact
    return Array.from({ length: 35 }, (_, index) => {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + index);

        return {
            date,
            value: dayKey(date),
            inMonth: date.getMonth() === monthDate.getMonth(),
        };
    });
};

const isMonthBoundaryDay = (date: Date) => {
    const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    return date.getDate() === 1 || date.getDate() === lastDay;
};

const formatCalendarDayLabel = (date: Date, dateLocale?: Intl.LocalesArgument) => {
    const localizedDayLabel = new Intl.DateTimeFormat(dateLocale, { day: 'numeric' }).format(date);
    if (!isMonthBoundaryDay(date)) return localizedDayLabel.replace(/\u65e5$/, '');

    const monthLabel = new Intl.DateTimeFormat(dateLocale, { month: 'short' }).format(date);
    return `${monthLabel} ${localizedDayLabel}`;
};

export function GigCalendar({ gigs, selectedDay, onSelectDay, onClose, onAddGig, starredGigIds, onToggleGigStar }: GigCalendarProps) {
    const { i18n, t } = useTranslation();
    const titleButtonRef = useRef<HTMLButtonElement>(null);
    const datePickerRef = useRef<HTMLDivElement>(null);
    const yearPickerRef = useRef<HTMLDivElement>(null);
    const dateFallback = i18n.resolvedLanguage || i18n.language || undefined;
    const dateLocale = useMemo(() => getBrowserDateLocale(dateFallback), [dateFallback]);
    const initialMonth = parseDateValue(selectedDay) ?? parseDateValue(gigs[0]?.date) ?? new Date();
    const [visibleMonth, setVisibleMonth] = useState(() => new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1));
    const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
    const [datePickerMode, setDatePickerMode] = useState<'month' | 'year'>('year');
    const [datePickerPosition, setDatePickerPosition] = useState({ top: 0, left: 0, width: 300, maxHeight: 520 });
    const [dayPopover, setDayPopover] = useState<DayPopoverState | null>(null);
    const dayPopoverRef = useRef<HTMLDivElement>(null);
    const todayValue = dayKey(new Date());
    const calendarDays = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);
    const weekdayLabels = useMemo(() => getLocalizedWeekdayLabels(dateFallback, dateLocale, 'short'), [dateFallback, dateLocale]);
    const gigsByDate = useMemo(() => {
        const grouped = new Map<string, Gig[]>();

        gigs.forEach((gig) => {
            const dayGigs = grouped.get(gig.date) ?? [];
            dayGigs.push(gig);
            grouped.set(gig.date, dayGigs);
        });

        grouped.forEach((dayGigs) => {
            dayGigs.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || getArtistNames(a).localeCompare(getArtistNames(b)));
        });

        return grouped;
    }, [gigs]);
    const provinceEventColors = useMemo(() => getGigProvinceColorMap(gigs), [gigs]);
    const monthLabel = new Intl.DateTimeFormat(dateLocale, { year: 'numeric', month: 'long' }).format(visibleMonth);
    const pickerTitle = new Intl.DateTimeFormat(dateLocale, { year: 'numeric', month: 'long' }).format(visibleMonth);
    const monthNames = useMemo(() => (
        Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat(dateLocale, { month: 'short' }).format(new Date(2026, index, 1)))
    ), [dateLocale]);
    const pickerYears = useMemo(() => Array.from({ length: 101 }, (_, index) => visibleMonth.getFullYear() - 50 + index), [visibleMonth]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (titleButtonRef.current?.contains(target) || datePickerRef.current?.contains(target)) return;
            setIsDatePickerOpen(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (dayPopoverRef.current?.contains(target)) return;
            setDayPopover(null);
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!isDatePickerOpen || !titleButtonRef.current) return;

        const rect = titleButtonRef.current.getBoundingClientRect();
        const width = Math.min(window.innerWidth - 16, 300);
        const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
        const availableBelow = window.innerHeight - rect.bottom - 10;

        // Portal position follows the clickable title trigger
        setDatePickerPosition({
            top: rect.bottom + 10,
            left,
            width,
            maxHeight: Math.max(360, Math.min(560, availableBelow)),
        });
    }, [isDatePickerOpen, datePickerMode, visibleMonth]);

    useEffect(() => {
        if (!isDatePickerOpen || datePickerMode !== 'year' || !yearPickerRef.current) return;

        const selectedYearButton = yearPickerRef.current.querySelector<HTMLButtonElement>('[data-selected-year="true"]');
        selectedYearButton?.scrollIntoView({ block: 'center' });
    }, [datePickerMode, isDatePickerOpen, pickerYears]);

    const moveMonth = (offset: number) => {
        setDayPopover(null);
        setVisibleMonth((currentMonth) => new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1));
    };

    const handleToday = () => {
        const today = new Date();

        // Today also acts as a broad jump back to the current month
        setDayPopover(null);
        setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
        onSelectDay(todayValue);
        setIsDatePickerOpen(false);
    };

    const handleTitleClick = (event: { currentTarget: HTMLButtonElement }) => {
        if (isDatePickerOpen) {
            // Closed picker should not leave active title styling
            event.currentTarget.blur();
            setIsDatePickerOpen(false);
            return;
        }

        setDatePickerMode('year');
        setIsDatePickerOpen(true);
    };

    const handleYearSelect = (year: number) => {
        setDayPopover(null);
        setVisibleMonth((currentMonth) => new Date(year, currentMonth.getMonth(), 1));
        setDatePickerMode('month');
        onSelectDay(null);
    };

    const handleMonthSelect = (month: number) => {
        setDayPopover(null);
        setVisibleMonth((currentMonth) => new Date(currentMonth.getFullYear(), month, 1));
        onSelectDay(null);
        setIsDatePickerOpen(false);
    };

    const openDayPopover = (event: React.MouseEvent<HTMLButtonElement>, dateValue: string) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const width = Math.min(300, window.innerWidth - 16);
        const left = Math.min(Math.max(8, rect.left + rect.width / 2 - width / 2), window.innerWidth - width - 8);
        const maxHeight = Math.min(520, window.innerHeight - 16);

        // Full-day popover anchors near the collapsed count row
        setDayPopover({
            dateValue,
            top: Math.min(Math.max(8, rect.top - 110), window.innerHeight - maxHeight - 8),
            left,
            width,
            maxHeight,
        });
    };

    const renderGigEvent = (gig: Gig) => {
        const eventLabel = getArtistNames(gig);
        const eventMeta = getGigMeta(gig);
        const isStarred = starredGigIds?.has(gig.id) ?? false;

        return (
            <button
                key={gig.id}
                type="button"
                aria-label={isStarred ? t('tour.actions.unstarGig') : t('tour.actions.starGig')}
                onClick={() => onToggleGigStar?.(gig)}
                className="relative min-w-0 rounded px-2 py-1 text-left text-xs font-semibold leading-4 text-white shadow-sm transition duration-150 hover:brightness-90 hover:shadow-md"
                style={{ backgroundColor: getGigProvinceColor(gig, provinceEventColors) }}
                title={eventMeta ? `${eventLabel} - ${eventMeta}` : eventLabel}
            >
                <span className="block truncate">{eventLabel}</span>
                {eventMeta && <span className="block truncate text-[11px] font-medium text-white/80">{eventMeta}</span>}
                {onToggleGigStar && (
                    <StarIcon className={`absolute right-1 top-1 h-3 w-3 ${isStarred ? 'text-white' : 'text-white/70'}`} filled={isStarred} />
                )}
            </button>
        );
    };

    const renderAddGigButton = (dateValue: string, placement: 'center' | 'row' | 'stack') => {
        if (!onAddGig) return null;

        const label = t('tour.actions.addGig');

        if (placement === 'center') {
            return (
                <button
                    type="button"
                    aria-label={label}
                    title={label}
                    onClick={() => onAddGig(dateValue)}
                    className="group/add-cell flex h-full w-full items-center justify-center rounded transition-colors hover:bg-border focus-visible:bg-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary app-dark:hover:bg-surface-muted"
                >
                    <span className="grid h-9 w-9 place-items-center text-text-secondary opacity-0 transition-opacity group-hover/add-cell:opacity-100 group-focus-visible/add-cell:opacity-100">
                        <PlusIcon className="h-5 w-5" />
                    </span>
                </button>
            );
        }

        if (placement === 'row') {
            return (
                <button
                    type="button"
                    aria-label={label}
                    title={label}
                    onClick={() => onAddGig(dateValue)}
                    className="group/add-row absolute inset-y-0 left-1 right-1 flex items-center justify-center rounded bg-surface-muted text-text-secondary opacity-0 transition-colors transition-opacity hover:bg-border focus-visible:bg-border focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary group-hover/day-row:opacity-100 group-focus-within/day-row:opacity-100 app-dark:bg-surface-secondary app-dark:hover:bg-surface-muted sm:left-2 sm:right-2"
                >
                    <PlusIcon className="h-3.5 w-3.5" />
                </button>
            );
        }

        return (
            <button
                type="button"
                aria-label={label}
                title={label}
                onClick={() => onAddGig(dateValue)}
                    className="group/add-stack flex items-start justify-center rounded focus-visible:outline-none"
                >
                <span className="grid h-9 w-full place-items-center rounded bg-surface-muted text-text-secondary opacity-0 transition-colors transition-opacity group-hover/add-stack:opacity-100 group-hover/add-stack:bg-border group-focus-visible/add-stack:opacity-100 group-focus-visible/add-stack:bg-border group-focus-visible/add-stack:ring-2 group-focus-visible/add-stack:ring-inset group-focus-visible/add-stack:ring-primary app-dark:bg-surface-secondary app-dark:group-hover/add-stack:bg-surface-muted">
                    <PlusIcon className="h-4 w-4" />
                </span>
            </button>
        );
    };

    const renderDayPopover = () => {
        if (!dayPopover) return null;

        const popoverDate = parseDateValue(dayPopover.dateValue);
        const dayGigs = gigsByDate.get(dayPopover.dateValue) ?? [];
        if (!popoverDate || dayGigs.length === 0) return null;

        const weekdayLabel = new Intl.DateTimeFormat(dateLocale, { weekday: 'short' }).format(popoverDate);
        const dayLabel = new Intl.DateTimeFormat(dateLocale, { day: 'numeric' }).format(popoverDate).replace(/\u65e5$/, '');

        return createPortal(
            <div
                ref={dayPopoverRef}
                role="region"
                aria-label={`${weekdayLabel} ${dayLabel}`}
                className="fixed z-[9999] overflow-hidden rounded-xl border border-border/70 bg-surface shadow-xl shadow-black/15 app-dark:shadow-[0_18px_36px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)]"
                style={{
                    top: `${dayPopover.top}px`,
                    left: `${dayPopover.left}px`,
                    width: `${dayPopover.width}px`,
                    maxHeight: `${dayPopover.maxHeight}px`,
                }}
            >
                <div className="relative px-4 pb-3 pt-4 text-center">
                    <p className="text-xs font-semibold text-text-secondary">{weekdayLabel}</p>
                    <p className="mt-2 text-3xl font-light leading-none text-text">{dayLabel}</p>
                    <CloseButton onClick={() => setDayPopover(null)} size="md" className="absolute right-3 top-3" />
                </div>
                <div className="flex max-h-[420px] min-w-0 flex-col gap-0.5 overflow-y-auto px-3 pb-4">
                    {dayGigs.map(renderGigEvent)}
                </div>
            </div>,
            document.body
        );
    };

    return (
        <div className="absolute inset-x-2 top-20 z-[1050] mx-auto flex w-[min(1280px,calc(100vw-1rem),calc((100vh-8rem)*1.6))] justify-center font-sans sm:top-24">
            <div role="region" aria-label={t('tour.calendar.title')} className="flex aspect-[16/10] w-full flex-col overflow-hidden rounded-xl bg-surface shadow-xl shadow-black/5 ring-1 ring-border/40">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5">
                    <div className="flex min-w-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={handleToday}
                            className="rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm font-semibold text-text transition-colors hover:bg-surface-muted focus:outline-none"
                        >
                            {t('tour.calendar.today')}
                        </button>
                        <button
                            type="button"
                            aria-label={t('tour.calendar.previousMonth')}
                            title={t('tour.calendar.previousMonth')}
                            onClick={() => moveMonth(-1)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
                        >
                            <ArrowUpIcon className="h-5 w-5 -rotate-90" />
                        </button>
                        <button
                            type="button"
                            aria-label={t('tour.calendar.nextMonth')}
                            title={t('tour.calendar.nextMonth')}
                            onClick={() => moveMonth(1)}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
                        >
                            <ArrowDownIcon className="h-5 w-5 -rotate-90" />
                        </button>
                        <button
                            ref={titleButtonRef}
                            type="button"
                            aria-expanded={isDatePickerOpen}
                            onClick={handleTitleClick}
                            className="group flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-left text-lg font-semibold tracking-tight text-text transition-colors hover:bg-surface-muted focus:bg-primary focus:text-white focus:outline-none sm:text-xl"
                        >
                            <span className="min-w-0 truncate">
                                {monthLabel}
                            </span>
                            <ChevronDownIcon className={`h-4 w-4 shrink-0 text-text-secondary transition-transform group-focus:text-white ${isDatePickerOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isDatePickerOpen && createPortal(
                            <div
                                ref={datePickerRef}
                                role="region"
                                aria-label={t('tour.calendar.selectDate')}
                                className="fixed z-[9999] overflow-y-auto rounded-xl border border-border-strong bg-surface shadow-xl shadow-black/10 app-dark:shadow-[0_18px_36px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)]"
                                style={{
                                    top: `${datePickerPosition.top}px`,
                                    left: `${datePickerPosition.left}px`,
                                    width: `${datePickerPosition.width}px`,
                                    maxHeight: `${datePickerPosition.maxHeight}px`,
                                }}
                            >
                                <div className="border-b border-border/60 px-5 pb-4 pt-5">
                                    <p className="text-xs font-semibold text-text-secondary">{t('tour.calendar.selectDate')}</p>
                                    <p className="mt-4 text-3xl font-light tracking-normal text-text">{pickerTitle}</p>
                                </div>
                                <div className="px-5 py-4">
                                    <button
                                        type="button"
                                        onClick={() => setDatePickerMode((mode) => mode === 'year' ? 'month' : 'year')}
                                        className="mb-4 inline-flex items-center gap-2 rounded-md px-1 py-1 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-muted hover:text-text"
                                    >
                                        <span>{monthLabel}</span>
                                        <ChevronDownIcon className={`h-4 w-4 transition-transform ${datePickerMode === 'year' ? 'rotate-180' : ''}`} />
                                    </button>

                                    {datePickerMode === 'year' ? (
                                        <>
                                            <div ref={yearPickerRef} className="mb-3 grid max-h-48 grid-cols-3 gap-y-2 overflow-y-auto pr-1 text-center">
                                                {pickerYears.map((year) => (
                                                    <button
                                                        key={year}
                                                        type="button"
                                                        data-selected-year={year === visibleMonth.getFullYear() ? 'true' : undefined}
                                                        onClick={() => handleYearSelect(year)}
                                                        className={`mx-auto grid h-10 min-w-16 place-items-center rounded-full px-3 text-base font-medium transition-colors ${
                                                            year === visibleMonth.getFullYear()
                                                                ? 'bg-primary text-white'
                                                                : 'text-text-secondary hover:bg-surface-muted hover:text-text'
                                                        }`}
                                                    >
                                                        {year}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="grid grid-cols-3 gap-y-2">
                                            {monthNames.map((monthName, index) => (
                                                <button
                                                    key={monthName}
                                                    type="button"
                                                    onClick={() => handleMonthSelect(index)}
                                                    className={`mx-auto grid h-10 min-w-16 place-items-center rounded-full px-3 text-sm font-semibold transition-colors ${
                                                        index === visibleMonth.getMonth()
                                                            ? 'bg-primary text-white'
                                                            : 'text-text-secondary hover:bg-surface-muted hover:text-text'
                                                    }`}
                                                >
                                                    {monthName}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center justify-end gap-2 border-t border-border/60 px-5 py-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsDatePickerOpen(false)}
                                        className="rounded-md px-3 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-muted hover:text-text"
                                    >
                                        {t('common.cancel')}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleToday}
                                        className="rounded-md px-3 py-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-muted hover:text-text"
                                    >
                                        {t('tour.calendar.today')}
                                    </button>
                                </div>
                            </div>,
                            document.body
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <CloseButton onClick={onClose} size="md" />
                    </div>
                </div>

                <div className="grid grid-cols-7 bg-surface-secondary/40 text-center text-xs font-semibold uppercase text-text-secondary">
                    {weekdayLabels.map((label) => (
                        <div key={label} className="px-2 py-2">
                            {label}
                        </div>
                    ))}
                </div>

                <div className="grid flex-1 grid-cols-7 grid-rows-5 overflow-hidden">
                    {calendarDays.map((day) => {
                        const dayGigs = gigsByDate.get(day.value) ?? [];
                        const isToday = todayValue === day.value;
                        const visibleGigs = dayGigs.length >= 3 ? dayGigs.slice(0, 2) : dayGigs;
                        const hiddenGigCount = dayGigs.length - visibleGigs.length;
                        const showCenteredAdd = dayGigs.length === 0;
                        const showStackAdd = dayGigs.length > 0 && dayGigs.length <= 2;
                        const showRowAdd = dayGigs.length >= 3;

                        return (
                            <div
                                key={day.value}
                                className={`flex min-h-0 flex-col overflow-hidden border-b border-r border-border/60 bg-surface pb-1 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary sm:pb-2 ${
                                    day.inMonth ? 'text-text' : 'text-text-muted bg-surface-secondary/25'
                                } hover:bg-surface-secondary/50`}
                            >
                                <div className={`relative mb-0.5 flex min-h-5 items-start gap-1 ${showRowAdd ? 'group/day-row' : ''}`}>
                                    <span
                                        className={`relative z-10 inline-flex h-5 min-w-5 self-start items-center justify-center rounded-full px-1 text-xs font-semibold leading-none transition-colors group-hover/day-row:opacity-0 focus:outline-none focus:ring-2 focus:ring-primary sm:mx-1 ${
                                            isToday ? 'bg-surface-muted text-text' : day.inMonth ? 'text-text-secondary' : 'text-text-muted'
                                        }`}
                                    >
                                        {formatCalendarDayLabel(day.date, dateLocale)}
                                    </span>
                                    {showRowAdd && renderAddGigButton(day.value, 'row')}
                                </div>
                                <span className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-hidden px-1 sm:px-2">
                                    {showCenteredAdd ? (
                                        <span className="flex flex-1 items-center justify-center">
                                            {renderAddGigButton(day.value, 'center')}
                                        </span>
                                    ) : (
                                        <>
                                            {visibleGigs.map(renderGigEvent)}
                                            {showStackAdd && renderAddGigButton(day.value, 'stack')}
                                            {hiddenGigCount > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={(event) => openDayPopover(event, day.value)}
                                                    className="truncate rounded bg-surface-muted px-1 py-1 text-left text-xs font-semibold text-text-secondary transition-colors hover:bg-border hover:text-text app-dark:bg-surface-secondary app-dark:hover:bg-surface-muted"
                                                >
                                                    {t('tour.calendar.remainingEvents', { count: hiddenGigCount, defaultValue: '{{count}} more events' })}
                                                </button>
                                            )}
                                        </>
                                    )}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
            {renderDayPopover()}
        </div>
    );
}

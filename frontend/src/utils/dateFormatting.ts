// Browser-localized date and time formatting

const JAPANESE_WEEKDAY_LABELS = ['\u6708', '\u706b', '\u6c34', '\u6728', '\u91d1', '\u571f', '\u65e5'];

export function getBrowserDateLocale(fallback?: string): Intl.LocalesArgument {
    if (typeof navigator === 'undefined') return fallback;

    // App language takes priority so date formatting matches the UI
    if (fallback) {
        return [fallback, ...(navigator.languages || [navigator.language])];
    }

    if (navigator.languages?.length) return [...navigator.languages];
    return navigator.language;
}

export function getLocalizedWeekdayLabels(language: string | undefined, locale: Intl.LocalesArgument, width: 'narrow' | 'short' = 'short'): string[] {
    const normalizedLanguage = language?.toLowerCase() ?? '';
    if (normalizedLanguage.startsWith('ja')) {
        // Japanese weekday labels follow app locale, not browser fallback order
        return JAPANESE_WEEKDAY_LABELS;
    }

    const monday = new Date(2024, 0, 1);
    return Array.from({ length: 7 }, (_, index) => {
        const day = new Date(monday);
        day.setDate(monday.getDate() + index);
        return new Intl.DateTimeFormat(locale, { weekday: width }).format(day);
    });
}

export function formatLocalizedDate(value: Date | string, options?: Intl.DateTimeFormatOptions, fallback?: string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return new Intl.DateTimeFormat(getBrowserDateLocale(fallback), options).format(date);
}

export function formatLocalizedTime(value: Date | string, options?: Intl.DateTimeFormatOptions, fallback?: string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return new Intl.DateTimeFormat(getBrowserDateLocale(fallback), options).format(date);
}

export function formatLocalizedDateValue(value: string, options?: Intl.DateTimeFormatOptions, fallback?: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return value;

    // Date-only API values stay timezone-free
    return formatLocalizedDate(date, options, fallback);
}

export function formatLocalizedTimeValue(value?: string | null, fallback?: string): string {
    if (!value || !/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return '';

    const [hour, minute, second = 0] = value.split(':').map(Number);
    const date = new Date(2000, 0, 1, hour, minute, second);
    if (date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second) return '';

    // Time-only API values stay date-independent
    return formatLocalizedTime(date, { hour: 'numeric', minute: '2-digit' }, fallback);
}

export function formatGigDateTimeValue(date: string, time?: string | null, fallback?: string): string {
    const formattedDate = formatLocalizedDateValue(date, { year: 'numeric', month: '2-digit', day: '2-digit' }, fallback);
    const formattedTime = formatLocalizedTimeValue(time, fallback);

    return [formattedDate, formattedTime].filter(Boolean).join(' ');
}

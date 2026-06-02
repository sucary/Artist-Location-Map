// Browser-localized date and time formatting

export function getBrowserDateLocale(fallback?: string): Intl.LocalesArgument {
    if (typeof navigator === 'undefined') return fallback;

    // Browser preference order controls localized date shape
    if (navigator.languages?.length) return [...navigator.languages];
    return navigator.language || fallback;
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

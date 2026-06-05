import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDownIcon, ClockIcon, KeyboardIcon } from '../icons/GeneralIcons';
import { formatLocalizedTimeValue } from '../../utils/dateFormatting';
import { Button } from '../ui';

// Optional gig time selector

interface GigTimePickerProps {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

type PickerMode = 'dial' | 'manual';
type DialPhase = 'hour' | 'minute';
type TimeParts = { hour: string; minute: string };

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'));

function parseTimeValue(value: string): TimeParts {
    const match = value.match(/^(\d{2}):(\d{2})$/);
    if (!match) return { hour: '19', minute: '00' };
    return { hour: match[1], minute: match[2] };
}

function formatTimeParts(time: TimeParts): string {
    return `${time.hour.padStart(2, '0')}:${time.minute.padStart(2, '0')}`;
}

function normalizeTwoDigitNumber(value: string, max: number): string | null {
    const digits = value.replace(/\D/g, '').slice(0, 2);
    if (digits.length === 0) return '';

    const numericValue = Number(digits);
    if (Number.isNaN(numericValue) || numericValue > max) return null;
    return digits;
}

function finalizeTimePart(value: string, max: number): string {
    const normalizedValue = normalizeTwoDigitNumber(value, max);
    if (normalizedValue === null || normalizedValue === '') return '00';
    return normalizedValue.padStart(2, '0');
}

export function GigTimePicker({ id, label, value, onChange, disabled = false }: GigTimePickerProps) {
    const { i18n, t } = useTranslation();
    const rootRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [mode, setMode] = useState<PickerMode>('manual');
    const [dialPhase, setDialPhase] = useState<DialPhase>('hour');
    const [draftTime, setDraftTime] = useState(() => parseTimeValue(value));
    const [draftCleared, setDraftCleared] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 420 });
    const localeFallback = i18n.resolvedLanguage || i18n.language || undefined;
    const displayValue = formatLocalizedTimeValue(value, localeFallback);

    useEffect(() => {
        setDraftTime(parseTimeValue(value));
        setDraftCleared(false);
    }, [value]);

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
        if (!isOpen || !rootRef.current || disabled) return;

        const rect = rootRef.current.getBoundingClientRect();
        const gap = 10;
        const availableBelow = window.innerHeight - rect.bottom - gap;
        const availableAbove = rect.top - gap;
        const opensAbove = availableBelow < 430 && availableAbove > availableBelow;
        const maxHeight = Math.max(330, Math.min(500, opensAbove ? availableAbove : availableBelow));
        const width = Math.min(window.innerWidth - 16, Math.max(rect.width, 320));

        // Material-style dialog can be wider than the trigger
        setDropdownPosition({
            top: opensAbove ? rect.top - maxHeight - gap : rect.bottom + gap,
            left: Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8),
            width,
            maxHeight,
        });
    }, [disabled, isOpen, mode]);

    const setDraft = (nextTime: TimeParts) => {
        setDraftTime(nextTime);
        setDraftCleared(false);
    };

    const updateManualPart = (part: DialPhase, nextValue: string) => {
        const normalizedValue = normalizeTwoDigitNumber(nextValue, part === 'hour' ? 23 : 59);
        if (normalizedValue === null) return;

        setDraft({
            ...draftTime,
            [part]: normalizedValue,
        });
    };

    const finalizeManualPart = (part: DialPhase) => {
        setDraft({
            ...draftTime,
            [part]: finalizeTimePart(draftTime[part], part === 'hour' ? 23 : 59),
        });
    };

    const confirmTime = () => {
        if (draftCleared) {
            onChange('');
            setIsOpen(false);
            return;
        }

        onChange(formatTimeParts(draftTime));
        setIsOpen(false);
    };

    const clearTime = () => {
        setDraftCleared(true);
    };

    const toggleMode = () => {
        setMode((currentMode) => currentMode === 'dial' ? 'manual' : 'dial');
    };

    const renderManualInput = () => (
        <div className="px-6 pb-5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2">
                <label className="min-w-0">
                    <input
                        type="text"
                        inputMode="numeric"
                        value={draftCleared ? '' : draftTime.hour}
                        onChange={(event) => updateManualPart('hour', event.target.value)}
                        onBlur={() => finalizeManualPart('hour')}
                        onFocus={(event) => event.currentTarget.select()}
                        className="h-16 w-full rounded-md border border-border-strong bg-surface-muted px-3 text-center text-4xl font-semibold leading-none text-text tabular-nums focus:border-primary-contrast focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-contrast"
                    />
                    <span className="mt-1 block text-xs font-medium text-text-secondary">{t('tour.timePicker.hour', { defaultValue: 'Hour' })}</span>
                </label>
                <span className="pt-3 text-4xl font-semibold leading-none text-text-secondary">:</span>
                <label className="min-w-0">
                    <input
                        type="text"
                        inputMode="numeric"
                        value={draftCleared ? '' : draftTime.minute}
                        onChange={(event) => updateManualPart('minute', event.target.value)}
                        onBlur={() => finalizeManualPart('minute')}
                        onFocus={(event) => event.currentTarget.select()}
                        className="h-16 w-full rounded-md border border-border-strong bg-surface-muted px-3 text-center text-4xl font-semibold leading-none text-text tabular-nums focus:border-primary-contrast focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary-contrast"
                    />
                    <span className="mt-1 block text-xs font-medium text-text-secondary">{t('tour.timePicker.minute', { defaultValue: 'Minute' })}</span>
                </label>
            </div>
        </div>
    );

    const renderPickerHead = () => (
        <div className="px-6 pb-3 pt-5">
            <div className="text-xs font-semibold text-text-secondary">
                {mode === 'dial'
                    ? t('tour.timePicker.selectTime')
                    : t('tour.timePicker.enterTime', { defaultValue: 'Enter time' })}
            </div>
        </div>
    );

    const renderDialTimeDisplay = () => (
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 px-6 pb-5">
            <div className="min-w-0">
                <button
                    type="button"
                    onClick={() => setDialPhase('hour')}
                    className={`h-16 w-full rounded-md border border-transparent px-3 text-center text-4xl font-semibold leading-none tabular-nums transition-colors ${
                        dialPhase === 'hour'
                            ? 'bg-primary-contrast text-white'
                            : 'bg-surface-muted text-text hover:bg-surface-secondary'
                    }`}
                >
                    {draftCleared ? '' : draftTime.hour}
                </button>
                <span className="invisible mt-1 block text-xs font-medium">{t('tour.timePicker.hour', { defaultValue: 'Hour' })}</span>
            </div>
            <span className="pt-3 text-4xl font-semibold leading-none text-text-secondary">:</span>
            <div className="min-w-0">
                <button
                    type="button"
                    onClick={() => setDialPhase('minute')}
                    className={`h-16 w-full rounded-md border border-transparent px-3 text-center text-4xl font-semibold leading-none tabular-nums transition-colors ${
                        dialPhase === 'minute'
                            ? 'bg-primary-contrast text-white'
                            : 'bg-surface-muted text-text hover:bg-surface-secondary'
                    }`}
                >
                    {draftCleared ? '' : draftTime.minute}
                </button>
                <span className="invisible mt-1 block text-xs font-medium">{t('tour.timePicker.minute', { defaultValue: 'Minute' })}</span>
            </div>
        </div>
    );

    const renderDialPicker = () => {
        const options = dialPhase === 'hour' ? HOURS : MINUTES;
        const selectedValue = dialPhase === 'hour' ? draftTime.hour : draftTime.minute;
        const phaseLabel = dialPhase === 'hour'
            ? t('tour.timePicker.selectHour', { defaultValue: 'Select hour' })
            : t('tour.timePicker.selectMinute', { defaultValue: 'Select minute' });

        const selectedIndex = draftCleared ? -1 : options.indexOf(selectedValue);
        const selectedHour = Number(draftTime.hour);
        const selectedInnerHour = dialPhase === 'hour' && (selectedHour === 0 || selectedHour > 12);
        const selectedAngleIndex = dialPhase === 'hour'
            ? (selectedHour === 0 ? 12 : selectedHour % 12 || 12)
            : selectedIndex;
        const selectedTotalSlots = dialPhase === 'hour' ? 12 : options.length;
        const selectedAngleDeg = (selectedAngleIndex / selectedTotalSlots) * 360;
        const handLength = dialPhase === 'hour' && selectedInnerHour ? 61 : 96;

        return (
            <div className="px-6 pb-4">
                <div className="sr-only">{phaseLabel}</div>
                <div className="relative mx-auto h-60 w-60 rounded-full bg-surface-muted">
                    {!draftCleared && (
                        <span
                            aria-hidden="true"
                            className="absolute left-1/2 top-1/2 z-20 h-0.5 origin-left rounded-full bg-primary-contrast"
                            style={{
                                width: `${handLength}px`,
                                transform: `rotate(${selectedAngleDeg - 90}deg)`,
                            }}
                        />
                    )}
                    <button
                        type="button"
                        aria-label={t('tour.timePicker.clear')}
                        onClick={clearTime}
                        className="absolute left-1/2 top-1/2 z-30 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-contrast transition-colors hover:bg-[#4A4A4D] focus:outline-none focus:ring-2 focus:ring-primary-contrast focus:ring-offset-2 focus:ring-offset-surface-muted"
                    />
                    {options.map((option, index) => {
                        const isHour = dialPhase === 'hour';
                        const hourNumber = Number(option);
                        const innerHour = isHour && (hourNumber === 0 || hourNumber > 12);
                        const angleIndex = isHour
                            ? (hourNumber === 0 ? 12 : hourNumber % 12 || 12)
                            : index;
                        const totalSlots = isHour ? 12 : options.length;
                        const angle = (angleIndex / totalSlots) * Math.PI * 2 - Math.PI / 2;
                        const radius = innerHour ? 61 : 96;
                        const x = 120 + Math.cos(angle) * radius;
                        const y = 120 + Math.sin(angle) * radius;

                        return (
                            <button
                                key={option}
                                type="button"
                                aria-pressed={selectedValue === option}
                                onClick={() => {
                                    if (dialPhase === 'hour') {
                                        setDraft({ ...draftTime, hour: option });
                                        setDialPhase('minute');
                                    } else {
                                        setDraft({ ...draftTime, minute: option });
                                    }
                                }}
                                className={`absolute grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-sm font-semibold tabular-nums transition-colors ${
                                    !draftCleared && selectedValue === option ? 'z-30 bg-primary-contrast text-white' : 'z-10 text-text-secondary hover:bg-surface hover:text-text'
                                }`}
                                style={{ left: `${x}px`, top: `${y}px` }}
                            >
                                {option}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    const renderPickerActions = () => (
        <div className="border-t border-border">
            <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 px-4 py-2">
                <button
                    type="button"
                    aria-label={mode === 'dial'
                        ? t('tour.timePicker.manual', { defaultValue: 'Manual input' })
                        : t('tour.timePicker.dial', { defaultValue: 'Dial' })}
                    onClick={toggleMode}
                    className="grid h-10 w-10 place-items-center rounded-lg text-text-secondary transition-colors hover:bg-surface-muted hover:text-text"
                >
                    {mode === 'dial' ? <KeyboardIcon className="h-5 w-5" /> : <ClockIcon className="h-5 w-5" />}
                </button>
                <button
                    type="button"
                    onClick={clearTime}
                    className="h-10 rounded-md px-2 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface-muted hover:text-text"
                >
                    {t('tour.timePicker.clear')}
                </button>
                <span />
                <Button
                    type="button"
                    onClick={confirmTime}
                    size="sm"
                    className="h-10 min-w-24 px-3 py-0 text-sm"
                >
                    {t('common.ok')}
                </Button>
            </div>
        </div>
    );

    return (
        <div className="relative" ref={rootRef}>
            <label htmlFor={id} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {label}
            </label>
            <button
                id={id}
                type="button"
                aria-expanded={isOpen}
                disabled={disabled}
                onClick={() => setIsOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-border-strong bg-surface px-3 py-2 text-left text-sm text-text transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
                <span className="flex min-w-0 items-center gap-2">
                    <ClockIcon className="h-4 w-4 shrink-0 text-text-secondary" />
                    <span className={displayValue ? 'truncate tabular-nums' : 'truncate text-text-muted'}>
                        {displayValue || t('tour.timePicker.selectTime')}
                    </span>
                </span>
                <ChevronDownIcon className={`h-4 w-4 shrink-0 text-text-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && !disabled && createPortal(
                <div
                    ref={dropdownRef}
                    role="region"
                    aria-label={label}
                    className="fixed z-[9999] overflow-hidden rounded-xl border border-border-strong bg-surface shadow-[0_-8px_24px_rgba(15,23,42,0.12),0_0_12px_rgba(15,23,42,0.08)] app-dark:shadow-[0_-10px_28px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.04)]"
                    style={{
                        top: `${dropdownPosition.top}px`,
                        left: `${dropdownPosition.left}px`,
                        width: `${dropdownPosition.width}px`,
                        maxHeight: `${dropdownPosition.maxHeight}px`,
                    }}
                >
                    {renderPickerHead()}
                    {mode === 'manual' ? renderManualInput() : (
                        <>
                            {renderDialTimeDisplay()}
                            {renderDialPicker()}
                        </>
                    )}
                    {renderPickerActions()}
                </div>,
                document.body
            )}
        </div>
    );
}

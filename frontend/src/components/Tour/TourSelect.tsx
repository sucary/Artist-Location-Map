import { useCallback, useEffect, useMemo, useRef, useState, useId, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from '../icons/GeneralIcons';
import { useTranslation } from 'react-i18next';
import { getBrowserDateLocale } from '../../utils/dateFormatting';
import { useAnchoredPopup } from '../../hooks/useAnchoredPopup';

interface TourSelectOption {
    id: string;
    name: string;
    startDate?: string | null;
    endDate?: string | null;
}

interface TourSelectProps {
    id?: string;
    tours: TourSelectOption[];
    value: string;
    placeholder: string;
    ariaLabel: string;
    emptyLabel?: string;
    dropdownMaxHeight?: number;
    onChange: (tourId: string) => void;
}

export function TourSelect({ id, tours, value, placeholder, ariaLabel, emptyLabel, dropdownMaxHeight, onChange }: TourSelectProps) {
    const generatedInputId = useId();
    const inputId = id ?? generatedInputId;
    const listboxId = `${inputId}-tours`;
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { i18n, t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const dateFallback = i18n.resolvedLanguage || i18n.language || undefined;
    const dateLocale = useMemo(() => getBrowserDateLocale(dateFallback), [dateFallback]);
    const tourMonthFormatter = useMemo(() => new Intl.DateTimeFormat(dateLocale, { year: 'numeric', month: 'short' }), [dateLocale]);
    const tourMonthOnlyFormatter = useMemo(() => new Intl.DateTimeFormat(dateLocale, { month: 'short' }), [dateLocale]);

    const selectedTour = useMemo(() => (
        tours.find((tour) => tour.id === value)
    ), [tours, value]);
    const selectedTourName = selectedTour?.name ?? '';

    // Draft query preserves user typing while external selection changes resync
    const [queryState, setQueryState] = useState(() => ({
        value: selectedTourName,
        syncedValue: value,
        syncedName: selectedTourName,
    }));
    const query = queryState.syncedValue === value && queryState.syncedName === selectedTourName
        ? queryState.value
        : selectedTourName;

    const formatTourMonth = useCallback((date?: string | null) => {
        if (!date) return '';
        const parsedDate = new Date(`${date}T00:00:00`);
        if (Number.isNaN(parsedDate.getTime())) return '';

        return tourMonthFormatter.format(parsedDate);
    }, [tourMonthFormatter]);

    const formatTourMonthOnly = useCallback((date?: string | null) => {
        if (!date) return '';
        const parsedDate = new Date(`${date}T00:00:00`);
        if (Number.isNaN(parsedDate.getTime())) return '';

        return tourMonthOnlyFormatter.format(parsedDate);
    }, [tourMonthOnlyFormatter]);

    // Tour range uses boundary gig months only
    const formatTourDateRange = useCallback((startDate?: string | null, endDate?: string | null) => {
        const startMonth = formatTourMonth(startDate);
        const endMonth = formatTourMonth(endDate);
        if (!startMonth && !endMonth) return '';
        if (!startMonth || !endMonth || startDate?.slice(0, 7) === endDate?.slice(0, 7)) return startMonth || endMonth;
        if (startDate?.slice(0, 4) === endDate?.slice(0, 4)) return `${startMonth} - ${formatTourMonthOnly(endDate)}`;

        return `${startMonth} - ${endMonth}`;
    }, [formatTourMonth, formatTourMonthOnly]);

    const getTourOptionDate = useCallback((tour: TourSelectOption) => (
        formatTourDateRange(tour.startDate, tour.endDate)
    ), [formatTourDateRange]);

    const getTourSearchText = useCallback((tour: TourSelectOption) => (
        [tour.name, getTourOptionDate(tour)].filter(Boolean).join(' ')
    ), [getTourOptionDate]);

    // Filter tours by the same visible value users type into the control
    const filteredTours = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery || selectedTourName === query) return tours;
        return tours.filter((tour) => getTourSearchText(tour).toLowerCase().includes(normalizedQuery));
    }, [getTourSearchText, query, selectedTourName, tours]);
    const safeActiveIndex = filteredTours.length === 0 ? 0 : Math.min(activeIndex, filteredTours.length - 1);
    const activeOptionId = isOpen && filteredTours[safeActiveIndex] ? `${listboxId}-${filteredTours[safeActiveIndex].id}` : undefined;

    const dropdownPosition = useAnchoredPopup({
        isOpen,
        anchorRef: containerRef,
        popupRef: dropdownRef,
        width: 'anchor',
        align: 'left',
        gap: 4,
        maxHeightCap: dropdownMaxHeight,
        recomputeKey: filteredTours.length,
        onScrollAway: () => {
            setIsOpen(false);
            setQueryState({
                value: selectedTourName,
                syncedValue: value,
                syncedName: selectedTourName,
            });
        },
    });

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            // Portaled list remains part of the active picker
            if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
            setIsOpen(false);
            setQueryState({
                value: selectedTourName,
                syncedValue: value,
                syncedName: selectedTourName,
            });
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedTourName, value]);

    const handleSelect = (tour: TourSelectOption) => {
        onChange(tour.id);
        setQueryState({
            value: tour.name,
            syncedValue: tour.id,
            syncedName: tour.name,
        });
        setIsOpen(false);
    };

    const openWithSelectedOption = () => {
        const selectedIndex = Math.max(0, filteredTours.findIndex((tour) => tour.id === value));
        setActiveIndex(selectedIndex);
        setIsOpen(true);
    };

    const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            setIsOpen(false);
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((current) => {
                if (filteredTours.length === 0) return 0;
                const nextIndex = event.key === 'ArrowDown' ? current + 1 : current - 1;
                return (nextIndex + filteredTours.length) % filteredTours.length;
            });
            return;
        }

        if (event.key === 'Enter' && isOpen && filteredTours[safeActiveIndex]) {
            event.preventDefault();
            handleSelect(filteredTours[safeActiveIndex]);
        }
    };

    return (
        <div ref={containerRef} className="relative">
            <input
                id={inputId}
                role="combobox"
                aria-label={ariaLabel}
                aria-autocomplete="list"
                aria-activedescendant={activeOptionId}
                aria-controls={isOpen ? listboxId : undefined}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                autoComplete="off"
                type="text"
                value={query}
                onChange={(event) => {
                    setQueryState({
                        value: event.target.value,
                        syncedValue: '',
                        syncedName: '',
                    });
                    onChange('');
                    setIsOpen(true);
                    setActiveIndex(0);
                }}
                onFocus={openWithSelectedOption}
                onKeyDown={handleInputKeyDown}
                placeholder={placeholder}
                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 pr-8 text-sm text-text placeholder:text-text-muted transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
            />
            <button
                aria-label={ariaLabel}
                aria-controls={isOpen ? listboxId : undefined}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                type="button"
                onMouseDown={(event) => {
                    event.preventDefault();
                    if (isOpen) {
                        setIsOpen(false);
                        return;
                    }
                    openWithSelectedOption();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-secondary transition-colors hover:bg-primary hover:text-white"
            >
                <ChevronDownIcon className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && createPortal(
                <div
                    id={listboxId}
                    role="listbox"
                    aria-label={ariaLabel}
                    ref={dropdownRef}
                    data-tour-select-dropdown="true"
                    className="fixed z-9999 overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-lg app-dark:shadow-[0_16px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)]"
                    style={{
                        top: `${dropdownPosition.top}px`,
                        left: `${dropdownPosition.left}px`,
                        width: `${dropdownPosition.width}px`,
                        maxHeight: `${dropdownPosition.maxHeight}px`,
                    }}
                >
                    {filteredTours.map((tour, index) => {
                        const tourDate = getTourOptionDate(tour);
                        const isActive = index === activeIndex;

                        return (
                            <button
                                key={tour.id}
                                id={`${listboxId}-${tour.id}`}
                                type="button"
                                role="option"
                                aria-selected={tour.id === value}
                                onMouseDown={(event) => event.preventDefault()}
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => handleSelect(tour)}
                                className={`flex w-full items-center gap-3 border-b border-border px-3 py-2 text-left text-sm text-text transition-colors last:border-b-0 hover:bg-surface-muted ${tour.id === value || isActive ? 'bg-surface-muted' : ''}`}
                            >
                                <span className="min-w-0 flex-1 truncate font-medium">{tour.name}</span>
                                {tourDate && (
                                    <span className="shrink-0 text-xs font-medium text-text-secondary">
                                        {tourDate}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                    {filteredTours.length === 0 && (
                        <div className="px-3 py-3 text-sm text-text-secondary">
                            {emptyLabel ?? t('tour.form.noToursFound')}
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}

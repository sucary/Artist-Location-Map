import { useEffect, useMemo, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import type { Tour } from '../../types/gig';
import { ChevronDownIcon } from '../icons/GeneralIcons';
import { useTranslation } from 'react-i18next';

interface TourSelectProps {
    tours: Tour[];
    value: string;
    placeholder: string;
    ariaLabel: string;
    onChange: (tourId: string) => void;
}

export function TourSelect({ tours, value, placeholder, ariaLabel, onChange }: TourSelectProps) {
    const inputId = useId();
    const listboxId = `${inputId}-tours`;
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

    const selectedTour = useMemo(() => (
        tours.find((tour) => tour.id === value)
    ), [tours, value]);

    // Filter tours by the same visible value users type into the control
    const filteredTours = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery || selectedTour?.name === query) return tours;
        return tours.filter((tour) => tour.name.toLowerCase().includes(normalizedQuery));
    }, [query, selectedTour?.name, tours]);

    useEffect(() => {
        if (!isOpen || !containerRef.current) return;

        // Portal menu follows the input inside map overlays
        const rect = containerRef.current.getBoundingClientRect();
        setDropdownPosition({
            top: rect.bottom + window.scrollY + 4,
            left: rect.left + window.scrollX,
            width: rect.width,
        });
    }, [isOpen, query]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            // Portaled list remains part of the active picker
            if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
            setIsOpen(false);
            setQuery(selectedTour?.name ?? '');
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [selectedTour?.name]);

    useEffect(() => {
        setQuery(selectedTour?.name ?? '');
    }, [selectedTour?.name]);

    const handleSelect = (tour: Tour) => {
        onChange(tour.id);
        setQuery(tour.name);
        setIsOpen(false);
    };

    return (
        <div ref={containerRef} className="relative">
            <input
                id={inputId}
                role="combobox"
                aria-label={ariaLabel}
                aria-autocomplete="list"
                aria-controls={isOpen ? listboxId : undefined}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                autoComplete="off"
                type="text"
                value={query}
                onChange={(event) => {
                    setQuery(event.target.value);
                    onChange('');
                    setIsOpen(true);
                }}
                onFocus={() => setIsOpen(true)}
                placeholder={placeholder}
                className="w-full border border-border-strong rounded-md bg-surface px-3 py-2 pr-8 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-inset focus:ring-primary"
            />
            <button
                aria-label={ariaLabel}
                aria-controls={isOpen ? listboxId : undefined}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                type="button"
                onMouseDown={(event) => {
                    event.preventDefault();
                    setIsOpen((open) => !open);
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
                    className="fixed z-9999 max-h-48 overflow-y-auto rounded-md border border-border-strong bg-surface shadow-lg"
                    style={{
                        top: `${dropdownPosition.top}px`,
                        left: `${dropdownPosition.left}px`,
                        width: `${dropdownPosition.width}px`,
                    }}
                >
                    {filteredTours.map((tour) => (
                        <button
                            key={tour.id}
                            type="button"
                            role="option"
                            aria-selected={tour.id === value}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => handleSelect(tour)}
                            className={`w-full border-b border-border px-3 py-2 text-left text-sm text-text transition-colors last:border-b-0 hover:bg-surface-secondary ${tour.id === value ? 'bg-surface-muted' : ''}`}
                        >
                            <span className="block truncate font-medium">{tour.name}</span>
                        </button>
                    ))}
                    {filteredTours.length === 0 && (
                        <div className="px-3 py-3 text-sm text-text-secondary">
                            {t('tour.form.noToursFound')}
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}

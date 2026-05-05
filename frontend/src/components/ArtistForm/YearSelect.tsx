import { useState, useRef, useEffect, useCallback, useId } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDownIcon } from '../icons/GeneralIcons';
import { useTranslation } from 'react-i18next';

interface YearSelectProps {
    value?: number;
    onChange: (year: number | undefined) => void;
    placeholder?: string;
    label?: string;
    minYear?: number;
    maxYear?: number;
    tutorialTarget?: string;
}

const YearSelect = ({
    value,
    onChange,
    placeholder,
    label,
    minYear = 1900,
    maxYear = new Date().getFullYear(),
    tutorialTarget
}: YearSelectProps) => {
    const inputId = useId();
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState(value?.toString() || '');
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();


    // Sync input value with prop value
    useEffect(() => {
        setInputValue(value?.toString() || '');
    }, [value]);

    // Generate all year options (newest first)
    const years = Array.from(
        { length: maxYear - minYear + 1 },
        (_, i) => maxYear - i
    );

    // Find the best matching year to focus on
    const getFocusYear = useCallback((): number | null => {
        if (!inputValue) return null;
        const numVal = parseInt(inputValue, 10);
        if (inputValue.length === 4 && numVal >= minYear && numVal <= maxYear) {
            return numVal;
        }
        // Find first year that starts with input
        const match = years.find(y => y.toString().startsWith(inputValue));
        return match || null;
    }, [inputValue, years, minYear, maxYear]);

    // Update dropdown position
    useEffect(() => {
        if (isOpen && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setDropdownPosition({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width
            });
        }
    }, [isOpen]);

    // Scroll to matching year when input changes
    useEffect(() => {
        if (isOpen && dropdownRef.current && inputValue) {
            const focusYear = getFocusYear();
            if (focusYear) {
                const yearElement = dropdownRef.current.querySelector(`[data-year="${focusYear}"]`);
                yearElement?.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [isOpen, inputValue, getFocusYear]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                !containerRef.current?.contains(target) &&
                !dropdownRef.current?.contains(target)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (year: number) => {
        onChange(year);
        setInputValue(year.toString());
        setIsOpen(false);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value.replace(/\D/g, '').slice(0, 4);
        setInputValue(val);
        setIsOpen(true);

        const numVal = parseInt(val, 10);
        if (val.length === 4 && numVal >= minYear && numVal <= maxYear) {
            onChange(numVal);
        } else if (val === '') {
            onChange(undefined);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const numVal = parseInt(inputValue, 10);
            if (inputValue.length === 4 && numVal >= minYear && numVal <= maxYear) {
                onChange(numVal);
                setIsOpen(false);
            } else {
                // Select the focused year if input is partial
                const focusYear = getFocusYear();
                if (focusYear) {
                    handleSelect(focusYear);
                }
            }
        } else if (e.key === 'Escape') {
            setIsOpen(false);
        }
    };

    const handleBlur = () => {
        // Validate on blur
        const numVal = parseInt(inputValue, 10);
        if (inputValue && (numVal < minYear || numVal > maxYear || inputValue.length !== 4)) {
            setInputValue(value?.toString() || '');
        }
    };

    return (
        <div data-tutorial-target={tutorialTarget} className="rounded-md p-1">
            {label && (
                <label 
                    htmlFor={inputId}
                    className="block text-sm font-bold text-text mb-1"
                >
                    {label}
                </label>
            )}
            <div ref={containerRef} className="relative">
                <input
                    id={inputId}
                    ref={inputRef}
                    type="text"
                    inputMode="numeric"
                    value={inputValue}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    onFocus={(e) => {
                        setIsOpen(true);
                        e.target.select();
                    }}
                    onBlur={handleBlur}
                    placeholder={placeholder || t('artistForm.yearSelect.placeholder')}
                    className="w-full px-3 py-2 pr-8 text-sm border border-border-strong rounded-md focus:outline-none focus:border-primary focus:ring-1 focus:ring-inset focus:ring-primary"
                />
                <button
                    aria-label={t('artistForm.yearSelect.label')}
                    type="button"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        setIsOpen(!isOpen);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-text-secondary hover:bg-primary hover:text-white transition-colors"
                >
                    <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
            </div>

            {isOpen && years.length > 0 && createPortal(
                <div
                    role="listbox"
                    ref={dropdownRef}
                    className="fixed z-9999 bg-surface border border-border-strong rounded-md shadow-lg max-h-48 overflow-y-auto"
                    style={{
                        top: `${dropdownPosition.top + 4}px`,
                        left: `${dropdownPosition.left}px`,
                        width: `${dropdownPosition.width}px`
                    }}
                >
                    {years.map((year) => {
                        const focusYear = getFocusYear();
                        const isSelected = year === value;
                        const isFocused = year === focusYear && focusYear !== value;
                        return (
                            <button
                                key={year}
                                data-year={year}
                                type="button"
                                role="option"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleSelect(year)}
                                className={`w-full px-3 py-2 text-left text-sm hover:bg-surface-secondary ${
                                    isSelected ? 'bg-primary/5 text-primary font-medium' :
                                    isFocused ? 'bg-surface-muted' : 'text-text'
                                }`}
                            >
                                {year}
                            </button>
                        );
                    })}
                </div>,
                document.body
            )}
        </div>
    );
};

export default YearSelect;

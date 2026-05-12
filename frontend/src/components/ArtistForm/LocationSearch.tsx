import { useRef, useEffect, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { SearchIcon, CloseIcon } from '../icons/GeneralIcons';
import { MapPinIcon } from '../icons/MapIcons';
import { useLocationSearch } from '../../hooks/useLocationSearch';
import { Alert, FieldStatusIcon, Spinner, Button, type FieldStatus } from '../ui';
import { useAuth } from '../../context/AuthContext';
import { useLocationLanguage } from '../../context/LocationLanguageContext';
import { formatLocationLocalized } from '../../utils/locationUtils';
import type { SearchResult } from '../../services/api';
import { useTranslation } from 'react-i18next';

interface LocationSearchProps {
    displayValue?: string;
    onChange: (result: SearchResult) => void;
    onManualPin: () => void;
    placeholder?: string;
    label?: string;
    pendingCoordinates?: { lat: number; lng: number } | null;
    onCoordinatesConsumed?: () => void;
    pendingSearch?: { query: string; key: number } | null;
    syncKey?: number;
    tutorialInputTarget?: string;
    status?: FieldStatus;
    statusMessage?: string;
}

export const LocationSearch = ({
    displayValue = '',
    onChange,
    onManualPin,
    placeholder,
    label,
    pendingCoordinates,
    onCoordinatesConsumed,
    pendingSearch,
    syncKey,
    tutorialInputTarget,
    status,
    statusMessage
}: LocationSearchProps) => {
    const {
        query,
        results,
        isOpen,
        isLoading,
        isLoadingMore,
        error,
        hasMore,
        queueSize,
        retryFn,
        setQuery,
        handleSearch,
        handleSelect,
        handleSearchMore,
        handleCancel,
        handleRetry,
        openDropdown,
        closeDropdown,
    } = useLocationSearch({
        displayValue,
        onChange,
        pendingCoordinates,
        onCoordinatesConsumed,
        pendingSearch,
        syncKey,
    });

    const { profile } = useAuth();
    const { locationLanguage } = useLocationLanguage();
    const inputId = useId();
    const listboxId = `${inputId}-results`;
    const statusId = status === 'warning' && statusMessage && !error ? `${inputId}-status` : undefined;
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 });
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLDivElement>(null);
    const controlsRef = useRef<HTMLDivElement>(null);
    const { t } = useTranslation();

    // Update dropdown position when opening
    useEffect(() => {
        if (isOpen && inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            // Find the outer form panel to cap dropdown within it
            const formContainer = inputRef.current.closest('.rounded-lg.shadow-xl');
            const containerBottom = formContainer
                ? formContainer.getBoundingClientRect().bottom
                : window.innerHeight;
            const gap = 4;
            const maxHeight = Math.max(120, containerBottom - rect.bottom - gap);
            
            setDropdownPosition({
                top: rect.bottom + window.scrollY,
                left: rect.left + window.scrollX,
                width: rect.width,
                maxHeight
            });
        }
    }, [isOpen]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const clickedInsideControls = controlsRef.current?.contains(target);
            const clickedOnDropdown = document.querySelector('.location-search-dropdown')?.contains(target);

            if (!clickedInsideControls && !clickedOnDropdown) {
                closeDropdown();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [closeDropdown]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
    };

    const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        if (query === null && displayValue) {
            setQuery(displayValue);
            setTimeout(() => e.target.select(), 0);
        } else if (query !== null && results.length > 0) {
            openDropdown();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleSearch();
        }
    };

    const canSearch = query !== null && query.trim().length >= 2;
    const showNoResults = isOpen && results.length === 0 && !isLoading && !error && canSearch;

    return (
        <div>
            <div className="relative" ref={dropdownRef}>
                <div className="flex items-end gap-2 rounded-md p-1" ref={inputRef} data-tutorial-target={tutorialInputTarget}>
                    <div className="flex-1">
                        {label && (
                            <label
                                htmlFor={inputId}
                                className="block text-sm font-bold text-text mb-1"
                            >
                                {label}
                            </label>
                        )}
                        <div className="relative" ref={controlsRef}>
                            <input
                                id={inputId}
                                role="combobox"
                                aria-autocomplete="list"
                                aria-controls={isOpen ? listboxId : undefined}
                                aria-expanded={isOpen}
                                aria-haspopup="listbox"
                                aria-busy={isLoading || queueSize > 0}
                                aria-describedby={statusId}
                                name={tutorialInputTarget ? `${tutorialInputTarget}-search` : 'location-search'}
                                autoComplete="off"
                                autoCorrect="off"
                                spellCheck={false}
                                type="text"
                                placeholder={placeholder || t('artistForm.locationSearch.placeholder')}
                                className={`w-full pl-3 py-2 border border-border-strong rounded-md text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-inset focus:ring-primary ${(isLoading || queueSize > 0 || status) ? 'pr-20' : 'pr-9'}`}
                                value={query !== null ? query : displayValue}
                                onChange={handleInputChange}
                                onFocus={handleInputFocus}
                                onKeyDown={handleKeyDown}
                            />
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center">
                                {(isLoading || queueSize > 0) && (
                                    <div className="relative inline-flex items-center justify-center">
                                        {isLoading && <Spinner size="sm" className="text-text-muted" />}
                                        {queueSize > 0 && (
                                            <div className={`${isLoading ? 'absolute inset-0' : ''} flex items-center justify-center`}>
                                                <span className={`text-[10px] font-bold ${isLoading ? 'text-text-muted' : 'text-primary-contrast app-dark:text-primary-text-dark'}`}>{queueSize}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <FieldStatusIcon
                                    status={status}
                                    label={t('artistForm.locationSearch.locationSelected')}
                                />
                                <button
                                    aria-label={(isLoading || queueSize > 0) ? t('artistForm.locationSearch.cancelSearch') : t('artistForm.locationSearch.searchLocation')}
                                    onClick={(isLoading || queueSize > 0) ? handleCancel : handleSearch}
                                    type="button"
                                    disabled={!isLoading && queueSize === 0 && !canSearch}
                                    className={`p-1 rounded transition-colors ${(isLoading || queueSize > 0) ? 'text-text-secondary hover:bg-error hover:text-white' : 'text-text-secondary hover:bg-primary hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary'}`}
                                    title={(isLoading || queueSize > 0) ? t('artistForm.locationSearch.cancelSearch') : t('artistForm.locationSearch.searchLocation')}
                                >
                                    {(isLoading || queueSize > 0) ? <CloseIcon className="w-4 h-4" /> : <SearchIcon className="w-4 h-4" />}
                                </button>
                            </div>
                                        </div>
                    </div>
                    <button
                        aria-label={t('artistForm.locationSearch.manualSelect')}
                        onClick={onManualPin}
                        type="button"
                        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded text-text-muted hover:bg-primary hover:text-white transition-colors"
                        title={t('artistForm.locationSearch.manualSelect')}
                    >
                        <MapPinIcon className="w-5 h-5" />
                    </button>
                </div>

                {error && (
                    <Alert variant="error" header={t('artistForm.locationSearch.failedHeader')} className="mt-2">
                        <span>{error}</span>
                        {retryFn && (
                            <button
                                type="button"
                                onClick={handleRetry}
                                className="ml-2 font-medium text-primary-contrast app-dark:text-primary hover:underline"
                            >
                                {t('artistForm.locationSearch.retry')}
                            </button>
                        )}
                    </Alert>
                )}
                {status === 'warning' && statusMessage && !error && (
                    <Alert id={statusId} variant="warning" className="mt-2" hideIcon>
                        {statusMessage}
                    </Alert>
                )}
            </div>

            {/* Dropdown Portal */}
            {isOpen && results.length > 0 && createPortal(
                <div
                    className="location-search-dropdown fixed z-[9999] bg-surface border border-border-strong rounded-md shadow-lg overflow-hidden"
                    style={{
                        top: `${dropdownPosition.top + 4}px`,
                        left: `${dropdownPosition.left}px`,
                        width: `${dropdownPosition.width}px`,
                        maxHeight: `${dropdownPosition.maxHeight}px`
                    }}
                >
                    <div id={listboxId} role="listbox" aria-label={label || t('artistForm.locationSearch.placeholder')} className="overflow-y-auto" style={{ maxHeight: `${dropdownPosition.maxHeight - 2}px` }}>
                        {results.map((result, index) => (
                            <button
                                role="option"
                                aria-selected="false"
                                key={`${result.osmId}-${index}`}
                                onClick={() => handleSelect(result)}
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-surface-secondary border-b border-border last:border-b-0"
                            >
                                <div className="font-medium text-text flex items-start">
                                    {profile?.isAdmin && result.isPriority && (
                                        <span className="inline-block w-2 h-2 bg-primary rounded-full mr-2 mt-1.5" />
                                    )}
                                    {result.localizedChain
                                        ? formatLocationLocalized({ localizedChain: result.localizedChain }, locationLanguage)
                                        : result.displayName}
                                </div>
                                <div className="flex items-center justify-between mt-0.5">
                                    {result.type && (
                                        <span className="text-xs text-text-secondary capitalize">{result.type}</span>
                                    )}
                                    {profile?.isAdmin && result.isLocal && (
                                        <span className="text-xs text-secondary bg-secondary/10 px-1.5 py-0.5 rounded ml-auto">DB</span>
                                    )}
                                </div>
                            </button>
                        ))}
                        {hasMore && (
                            <Button
                                onClick={handleSearchMore}
                                type="button"
                                disabled={isLoadingMore}
                                variant="ghost"
                                className="w-full border-t border-border rounded-none flex items-center justify-center gap-2"
                            >
                                {isLoadingMore && (
                                    <div className="relative inline-flex items-center justify-center">
                                        <Spinner size="sm" />
                                        {queueSize > 0 && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-[10px] font-bold text-text-muted">{queueSize}</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <span>{isLoadingMore ? t('artistForm.locationSearch.searching') : t('artistForm.locationSearch.searchMore')}</span>
                            </Button>
                        )}
                    </div>
                </div>,
                document.body
            )}

            {/* No results Portal */}
            {showNoResults && createPortal(
                <div
                    className="location-search-dropdown fixed z-[9999] bg-surface border border-border-strong rounded-md shadow-lg p-3 text-sm text-text-secondary text-center"
                    style={{
                        top: `${dropdownPosition.top + 4}px`,
                        left: `${dropdownPosition.left}px`,
                        width: `${dropdownPosition.width}px`
                    }}
                >
                    {t('artistForm.locationSearch.noResults')}
                </div>,
                document.body
            )}
        </div>
    );
};

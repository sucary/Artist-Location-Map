import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Location, LocationLanguage } from '../../types/artist';
import {
    searchTourLocations,
    type TourLocationSearchResult,
} from '../../services/api';
import { formatLocationLocalized } from '../../utils/locationUtils';
import { useLocationLanguage } from '../../context/LocationLanguageContext';
import { SearchIcon } from '../icons/GeneralIcons';
import { Alert, Spinner } from '../ui';
import { useTranslation } from 'react-i18next';

// Tour-only Geoapify venue and location picker

interface VenueLocationSearchProps {
    venueName?: string | null;
    location: Location | null;
    rawExternalData?: unknown;
    onChange: (value: {
        venueName?: string | null;
        placeLocationId?: string | null;
        location: Location | null;
        rawExternalData?: unknown;
    }) => void;
}

const getResultLabel = (result: TourLocationSearchResult) => {
    return result.displayName || [result.name, result.city, result.province, result.country]
        .filter(Boolean)
        .join(', ');
};

// Geoapify accepts 2-character ISO language codes
function getGeoapifyLanguage(language: LocationLanguage): string | undefined {
    if (language === 'native') return undefined;
    if (language === 'zhHans' || language === 'zhHant') return 'zh';
    return language;
}

function resultToLocation(result: TourLocationSearchResult, isManualSelection = false): Location {
    return {
        city: result.city || result.name,
        province: result.province || result.city || result.name,
        country: result.country,
        displayName: result.displayName || getResultLabel(result),
        coordinates: result.center,
        type: result.type,
        cityId: result.cityId,
        source: result.source,
        isManualSelection,
    };
}

export function VenueLocationSearch({
    venueName,
    location,
    onChange,
}: VenueLocationSearchProps) {
    const { t } = useTranslation();
    const { locationLanguage } = useLocationLanguage();
    const inputId = useId();
    const [query, setQuery] = useState(venueName || (location ? formatLocationLocalized(location, locationLanguage) : ''));
    const [results, setResults] = useState<TourLocationSearchResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 });
    const [error, setError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const controlsRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setQuery(venueName || (location ? formatLocationLocalized(location, locationLanguage) : ''));
    }, [location, locationLanguage, venueName]);

    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    useEffect(() => {
        if (!isOpen || !controlsRef.current) return;

        const rect = controlsRef.current.getBoundingClientRect();
        const gap = 4;
        const availableBelow = window.innerHeight - rect.bottom - gap;
        const availableAbove = rect.top - gap;
        const opensAbove = availableBelow < 160 && availableAbove > availableBelow;
        const maxHeight = Math.max(140, Math.min(360, opensAbove ? availableAbove : availableBelow));

        // Portal avoids clipping inside the scrollable gig form
        setDropdownPosition({
            top: opensAbove ? rect.top + window.scrollY - maxHeight - gap : rect.bottom + window.scrollY + gap,
            left: rect.left + window.scrollX,
            width: rect.width,
            maxHeight,
        });
    }, [isOpen, results.length]);

    // Dropdown follows add-artist outside-click behavior
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const clickedDropdown = document.querySelector('.tour-location-search-dropdown')?.contains(target);
            if ((!rootRef.current?.contains(target) || !controlsRef.current?.contains(target)) && !clickedDropdown) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const runSearch = async () => {
        const searchQuery = query.trim();
        if (searchQuery.length < 2) return;

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setIsLoading(true);
        setError(null);

        try {
            const response = await searchTourLocations(searchQuery, {
                limit: 10,
                lang: getGeoapifyLanguage(locationLanguage),
                nativeName: locationLanguage === 'native',
            }, controller.signal);
            setResults(response.results);
            setIsOpen(true);
        } catch {
            setError(t('tour.venueSearch.failedLocation', {
                defaultValue: 'Failed to search. Please try again.',
            }));
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
            }
            setIsLoading(false);
        }
    };

    const openResults = () => {
        if (results.length > 0) {
            setIsOpen(true);
        }
    };

    const selectResult = (result: TourLocationSearchResult) => {
        const nextLocation = resultToLocation(result);
        onChange({
            venueName: result.isVenue ? result.venueName || result.name : null,
            placeLocationId: result.placeLocationId ?? null,
            location: nextLocation,
            rawExternalData: result.isVenue ? result.rawExternalData : null,
        });
        setQuery(result.isVenue ? result.venueName || result.name : formatLocationLocalized(nextLocation, locationLanguage));
        setIsOpen(false);
    };

    const renderResults = () => {
        if (!isOpen || results.length === 0) return null;

        return (
            <div
                className="tour-location-search-dropdown fixed z-[9999] overflow-y-auto rounded-md border border-border-strong bg-surface shadow-lg"
                style={{
                    top: `${dropdownPosition.top}px`,
                    left: `${dropdownPosition.left}px`,
                    width: `${dropdownPosition.width}px`,
                    maxHeight: `${dropdownPosition.maxHeight}px`,
                }}
            >
                {results.map((result, index) => {
                    const key = `${result.providerId || result.name}-${index}`;
                    const primaryLabel = result.isVenue ? result.venueName || result.name : result.name;

                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => selectResult(result)}
                            className="w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-surface-secondary"
                        >
                            <span className="flex items-center gap-2 font-medium text-text">
                                <span>{primaryLabel}</span>
                                {result.isVenue && (
                                    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
                                        {t('tour.fields.venue')}
                                    </span>
                                )}
                            </span>
                            <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-text-secondary">
                                <span>{getResultLabel(result)}</span>
                                {(result.source === 'local' || result.isCached) && (
                                    <span className="shrink-0 rounded bg-secondary/10 px-1.5 py-0.5 text-secondary">DB</span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
        );
    };

    const inputClass = 'w-full rounded-md border border-border-strong bg-surface px-3 py-2 pr-9 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary';

    return (
        <div className="relative rounded-md p-1" ref={rootRef}>
            <label htmlFor={inputId} className="mb-1 block text-sm font-bold text-text">
                {t('tour.fields.location')}
            </label>
            <div className="relative" ref={controlsRef}>
                <input
                    id={inputId}
                    type="text"
                    autoComplete="off"
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        if (venueName) {
                                onChange({
                                    venueName: null,
                                    placeLocationId: null,
                                    location,
                                    rawExternalData: null,
                                });
                        }
                    }}
                    onFocus={openResults}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                            setIsOpen(false);
                            return;
                        }
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            void runSearch();
                        }
                    }}
                    placeholder={t('tour.form.locationPlaceholder')}
                    className={inputClass}
                />
                <button
                    type="button"
                    aria-label={t('tour.venueSearch.searchLocation', { defaultValue: 'Search location' })}
                    disabled={query.trim().length < 2 || isLoading}
                    onClick={() => { void runSearch(); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-secondary hover:bg-primary hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
                >
                    {isLoading ? <Spinner size="sm" /> : <SearchIcon className="h-4 w-4" />}
                </button>
            </div>

            {error && (
                <Alert variant="error" header={t('artistForm.locationSearch.failedHeader')} className="mt-2">
                    {error}
                </Alert>
            )}

            {isOpen && results.length > 0 && createPortal(renderResults(), document.body)}
        </div>
    );
}

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import type { Coordinates, Location, LocationLanguage } from '../../types/artist';
import {
    createManualVenue,
    reverseSearchCities,
    reverseTourLocation,
    searchTourLocations,
    updateManualVenue,
    type SearchResult,
    type TourLocationSearchResult,
} from '../../services/api';
import { formatLocationLocalized } from '../../utils/locationUtils';
import { useLocationLanguage } from '../../context/LocationLanguageContext';
import { SearchIcon } from '../icons/GeneralIcons';
import { MapPinIcon } from '../icons/MapIcons';
import { Alert, Button, InlineActionMenu, Spinner } from '../ui';
import { useTranslation } from 'react-i18next';

// Tour-only Geoapify venue and location picker

interface VenueLocationSearchProps {
    venueName?: string | null;
    placeLocationId?: string | null;
    location: Location | null;
    rawExternalData?: unknown;
    pendingCoordinates?: Coordinates | null;
    onManualPin?: () => void;
    onConsumePendingCoordinates?: () => void;
    onChange: (value: {
        venueName?: string | null;
        placeLocationId?: string | null;
        location: Location | null;
        rawExternalData?: unknown;
    }) => void;
}

function manualCoordinatesToLocation(coordinates: Coordinates, label: string): Location {
    return {
        city: label,
        province: label,
        displayName: label,
        coordinates,
        source: 'manual',
        isManualSelection: true,
    };
}

const getResultLabel = (result: TourLocationSearchResult) => {
    return result.displayName || [result.name, result.city, result.province, result.country]
        .filter(Boolean)
        .join(', ');
};

function getVenueAddressLabel(result: TourLocationSearchResult): string {
    const venueName = result.venueName || result.name;
    return result.isVenue ? stripLeadingVenueName(getResultLabel(result), venueName) : getResultLabel(result);
}

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

function isUserCreatedVenue(result: TourLocationSearchResult): boolean {
    const rawData = result.rawExternalData;
    const rawSource = rawData && typeof rawData === 'object' && 'source' in rawData
        ? (rawData as { source?: unknown }).source
        : undefined;

    return result.providerId?.startsWith('manual:') || rawSource === 'manual';
}

function stripLeadingVenueName(label: string, venueName?: string | null): string {
    const normalizedVenue = venueName?.trim();
    if (!normalizedVenue) return label;

    // Provider/manual formatted addresses can repeat the venue name first
    const escapedVenue = normalizedVenue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return label.replace(new RegExp(`^${escapedVenue}\\s*,\\s*`, 'i'), '');
}

function sameCoordinates(left: Coordinates | undefined, right: Coordinates): boolean {
    if (!left) return false;
    return left.lat.toFixed(6) === right.lat.toFixed(6) && left.lng.toFixed(6) === right.lng.toFixed(6);
}

export function VenueLocationSearch({
    venueName,
    location,
    pendingCoordinates,
    onManualPin,
    onConsumePendingCoordinates,
    onChange,
}: VenueLocationSearchProps) {
    const { t } = useTranslation();
    const { locationLanguage } = useLocationLanguage();
    const inputId = useId();
    const listboxId = `${inputId}-results`;
    const searchHintId = `${inputId}-hint`;
    const [query, setQuery] = useState(venueName || (location ? formatLocationLocalized(location, locationLanguage) : ''));
    const [results, setResults] = useState<TourLocationSearchResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [venueCreationOn, setVenueCreationOn] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 });
    const [error, setError] = useState<string | null>(null);
    const [isCreatingVenue, setIsCreatingVenue] = useState(false);
    const [isResolvingCreationLocation, setIsResolvingCreationLocation] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const controlsRef = useRef<HTMLDivElement>(null);
    const skipNextSyncRef = useRef(false);
    const skipNextCreationCoordSearchRef = useRef(false);
    const [venueNameInput, setVenueNameInput] = useState(venueName || '');
    const [coordInput, setCoordInput] = useState('');
    const [createdVenue, setCreatedVenue] = useState<TourLocationSearchResult | null>(null);
    const [isEditingCreatedVenue, setIsEditingCreatedVenue] = useState(false);
    const safeActiveIndex = results.length === 0 ? 0 : Math.min(activeIndex, results.length - 1);
    const activeOptionId = isOpen && results[safeActiveIndex] ? `${listboxId}-${safeActiveIndex}` : undefined;

    // Venue draft location stays local until the manual venue is created
    const [creationLocation, setCreationLocation] = useState<Location | null>(null);

    useEffect(() => {
        if (skipNextSyncRef.current) {
            skipNextSyncRef.current = false;
            return;
        }
        setQuery(venueName || (location ? formatLocationLocalized(location, locationLanguage) : ''));
    }, [location, locationLanguage, venueName]);

    useEffect(() => {
        setVenueNameInput(venueName || '');
    }, [venueName]);

    useEffect(() => {
        return () => abortRef.current?.abort();
    }, []);

    useEffect(() => {
        if (!pendingCoordinates) return;

        const controller = new AbortController();
        abortRef.current?.abort();
        abortRef.current = controller;
        setIsLoading(!venueCreationOn);
        setIsResolvingCreationLocation(venueCreationOn);
        setError(null);
        if (venueCreationOn) {
            if (!isEditingCreatedVenue) setCreatedVenue(null);
            skipNextCreationCoordSearchRef.current = true;
            setCoordInput(`${pendingCoordinates.lat.toFixed(6)}, ${pendingCoordinates.lng.toFixed(6)}`);
            setCreationLocation(null);
        }

        const applyManualLocation = async () => {
            try {
                if (venueCreationOn) {
                    await runCreationReverseSearch(pendingCoordinates, controller.signal);
                    return;
                }

                const result = await reverseTourLocation(
                    pendingCoordinates.lat,
                    pendingCoordinates.lng,
                    controller.signal
                );
                const nextLocation = resultToLocation(result, true);
                onChange({
                    venueName: null,
                    placeLocationId: result.placeLocationId ?? null,
                    location: nextLocation,
                    rawExternalData: null,
                });
                setQuery(formatLocationLocalized(nextLocation, locationLanguage));
            } catch {
                if (venueCreationOn) {
                    setError(t('tour.venueSearch.failedReverseLocation', {
                        defaultValue: 'Could not resolve the administrative location for these coordinates.',
                    }));
                    return;
                }
                const label = t('tour.venueSearch.manualLocation', { defaultValue: 'Manual location' });
                const nextLocation = manualCoordinatesToLocation(pendingCoordinates, label);
                onChange({
                    venueName: null,
                    placeLocationId: null,
                    location: nextLocation,
                    rawExternalData: null,
                });
                setQuery(formatLocationLocalized(nextLocation, locationLanguage));
            } finally {
                if (abortRef.current === controller) {
                    abortRef.current = null;
                }
                setIsLoading(false);
                setIsResolvingCreationLocation(false);
                onConsumePendingCoordinates?.();
            }
        };

        void applyManualLocation();
    }, [isEditingCreatedVenue, locationLanguage, onChange, onConsumePendingCoordinates, pendingCoordinates, t, venueCreationOn]);

    // Coordinate edits resolve into the administrative address preview
    useEffect(() => {
        if (!venueCreationOn || !coordInput.trim()) return;
        if (skipNextCreationCoordSearchRef.current) {
            skipNextCreationCoordSearchRef.current = false;
            return;
        }

        const coordinates = parseCoordInput(coordInput);
        if (!coordinates) {
            setCreationLocation(null);
            return;
        }
        if (sameCoordinates(creationLocation?.coordinates, coordinates)) return;

        const controller = new AbortController();
        abortRef.current?.abort();
        abortRef.current = controller;
        setIsResolvingCreationLocation(true);
        setError(null);

        const reverseCreationLocation = async () => {
            try { await runCreationReverseSearch(coordinates, controller.signal); } finally {
                if (abortRef.current === controller) {
                    abortRef.current = null;
                }
                setIsResolvingCreationLocation(false);
            }
        };

        const timeout = window.setTimeout(() => { void reverseCreationLocation(); }, 450);
        return () => {
            window.clearTimeout(timeout);
            controller.abort();
        };
    }, [coordInput, t, venueCreationOn]);

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

    // Scrolling the form dismisses the open dropdown.
    useEffect(() => {
        if (!isOpen) return;
        const handleScroll = (event: Event) => {
            const target = event.target as Node | null;
            if (target && document.querySelector('.tour-location-search-dropdown')?.contains(target)) return;
            setIsOpen(false);
        };
        window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
        return () => window.removeEventListener('scroll', handleScroll, { capture: true } as EventListenerOptions);
    }, [isOpen]);

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

    const runSearch = async (source: 'auto' | 'geoapify' = 'auto') => {
        const searchQuery = query.trim();
        if (searchQuery.length < 2) return;

        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setIsLoading(source !== 'geoapify');
        setIsLoadingMore(source === 'geoapify');
        setError(null);

        try {
            const response = await searchTourLocations(searchQuery, {
                limit: 10,
                lang: getGeoapifyLanguage(locationLanguage),
                nativeName: locationLanguage === 'native',
                source,
            }, controller.signal);
            setResults(response.results);
            setHasMore(response.hasMore);
            setActiveIndex(0);
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
            setIsLoadingMore(false);
        }
    };

    const openResults = () => {
        if (results.length > 0) {
            setActiveIndex(0);
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
        setHasMore(false);
        setIsOpen(false);
    };

    const clearCreatedVenue = () => {
        setCreatedVenue(null);
        setIsEditingCreatedVenue(false);
        setVenueNameInput('');
        setCoordInput('');
        setCreationLocation(null);
    };

    const deleteCreatedVenueSelection = () => {
        clearCreatedVenue();
        onChange({ venueName: null, placeLocationId: null, location: null, rawExternalData: null });
    };

    const searchResultToLocation = (result: SearchResult, coordinates: Coordinates): Location => ({
        city: result.name,
        province: result.province || result.name,
        country: result.country,
        displayName: result.displayName,
        coordinates,
        type: result.type,
        cityId: result.id,
        source: 'local',
        isManualSelection: true,
    });

    const pickCreationLocationResult = (results: SearchResult[]): SearchResult | null => {
        const cityLevelTypes = new Set(['city', 'town', 'village', 'municipality']);
        const higherAdminTypes = new Set(['county', 'state', 'province', 'region', 'country', 'administrative']);

        // City-level administrative identity is the venue address target
        return results.find((result) => result.type && cityLevelTypes.has(result.type)) ||
            results.find((result) => result.type && higherAdminTypes.has(result.type)) ||
            results[0] ||
            null;
    };

    const runCreationReverseSearch = async (coordinates: Coordinates, signal?: AbortSignal) => {
        const response = await reverseSearchCities(coordinates.lat, coordinates.lng, 10, 'auto', signal);
        const result = pickCreationLocationResult(response.results);
        if (!result) {
            setCreationLocation(null);
            setError(t('tour.venueSearch.failedReverseLocation', {
                defaultValue: 'Could not resolve the administrative location for these coordinates.',
            }));
            return;
        }

        setError(null);
        setCreationLocation(searchResultToLocation(result, coordinates));
    };

    const runCreationLocationSearch = async () => {
        const coordinates = parseCoordInput(coordinateDisplayValue);
        if (!coordinates || isResolvingCreationLocation) return;

        const controller = new AbortController();
        abortRef.current?.abort();
        abortRef.current = controller;
        setIsResolvingCreationLocation(true);
        setError(null);

        try {
            await runCreationReverseSearch(coordinates, controller.signal);
        } catch {
            setCreationLocation(null);
            setError(t('tour.venueSearch.failedReverseLocation', {
                defaultValue: 'Could not resolve the administrative location for these coordinates.',
            }));
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
            }
            setIsResolvingCreationLocation(false);
        }
    };

    const handleCreateManualVenue = async () => {
        const name = venueNameInput.trim();
        const coordinates = parseCoordInput(coordinateDisplayValue);

        if (!name || !coordinates) return;

        const controller = new AbortController();
        abortRef.current?.abort();
        abortRef.current = controller;
        setIsCreatingVenue(true);
        setError(null);

        const adminLocation = creationLocation;

        if (!adminLocation) {
            setError(t('tour.venueSearch.failedReverseLocation', {
                defaultValue: 'Could not resolve the administrative location for these coordinates.',
            }));
            if (abortRef.current === controller) {
                abortRef.current = null;
            }
            setIsCreatingVenue(false);
            return;
        }

        try {
            const payload = {
                name,
                coordinates,
                displayName: adminLocation.displayName,
                city: adminLocation.city,
                province: adminLocation.province,
                country: adminLocation.country,
                cityId: adminLocation.cityId,
            };
            const result = isEditingCreatedVenue && createdVenue?.placeLocationId
                ? await updateManualVenue(createdVenue.placeLocationId, payload, controller.signal)
                : await createManualVenue(payload, controller.signal);
            selectResult(result);
            setCreatedVenue(result);
            setIsEditingCreatedVenue(false);
            setVenueCreationOn(true);
        } catch (createError) {
            const duplicateMessage = axios.isAxiosError<{ message?: string }>(createError) && createError.response?.status === 409
                ? createError.response.data?.message
                : null;
            setError(duplicateMessage || t('tour.venueSearch.failedCreateVenue', {
                defaultValue: 'Failed to create venue. Please try again.',
            }));
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
            }
            setIsCreatingVenue(false);
        }
    };

    const clearSelectedLocationForEdit = (nextQuery: string) => {
        if (!location && !venueName) return;

        // Typed text must be confirmed by selecting a matching result
        skipNextSyncRef.current = true;
        onChange({
            venueName: null,
            placeLocationId: null,
            location: null,
            rawExternalData: null,
        });
        setQuery(nextQuery);
        setHasMore(false);
    };

    const renderResults = () => {
        if (!isOpen) return null;

        return (
            <div
                id={listboxId}
                role="listbox"
                aria-label={t('tour.venueSearch.resultsLabel', { defaultValue: 'Venue and location results' })}
                className="tour-location-search-dropdown fixed z-[9999] overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-lg app-dark:shadow-[0_16px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)]"
                style={{
                    top: `${dropdownPosition.top}px`,
                    left: `${dropdownPosition.left}px`,
                    width: `${dropdownPosition.width}px`,
                    maxHeight: `${dropdownPosition.maxHeight}px`,
                }}
            >
                {results.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-text-secondary">
                        {t('artistForm.locationSearch.noResults', { defaultValue: 'No results found' })}
                    </div>
                ) : results.map((result, index) => {
                    const key = `${result.providerId || result.name}-${index}`;
                    const primaryLabel = result.isVenue ? result.venueName || result.name : result.name;
                    const userCreatedVenue = isUserCreatedVenue(result);

                    return (
                        <button
                            key={key}
                            id={`${listboxId}-${index}`}
                            type="button"
                            role="option"
                            aria-selected={false}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => selectResult(result)}
                            className={`w-full border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-surface-muted ${index === safeActiveIndex ? 'bg-surface-muted' : ''}`}
                        >
                            <span className="flex items-center gap-2 font-medium text-text">
                                <span>{primaryLabel}</span>
                                {result.isVenue && (
                                    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
                                        {t('tour.fields.venue')}
                                    </span>
                                )}
                                {userCreatedVenue && (
                                    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
                                        {t('tour.venueSearch.createdByUser', { defaultValue: 'Created by user' })}
                                    </span>
                                )}
                            </span>
                            <span className="mt-0.5 flex items-center justify-between gap-2 text-xs text-text-secondary">
                                <span>{getVenueAddressLabel(result)}</span>
                                {(result.source === 'local' || result.isCached) && (
                                    <span className="shrink-0 rounded bg-success/10 px-1.5 py-0.5 text-success">DB</span>
                                )}
                            </span>
                        </button>
                    );
                })}
                {hasMore && (
                    <Button
                        type="button"
                        disabled={isLoadingMore}
                        variant="ghost"
                        onClick={() => { void runSearch('geoapify'); }}
                        className="flex w-full items-center justify-center gap-2 rounded-none border-t border-border"
                    >
                        {isLoadingMore && <Spinner size="sm" />}
                        <span>{isLoadingMore ? t('artistForm.locationSearch.searching') : t('artistForm.locationSearch.searchMore')}</span>
                    </Button>
                )}
            </div>
        );
    };

    const inputClass = 'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 pr-9 text-sm text-text placeholder:text-text-muted transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary';

    const parseCoordInput = (input: string): { lat: number; lng: number } | null => {
        const parts = input.split(',').map((s) => parseFloat(s.trim()));
        if (parts.length !== 2 || parts.some((n) => isNaN(n))) return null;
        const [lat, lng] = parts;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
        return { lat, lng };
    };

    const coordinateDisplayValue = coordInput || (!venueCreationOn && location?.coordinates
        ? `${location.coordinates.lat.toFixed(6)}, ${location.coordinates.lng.toFixed(6)}`
        : '');
    const hasValidCoords = parseCoordInput(coordinateDisplayValue) !== null;
    const canCreateVenue = venueCreationOn && venueNameInput.trim() && hasValidCoords && !!creationLocation && !isResolvingCreationLocation;
    const creationLocationLabel = creationLocation ? formatLocationLocalized(creationLocation, locationLanguage) : null;
    const createdVenueName = createdVenue?.venueName || createdVenue?.name || '';
    const createdVenueAddress = createdVenue
        ? stripLeadingVenueName(createdVenue.displayName || getResultLabel(createdVenue), createdVenueName)
        : '';

    const handleVenueCreationEnter = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;

        // Venue creation owns Enter while nested inside the gig form
        event.preventDefault();
        event.stopPropagation();

        if (!canCreateVenue || isCreatingVenue) return;
        void handleCreateManualVenue();
    };

    const openVenueCreation = () => {
        setVenueCreationOn(true);

        // Cached manual venues must be re-applied after search edits clear the parent location
        if (createdVenue && !isEditingCreatedVenue) {
            selectResult(createdVenue);
        }
    };

    const handleSearchInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            setIsOpen(false);
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (results.length === 0) return;
            setIsOpen(true);
            setActiveIndex((current) => {
                const nextIndex = event.key === 'ArrowDown' ? current + 1 : current - 1;
                return (nextIndex + results.length) % results.length;
            });
            return;
        }

        if (event.key === 'Enter') {
            event.preventDefault();
            if (isOpen && results[safeActiveIndex]) {
                selectResult(results[safeActiveIndex]);
                return;
            }
            void runSearch();
        }
    };

    const segmentClass = (active: boolean) =>
        `relative z-10 rounded-full px-3 py-2 text-center text-xs font-medium transition-colors duration-150 ${
            active ? 'text-white' : 'text-text-secondary hover:text-text'
        }`;

    return (
        <div className="relative" ref={rootRef}>
            <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {t('tour.fields.venueLocation')}
            </label>

            <div className="rounded-lg border border-border p-3">
                <div role="tablist" aria-label={t('tour.fields.venueLocation')} className="relative inline-grid grid-cols-2 rounded-full transition-colors duration-150 hover:bg-surface-muted">
                    <span
                        aria-hidden="true"
                        className={`absolute inset-y-0 z-0 w-1/2 rounded-full bg-primary-contrast shadow-sm transition-transform duration-200 ease-out ${venueCreationOn ? 'translate-x-full' : 'translate-x-0'}`}
                    />
                    <button
                        type="button"
                        role="tab"
                        aria-selected={!venueCreationOn}
                        onClick={() => setVenueCreationOn(false)}
                        className={segmentClass(!venueCreationOn)}
                    >
                        {t('tour.venueSearch.searchLocationTab', { defaultValue: 'Search location' })}
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={venueCreationOn}
                        onClick={openVenueCreation}
                        className={segmentClass(venueCreationOn)}
                    >
                        {t('tour.venueSearch.createVenueName', { defaultValue: 'Create venue' })}
                    </button>
                </div>

                {!venueCreationOn ? (
                    <>
                        <div className="relative mt-3" ref={controlsRef}>
                            <input
                                id={inputId}
                                role="combobox"
                                aria-autocomplete="list"
                                aria-activedescendant={activeOptionId}
                                aria-busy={isLoading || isLoadingMore}
                                aria-controls={isOpen ? listboxId : undefined}
                                aria-describedby={searchHintId}
                                aria-expanded={isOpen}
                                aria-haspopup="listbox"
                                type="text"
                                autoComplete="off"
                                value={query}
                                onChange={(event) => {
                                    const nextQuery = event.target.value;
                                    setQuery(nextQuery);
                                    clearSelectedLocationForEdit(nextQuery);
                                }}
                                onFocus={openResults}
                                onKeyDown={handleSearchInputKeyDown}
                                placeholder={t('tour.form.locationPlaceholder')}
                                className={inputClass}
                            />
                            <button
                                type="button"
                                aria-label={t('tour.venueSearch.searchLocation', { defaultValue: 'Search location' })}
                                disabled={query.trim().length < 2 || isLoading || isLoadingMore}
                                onClick={() => { void runSearch(); }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-secondary hover:bg-primary hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
                            >
                                {isLoading ? <Spinner size="sm" /> : <SearchIcon className="h-4 w-4" />}
                            </button>
                        </div>
                        <p id={searchHintId} className="mx-1 mt-1 text-xs text-text-secondary">
                            {t('tour.form.locationSearchHint')}
                        </p>
                    </>
                ) : createdVenue && !isEditingCreatedVenue ? (
                    <div className="mt-3">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                                <p className="break-words text-sm font-semibold leading-5 text-text">
                                    {createdVenueName}
                                </p>
                                <p className="break-words text-xs leading-5 text-text-secondary">
                                    {createdVenueAddress}
                                </p>
                            </div>
                            <InlineActionMenu
                                alwaysVisible
                                className="shrink-0"
                                actions={[
                                    {
                                        key: 'edit',
                                        label: t('common.edit', { defaultValue: 'Edit' }),
                                        title: t('common.edit', { defaultValue: 'Edit' }),
                                        onClick: () => setIsEditingCreatedVenue(true),
                                    },
                                    {
                                        key: 'delete',
                                        label: t('common.delete', { defaultValue: 'Delete' }),
                                        title: t('common.delete', { defaultValue: 'Delete' }),
                                        onClick: deleteCreatedVenueSelection,
                                    },
                                ]}
                            />
                        </div>
                        <Alert
                            variant="success"
                            header={t('tour.venueSearch.venueCreated', { defaultValue: 'Venue created and applied' })}
                            className="mt-2"
                        >
                            <></>
                        </Alert>
                    </div>
                ) : (
                    <div className="mt-3 flex flex-col gap-3">
                        <div>
                            <label htmlFor={`${inputId}-manual-venue`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                                {t('tour.venueSearch.venueNamePlaceholder', { defaultValue: 'Venue name' })}
                            </label>
                            <input
                                id={`${inputId}-manual-venue`}
                                type="text"
                                autoComplete="off"
                                value={venueNameInput}
                                maxLength={255}
                                onChange={(event) => setVenueNameInput(event.target.value)}
                                onKeyDown={handleVenueCreationEnter}
                                placeholder={t('tour.venueSearch.venueNamePlaceholder', { defaultValue: 'Venue name' })}
                                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
                            />
                        </div>
                        <div>
                            <label htmlFor={`${inputId}-manual-coordinates`} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                                {t('tour.fields.location', { defaultValue: 'Location' })}
                            </label>
                            <div className="flex gap-2">
                                <div className="relative min-w-0 flex-1">
                                    <input
                                        id={`${inputId}-manual-coordinates`}
                                        type="text"
                                        inputMode="decimal"
                                        autoComplete="off"
                                        value={coordinateDisplayValue}
                                        onChange={(event) => {
                                            const nextValue = event.target.value;
                                            if (/^[\d\s,.-]*$/.test(nextValue)) {
                                                if (!isEditingCreatedVenue) setCreatedVenue(null);
                                                setCoordInput(nextValue);
                                                setCreationLocation(null);
                                            }
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                if (canCreateVenue && !isCreatingVenue) {
                                                    void handleCreateManualVenue();
                                                    return;
                                                }
                                                void runCreationLocationSearch();
                                            }
                                        }}
                                        placeholder={t('tour.venueSearch.coordsPlaceholder', { defaultValue: 'Lat, Lng' })}
                                        className={inputClass}
                                    />
                                    <button
                                        type="button"
                                        aria-label={t('tour.venueSearch.searchLocation', { defaultValue: 'Search location' })}
                                        disabled={!hasValidCoords || isResolvingCreationLocation}
                                        onClick={() => { void runCreationLocationSearch(); }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-secondary hover:bg-primary hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
                                    >
                                        {isResolvingCreationLocation ? <Spinner size="sm" /> : <SearchIcon className="h-4 w-4" />}
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    aria-label={t('artistForm.locationSearch.manualSelect')}
                                    title={t('artistForm.locationSearch.manualSelect')}
                                    onClick={onManualPin}
                                    className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded text-text-muted transition-colors hover:bg-primary hover:text-white"
                                >
                                    <MapPinIcon className="h-5 w-5" />
                                </button>
                                <Button
                                    type="button"
                                    disabled={!canCreateVenue || isCreatingVenue}
                                    isLoading={isCreatingVenue}
                                    onClick={() => { void handleCreateManualVenue(); }}
                                    className="shrink-0 rounded-lg"
                                >
                                    {isEditingCreatedVenue
                                        ? t('common.save', { defaultValue: 'Save' })
                                        : t('common.create', { defaultValue: 'Create' })}
                                </Button>
                            </div>
                            {creationLocationLabel && (
                                <p className="mx-1 mt-1 text-xs text-text-secondary">
                                    {creationLocationLabel}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </div>
            {error && (
                <Alert variant="error" header={t('artistForm.locationSearch.failedHeader')} className="mt-2">
                    {error}
                </Alert>
            )}

            {isOpen && createPortal(renderResults(), document.body)}
        </div>
    );
}

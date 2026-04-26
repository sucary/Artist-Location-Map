import { useReducer, useRef, useEffect, useCallback, useMemo } from 'react';
import { reverseSearchCities, type SearchResult } from '../services/api';
import { LocationSearchService } from '../services/LocationSearchService';
import { locationSearchReducer, initialState } from './locationSearchReducer';
import { useLocationLanguage } from '../context/LocationLanguageContext';
import { useTranslation } from 'react-i18next';

interface UseLocationSearchProps {
    displayValue?: string;
    onChange: (result: SearchResult) => void;
    pendingCoordinates?: { lat: number; lng: number } | null;
    onCoordinatesConsumed?: () => void;
    pendingSearch?: { query: string; key: number } | null;
}

export function useLocationSearch({
    displayValue = '',
    onChange,
    pendingCoordinates,
    onCoordinatesConsumed,
    pendingSearch,
}: UseLocationSearchProps) {
    const [state, dispatch] = useReducer(locationSearchReducer, initialState);
    const { locationLanguage } = useLocationLanguage();
    const { t } = useTranslation();
    const { clickedCoords, query, retryFn } = state;

    // Create service with callbacks that dispatch to reducer
    const service = useMemo(() => new LocationSearchService({
        onStart: (isMore) => dispatch({ type: 'SEARCH_START', isMore }),
        onSuccess: (response) => dispatch({
            type: 'SEARCH_SUCCESS',
            results: response.results,
            source: response.source,
            hasMore: response.hasMore,
        }),
        onError: (error) => dispatch({ type: 'SEARCH_ERROR', error }),
        onQueueUpdate: (queueSize) => dispatch({ type: 'UPDATE_QUEUE_SIZE', queueSize }),
        onRateLimited: (retryFn) => dispatch({ type: 'RATE_LIMITED', retryFn }),
    }), []);

    // Sync language preference to service
    useEffect(() => {
        service.setLang(locationLanguage);
    }, [service, locationLanguage]);

    useEffect(() => {
        service.setMessages({
            searchTimedOut: t('artistForm.locationSearch.errors.searchTimedOut'),
            failedSearch: t('artistForm.locationSearch.errors.failedSearch'),
            failedMore: t('artistForm.locationSearch.errors.failedMore'),
        });
    }, [service, t]);

    // Cleanup service on unmount
    useEffect(() => {
        return () => service.destroy();
    }, [service]);

    // Public handlers
    const handleCancel = useCallback(() => {
        service.cancel();
        dispatch({ type: 'SEARCH_CANCEL' });
    }, [service]);

    const handleSelect = useCallback((result: SearchResult) => {
        const finalResult = clickedCoords
            ? { ...result, center: clickedCoords }
            : result;
        onChange(finalResult);
        dispatch({ type: 'RESET_QUERY' });
    }, [clickedCoords, onChange]);

    const handleSearch = useCallback(() => {
        const searchQuery = query ?? '';
        if (searchQuery.trim().length >= 2) {
            service.search(searchQuery.trim());
        }
    }, [service, query]);

    const handleSearchMore = useCallback(() => {
        if (clickedCoords) {
            service.reverseSearch(clickedCoords.lat, clickedCoords.lng, 'nominatim');
        } else {
            const searchQuery = query ?? '';
            if (searchQuery.trim().length >= 2) {
                service.search(searchQuery.trim(), 'nominatim');
            }
        }
    }, [service, clickedCoords, query]);

    const handleRetry = useCallback(() => {
        if (retryFn) {
            retryFn();
        }
    }, [retryFn]);

    const setQuery = useCallback((query: string | null) => {
        dispatch({ type: 'SET_QUERY', query });
        if (query !== null && query.trim().length < 2) {
            dispatch({ type: 'CLOSE_DROPDOWN' });
        }
    }, []);

    const openDropdown = useCallback(() => dispatch({ type: 'OPEN_DROPDOWN' }), []);
    const closeDropdown = useCallback(() => dispatch({ type: 'CLOSE_DROPDOWN' }), []);

    // Effect: handle pending coordinates from manual map pin
    useEffect(() => {
        if (!pendingCoordinates) return;

        dispatch({ type: 'SET_CLICKED_COORDS', coords: pendingCoordinates });

        const handleReverseSearch = async () => {
            if (service.searching) {
                service.reverseSearch(pendingCoordinates.lat, pendingCoordinates.lng, 'auto');
                onCoordinatesConsumed?.();
                return;
            }

            dispatch({ type: 'SEARCH_START', isMore: false });

            try {
                const response = await reverseSearchCities(
                    pendingCoordinates.lat,
                    pendingCoordinates.lng,
                    10,
                    'auto'
                );

                if (response.results.length === 1) {
                    const result = response.results[0];
                    onChange({ ...result, center: pendingCoordinates });
                    dispatch({ type: 'RESET_QUERY' });
                } else {
                    dispatch({
                        type: 'SEARCH_SUCCESS',
                        results: response.results,
                        source: response.source,
                        hasMore: response.hasMore,
                    });
                    dispatch({ type: 'SET_QUERY', query: null });
                }
            } catch (err) {
                dispatch({ type: 'SEARCH_ERROR', error: t('artistForm.locationSearch.errors.noLocationsAtPoint') });
                console.error('Reverse search failed:', err);
            } finally {
                onCoordinatesConsumed?.();
            }
        };

        handleReverseSearch();
    }, [pendingCoordinates, onCoordinatesConsumed, onChange, service, t]);

    useEffect(() => {
        const query = pendingSearch?.query.trim();
        if (!query || query.length < 2) return;

        dispatch({ type: 'SET_QUERY', query });
        void service.search(query, 'auto');
    }, [pendingSearch?.key, pendingSearch?.query, service]);

    // Effect: reset query when displayValue changes externally
    const prevDisplayValue = useRef(displayValue);
    useEffect(() => {
        if (prevDisplayValue.current !== displayValue) {
            prevDisplayValue.current = displayValue;
            dispatch({ type: 'RESET_QUERY' });
        }
    }, [displayValue]);

    return {
        query: state.query,
        results: state.results,
        isOpen: state.isOpen,
        isLoading: state.isLoading,
        isLoadingMore: state.isLoadingMore,
        error: state.error,
        hasMore: state.hasMore,
        queueSize: state.queueSize,
        retryFn: state.retryFn,

        setQuery,
        handleSearch,
        handleSelect,
        handleSearchMore,
        handleCancel,
        handleRetry,
        openDropdown,
        closeDropdown,
    };
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { mainSearch } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLocationLanguage } from '../../context/LocationLanguageContext';
import type { MainSearchResponse, LocationSearchResult, UserSearchResult } from '../../types/search';

interface UseMainSearchOptions {
    onAutoFocusLocation?: (result: LocationSearchResult) => void;
}

export function useMainSearch(options: UseMainSearchOptions = {}) {
    const { onAutoFocusLocation } = options;
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const { profile } = useAuth();
    const { locationLanguage } = useLocationLanguage();

    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [searchMoreQueueSize, setSearchMoreQueueSize] = useState(0);
    const autoFocusTriggered = useRef(false);
    const pendingSearchMore = useRef<string | null>(null);
    const processingSearchMore = useRef(false);

    useEffect(() => {
        autoFocusTriggered.current = false;
        const timer = setTimeout(() => {
            setDebouncedQuery(query);
        }, 500);

        return () => clearTimeout(timer);
    }, [query]);

    // Clear pending Search More when query changes
    useEffect(() => {
        if (pendingSearchMore.current) {
            console.log('[MainSearch] New search detected, clearing pending Search More');
            pendingSearchMore.current = null;
            setSearchMoreQueueSize(0);
        }
    }, [debouncedQuery]);

    // Open dropdown when query is entered
    useEffect(() => {
        if (query.length >= 2) {
            setIsOpen(true);
        }
    }, [query]);

    const { data: results, isLoading, isFetching } = useQuery<MainSearchResponse>({
        queryKey: ['mainSearch', debouncedQuery, profile?.username, locationLanguage],
        queryFn: () => mainSearch(debouncedQuery, 10, 'auto', profile?.username ?? undefined, undefined, locationLanguage),
        enabled: debouncedQuery.length >= 2,
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 30, // 30 minutes
    });

    // Auto-focus when single location result and no profile results
    useEffect(() => {
        if (!results || autoFocusTriggered.current) return;

        if (results.locations.length === 1 && results.users.length === 0) {
            autoFocusTriggered.current = true;
            onAutoFocusLocation?.(results.locations[0]);
            setIsOpen(false);
        }
    }, [results, onAutoFocusLocation]);

    const handleClose = useCallback(() => {
        setIsOpen(false);
    }, []);

    const handleClear = useCallback(() => {
        setQuery('');
        setDebouncedQuery('');
        setIsOpen(false);
    }, []);

    const handleSelectLocation = useCallback((result: LocationSearchResult) => {
        onAutoFocusLocation?.(result);
        setIsOpen(false);
    }, [onAutoFocusLocation]);

    const handleSelectUser = useCallback((result: UserSearchResult) => {
        navigate(`/u/${result.username}`);
        setIsOpen(false);
        setQuery('');
    }, [navigate]);

    const processSearchMoreQueue = useCallback(async (hasResults: boolean = false) => {
        // If we got results, clear the pending search - user already found what they need
        if (hasResults && pendingSearchMore.current) {
            pendingSearchMore.current = null;
            processingSearchMore.current = false;
            setIsLoadingMore(false);
            setSearchMoreQueueSize(0);
            console.log(`[MainSearch] Results found - cleared pending Search More request`);
            return;
        }

        if (processingSearchMore.current) return;

        const nextQuery = pendingSearchMore.current;
        pendingSearchMore.current = null;
        setSearchMoreQueueSize(0);

        if (!nextQuery) {
            processingSearchMore.current = false;
            setIsLoadingMore(false);
            console.log('[MainSearch] Search More queue empty');
            return;
        }

        processingSearchMore.current = true;
        setIsLoadingMore(true);

        console.log('[MainSearch] Processing Search More:', nextQuery);

        try {
            const moreResults = await mainSearch(nextQuery, 10, 'nominatim', profile?.username ?? undefined, undefined, locationLanguage);
            // Update the cache with the new results
            queryClient.setQueryData(['mainSearch', nextQuery, profile?.username, locationLanguage], moreResults);

            processingSearchMore.current = false;

            // Clear queue if we got more location results
            const hasLocationResults = moreResults.locations && moreResults.locations.length > 0;
            await processSearchMoreQueue(hasLocationResults);
        } catch (error) {
            console.error('Failed to load more results:', error);
            processingSearchMore.current = false;

            // Continue queue without clearing on error
            await processSearchMoreQueue(false);
        }
    }, [queryClient, profile?.username]);

    const handleSearchMore = useCallback(async () => {
        if (!debouncedQuery) return;

        if (processingSearchMore.current) {
            // Queue the request (overwrites any previous pending)
            pendingSearchMore.current = debouncedQuery;
            setSearchMoreQueueSize(1);
            console.log('[MainSearch] Already loading more, queuing Search More:', debouncedQuery);
            return;
        }

        // Start processing immediately
        pendingSearchMore.current = debouncedQuery;
        setSearchMoreQueueSize(1);
        await processSearchMoreQueue(false);
    }, [debouncedQuery, processSearchMoreQueue]);

    return {
        query,
        setQuery,
        results,
        isLoading: isLoading || isFetching,
        isLoadingMore,
        searchMoreQueueSize,
        hasMoreLocations: results?.hasMoreLocations ?? false,
        isOpen,
        setIsOpen,
        handleClose,
        handleClear,
        handleSelectLocation,
        handleSelectUser,
        handleSearchMore,
    };
}

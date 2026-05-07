import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { mainSearch } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import type { Artist } from '../../types/artist';
import type { MainSearchResponse, ArtistSearchResult, UserSearchResult } from '../../types/search';

interface UseMainSearchOptions {
    mapUsername?: string;
    onSelectArtist?: (artist: Artist) => void;
}

export function useMainSearch(options: UseMainSearchOptions = {}) {
    const { mapUsername, onSelectArtist } = options;
    const navigate = useNavigate();
    const { profile } = useAuth();
    const username = profile?.username;

    const [query, setQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(query);
        }, 500);

        return () => clearTimeout(timer);
    }, [query]);

    // Open dropdown when query is entered
    useEffect(() => {
        if (query.length >= 2) {
            const frameId = window.requestAnimationFrame(() => setIsOpen(true));
            return () => window.cancelAnimationFrame(frameId);
        }
    }, [query]);

    const { data: results, isLoading, isFetching } = useQuery<MainSearchResponse>({
        queryKey: ['mainSearch', debouncedQuery, username, mapUsername],
        queryFn: () => mainSearch(debouncedQuery, 10, username ?? undefined, undefined, mapUsername),
        enabled: debouncedQuery.length >= 2,
        staleTime: 1000 * 60 * 5, // 5 minutes
        gcTime: 1000 * 60 * 30, // 30 minutes
    });

    const handleClose = useCallback(() => {
        setIsOpen(false);
    }, []);

    const handleClear = useCallback(() => {
        setQuery('');
        setDebouncedQuery('');
        setIsOpen(false);
    }, []);

    const handleSelectArtist = useCallback((result: ArtistSearchResult) => {
        onSelectArtist?.(result.artist);
        setIsOpen(false);
        setQuery('');
    }, [onSelectArtist]);

    const handleSelectUser = useCallback((result: UserSearchResult) => {
        navigate(`/u/${result.username}`);
        setIsOpen(false);
        setQuery('');
    }, [navigate]);

    return {
        query,
        setQuery,
        results,
        isLoading: isLoading || isFetching,
        isOpen,
        setIsOpen,
        handleClose,
        handleClear,
        handleSelectArtist,
        handleSelectUser,
    };
}

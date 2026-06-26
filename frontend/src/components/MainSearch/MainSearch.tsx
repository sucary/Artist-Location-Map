import { useCallback, useMemo, useRef, useEffect, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useMainSearch } from './useMainSearch';
import { SearchResultRow } from './SearchResultRow';
import { SearchIcon, CloseIcon } from '../icons/GeneralIcons';
import { IconButton, Spinner } from '../ui';
import type { Artist } from '../../types/artist';
import type { SearchResult } from '../../types/search';
import { useTranslation } from 'react-i18next';

// Global artist and user search box with keyboard navigation

interface MainSearchProps {
    mapUsername?: string;
    onSelectArtist?: (artist: Artist) => void;
    closeSignal?: number;
    onResultsOpenChange?: (open: boolean) => void;
}

export function MainSearch({ mapUsername, onSelectArtist, closeSignal = 0, onResultsOpenChange }: MainSearchProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [activeIndex, setActiveIndex] = useState(-1);
    // Below `sm` (mobile) the search is a single button that expands into a
    // full-row field on tap; the desktop field is unchanged.
    const [compact, setCompact] = useState(() => (
        typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
    ));
    const [expanded, setExpanded] = useState(false);
    const { t } = useTranslation();

    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 639px)');
        const syncCompact = () => {
            const isCompact = mediaQuery.matches;
            setCompact(isCompact);
            // Leaving compact renders the field inline, so drop the expanded flag.
            if (!isCompact) setExpanded(false);
        };
        syncCompact();
        mediaQuery.addEventListener('change', syncCompact);
        return () => mediaQuery.removeEventListener('change', syncCompact);
    }, []);

    // Always show the full field on wider screens; on compact only once expanded.
    const showField = !compact || expanded;

    const {
        query,
        setQuery,
        results,
        isLoading,
        isOpen,
        setIsOpen,
        handleClear,
        handleSelectArtist,
        handleSelectUser,
    } = useMainSearch({
        mapUsername,
        onSelectArtist,
    });

    const openSearch = useCallback(() => {
        setExpanded(true);
    }, []);

    const collapseSearch = useCallback(() => {
        setExpanded(false);
        setIsOpen(false);
    }, [setIsOpen]);

    // Focus the field as soon as it expands.
    useEffect(() => {
        if (showField && expanded) {
            inputRef.current?.focus();
        }
    }, [expanded, showField]);

    // Close on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setExpanded(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [setIsOpen]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: globalThis.KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                setExpanded(true);
                inputRef.current?.focus();
            }
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
                setExpanded(false);
                inputRef.current?.blur();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, setIsOpen]);

    const hasResults = results && results.totalCount > 0;
    const showDropdown = isOpen && query.length >= 2;
    // Keep keyboard indexes aligned with the rendered option order
    const flatResults: SearchResult[] = useMemo(() => (
        results ? [...results.artists, ...results.users] : []
    ), [results]);

    const hasActiveResult = activeIndex >= 0 && activeIndex < flatResults.length;

    const selectResult = (result: SearchResult) => {
        setExpanded(false);
        if (result.type === 'artist') {
            handleSelectArtist(result);
            return;
        }

        handleSelectUser(result);
    };

    const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape' && showDropdown) {
            event.preventDefault();
            setIsOpen(false);
            setExpanded(false);
            return;
        }

        if (!showDropdown || flatResults.length === 0) return;

        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveIndex((current) => (current + 1) % flatResults.length);
            return;
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveIndex((current) => (current <= 0 ? flatResults.length - 1 : current - 1));
            return;
        }

        if (event.key === 'Enter' && hasActiveResult) {
            event.preventDefault();
            selectResult(flatResults[activeIndex]);
        }
    };

    useEffect(() => {
        onResultsOpenChange?.(showDropdown);
    }, [onResultsOpenChange, showDropdown]);

    useEffect(() => {
        // Keep mobile surfaces mutually exclusive from the parent signal
        if (closeSignal > 0) {
            setIsOpen(false);
            // Sync on an external close signal so the expanded field can't linger.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setExpanded(false);
        }
    }, [closeSignal, setIsOpen]);

    return (
        <div ref={containerRef} className={compact ? 'font-sans' : 'relative w-full font-sans'}>
            {!showField ? (
                /* Compact: collapsed search trigger */
                <button
                    type="button"
                    aria-label={t('mainSearch.search')}
                    aria-expanded={false}
                    onClick={openSearch}
                    className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-surface text-text shadow-md transition-colors hover:bg-primary hover:text-white hover:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                    <SearchIcon className="h-5 w-5" />
                </button>
            ) : (
                /* Expanded field — covers the whole top row on compact. */
                <div className={compact ? 'fixed top-2 inset-x-2 z-[1300]' : 'relative'}>
                    <div
                        className="relative"
                        onPointerDown={(event) => {
                            // Expand the focus target without stealing clear/search button clicks
                            if ((event.target as HTMLElement).closest('button')) return;
                            inputRef.current?.focus();
                        }}
                    >
                        {compact && (
                            <button
                                type="button"
                                aria-label={t('common.cancel')}
                                onClick={collapseSearch}
                                className="absolute left-0 top-0 z-10 flex h-12 w-10 items-center justify-center rounded-l-lg text-text-secondary hover:bg-primary hover:text-white transition-colors"
                            >
                                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M19 12H5" />
                                    <path d="M12 19l-7-7 7-7" />
                                </svg>
                            </button>
                        )}
                        <input
                            ref={inputRef}
                            role="combobox"
                            aria-label={t('mainSearch.placeholder')}
                            aria-expanded={showDropdown}
                            aria-controls="search-results"
                            aria-autocomplete="list"
                            aria-haspopup="listbox"
                            aria-busy={isLoading}
                            aria-activedescendant={hasActiveResult ? `main-search-option-${activeIndex}` : undefined}
                            type="text"
                            name="main-search"
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck={false}
                            placeholder={t('mainSearch.placeholder')}
                            value={query}
                            onChange={(e) => {
                                setQuery(e.target.value);
                                setActiveIndex(-1);
                            }}
                            onFocus={() => query.length >= 2 && setIsOpen(true)}
                            onKeyDown={handleInputKeyDown}
                            className={`h-12 w-full min-w-0 pr-13 text-base bg-surface border border-border rounded-lg shadow-md focus:outline-none focus:border-primary focus:ring-[1.5px] focus:ring-inset focus:ring-primary ${compact ? 'pl-11' : 'pl-3.5 sm:pl-5'}`}
                        />
                        {query && (
                            <IconButton
                                aria-label={t('mainSearch.clearSearch')}
                                onClick={handleClear}
                                size="sm"
                                className="absolute right-8 top-1/2 -translate-y-1/2 rounded hover:bg-surface-muted"
                            >
                                <CloseIcon className="w-4 h-4" />
                            </IconButton>
                        )}
                        <button
                            aria-label={t('mainSearch.search')}
                            type="button"
                            onClick={() => inputRef.current?.focus()}
                            className="absolute right-0 top-0 flex h-12 w-9 items-center justify-center rounded-r-lg text-text-secondary hover:bg-primary hover:text-white transition-colors"
                        >
                            <SearchIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Dropdown Results */}
            {showDropdown && (
                <div 
                    aria-live="polite"
                    id="search-results" 
                    role="listbox"
                    aria-label={t('mainSearch.results')}
                    className="fixed top-16 left-2 right-2 z-[1260] bg-surface border border-border rounded-md shadow-md overflow-hidden max-h-[calc(100vh-5rem)] overflow-y-auto sm:absolute sm:top-full sm:left-0 sm:right-auto sm:mt-1 sm:w-full sm:max-h-96"
                >
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Spinner className="text-primary" />
                        </div>
                    ) : !hasResults ? (
                        <div className="text-center py-8 text-text-secondary text-sm">
                            {t('mainSearch.noResults')}
                        </div>
                    ) : (
                        <>
                            {/* Artists */}
                            {results.artists.length > 0 && (
                                <div>
                                    <div role="group" aria-label={t('mainSearch.artists')} className="px-4 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wider bg-surface-muted">
                                        {t('mainSearch.artists')}
                                    </div>
                                    {results.artists.map((artistResult, index) => (
                                        <SearchResultRow
                                            key={artistResult.artist.id}
                                            result={artistResult}
                                            id={`main-search-option-${index}`}
                                            isActive={activeIndex === index}
                                            onActive={() => setActiveIndex(index)}
                                            onSelect={() => handleSelectArtist(artistResult)}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Users */}
                            {results.users.length > 0 && (
                                <div>
                                    <div role="group" aria-label={t('mainSearch.users')} className="px-4 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wider bg-surface-muted">
                                        {t('mainSearch.users')}
                                    </div>
                                    {results.users.map((user, index) => {
                                        const resultIndex = results.artists.length + index;
                                        return (
                                            <SearchResultRow
                                                key={user.id}
                                                result={user}
                                                id={`main-search-option-${resultIndex}`}
                                                isActive={activeIndex === resultIndex}
                                                onActive={() => setActiveIndex(resultIndex)}
                                                onSelect={() => handleSelectUser(user)}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

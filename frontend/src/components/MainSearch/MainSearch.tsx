import { useRef, useEffect } from 'react';
import { useMainSearch } from './useMainSearch';
import { SearchResultRow } from './SearchResultRow';
import { SearchIcon, CloseIcon } from '../icons/GeneralIcons';
import { IconButton, Spinner } from '../ui';
import type { Artist } from '../../types/artist';
import { useTranslation } from 'react-i18next';

interface MainSearchProps {
    mapUsername?: string;
    onSelectArtist?: (artist: Artist) => void;
    closeSignal?: number;
    onResultsOpenChange?: (open: boolean) => void;
}

export function MainSearch({ mapUsername, onSelectArtist, closeSignal = 0, onResultsOpenChange }: MainSearchProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const { t } = useTranslation();

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

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [setIsOpen]);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                inputRef.current?.focus();
            }
            if (e.key === 'Escape' && isOpen) {
                setIsOpen(false);
                inputRef.current?.blur();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, setIsOpen]);

    const hasResults = results && results.totalCount > 0;
    const showDropdown = isOpen && query.length >= 2;

    useEffect(() => {
        onResultsOpenChange?.(showDropdown);
    }, [onResultsOpenChange, showDropdown]);

    useEffect(() => {
        // Parent-owned close signal keeps mobile surfaces mutually exclusive.
        if (closeSignal > 0) {
            setIsOpen(false);
        }
    }, [closeSignal, setIsOpen]);

    return (
        <div ref={containerRef} className="relative w-full font-sans sm:w-80">
            {/* Search Input */}
            <div
                className="relative"
                onPointerDown={(event) => {
                    // Expand the focus target without stealing clear/search button clicks.
                    if ((event.target as HTMLElement).closest('button')) return;
                    inputRef.current?.focus();
                }}
            >
                <input
                    ref={inputRef}
                    role="combobox"
                    aria-label={t('mainSearch.placeholder')}
                    aria-expanded={showDropdown}
                    aria-controls="search-results"
                    aria-autocomplete="list"
                    aria-haspopup="listbox"
                    aria-busy={isLoading}
                    type="text"
                    name="main-search"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder={t('mainSearch.placeholder')}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => query.length >= 2 && setIsOpen(true)}
                    className="h-12 w-full min-w-0 pl-3.5 pr-13 text-base bg-surface border border-border rounded-md shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent sm:pl-5"
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
                    className="absolute right-0 top-0 flex h-12 w-9 items-center justify-center rounded-r-md text-text-secondary hover:bg-primary hover:text-white transition-colors"
                >
                    <SearchIcon className="w-5 h-5" />
                </button>
            </div>

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
                                    {results.artists.map((artistResult) => (
                                        <SearchResultRow
                                            key={artistResult.artist.id}
                                            result={artistResult}
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
                                    {results.users.map((user) => (
                                        <SearchResultRow
                                            key={user.id}
                                            result={user}
                                            onSelect={() => handleSelectUser(user)}
                                        />
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

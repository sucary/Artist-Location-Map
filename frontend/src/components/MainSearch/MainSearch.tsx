import { useRef, useEffect } from 'react';
import { useMainSearch } from './useMainSearch';
import { SearchResultRow } from './SearchResultRow';
import { SearchIcon, CloseIcon } from '../icons/GeneralIcons';
import { IconButton, Spinner, Button } from '../ui';
import type { LocationSearchResult } from '../../types/search';

interface MainSearchProps {
    onFocusLocation?: (result: LocationSearchResult) => void;
}

export function MainSearch({ onFocusLocation }: MainSearchProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const {
        query,
        setQuery,
        results,
        isLoading,
        isLoadingMore,
        searchMoreQueueSize,
        hasMoreLocations,
        isOpen,
        setIsOpen,
        handleClear,
        handleSelectLocation,
        handleSelectUser,
        handleSearchMore,
    } = useMainSearch({
        onAutoFocusLocation: onFocusLocation,
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

    return (
        <div ref={containerRef} className="relative w-full font-sans sm:w-80">
            {/* Search Input */}
            <div className="relative">
                <input
                    ref={inputRef}
                    role="combobox"
                    aria-label="Search users and locations"
                    aria-expanded={showDropdown}
                    aria-controls="search-results"
                    aria-autocomplete="list"
                    type="text"
                    name="main-search"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="Search users, locations..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => query.length >= 2 && setIsOpen(true)}
                    className="h-12 w-full min-w-0 pl-4 pr-16 text-base bg-surface border border-border rounded-md shadow-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                />
                {query && (
                    <IconButton
                        aria-label="Clear search"
                        onClick={handleClear}
                        size="sm"
                        className="absolute right-9 top-1/2 -translate-y-1/2 rounded hover:bg-surface-muted"
                    >
                        <CloseIcon className="w-4 h-4" />
                    </IconButton>
                )}
                <button
                    aria-label="Search!"
                    type="button"
                    onClick={() => inputRef.current?.focus()}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-text-secondary hover:bg-primary hover:text-white transition-colors"
                >
                    <SearchIcon className="w-4 h-4" />
                </button>
            </div>

            {/* Dropdown Results */}
            {showDropdown && (
                <div 
                    aria-live="polite"
                    id="search-results" 
                    role="listbox"
                    className="fixed top-16 left-2 right-2 z-[1260] bg-surface border border-border rounded-md shadow-md overflow-hidden max-h-[calc(100vh-5rem)] overflow-y-auto sm:absolute sm:top-full sm:left-0 sm:right-auto sm:mt-1 sm:w-full sm:max-h-96"
                >
                    {isLoading ? (
                        <div className="flex items-center justify-center py-8">
                            <Spinner className="text-primary" />
                        </div>
                    ) : !hasResults ? (
                        <div className="text-center py-8 text-text-secondary text-sm">
                            No results found
                        </div>
                    ) : (
                        <>
                            {/* Users */}
                            {results.users.length > 0 && (
                                <div>
                                    <div role="group" aria-label="Users" className="px-4 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wider bg-surface-muted">
                                        Users
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

                            {/* Locations */}
                            {results.locations.length > 0 && (
                                <div>
                                    <div role="group" aria-label="Locations" className="px-4 py-2 text-xs font-semibold text-text-secondary uppercase tracking-wider bg-surface-muted">
                                        Locations
                                    </div>
                                    {results.locations.map((location) => (
                                        <SearchResultRow
                                            key={`${location.osmId}:${location.osmType}`}
                                            result={location}
                                            onSelect={() => handleSelectLocation(location)}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Load more button */}
                            {hasMoreLocations && (
                                <Button
                                    onClick={handleSearchMore}
                                    disabled={isLoadingMore}
                                    variant="ghost"
                                    className="w-full border-t border-border rounded-none flex items-center justify-center gap-2"
                                >
                                    {isLoadingMore && (
                                        <div className="relative inline-flex items-center justify-center">
                                            <Spinner size="sm" />
                                            {searchMoreQueueSize > 0 && (
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    <span className="text-[10px] font-bold text-text-muted">{searchMoreQueueSize}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    <span>{isLoadingMore ? 'Searching...' : 'Search for more locations'}</span>
                                </Button>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

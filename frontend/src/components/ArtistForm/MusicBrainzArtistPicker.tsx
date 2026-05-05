import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    cacheMusicBrainzCatalogArtist,
    getMusicBrainzCatalogArtist,
    searchMusicBrainzCatalogOnline,
    searchMusicBrainzCatalogPage
} from '../../services/api';
import type { MusicBrainzCatalogArtist } from '../../services/api';
import { Button, Spinner } from '../ui';
import { useAuth } from '../../context/AuthContext';
import { SearchIcon } from '../icons/GeneralIcons';

interface MusicBrainzArtistPickerProps {
    value?: string;
    selectedMbid?: string;
    onNameChange: (name: string) => void;
    onSelect: (artist: MusicBrainzCatalogArtist) => void | Promise<void>;
}

const pageSize = 100;
const onlinePageSize = 20;

function formatMeta(artist: MusicBrainzCatalogArtist, showMbid: boolean) {
    const artistType = artist.type === 'Group' ? 'Band/group' : artist.type;
    const parts = [
        artistType,
        artist.areaName,
        artist.lifeSpanBegin?.slice(0, 4)
    ].filter(Boolean);

    if (parts.length > 0) return parts.join(' - ');

    if (parts.length > 0) return parts.join(' · ');
    if (showMbid) return artist.mbid;
    return artist.disambiguation || 'Artist';
}

export function MusicBrainzArtistPicker({ value, selectedMbid, onNameChange, onSelect }: MusicBrainzArtistPickerProps) {
    const { profile } = useAuth();
    const [query, setQuery] = useState(value || '');
    const [localResults, setLocalResults] = useState<MusicBrainzCatalogArtist[]>([]);
    const [localOffset, setLocalOffset] = useState(0);
    const [localHasMore, setLocalHasMore] = useState(false);
    const [isCatalogSearching, setIsCatalogSearching] = useState(false);
    const [isCatalogDebouncing, setIsCatalogDebouncing] = useState(false);
    const [hasCatalogSearched, setHasCatalogSearched] = useState(false);
    const [onlineResults, setOnlineResults] = useState<MusicBrainzCatalogArtist[]>([]);
    const [onlineOffset, setOnlineOffset] = useState(0);
    const [onlineHasMore, setOnlineHasMore] = useState(false);
    const [isOnlineSearching, setIsOnlineSearching] = useState(false);
    const [isSelectingArtist, setIsSelectingArtist] = useState(false);
    const [hasOnlineSearched, setHasOnlineSearched] = useState(false);
    const [onlineError, setOnlineError] = useState<string | null>(null);
    const [resultMode, setResultMode] = useState<'catalog' | 'online'>('catalog');
    const [isDeepSearch, setIsDeepSearch] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 });
    const inputWrapRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const restoreScrollTopRef = useRef<number | null>(null);
    const suppressNextCatalogSearchRef = useRef(false);
    const catalogDebounceTimeoutRef = useRef<number | null>(null);

    useEffect(() => {
        if (!selectedMbid && value && value !== query) {
            setQuery(value);
        }
    }, [query, selectedMbid, value]);

    const normalizedQuery = query.trim();
    const enabled = normalizedQuery.length >= 2;

    useEffect(() => {
        setLocalResults([]);
        setLocalOffset(0);
        setLocalHasMore(false);
        setHasCatalogSearched(false);
        setOnlineResults([]);
        setOnlineOffset(0);
        setOnlineHasMore(false);
        setHasOnlineSearched(false);
        setOnlineError(null);
        setResultMode(isDeepSearch ? 'online' : 'catalog');
    }, [normalizedQuery]);

    useEffect(() => {
        if (suppressNextCatalogSearchRef.current) {
            suppressNextCatalogSearchRef.current = false;
            setIsCatalogDebouncing(false);
            return;
        }

        if (!enabled || isDeepSearch) {
            setIsCatalogDebouncing(false);
            return;
        }

        const controller = new AbortController();
        setIsCatalogDebouncing(true);

        // Local catalog search is the normal path, so it can run as the user types.
        // The debounce avoids flashing "no result" states while the query is still settling.
        const timeoutId = window.setTimeout(() => {
            catalogDebounceTimeoutRef.current = null;
            setIsCatalogDebouncing(false);
            setIsCatalogSearching(true);

            searchMusicBrainzCatalogPage({ q: normalizedQuery, limit: pageSize, offset: 0 }, controller.signal)
                .then((response) => {
                    setHasCatalogSearched(true);
                    setLocalResults(response.results);
                    setLocalOffset(response.offset + response.results.length);
                    setLocalHasMore(response.hasMore);
                })
                .catch((error) => {
                    if ((error as { name?: string }).name !== 'CanceledError') {
                        setHasCatalogSearched(true);
                        setLocalResults([]);
                        setLocalOffset(0);
                        setLocalHasMore(false);
                    }
                })
                .finally(() => setIsCatalogSearching(false));
        }, 500); // Search debounce!

        catalogDebounceTimeoutRef.current = timeoutId;

        return () => {
            window.clearTimeout(timeoutId);
            catalogDebounceTimeoutRef.current = null;
            controller.abort();
            setIsCatalogDebouncing(false);
        };
    }, [enabled, isDeepSearch, normalizedQuery]);

    const selectedArtist = useMemo(
        () => [...localResults, ...onlineResults].find((artist) => artist.mbid === selectedMbid),
        [localResults, onlineResults, selectedMbid]
    );

    useEffect(() => {
        if (isOpen && inputWrapRef.current) {
            const rect = inputWrapRef.current.getBoundingClientRect();
            const formContainer = inputWrapRef.current.closest('.rounded-lg.shadow-xl');
            const containerBottom = formContainer
                ? formContainer.getBoundingClientRect().bottom
                : window.innerHeight;
            const gap = 4;
            setDropdownPosition({
                top: rect.bottom + window.scrollY + gap,
                left: rect.left + window.scrollX,
                width: rect.width,
                maxHeight: Math.max(180, containerBottom - rect.bottom - gap)
            });
        }
    }, [isOpen, localResults.length, onlineResults.length]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                !inputWrapRef.current?.contains(target)
                && !dropdownRef.current?.contains(target)
            ) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if ((isCatalogSearching || isOnlineSearching) || restoreScrollTopRef.current === null) return;

        const scrollTop = restoreScrollTopRef.current;
        restoreScrollTopRef.current = null;
        window.setTimeout(() => {
            if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollTop;
            }
        }, 0);
    }, [isCatalogSearching, isOnlineSearching, localResults.length, onlineResults.length]);

    const handleSelect = async (artist: MusicBrainzCatalogArtist, source: 'local' | 'online') => {
        setIsOpen(false);
        suppressNextCatalogSearchRef.current = true;
        setIsSelectingArtist(true);

        try {
            // Online hits are only lightweight MusicBrainz search rows. Cache first, then fetch
            // the full catalog detail so location/social autofill uses the same shape as DB hits.
            const cached = source === 'online'
                ? await cacheMusicBrainzCatalogArtist({ mbid: artist.mbid })
                : artist;
            const detail = await getMusicBrainzCatalogArtist(cached.mbid).catch(() => cached);
            await onSelect(detail);
            setQuery(detail.name);
        } finally {
            setIsSelectingArtist(false);
        }
    };

    const handleSearchOnline = async (append = false) => {
        if (!enabled || isOnlineSearching) return;

        restoreScrollTopRef.current = scrollRef.current?.scrollTop ?? null;
        setIsOnlineSearching(true);
        setOnlineError(null);
        try {
            const response = await searchMusicBrainzCatalogOnline({
                q: normalizedQuery,
                limit: onlinePageSize,
                offset: append ? onlineOffset : 0
            });
            setHasOnlineSearched(true);
            setOnlineResults((prev) => {
                if (!append) return response.results;
                const existing = new Set(prev.map((artist) => artist.mbid));
                return [
                    ...prev,
                    ...response.results.filter((artist) => !existing.has(artist.mbid))
                ];
            });
            setOnlineOffset(response.offset + response.results.length);
            setOnlineHasMore(response.hasMore);
            setResultMode('online');
            setIsOpen(true);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'MusicBrainz online search failed';
            setHasOnlineSearched(true);
            setOnlineError(message);
        } finally {
            setIsOnlineSearching(false);
        }
    };

    const showDropdown = isOpen && enabled;
    const isSearching = isCatalogDebouncing || isCatalogSearching || isOnlineSearching;

    const handleSearchCatalog = async () => {
        if (!enabled || isDeepSearch || isCatalogSearching) return;

        // Manual local search should run immediately and cancel the pending debounce.
        if (catalogDebounceTimeoutRef.current !== null) {
            window.clearTimeout(catalogDebounceTimeoutRef.current);
            catalogDebounceTimeoutRef.current = null;
        }
        restoreScrollTopRef.current = scrollRef.current?.scrollTop ?? null;
        setIsCatalogDebouncing(false);
        setIsCatalogSearching(true);
        setResultMode('catalog');
        setIsOpen(true);
        try {
            const response = await searchMusicBrainzCatalogPage({
                q: normalizedQuery,
                limit: pageSize,
                offset: 0
            });
            setHasCatalogSearched(true);
            setLocalResults(response.results);
            setLocalOffset(response.offset + response.results.length);
            setLocalHasMore(response.hasMore);
        } catch {
            setHasCatalogSearched(true);
            setLocalResults([]);
            setLocalOffset(0);
            setLocalHasMore(false);
        } finally {
            setIsCatalogSearching(false);
        }
    };

    const handleSearchMoreCatalog = async () => {
        if (!enabled || isCatalogSearching) return;

        restoreScrollTopRef.current = scrollRef.current?.scrollTop ?? null;
        setIsCatalogSearching(true);
        try {
            const response = await searchMusicBrainzCatalogPage({
                q: normalizedQuery,
                limit: pageSize,
                offset: localOffset
            });
            setLocalResults((prev) => {
                const existing = new Set(prev.map((artist) => artist.mbid));
                return [
                    ...prev,
                    ...response.results.filter((artist) => !existing.has(artist.mbid))
                ];
            });
            setLocalOffset(response.offset + response.results.length);
            setLocalHasMore(response.hasMore);
            setHasCatalogSearched(true);
        } finally {
            setIsCatalogSearching(false);
        }
    };

    return (
        <div data-tutorial-target="artist-search" className="rounded-md p-1">
            <div className="mb-1 flex items-center justify-between gap-3">
                <label className="block text-sm font-bold text-text" htmlFor="musicbrainz-artist-search">
                    Artist
                </label>
                <div className="inline-flex -translate-y-0.5 items-center gap-2 text-xs leading-none text-text-secondary">
                    <span>Deep search</span>
                    <label className="inline-flex items-center">
                        <span className="sr-only">Deep search</span>
                        <input
                            type="checkbox"
                            role="switch"
                            checked={isDeepSearch}
                            onChange={(event) => {
                                const nextIsDeepSearch = event.target.checked;
                                // Mode switches should not fire network requests by themselves.
                                suppressNextCatalogSearchRef.current = true;
                                setIsDeepSearch(nextIsDeepSearch);
                                setResultMode(nextIsDeepSearch ? 'online' : 'catalog');
                                setOnlineError(null);
                                setIsOpen(false);
                            }}
                            className="sr-only"
                        />
                        <span className={`relative h-5 w-9 rounded-full transition-colors ${isDeepSearch ? 'bg-primary' : 'bg-border'}`}>
                            <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-surface shadow-sm transition-transform ${isDeepSearch ? 'translate-x-4' : ''}`} />
                        </span>
                    </label>
                </div>
            </div>
            <div ref={inputWrapRef} className="relative">
                <input
                    id="musicbrainz-artist-search"
                    name="musicbrainz-artist-search"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={query}
                    onChange={(event) => {
                        const nextValue = event.target.value;
                        setQuery(nextValue);
                        onNameChange(nextValue);
                        setOnlineError(null);
                        setIsOpen(nextValue.trim().length >= 2 && !isDeepSearch);
                    }}
                    onFocus={() => {
                        if (enabled && (!isDeepSearch || onlineResults.length > 0 || hasOnlineSearched)) {
                            setIsOpen(true);
                        }
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            if (isDeepSearch) {
                                void handleSearchOnline();
                                return;
                            }
                            void handleSearchCatalog();
                        }
                    }}
                    placeholder="Search artist"
                    className="w-full px-3 py-2 pr-14 text-sm border border-border-strong rounded-md bg-surface text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-inset focus:ring-primary"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {isSearching && <Spinner size="sm" className="text-text-muted" />}
                    <button
                        aria-label={isDeepSearch ? 'Search MusicBrainz' : 'Search saved artists'}
                        onClick={() => {
                            if (isDeepSearch) {
                                void handleSearchOnline();
                                return;
                            }
                            void handleSearchCatalog();
                        }}
                        type="button"
                        disabled={!enabled || (isDeepSearch ? isOnlineSearching : isCatalogSearching)}
                        className="p-1 rounded text-text-secondary hover:bg-primary hover:text-white disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary transition-colors"
                        title={isDeepSearch ? 'Search MusicBrainz' : 'Search saved artists'}
                    >
                        <SearchIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {(isSelectingArtist || (profile?.isAdmin && selectedMbid)) && (
                <div className="mt-2 text-xs text-text-secondary">
                    {isSelectingArtist ? (
                        <span className="inline-flex items-center gap-1.5">
                            <Spinner size="sm" className="text-text-muted" />
                            Processing artist...
                        </span>
                    ) : (
                        <>
                            Linked: <span className="font-medium text-text">{selectedArtist?.name || selectedMbid}</span>
                        </>
                    )}
                </div>
            )}

            {onlineError && <div className="mt-2 text-xs text-error">{onlineError}</div>}

            {showDropdown && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-[9999] overflow-hidden rounded-md border border-border bg-surface shadow-lg"
                    style={{
                        top: dropdownPosition.top,
                        left: dropdownPosition.left,
                        width: dropdownPosition.width,
                        maxHeight: dropdownPosition.maxHeight
                    }}
                >
                    <div ref={scrollRef} className="overflow-y-auto" style={{ maxHeight: dropdownPosition.maxHeight }}>
                        {resultMode === 'catalog' && ((isCatalogDebouncing || isCatalogSearching) && localResults.length === 0 ? (
                            <div className="px-3 py-2 text-sm text-text-secondary">Searching artists...</div>
                        ) : localResults.length > 0 ? (
                            <>
                                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary bg-surface-secondary">
                                    Artists
                                </div>
                                {localResults.map((artist) => (
                                    <button
                                        key={`local-${artist.mbid}`}
                                        type="button"
                                        onClick={() => void handleSelect(artist, 'local')}
                                        className={`w-full px-3 py-2 text-left hover:bg-surface-muted transition-colors border-b border-border last:border-b-0 ${artist.mbid === selectedMbid ? 'bg-surface-muted' : ''}`}
                                    >
                                        <div className="text-sm font-semibold text-text truncate">{artist.name}</div>
                                        <div className="text-xs text-text-secondary truncate">{formatMeta(artist, !!profile?.isAdmin)}</div>
                                    </button>
                                ))}
                            </>
                        ) : hasCatalogSearched ? (
                            <div className="px-3 py-2 text-sm text-text-secondary">No artist found</div>
                        ) : (
                            null
                        ))}

                        {resultMode === 'catalog' && localHasMore && (
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={handleSearchMoreCatalog}
                                disabled={isCatalogSearching}
                                isLoading={isCatalogSearching}
                                className="w-full rounded-none border-t border-border"
                            >
                                More artists
                            </Button>
                        )}

                        {resultMode === 'online' && onlineResults.length > 0 && (
                            <>
                                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary bg-surface-secondary border-t border-border">
                                    MusicBrainz online
                                </div>
                                {onlineResults.map((artist) => (
                                    <button
                                        key={`online-${artist.mbid}`}
                                        type="button"
                                        onClick={() => void handleSelect(artist, 'online')}
                                        className={`w-full px-3 py-2 text-left hover:bg-surface-muted transition-colors border-b border-border last:border-b-0 ${artist.mbid === selectedMbid ? 'bg-surface-muted' : ''}`}
                                    >
                                        <div className="text-sm font-semibold text-text truncate">{artist.name}</div>
                                        <div className="text-xs text-text-secondary truncate">{formatMeta(artist, !!profile?.isAdmin)}</div>
                                    </button>
                                ))}
                                {onlineHasMore && (
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => void handleSearchOnline(true)}
                                        disabled={isOnlineSearching}
                                        isLoading={isOnlineSearching}
                                        className="w-full rounded-none border-t border-border"
                                    >
                                        More artists
                                    </Button>
                                )}
                            </>
                        )}

                        {resultMode === 'online' && isOnlineSearching && onlineResults.length === 0 && (
                            <div className="px-3 py-2 text-sm text-text-secondary">Searching MusicBrainz...</div>
                        )}

                        {resultMode === 'online' && hasOnlineSearched && onlineResults.length === 0 && !isOnlineSearching && (
                            <div className="px-3 py-2 text-sm text-text-secondary">No artist found</div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

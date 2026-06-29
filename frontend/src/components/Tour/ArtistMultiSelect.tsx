import { useEffect, useMemo, useRef, useState, useId, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Artist } from '../../types/artist';
import { getAvatarUrl } from '../../utils/cloudinaryUrl';
import { ChevronDownIcon, CloseIcon, PlusIcon } from '../icons/GeneralIcons';
import { useTranslation } from 'react-i18next';
import { useAnchoredPopup } from '../../hooks/useAnchoredPopup';

interface ArtistMultiSelectProps {
    artists: Artist[];
    value: string[];
    label: string;
    placeholder: string;
    removeLabel: (name: string) => string;
    onChange: (artistIds: string[]) => void;
}

export function ArtistMultiSelect({ artists, value, label, placeholder, removeLabel, onChange }: ArtistMultiSelectProps) {
    const inputId = useId();
    const listboxId = `${inputId}-artists`;
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const { t } = useTranslation();
    const [isAddingArtist, setIsAddingArtist] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);

    const selectedArtists = useMemo(() => (
        value
            .map((artistId) => artists.find((artist) => artist.id === artistId))
            .filter((artist): artist is Artist => !!artist)
    ), [artists, value]);

    // Hide selected artists from the addable result set
    const filteredArtists = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        return artists.filter((artist) => {
            if (value.includes(artist.id)) return false;
            if (!normalizedQuery) return true;
            return artist.name.toLowerCase().includes(normalizedQuery) || artist.romanizedName?.toLowerCase().includes(normalizedQuery);
        });
    }, [artists, query, value]);
    const safeActiveIndex = filteredArtists.length === 0 ? 0 : Math.min(activeIndex, filteredArtists.length - 1);
    const activeOptionId = isOpen && filteredArtists[safeActiveIndex] ? `${listboxId}-${filteredArtists[safeActiveIndex].id}` : undefined;

    const dropdownPosition = useAnchoredPopup({
        isOpen: isAddingArtist && isOpen,
        anchorRef: containerRef,
        popupRef: dropdownRef,
        width: 'anchor',
        align: 'left',
        gap: 4,
        recomputeKey: filteredArtists.length,
        onScrollAway: () => {
            setIsOpen(false);
            setIsAddingArtist(false);
        },
    });

    useEffect(() => {
        if (!isAddingArtist) return;
        inputRef.current?.focus();
    }, [isAddingArtist]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            // Portaled list remains part of the active picker
            if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
            setIsOpen(false);
            setIsAddingArtist(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const addArtist = (artistId: string) => {
        if (value.includes(artistId)) return;
        onChange([...value, artistId]);
        setQuery('');
        setActiveIndex(0);
        setIsOpen(false);
        setIsAddingArtist(false);
    };

    const removeArtist = (artistId: string) => {
        onChange(value.filter((id) => id !== artistId));
    };

    const openArtistField = () => {
        setIsAddingArtist(true);
        setIsOpen(true);
        setActiveIndex(0);
    };

    const closeArtistField = () => {
        setIsOpen(false);
        setIsAddingArtist(false);
    };

    const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
            closeArtistField();
            return;
        }

        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setIsOpen(true);
            setActiveIndex((current) => {
                if (filteredArtists.length === 0) return 0;
                const nextIndex = event.key === 'ArrowDown' ? current + 1 : current - 1;
                return (nextIndex + filteredArtists.length) % filteredArtists.length;
            });
            return;
        }

        if (event.key === 'Enter' && isOpen && filteredArtists[safeActiveIndex]) {
            event.preventDefault();
            addArtist(filteredArtists[safeActiveIndex].id);
        }
    };

    return (
        <div>
            <label htmlFor={inputId} className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {label}
            </label>
            <div ref={containerRef} className="relative">
                <div
                    className="flex flex-wrap items-center gap-2"
                    onMouseDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        closeArtistField();
                    }}
                >
                    {selectedArtists.map((artist) => {
                        const avatarUrl = getAvatarUrl(artist.sourceImage, artist.avatarCrop);

                        return (
                            <button
                                key={artist.id}
                                type="button"
                                aria-label={removeLabel(artist.name)}
                                onClick={() => removeArtist(artist.id)}
                                className="group relative inline-flex max-w-full items-center gap-1.5 overflow-hidden rounded-full bg-surface-muted py-1 pl-3 pr-1 text-xs font-medium text-text-secondary transition-colors hover:bg-primary hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                                title={removeLabel(artist.name)}
                            >
                                <span className="min-w-0 truncate">{artist.name}</span>
                                {avatarUrl ? (
                                    <span className="relative grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full">
                                        <img
                                            src={avatarUrl}
                                            alt=""
                                            className="h-full w-full object-cover group-hover:hidden group-focus-visible:hidden"
                                        />
                                        <span className="absolute inset-0 hidden place-items-center rounded-full text-white group-hover:grid group-focus-visible:grid">
                                            <CloseIcon className="h-3 w-3" />
                                        </span>
                                    </span>
                                ) : (
                                    <span className="relative grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-secondary text-[10px] font-semibold text-text-secondary group-hover:bg-transparent group-hover:text-white group-focus-visible:bg-transparent group-focus-visible:text-white">
                                        <span className="group-hover:hidden group-focus-visible:hidden">
                                            {Array.from(artist.name.trim())[0]?.toUpperCase()}
                                        </span>
                                        <span className="absolute inset-0 hidden place-items-center rounded-full text-white group-hover:grid group-focus-visible:grid">
                                            <CloseIcon className="h-3 w-3" />
                                        </span>
                                    </span>
                                )}
                            </button>
                        );
                    })}

                    {isAddingArtist ? (
                        <div className="relative min-w-[8rem] flex-1">
                            <input
                                ref={inputRef}
                                id={inputId}
                                role="combobox"
                                aria-autocomplete="list"
                                aria-activedescendant={activeOptionId}
                                aria-controls={isOpen ? listboxId : undefined}
                                aria-expanded={isOpen}
                                aria-haspopup="listbox"
                                autoComplete="off"
                                type="text"
                                value={query}
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                    setIsOpen(true);
                                    setActiveIndex(0);
                                }}
                                onFocus={() => setIsOpen(true)}
                                onKeyDown={handleInputKeyDown}
                                placeholder={placeholder}
                                className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 pr-8 text-sm text-text placeholder:text-text-muted transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
                            />
                            <button
                                aria-label={placeholder}
                                aria-controls={isOpen ? listboxId : undefined}
                                aria-expanded={isOpen}
                                aria-haspopup="listbox"
                                type="button"
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    setIsOpen((open) => !open);
                                }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-secondary transition-colors hover:bg-primary hover:text-white"
                            >
                                <ChevronDownIcon className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            aria-label={placeholder}
                            onClick={openArtistField}
                            className={`grid h-7 place-items-center rounded-full transition-all duration-150 ${
                                selectedArtists.length === 0 ? 'w-full' : 'w-7'
                            } bg-surface-muted text-text-secondary hover:bg-primary hover:text-white`}
                        >
                            <PlusIcon className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {isAddingArtist && isOpen && createPortal(
                <div
                    id={listboxId}
                    role="listbox"
                    aria-label={label}
                    ref={dropdownRef}
                    className="fixed z-9999 overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-lg app-dark:shadow-[0_16px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(255,255,255,0.04)]"
                    style={{
                        top: `${dropdownPosition.top}px`,
                        left: `${dropdownPosition.left}px`,
                        width: `${dropdownPosition.width}px`,
                        maxHeight: `${dropdownPosition.maxHeight}px`,
                    }}
                >
                    {filteredArtists.map((artist, index) => {
                        const isActive = index === safeActiveIndex;

                        return (
                        <button
                            key={artist.id}
                            id={`${listboxId}-${artist.id}`}
                            type="button"
                            role="option"
                            aria-selected={false}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => addArtist(artist.id)}
                            className={`w-full border-b border-border px-3 py-2 text-left text-sm text-text transition-colors last:border-b-0 hover:bg-surface-muted ${isActive ? 'bg-surface-muted' : ''}`}
                        >
                            <span className="block truncate font-medium">{artist.name}</span>
                            {artist.romanizedName && (
                                <span className="block truncate text-xs text-text-secondary">{artist.romanizedName}</span>
                            )}
                        </button>
                        );
                    })}
                    {filteredArtists.length === 0 && (
                        <div className="px-3 py-3 text-sm text-text-secondary">
                            {t('tour.form.noArtistsFound')}
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}

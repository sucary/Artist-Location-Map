import { useEffect, useMemo, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import type { Artist } from '../../types/artist';
import { getAvatarUrl } from '../../utils/cloudinaryUrl';
import { ChevronDownIcon, CloseIcon, PlusIcon } from '../icons/GeneralIcons';
import { useTranslation } from 'react-i18next';

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
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

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

    useEffect(() => {
        if (!isOpen || !containerRef.current) return;

        // Portal menu follows the input inside map overlays
        const rect = containerRef.current.getBoundingClientRect();
        setDropdownPosition({
            top: rect.bottom + window.scrollY + 4,
            left: rect.left + window.scrollX,
            width: rect.width,
        });
    }, [isOpen, query, selectedArtists.length]);

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
        setIsOpen(false);
        setIsAddingArtist(false);
    };

    const removeArtist = (artistId: string) => {
        onChange(value.filter((id) => id !== artistId));
    };

    const openArtistField = () => {
        setIsAddingArtist(true);
        setIsOpen(true);
    };

    const closeArtistField = () => {
        setIsOpen(false);
        setIsAddingArtist(false);
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
                                onClick={() => removeArtist(artist.id)}
                                className="group relative inline-flex max-w-full items-center gap-1.5 overflow-hidden rounded-full bg-surface-muted py-1 pl-3 pr-1 text-xs font-medium text-text-secondary transition-colors hover:bg-primary hover:text-white"
                                title={removeLabel(artist.name)}
                            >
                                <span className="min-w-0 truncate">{artist.name}</span>
                                {avatarUrl ? (
                                    <span className="relative grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-full">
                                        <img
                                            src={avatarUrl}
                                            alt=""
                                            className="h-full w-full object-cover group-hover:hidden"
                                        />
                                        <span className="absolute inset-0 hidden place-items-center rounded-full text-white group-hover:grid">
                                            <CloseIcon className="h-3 w-3" />
                                        </span>
                                    </span>
                                ) : (
                                    <span className="relative grid h-5 w-5 shrink-0 place-items-center rounded-full bg-surface-secondary text-[10px] font-semibold text-text-secondary group-hover:bg-transparent group-hover:text-white">
                                        <span className="group-hover:hidden">
                                            {Array.from(artist.name.trim())[0]?.toUpperCase()}
                                        </span>
                                        <span className="absolute inset-0 hidden place-items-center rounded-full text-white group-hover:grid">
                                            <CloseIcon className="h-3 w-3" />
                                        </span>
                                    </span>
                                )}
                            </button>
                        );
                    })}

                    <button
                        type="button"
                        aria-label={placeholder}
                        onClick={openArtistField}
                        className={`grid h-7 place-items-center rounded-full transition-all duration-150 ${
                            selectedArtists.length === 0 ? 'w-full' : 'w-7'
                        } ${
                            isAddingArtist
                                ? 'bg-primary text-white'
                                : 'bg-surface-muted text-text-secondary hover:bg-primary hover:text-white'
                        }`}
                    >
                        <PlusIcon className="h-4 w-4" />
                    </button>
                </div>

                {isAddingArtist && (
                    <div className="relative mt-2">
                        <input
                            ref={inputRef}
                            id={inputId}
                            role="combobox"
                            aria-autocomplete="list"
                            aria-controls={isOpen ? listboxId : undefined}
                            aria-expanded={isOpen}
                            aria-haspopup="listbox"
                            autoComplete="off"
                            type="text"
                            value={query}
                            onChange={(event) => {
                                setQuery(event.target.value);
                                setIsOpen(true);
                            }}
                            onFocus={() => setIsOpen(true)}
                            placeholder={placeholder}
                            className="w-full rounded-lg border border-border-strong bg-surface px-3 py-2 pr-8 text-sm text-text placeholder:text-text-muted transition-colors duration-150 focus:border-primary focus:outline-none focus:ring-1 focus:ring-inset focus:ring-primary"
                        />
                        <button
                            aria-label={t('artistForm.yearSelect.label')}
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
                )}
            </div>

            {isAddingArtist && isOpen && createPortal(
                <div
                    id={listboxId}
                    role="listbox"
                    aria-label={label}
                    ref={dropdownRef}
                    className="fixed z-9999 max-h-48 overflow-y-auto rounded-lg border border-border-strong bg-surface shadow-lg"
                    style={{
                        top: `${dropdownPosition.top}px`,
                        left: `${dropdownPosition.left}px`,
                        width: `${dropdownPosition.width}px`,
                    }}
                >
                    {filteredArtists.map((artist) => (
                        <button
                            key={artist.id}
                            type="button"
                            role="option"
                            aria-selected={false}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => addArtist(artist.id)}
                            className="w-full border-b border-border px-3 py-2 text-left text-sm text-text transition-colors last:border-b-0 hover:bg-surface-muted"
                        >
                            <span className="block truncate font-medium">{artist.name}</span>
                            {artist.romanizedName && (
                                <span className="block truncate text-xs text-text-secondary">{artist.romanizedName}</span>
                            )}
                        </button>
                    ))}
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

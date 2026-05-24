import { useEffect, useMemo, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import type { Artist } from '../../types/artist';
import { ChevronDownIcon } from '../icons/GeneralIcons';
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
    const { t } = useTranslation();
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
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            // Portaled list remains part of the active picker
            if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
            setIsOpen(false);
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const addArtist = (artistId: string) => {
        if (value.includes(artistId)) return;
        onChange([...value, artistId]);
        setQuery('');
        setIsOpen(true);
    };

    const removeArtist = (artistId: string) => {
        onChange(value.filter((id) => id !== artistId));
    };

    return (
        <div className="rounded-md p-1">
            <label htmlFor={inputId} className="block text-sm font-bold text-text mb-1">
                {label}
            </label>
            <div ref={containerRef} className="relative">
                <div className="relative">
                    <input
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
                        className="w-full border border-border-strong rounded-md bg-surface px-3 py-2 pr-8 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-primary focus:ring-1 focus:ring-inset focus:ring-primary"
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

                {selectedArtists.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                        {selectedArtists.map((artist) => (
                            <button
                                key={artist.id}
                                type="button"
                                onClick={() => removeArtist(artist.id)}
                                className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-primary hover:text-white"
                                title={removeLabel(artist.name)}
                            >
                                <span className="truncate">{artist.name}</span>
                                <span aria-hidden="true">x</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {isOpen && createPortal(
                <div
                    id={listboxId}
                    role="listbox"
                    aria-label={label}
                    ref={dropdownRef}
                    className="fixed z-9999 max-h-48 overflow-y-auto rounded-md border border-border-strong bg-surface shadow-lg"
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
                            className="w-full border-b border-border px-3 py-2 text-left text-sm text-text transition-colors last:border-b-0 hover:bg-surface-secondary"
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

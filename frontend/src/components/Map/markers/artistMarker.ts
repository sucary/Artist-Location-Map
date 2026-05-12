import type { Artist } from '../../../types/artist';
import { getAvatarUrl } from '../../../utils/cloudinaryUrl';

// Artist map marker image handling

const preloadedImageUrls = new Set<string>();

const getMarkerImageUrl = (artist: Artist) => getAvatarUrl(artist.sourceImage, artist.avatarCrop);

const getNameShortcut = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return '';

    const firstCharacter = Array.from(trimmed)[0];
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(firstCharacter)) {
        return firstCharacter;
    }

    const parts = trimmed.split(/\s+/).filter(Boolean);
    return parts
        .slice(0, 2)
        .map((part) => Array.from(part)[0])
        .join('')
        .toUpperCase();
};

export const preloadArtistMarkerImages = (artists: Artist[]) => {
    artists.forEach((artist) => {
        const imageUrl = getMarkerImageUrl(artist);
        if (!imageUrl) return;
        if (preloadedImageUrls.has(imageUrl)) return;

        preloadedImageUrls.add(imageUrl);
        const image = new Image();
        image.decoding = 'async';
        image.src = imageUrl;
    });
};

export const createArtistMarkerElement = (artist: Artist) => {
    const imageUrl = getMarkerImageUrl(artist);
    const element = document.createElement('button');
    const frame = document.createElement('div');

    // Build marker nodes directly to keep artist names and image URLs escaped.
    element.type = 'button';
    element.className = 'artist-maplibre-marker custom-artist-marker';
    element.setAttribute('aria-label', artist.name);
    element.ondblclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };

    frame.className = 'relative w-7 h-7 rounded-full border-2 border-white app-dark:border-border-strong overflow-hidden bg-surface-muted shadow-sm group';

    if (imageUrl) {
        const image = document.createElement('img');
        image.src = imageUrl;
        image.className = 'w-full h-full object-cover object-center';
        image.alt = artist.name;
        image.decoding = 'async';
        image.loading = 'eager';
        frame.appendChild(image);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'flex h-full w-full items-center justify-center bg-surface-muted text-[10px] font-semibold leading-none text-text-muted';
        placeholder.textContent = getNameShortcut(artist.name);
        frame.appendChild(placeholder);
    }

    element.appendChild(frame);

    return element;
};

import type { Artist } from '../../../types/artist';
import type { ArtistNameDisplayMode } from '../../../types/profile';
import { getAvatarUrl } from '../../../utils/cloudinaryUrl';
import { getArtistDisplayNameParts } from '../../../utils/artistNameDisplay';

// Artist map marker image handling

const preloadedImageUrls = new Set<string>();

const getMarkerImageUrl = (artist: Artist) => getAvatarUrl(artist.sourceImage, artist.avatarCrop);

export const createArtistDebugCenterElement = (color: string) => {
    const element = document.createElement('div');

    element.setAttribute('aria-hidden', 'true');
    element.className = 'artist-maplibre-marker-debug-center';
    element.style.width = '10px';
    element.style.height = '10px';
    element.style.borderRadius = '9999px';
    element.style.boxSizing = 'border-box';
    element.style.border = '2px solid #ffffff';
    element.style.background = color;
    element.style.pointerEvents = 'none';
    element.style.boxShadow = '0 0 0 1px #111827, 0 1px 6px rgba(0,0,0,0.5)';

    return element;
};

export const getArtistMarkerRenderKey = (
    artist: Artist,
    artistNameDisplayMode?: ArtistNameDisplayMode
) => {
    const imageUrl = getMarkerImageUrl(artist) ?? '';
    const displayName = getArtistDisplayNameParts(artist, artistNameDisplayMode);

    // Visible marker content cache key
    return [
        artist.id,
        displayName.primary,
        artist.name,
        imageUrl,
    ].join('|');
};

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

export const createArtistMarkerElement = (
    artist: Artist,
    artistNameDisplayMode?: ArtistNameDisplayMode,
    clusterDebugColor?: string
) => {
    const imageUrl = getMarkerImageUrl(artist);
    const displayName = getArtistDisplayNameParts(artist, artistNameDisplayMode);
    const element = document.createElement('button');
    const frame = document.createElement('div');

    // Escaped marker content from DOM node construction
    element.type = 'button';
    element.className = 'artist-maplibre-marker custom-artist-marker';
    element.setAttribute('aria-label', displayName.primary);
    element.dataset.artistId = artist.id;
    element.ondblclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };

    // Marker footprint matches clustering collision distance
    frame.className = 'relative w-10 h-10 rounded-full border-3 border-white app-dark:border-border-strong overflow-hidden bg-surface-muted shadow-xl shadow-black/10 group';

    if (clusterDebugColor) {
        // Debug swatch preserves marker geometry while hiding the avatar
        const swatch = document.createElement('div');
        element.dataset.clusterDebugColor = clusterDebugColor;
        swatch.className = 'h-full w-full';
        swatch.style.background = clusterDebugColor;
        frame.appendChild(swatch);
    } else if (imageUrl) {
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
        placeholder.textContent = getNameShortcut(displayName.primary);
        frame.appendChild(placeholder);
    }

    element.appendChild(frame);

    return element;
};

import type { Artist } from '../../../types/artist';
import { getAvatarUrl } from '../../../utils/cloudinaryUrl';

const getPlaceholderUrl = (name: string) =>
    `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=150&background=e5e7eb&color=9ca3af`;

const preloadedImageUrls = new Set<string>();

const getMarkerImageUrl = (artist: Artist) => (
    getAvatarUrl(artist.sourceImage, artist.avatarCrop) || getPlaceholderUrl(artist.name)
);

export const preloadArtistMarkerImages = (artists: Artist[]) => {
    artists.forEach((artist) => {
        const imageUrl = getMarkerImageUrl(artist);
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
    const image = document.createElement('img');

    // Build marker nodes directly to keep artist names and image URLs escaped.
    element.type = 'button';
    element.className = 'artist-maplibre-marker custom-artist-marker';
    element.setAttribute('aria-label', artist.name);
    element.ondblclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };

    frame.className = 'relative w-7 h-7 rounded-full border-2 border-white overflow-hidden bg-gray-200 group';

    image.src = imageUrl;
    image.className = 'w-full h-full object-cover object-center';
    image.alt = artist.name;
    image.decoding = 'async';

    frame.appendChild(image);
    element.appendChild(frame);

    return element;
};

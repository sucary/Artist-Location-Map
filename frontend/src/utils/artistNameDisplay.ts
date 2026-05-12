import type { Artist } from '../types/artist';
import type { ArtistNameDisplayMode } from '../types/profile';

// Artist display-name ordering

type ArtistNameFields = Pick<Artist, 'name' | 'romanizedName'>;

export interface ArtistDisplayNameParts {
    primary: string;
    secondary?: string;
}

export const DEFAULT_ARTIST_NAME_DISPLAY_MODE: ArtistNameDisplayMode = 'both';

export function getArtistDisplayNameParts(
    artist: ArtistNameFields,
    mode: ArtistNameDisplayMode = DEFAULT_ARTIST_NAME_DISPLAY_MODE
): ArtistDisplayNameParts {
    const mainName = artist.name;
    const subName = artist.romanizedName && artist.romanizedName !== mainName
        ? artist.romanizedName
        : undefined;

    if (!subName) return { primary: mainName };

    if (mode === 'main') return { primary: mainName };
    if (mode === 'sub') return { primary: subName };
    if (mode === 'subFirst') return { primary: subName, secondary: mainName };

    return { primary: mainName, secondary: subName };
}

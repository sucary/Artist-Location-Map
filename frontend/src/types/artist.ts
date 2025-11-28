/**
 * Geographic coordinates for a location
 */
export interface Coordinates {
    lat: number;
    lng: number;
}

/**
 * Location information including city, province, and coordinates
 */
export interface Location {
    city: string;
    province: string;
    coordinates: Coordinates;
}

/**
 * Social media links for an artist
 */
export interface SocialLinks {
    instagram?: string;
    twitter?: string;
    spotify?: string;
    website?: string;
}

/**
 * Complete artist profile
 */
export interface Artist {
    id: string;
    name: string;
    profilePicture?: string; // base64 string or URL
    originalLocation: Location; // Where artist is from
    activeLocation: Location; // Where artist is currently based
    bio?: string;
    socialLinks?: SocialLinks;
    createdAt: Date | string;
    updatedAt: Date | string;
}

/**
 * Type for location view toggle (used in frontend)
 */
export type LocationView = 'original' | 'active';

/**
 * Query parameters for filtering artists
 */
export interface ArtistQueryParams {
    name?: string;
    city?: string;
    province?: string;
    view?: LocationView; // Which location to search by
}
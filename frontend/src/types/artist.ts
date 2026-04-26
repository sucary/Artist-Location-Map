/**
 * Geographic coordinates for a location
 */
export interface Coordinates {
    lat: number;
    lng: number;
}

/**
 * Multilingual name set for a location
 */
export interface LocalizedNames {
    en?: string;
    zhHans?: string;
    zhHant?: string;
    ja?: string;
    native?: string;
}

/**
 * Full localized address chain for a location
 */
export interface LocalizedChain {
    city: LocalizedNames;
    province?: LocalizedNames;
    country?: LocalizedNames;
}

export type LocationLanguage = 'en' | 'zhHans' | 'zhHant' | 'ja' | 'native';

/**
 * Location information including city, province, and coordinates
 */
export interface Location {
    city: string;
    province: string;
    country?: string;
    coordinates: Coordinates;
    displayName?: string;
    osmId?: number;
    osmType?: string;
    localizedChain?: LocalizedChain;
}

/**
 * Social media links for an artist
 */
export interface SocialLinks {
    instagram?: string;
    twitter?: string;
    appleMusic?: string;
    website?: string;
    youtube?: string;
}

/**
 * Crop area coordinates for image cropping
 */
export interface CropArea {
    x: number;
    y: number;
    width: number;
    height: number;
}

/**
 * Complete artist profile
 */
export interface Artist {
    id: string;
    musicbrainzMbid?: string;
    name: string;
    sourceImage?: string; // Original uploaded image URL
    avatarCrop?: CropArea; // Crop coordinates for avatar (1:1)
    profileCrop?: CropArea; // Crop coordinates for profile banner (2.5:1)
    originalLocation: Location; // Where artist is from
    activeLocation: Location; // Where artist is currently based
    originalLocationDisplayCoordinates: Coordinates;
    activeLocationDisplayCoordinates: Coordinates;
    socialLinks?: SocialLinks;
    debutYear?: number;
    inactiveYear?: number;
    createdAt: Date | string;
    updatedAt: Date | string;
    originalCityId: string;
    activeCityId: string;
}

/**
 * Type for location view toggle (used in frontend)
 */
export type LocationView = 'original' | 'active';

/**
 * Selection mode state for manual map-based location selection
 */
export interface SelectionMode {
    active: boolean;
    targetField: 'originalLocation' | 'activeLocation';
}

/**
 * Query parameters for filtering artists
 */
export interface ArtistQueryParams {
    name?: string;
    city?: string;
    province?: string;
    view?: LocationView; // Which location to search by
}

import type { LocalizedChain } from './city';

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
    country?: string;
    coordinates: Coordinates;   // For determining the city, not for locating the artist
    displayName?: string;       // Full Nominatim display name for point locations
    osmId?: number;
    osmType?: string;
    isManualSelection?: boolean;
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
    userId?: string;
    musicbrainzMbid?: string;
    name: string;
    romanizedName?: string;
    sourceImage?: string;
    avatarCrop?: CropArea;
    profileCrop?: CropArea;
    originalLocation: Location;
    activeLocation: Location;
    socialLinks?: SocialLinks;
    debutYear?: number;
    inactiveYear?: number;
    createdAt: Date | string;
    updatedAt: Date | string;
    originalLocationDisplayCoordinates: Coordinates;
    activeLocationDisplayCoordinates: Coordinates;
    originalCityId: string;
    activeCityId: string;
}

/**
 * Artist data for creation (without auto-generated fields)
 */
export interface CreateArtistDTO {
    musicbrainzMbid?: string;
    name: string;
    romanizedName?: string;
    sourceImage?: string;
    avatarCrop?: CropArea;
    profileCrop?: CropArea;
    originalLocation: Location;
    activeLocation: Location;
    socialLinks?: SocialLinks;
    debutYear?: number;
    inactiveYear?: number;
}

/**
 * Extended DTO for Store layer including resolved IDs and coordinates
 */
export interface StoreArtistDTO extends CreateArtistDTO {
    userId: string;
    originalCityId: string;
    activeCityId: string;
    originalLocationDisplayCoordinates: Coordinates;
    activeLocationDisplayCoordinates: Coordinates;
}

/**
 * Artist data for updates (all fields optional except those needed for validation)
 */
export interface UpdateArtistDTO {
    musicbrainzMbid?: string;
    name?: string;
    romanizedName?: string;
    sourceImage?: string;
    avatarCrop?: CropArea;
    profileCrop?: CropArea;
    originalLocation?: Location;
    activeLocation?: Location;
    socialLinks?: SocialLinks;
    debutYear?: number;
    inactiveYear?: number;
}

/**
 * Extended Update DTO for Store layer
 */
export interface UpdateStoreArtistDTO extends UpdateArtistDTO {
    originalCityId?: string;
    activeCityId?: string;
    originalLocationDisplayCoordinates?: Coordinates;
    activeLocationDisplayCoordinates?: Coordinates;
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
    userId?: string; // Filter by owner
}

/**
 * Count of artists per location (city or province)
 */
export interface LocationCount {
    location: string;
    count: number;
}

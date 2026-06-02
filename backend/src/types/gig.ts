import type { Location, Coordinates, CropArea } from './artist';
import type { LocalizedChain } from './city';

// Gig and tour API contracts

export interface GigArtistSummary {
    id: string;
    name: string;
    romanizedName?: string;
    sourceImage?: string;
    avatarCrop?: CropArea;
}

export interface GigLocation extends Location {
    localizedChain?: LocalizedChain;
}

export interface Gig {
    id: string;
    userId: string;
    tourId?: string | null;
    tour?: TourSummary;
    artistIds: string[];
    artist: GigArtistSummary;
    artists: GigArtistSummary[];
    gigName?: string | null;
    venueName?: string | null;
    placeLocation?: GigPlaceLocationSummary | null;
    location: GigLocation;
    locationCityId?: string | null;
    placeLocationId?: string | null;
    displayCoordinates: Coordinates;
    date: string;
    time?: string | null;
    timezone?: string | null;
    externalSource?: string | null;
    externalId?: string | null;
    externalArtistId?: string | null;
    externalUrl?: string;
    importedAt?: Date | string;
    lastSyncedAt?: Date | string;
    rawExternalData?: unknown;
    createdAt: Date | string;
    updatedAt: Date | string;
}

export interface GigPlaceLocationSummary {
    id: string;
    provider: string;
    providerPlaceId: string;
    name: string;
    formatted?: string | null;
    categories: string[];
    isVenue: boolean;
}

export interface TourSummary {
    id: string;
    name: string;
}

export interface Tour {
    id: string;
    userId: string;
    name: string;
    artistIds: string[];
    artists: GigArtistSummary[];
    startDate?: string;
    endDate?: string;
    gigCount: number;
    createdAt: Date | string;
    updatedAt: Date | string;
}

export interface GigQueryParams {
    userId: string;
    artistId?: string;
    from?: string;
    to?: string;
    q?: string;
}

export interface CreateGigDTO {
    artistIds: string[];
    tourId?: string | null;
    newTourName?: string;
    gigName?: string | null;
    venueName?: string | null;
    placeLocationId?: string | null;
    location: Location;
    date: string;
    time?: string | null;
    timezone?: string | null;
    externalSource?: string | null;
    externalId?: string | null;
    externalArtistId?: string | null;
    externalUrl?: string;
    importedAt?: string;
    lastSyncedAt?: string;
    rawExternalData?: unknown;
}

export interface UpdateGigDTO {
    artistIds?: string[];
    tourId?: string | null;
    newTourName?: string;
    gigName?: string | null;
    venueName?: string | null;
    placeLocationId?: string | null;
    location?: Location;
    date?: string;
    time?: string | null;
    timezone?: string | null;
    externalSource?: string | null;
    externalId?: string | null;
    externalArtistId?: string | null;
    externalUrl?: string;
    importedAt?: string;
    lastSyncedAt?: string;
    rawExternalData?: unknown;
}

export interface StoreGigDTO extends CreateGigDTO {
    userId: string;
    locationCityId?: string | null;
    displayCoordinates: Coordinates;
}

export interface UpdateStoreGigDTO extends UpdateGigDTO {
    userId?: string;
    locationCityId?: string | null;
    displayCoordinates?: Coordinates;
}

export interface CreateTourDTO {
    name: string;
    artistIds?: string[];
    gigIds?: string[];
}

export interface UpdateTourDTO {
    name?: string;
    artistIds?: string[];
    gigIds?: string[];
}

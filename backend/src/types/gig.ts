import type { Location, Coordinates, CropArea } from './artist';
import type { LocalizedChain } from './city';

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
    venueName?: string;
    location: GigLocation;
    locationCityId: string;
    displayCoordinates: Coordinates;
    date: string;
    timezone?: string;
    externalSource?: string;
    externalId?: string;
    externalArtistId?: string;
    externalUrl?: string;
    importedAt?: Date | string;
    lastSyncedAt?: Date | string;
    rawExternalData?: unknown;
    createdAt: Date | string;
    updatedAt: Date | string;
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
    venueName?: string;
    location: Location;
    date: string;
    timezone?: string;
    externalSource?: string;
    externalId?: string;
    externalArtistId?: string;
    externalUrl?: string;
    importedAt?: string;
    lastSyncedAt?: string;
    rawExternalData?: unknown;
}

export interface UpdateGigDTO {
    artistIds?: string[];
    tourId?: string | null;
    newTourName?: string;
    venueName?: string;
    location?: Location;
    date?: string;
    timezone?: string;
    externalSource?: string;
    externalId?: string;
    externalArtistId?: string;
    externalUrl?: string;
    importedAt?: string;
    lastSyncedAt?: string;
    rawExternalData?: unknown;
}

export interface StoreGigDTO extends CreateGigDTO {
    userId: string;
    locationCityId: string;
    displayCoordinates: Coordinates;
}

export interface UpdateStoreGigDTO extends UpdateGigDTO {
    userId?: string;
    locationCityId?: string;
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

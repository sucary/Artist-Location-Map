import type { Artist, Coordinates, CropArea, Location } from './artist';

export interface GigArtistSummary {
    id: string;
    name: string;
    romanizedName?: string;
    sourceImage?: string;
    avatarCrop?: CropArea;
}

export interface Gig {
    id: string;
    userId: string;
    tourId?: string;
    tour?: TourSummary;
    artistIds: string[];
    artist: GigArtistSummary;
    artists: GigArtistSummary[];
    venueName?: string;
    location: Location;
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

export interface GigInput {
    artistIds: string[];
    tourId?: string | null;
    newTourName?: string;
    venueName?: string;
    location: Location;
    date: string;
    timezone?: string;
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

export interface TourInput {
    name: string;
    artistIds?: string[];
    gigIds?: string[];
}

export interface GigQueryParams {
    from?: string;
    to?: string;
    q?: string;
}

export interface TourModeState {
    active: boolean;
    interval: {
        from: string;
        to: string;
    } | null;
    selectedDay: string | null;
}

export type GigMarkerArtist = Artist & {
    gig: Gig;
};

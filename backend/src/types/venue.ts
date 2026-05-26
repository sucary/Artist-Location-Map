import type { Coordinates } from './artist';

// Tour venue and location search result contracts

export type TourSearchSource = 'geoapify' | 'local';

export interface TourLocationSearchResult {
    source: TourSearchSource;
    providerId?: string;
    placeLocationId?: string;
    name: string;
    displayName?: string;
    city: string;
    province: string;
    country?: string;
    countryCode?: string;
    center: Coordinates;
    cityId?: string;
    type?: string;
    categories?: string[];
    isVenue?: boolean;
    venueName?: string;
    isCached?: boolean;
    rawExternalData?: unknown;
}

export interface VenueSearchResult extends TourLocationSearchResult {
    source: 'geoapify';
    providerId: string;
    venueName: string;
}

export interface VenueSearchResponse {
    results: VenueSearchResult[];
    source: 'geoapify' | 'cache';
}

export interface TourLocationSearchResponse {
    results: TourLocationSearchResult[];
    source: 'local' | 'geoapify' | 'cache';
    hasMore: boolean;
}

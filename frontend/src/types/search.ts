import type { LocalizedChain } from './artist';

export interface LocationSearchResult {
    type: 'location';
    id?: string;
    displayName: string;
    locationType?: string;
    center: { lat: number; lng: number };
    isLocal?: boolean;
    osmId: number;
    osmType: string;
    localizedChain?: LocalizedChain;
}

export interface UserSearchResult {
    type: 'user';
    id: string;
    username: string;
}

export type SearchResult = LocationSearchResult | UserSearchResult;

export interface MainSearchResponse {
    locations: LocationSearchResult[];
    users: UserSearchResult[];
    totalCount: number;
    locationSource: 'local' | 'nominatim' | 'cache';
    hasMoreLocations: boolean;
}

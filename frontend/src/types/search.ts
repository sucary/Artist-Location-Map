import type { Artist } from './artist';

export interface ArtistSearchResult {
    type: 'artist';
    artist: Artist;
}

export interface UserSearchResult {
    type: 'user';
    id: string;
    username: string;
}

export type SearchResult = ArtistSearchResult | UserSearchResult;

export interface MainSearchResponse {
    artists: ArtistSearchResult[];
    users: UserSearchResult[];
    totalCount: number;
}

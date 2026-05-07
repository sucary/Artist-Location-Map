import { ArtistStore } from '../models/artistStore';
import type { Artist } from '../types/artist';
import pool from '../config/database';

export interface ArtistSearchResult {
    type: 'artist';
    artist: Artist;
}

export interface UserSearchResult {
    type: 'user';
    id: string;
    username: string;
}

export interface UnifiedSearchResponse {
    artists: ArtistSearchResult[];
    users: UserSearchResult[];
    totalCount: number;
}

async function searchUsers(query: string, limit: number, excludeUsername?: string): Promise<UserSearchResult[]> {
    const params: (string | number)[] = [`%${query}%`, limit];
    let excludeClause = '';

    if (excludeUsername) {
        excludeClause = 'AND username != $3';
        params.push(excludeUsername);
    }

    const result = await pool.query(
        `SELECT id, username FROM profiles
         WHERE username IS NOT NULL
           AND is_private = false
           AND username ILIKE $1
           ${excludeClause}
         ORDER BY username
         LIMIT $2`,
        params
    );
    return result.rows.map((row: any) => ({
        type: 'user' as const,
        id: row.id,
        username: row.username,
    }));
}

export const SearchService = {
    search: async (
        query: string,
        limit: number = 10,
        artistUserId?: string,
        excludeUsername?: string
    ): Promise<UnifiedSearchResponse> => {
        const [artists, users] = await Promise.all([
            artistUserId ? ArtistStore.searchForMap(query, artistUserId, limit) : Promise.resolve([]),
            searchUsers(query, limit, excludeUsername),
        ]);

        const artistResults: ArtistSearchResult[] = artists.map((artist) => ({
            type: 'artist' as const,
            artist,
        }));

        return {
            artists: artistResults,
            users,
            totalCount: artistResults.length + users.length,
        };
    },
};

import { TextSearch, type LocationLanguage } from './searchHelper';
import type { LocalizedChain } from '../types/city';
import pool from '../config/database';

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

export interface UnifiedSearchResponse {
    locations: LocationSearchResult[];
    users: UserSearchResult[];
    totalCount: number;
    locationSource: 'local' | 'nominatim' | 'cache';
    hasMoreLocations: boolean;
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
        source: 'auto' | 'nominatim' = 'auto',
        excludeUsername?: string,
        lang?: LocationLanguage
    ): Promise<UnifiedSearchResponse> => {
        // Execute all searches in parallel
        const [locationResponse, users] = await Promise.all([
            TextSearch.search(query, limit, source, lang),
            searchUsers(query, limit, excludeUsername),
        ]);

        const locationResults: LocationSearchResult[] = locationResponse.results
            .slice(0, limit)
            .map((loc) => {
                const r = loc as Record<string, unknown>;
                const center = r.center as { lat: number; lng: number } | undefined;

                const chain = r.localizedChain as LocalizedChain | undefined;
                return {
                    type: 'location' as const,
                    id: loc.id,
                    displayName: (r.displayName as string) || (r.name as string) || 'Unknown',
                    locationType: r.type as string | undefined,
                    center: {
                        lat: (r.lat as number) ?? center?.lat ?? 0,
                        lng: (r.lng as number) ?? center?.lng ?? 0,
                    },
                    isLocal: loc.isLocal,
                    osmId: loc.osmId,
                    osmType: loc.osmType,
                    ...(chain?.city ? { localizedChain: chain } : {}),
                };
            });

        return {
            locations: locationResults,
            users,
            totalCount: locationResults.length + users.length,
            locationSource: locationResponse.source,
            hasMoreLocations: locationResponse.hasMore,
        };
    },
};

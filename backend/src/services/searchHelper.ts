import { CityService } from './cityService';
import { SearchCacheService } from './searchCacheService';
import { LocationLocalizationService } from './locationLocalizationService';
import pool from '../config/database';

export type LocationLanguage = 'en' | 'zhHans' | 'zhHant' | 'ja' | 'native';
export const VALID_LANGS = new Set<LocationLanguage>(['en', 'zhHans', 'zhHant', 'ja', 'native']);

export interface SearchResult {
    osmId: number;
    osmType: string;
    isLocal: boolean;
    id?: string;
    clickedCoordinates?: { lat: number; lng: number };
    [key: string]: unknown;
}

/** Map LocationLanguage to accept-language header value */
const LANG_TO_ACCEPT_LANGUAGE: Record<LocationLanguage, string | null> = {
    en: 'en',
    ja: 'ja',
    zhHans: 'zh-CN',
    zhHant: 'zh-TW',
    native: null,
};

export interface SearchResponse {
    results: SearchResult[];
    source: 'local' | 'nominatim' | 'cache';
    hasMore: boolean;
}

/**
 * Deduplicate results by osmId:osmType key
 */
export function deduplicateResults<T extends { osmId: number; osmType: string }>(
    results: T[]
): T[] {
    const seen = new Set<string>();
    const unique: T[] = [];

    for (const result of results) {
        const key = `${String(result.osmId)}:${result.osmType}`;
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(result);
        }
    }

    return unique;
}

function normalizeSearchQuery(query: string): string {
    return query.trim().toLowerCase().replace(/\s+/g, '');
}

async function getSuppressedResultKeys(query: string): Promise<Set<string> | null> {
    const normalizedQuery = normalizeSearchQuery(query);
    if (!normalizedQuery) return null;

    const result = await pool.query<{
        suppressed_osm_id: string;
        suppressed_osm_type: string;
    }>(`
        SELECT suppressed_osm_id, suppressed_osm_type
        FROM location_search_suppressions
        WHERE normalized_query = $1
    `, [normalizedQuery]);

    if (result.rows.length === 0) return null;

    return new Set(result.rows.map((row) => (
        `${String(row.suppressed_osm_id)}:${row.suppressed_osm_type}`
    )));
}

async function suppressSearchResults<T extends { osmId: number; osmType: string }>(
    query: string,
    results: T[]
): Promise<T[]> {
    const suppressedKeys = await getSuppressedResultKeys(query);
    if (!suppressedKeys) return results;

    return results.filter((result) => (
        !suppressedKeys.has(`${String(result.osmId)}:${result.osmType}`)
    ));
}


/**
 * Text search helpers
 */
export const TextSearch = {
    async getLocalResults(query: string, limit: number): Promise<SearchResult[]> {
        const [priorityResults, localResults] = await Promise.all([
            CityService.getPriorityLocations(query),
            CityService.searchLocal(query, limit)
        ]);

        const combined = [
            ...priorityResults.map(r => ({ ...r, isLocal: true })),
            ...localResults.map(r => ({ ...r, isLocal: true }))
        ];

        return suppressSearchResults(query, deduplicateResults(combined));
    },

    async getNominatimResults(query: string, limit: number, lang?: LocationLanguage): Promise<{ results: SearchResult[]; fromCache: boolean }> {
        const acceptLang = lang ? LANG_TO_ACCEPT_LANGUAGE[lang] : null;

        let results = await SearchCacheService.get(query, acceptLang ?? undefined);
        const fromCache = results !== null;

        if (!results) {
            console.log(`[SEARCH] Cache miss for: "${query}"${acceptLang ? ` (lang: ${acceptLang})` : ''} - calling geocoding API`);
            results = await CityService.searchNominatim(query, limit, acceptLang ?? undefined);

            SearchCacheService.set(query, results, acceptLang ?? undefined).catch(err => {
                console.error('Failed to cache search results:', err);
            });
        } else {
            console.log(`[SEARCH] Cache hit for: "${query}"${acceptLang ? ` (lang: ${acceptLang})` : ''} (${results.length} results)`);
        }

        // Filter to only place/boundary results — exclude nodes (no polygon) and infrastructure (railway, building, etc.)
        const nonPlaceClasses = new Set(['railway', 'building', 'aeroway', 'highway']);
        const filtered = results.filter(r =>
            (r.type as string)?.toLowerCase() !== 'yes'
            && r.osmType !== 'node'
            && !nonPlaceClasses.has(r.class as string)
        );

        // Cross-reference with local DB to set isLocal flag
        const osmPairs = filtered.map(r => ({ osmId: r.osmId, osmType: r.osmType }));
        const existingMap = await CityService.getExistingOsmIds(osmPairs);

        const withFlags = filtered.map(r => {
            const key = `${String(r.osmId)}:${r.osmType}`;
            const existing = existingMap.get(key);

            return {
                ...r,
                osmId: Number(r.osmId),
                id: existing?.id,
                isLocal: !!existing,
                ...(existing?.localizedNames?.city ? { localizedChain: existing.localizedNames } : {}),
            };
        });
        const visibleResults = await suppressSearchResults(query, withFlags);

        // Fire-and-forget: localize DB entries that haven't been localized yet
        for (const [, existing] of existingMap) {
            if (existing.id && !existing.localizedNames) {
                LocationLocalizationService.ensureLocalized(existing.id).catch(() => {});
            }
        }

        return { results: visibleResults, fromCache };
    },

    async search(query: string, limit: number, source: 'auto' | 'local' | 'nominatim', lang?: LocationLanguage): Promise<SearchResponse> {
        if (source === 'local') {
            const localResults = await this.getLocalResults(query, limit);
            return {
                results: localResults.slice(0, limit),
                source: 'local',
                hasMore: true
            };
        }

        if (source === 'nominatim') {
            const [localResults, nominatimData] = await Promise.all([
                this.getLocalResults(query, limit),
                this.getNominatimResults(query, limit, lang)
            ]);

            const combined = deduplicateResults([...localResults, ...nominatimData.results]);

            return {
                results: combined.slice(0, limit),
                source: nominatimData.fromCache ? 'cache' : 'nominatim',
                hasMore: false
            };
        }

        // For translated searches, local DB names are native so local search
        // is inherently incomplete — always fetch both sources in parallel.
        if (lang && lang !== 'native') {
            const [localResults, nominatimData] = await Promise.all([
                this.getLocalResults(query, limit),
                this.getNominatimResults(query, limit, lang)
            ]);

            const combined = deduplicateResults([...localResults, ...nominatimData.results]);

            return {
                results: combined.slice(0, limit),
                source: nominatimData.fromCache ? 'cache' : 'nominatim',
                hasMore: false
            };
        }

        // AUTO (native): Local first, Nominatim if empty
        const localResults = await this.getLocalResults(query, limit);

        if (localResults.length > 0) {
            // Show "more" if not cached OR if cache has more results than local
            const cachedCount = await SearchCacheService.getResultCount(query);
            const hasMore = cachedCount === null || cachedCount > localResults.length;

            return {
                results: localResults.slice(0, limit),
                source: 'local',
                hasMore
            };
        }

        const nominatimData = await this.getNominatimResults(query, limit, lang);
        return {
            results: nominatimData.results.slice(0, limit),
            source: nominatimData.fromCache ? 'cache' : 'nominatim',
            hasMore: false
        };
    }
};

/**
 * Reverse search helpers
 */
export const ReverseSearch = {
    async getLocalResults(lat: number, lng: number, limit: number): Promise<SearchResult[]> {
        const localResults = await CityService.reverseGeocodeAll(lat, lng, limit);
        return localResults.map(r => ({
            ...r,
            isLocal: true,
            clickedCoordinates: { lat, lng }
        }));
    },

    async getOverpassResults(lat: number, lng: number): Promise<SearchResult[]> {
        // Get all administrative boundaries containing this point in ONE call
        const boundaries = await CityService.getContainingBoundaries(lat, lng);

        // If Overpass failed, fall back to Nominatim reverse geocode
        if (boundaries.length === 0) {
            const nominatimResult = await CityService.reverseGeocodeNominatim(lat, lng);
            if (nominatimResult) {
                // Fetch and save boundary data
                CityService.fetchByOsmId(nominatimResult.osmId, nominatimResult.osmType)
                    .then(fullData => {
                        if (fullData) return CityService.saveFromNominatim(fullData);
                    })
                    .catch(() => {});

                return [{
                    ...nominatimResult,
                    isLocal: false,
                    clickedCoordinates: { lat, lng }
                }];
            }
            return [];
        }

        // Convert to SearchResult format and save boundaries to DB
        const results: SearchResult[] = [];

        for (const boundary of boundaries) {
            results.push({
                ...boundary,
                isLocal: false,
                clickedCoordinates: { lat, lng }
            });

            // Fetch and save full boundary polygon data (fire-and-forget)
            CityService.fetchByOsmId(boundary.osmId, boundary.osmType)
                .then(fullData => {
                    if (fullData) {
                        return CityService.saveFromNominatim(fullData);
                    }
                })
                .catch(() => {});
        }

        return results;
    },

    async search(lat: number, lng: number, limit: number, source: 'auto' | 'nominatim'): Promise<SearchResponse> {
        // Get local results (from DB) and Overpass results (all admin boundaries) in parallel
        const [localResults, overpassResults] = await Promise.all([
            source === 'nominatim' ? Promise.resolve([]) : this.getLocalResults(lat, lng, limit),
            this.getOverpassResults(lat, lng)
        ]);

        const allResults = [...localResults, ...overpassResults];
        const deduplicated = deduplicateResults(allResults).slice(0, limit);

        if (deduplicated.length > 0) {
            return {
                results: deduplicated,
                source: overpassResults.length > 0 ? 'nominatim' : 'local',
                hasMore: false
            };
        }

        return {
            results: [],
            source: 'local',
            hasMore: false
        };
    }
};

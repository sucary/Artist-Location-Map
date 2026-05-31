import pool from '../config/database';
import { City, LocalizedChain, LocalizedLocation, NominatimResponse, NominatimSearchResult } from '../types/city';
import { applyLocationDisplayOverride, getLocationDisplayOverride } from './locationDisplayOverrides';
import { nominatimLimiter } from './nominatimRateLimiter';

// City lookup and geometry persistence services

// Geocoding API configuration (LocationIQ - Nominatim-compatible)
const GEOCODING_API_BASE = 'https://us1.locationiq.com/v1';
const GEOCODING_API_KEY = process.env.LOCATIONIQ_API_KEY;
const NOMINATIM_HEADERS = { 'User-Agent': 'ArtistLocationMap/1.0' };

interface CityRow {
    id: string;
    name: string;
    province: string;
    country: string | null;
    display_name?: string | null;
    osm_id: string | number;
    osm_type: string;
    type?: string;
    class?: string;
    importance?: string | number | null;
    boundary?: City['boundary'] | null;
    raw_boundary?: City['rawBoundary'] | null;
    lat: string | number;
    lng: string | number;
    cb_lat?: string | number | null;
    cb_lng?: string | number | null;
    localized_names?: LocalizedChain | string | null;
    last_updated?: Date | string;
    needs_refresh?: boolean;
}

/**
 * Get display type for a location
 */
function getDisplayType(type: string, addresstype?: string, address?: Record<string, string>, name?: string): string {
    // If addresstype is provided (standard Nominatim), use it
    if (type === 'administrative' && addresstype) {
        return addresstype;
    }

    // Infer type from address object (for LocationIQ)
    if (type === 'administrative' && address && name) {
        const nameLower = name.toLowerCase();

        // Check which address field matches the location name
        // Order matters: more specific types first
        const typeMapping: [string, string][] = [
            ['village', 'village'],
            ['town', 'town'],
            ['city', 'city'],
            ['municipality', 'municipality'],
            ['county', 'county'],
            ['state_district', 'district'],
            ['state', 'state'],
            ['province', 'province'],
            ['region', 'region'],
            ['country', 'country'],
        ];

        for (const [addressKey, displayType] of typeMapping) {
            const addressValue = address[addressKey];
            if (addressValue && addressValue.toLowerCase().includes(nameLower)) {
                return displayType;
            }
        }

        // If name not found in address, check if any key exists as a hint
        for (const [addressKey, displayType] of typeMapping) {
            if (address[addressKey]) {
                return displayType;
            }
        }
    }

    return type;
}

/**
 * Parse localized_names which may be stored as a JSON string or object
 */
export function parseLocalizedNames<T = unknown>(raw: string | T | null | undefined): T | null {
    return typeof raw === 'string' ? JSON.parse(raw) as T : raw ?? null;
}

/**
 * Map a database row to a City object
 */
function rowToCity(row: CityRow): City {
    return {
        id: row.id,
        name: row.name,
        province: row.province,
        country: row.country,
        displayName: row.display_name ?? undefined,
        center: { lat: parseFloat(String(row.lat)), lng: parseFloat(String(row.lng)) },
        osmId: parseInt(String(row.osm_id), 10),
        osmType: row.osm_type,
        type: row.type,
        class: row.class,
        importance: row.importance === null || row.importance === undefined ? undefined : Number(row.importance),
        ...(row.boundary ? { boundary: row.boundary } : {}),
        ...(row.raw_boundary ? { rawBoundary: row.raw_boundary } : {}),
        ...(row.last_updated !== undefined ? { lastUpdated: row.last_updated } : {}),
        ...(row.needs_refresh !== undefined ? { needsRefresh: row.needs_refresh } : {}),
    };
}

/**
 * Query a single location with full details
 */
async function queryOneLocation(whereClause: string, params: unknown[]): Promise<City | null> {
    const result = await pool.query<CityRow>(`
        SELECT
            id, name, province, country,
            display_name, osm_id, osm_type, type, class, importance,
            ST_AsGeoJSON(boundary)::json as boundary,
            ST_AsGeoJSON(raw_boundary)::json as raw_boundary,
            ST_Y(center::geometry) as lat,
            ST_X(center::geometry) as lng,
            last_updated, needs_refresh
        FROM locations
        WHERE ${whereClause}
    `, params);

    if (result.rows.length === 0) return null;
    return rowToCity(result.rows[0]);
}

export const CityService = {

    /**
     * Search cities in local DB with fuzzy matching
     */
    searchLocal: async (query: string, limit: number = 20): Promise<City[]> => {
        const result = await pool.query<CityRow>(`
            SELECT
                id, name, province, country, display_name,
                osm_id, osm_type, type, class, importance,
                ST_Y(center::geometry) as lat,
                ST_X(center::geometry) as lng,
                localized_names
            FROM locations
            WHERE
                name IS NOT NULL AND name != ''
                AND center IS NOT NULL
                AND (
                    name ILIKE $1
                    OR province ILIKE $1
                    OR display_name ILIKE $1
                    OR localized_names::text ILIKE $1
                )
            ORDER BY
                -- Prioritize exact name matches first
                CASE WHEN LOWER(name) = LOWER($2) THEN 0 ELSE 1 END,
                -- Then prioritize name starts with query
                CASE WHEN LOWER(name) LIKE LOWER($2) || '%' THEN 0 ELSE 1 END,
                -- Then prioritize city/town/administrative types over small POIs
                CASE
                    WHEN type IN ('city', 'town', 'administrative', 'village', 'municipality', 'county', 'state', 'province', 'region') THEN 0
                    WHEN type IN ('suburb', 'neighbourhood', 'district') THEN 1
                    ELSE 2
                END,
                -- Then by importance (higher is better for cities)
                importance DESC NULLS LAST,
                -- Finally by area for same importance level
                ST_Area(boundary::geometry) DESC
            LIMIT $3
        `, [`%${query}%`, query, limit]);

        return result.rows.map((row) => {
            const ln = parseLocalizedNames<LocalizedChain>(row.localized_names);
            return {
                ...rowToCity(row),
                ...(ln?.city ? { localizedChain: ln } : {}),
            };
        });
    },

    /**
     * Get priority locations for a query
     */
    getPriorityLocations: async (query: string): Promise<City[]> => {
        const result = await pool.query<CityRow>(`
            SELECT
                cb.id,
                pl.name,
                pl.province,
                pl.country,
                pl.display_name,
                pl.osm_id,
                pl.osm_type,
                pl.lat,
                pl.lng,
                pl.rank,
                cb.type,
                cb.class,
                cb.importance,
                cb.localized_names,
                ST_Y(cb.center::geometry) as cb_lat,
                ST_X(cb.center::geometry) as cb_lng
            FROM priority_locations pl
            LEFT JOIN locations cb ON cb.osm_id = pl.osm_id AND cb.osm_type = pl.osm_type
            WHERE pl.search_query = LOWER($1)
            ORDER BY pl.rank ASC
        `, [query]);

        return result.rows.map((row) => {
            const ln = parseLocalizedNames<LocalizedChain>(row.localized_names);
            // Use locations center if available, otherwise fall back to priority_locations coords
            const center = row.cb_lat !== null && row.cb_lat !== undefined && row.cb_lng !== null && row.cb_lng !== undefined
                ? { lat: parseFloat(String(row.cb_lat)), lng: parseFloat(String(row.cb_lng)) }
                : { lat: parseFloat(String(row.lat)), lng: parseFloat(String(row.lng)) };
            return {
                ...rowToCity(row),
                center,
                isPriority: true,
                ...(ln?.city ? { localizedChain: ln } : {}),
            };
        });
    },

    /**
     * Search cities via Nominatim API
     */
    searchNominatim: async (query: string, limit: number = 20, acceptLanguage?: string): Promise<NominatimSearchResult[]> => {
        const params = new URLSearchParams({
            q: query,
            format: 'json',
            addressdetails: '1',
            limit: String(limit),
            polygon_geojson: '1',
            dedupe: '0'
        });

        const url = `${GEOCODING_API_BASE}/search?${params.toString()}&key=${GEOCODING_API_KEY}`;

        console.log(`[GEOCODING] Calling API for: "${query}"${acceptLanguage ? ` (lang: ${acceptLanguage})` : ''}`);

        try {
            const headers: Record<string, string> = { ...NOMINATIM_HEADERS };
            if (acceptLanguage) {
                headers['accept-language'] = acceptLanguage;
            }

            // Use global rate limiter to ensure 1 req/sec across all users
            const response = await nominatimLimiter.enqueue(() =>
                fetch(url, { headers })
            );

            // Handle rate limit - throw specific error
            if (response.status === 429) {
                console.error('[GEOCODING] Rate limit exceeded (429) - Too many requests');
                throw new Error('Rate limit exceeded. Please try again in a few minutes.');
            }

            if (!response.ok) {
                console.error(`[GEOCODING] API error: ${response.status} ${response.statusText}`);
                throw new Error(`Location search service error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json() as NominatimResponse[];

            console.log(`[GEOCODING] Received ${data.length} results for: "${query}"`);

            // Debug: Check type inference
            if (data.length > 0) {
                const firstItem = data[0];
                const name = firstItem.name || firstItem.display_name.split(',')[0].trim();
                const inferredType = getDisplayType(firstItem.type, firstItem.addresstype, firstItem.address as Record<string, string>, name);
                console.log(`[GEOCODING] First result - raw type: "${firstItem.type}", inferred: "${inferredType}", name: "${name}"`);
            }

            // Save all results to locations in the background.
            // ON CONFLICT (osm_id, osm_type) prevents overwriting existing native entries.
            (async () => {
                for (const item of data) {
                    // Only save administrative/place results — skip natural features, POIs, etc.
                    const placeClasses = new Set(['boundary', 'place']);
                    if (!placeClasses.has(item.class)) continue;
                    try {
                        if (item.geojson) {
                            console.log(`[GEOCODING] Saving ${item.name} (${item.osm_type}/${item.osm_id}) - has geojson`);
                            await CityService.saveFromNominatim(item);
                        } else {
                            console.log(`[GEOCODING] Fetching boundary for ${item.name} (${item.osm_type}/${item.osm_id}) via lookup`);
                            const fullData = await CityService.fetchByOsmId(item.osm_id, item.osm_type);
                            console.log(`[GEOCODING] Lookup result for ${item.name}: ${fullData ? 'found' : 'not found'}${fullData?.geojson ? ' (with geojson)' : ''}`);
                            if (fullData) await CityService.saveFromNominatim(fullData);
                        }
                    } catch (err: unknown) {
                        const message = err instanceof Error ? err.message : String(err);
                        console.error(`[GEOCODING] Background save failed for ${item.name} (${item.osm_type}/${item.osm_id}):`, message);
                    }
                }
            })();

            return data.map(item => {
                // Extract name from display_name (first part before comma) or use name field
                const name = item.name || item.display_name.split(',')[0].trim();
                return {
                    name,
                    displayName: item.display_name,
                    osmId: Number(item.osm_id),
                    osmType: item.osm_type,
                    lat: parseFloat(item.lat),
                    lng: parseFloat(item.lon),
                    type: getDisplayType(item.type, item.addresstype, item.address as Record<string, string>, name),
                    class: item.class,
                    importance: item.importance,
                    address: item.address as Record<string, string>,
                    boundingBox: item.boundingbox.map(parseFloat)
                };
            });
        } catch (error) {
            console.error('Error searching Nominatim:', error);
            throw error;
        }
    },

    /**
     * Fetch city by OSM ID from DB
     */
    getByOsmId: async (osmId: number, osmType: string): Promise<City | null> => {
        return queryOneLocation('osm_id = $1 AND osm_type = $2', [osmId, osmType]);
    },

    /**
     * Check which OSM IDs already exist in local DB (for cross-referencing Nominatim results)
     */
    getExistingOsmIds: async (osmPairs: Array<{ osmId: number; osmType: string }>): Promise<Map<string, { id: string; localizedNames: LocalizedChain | null }>> => {
        if (osmPairs.length === 0) return new Map();

        const conditions = osmPairs.map((_, i) => `(osm_id = $${i * 2 + 1} AND osm_type = $${i * 2 + 2})`).join(' OR ');
        const params = osmPairs.flatMap(p => [String(p.osmId), p.osmType]);

        const result = await pool.query<{
            osm_id: string | number;
            osm_type: string;
            id: string;
            localized_names: LocalizedChain | string | null;
        }>(`
            SELECT osm_id, osm_type, id, localized_names FROM locations WHERE ${conditions}
        `, params);

        const map = new Map<string, { id: string; localizedNames: LocalizedChain | null }>();
        for (const row of result.rows) {
            map.set(`${String(row.osm_id)}:${row.osm_type}`, { id: row.id, localizedNames: parseLocalizedNames<LocalizedChain>(row.localized_names) });
        }
        return map;
    },

    /**
     * Fetch full city data from Nominatim by OSM ID (includes boundary)
     */
    fetchByOsmId: async (osmId: number, osmType: string): Promise<NominatimResponse | null> => {
        // Format: "R123" for relation, "W123" for way, "N123" for node
        const osmTypePrefix = osmType.charAt(0).toUpperCase();
        const osmIds = `${osmTypePrefix}${osmId}`;

        const params = new URLSearchParams({
            osm_ids: osmIds,
            format: 'json',
            polygon_geojson: '1',
            addressdetails: '1'
        });

        const url = `${GEOCODING_API_BASE}/lookup?${params.toString()}&key=${GEOCODING_API_KEY}`;

        try {
            // Use global rate limiter to ensure 1 req/sec across all users
            const response = await nominatimLimiter.enqueue(() =>
                fetch(url, {
                    headers: NOMINATIM_HEADERS
                })
            );

            if (!response.ok) {
                throw new Error(`Geocoding API error: ${response.statusText}`);
            }

            const data = await response.json() as NominatimResponse[];
            return data.length > 0 ? data[0] : null;
        } catch (error) {
            console.error('Error fetching from Nominatim by OSM ID:', error);
            return null;
        }
    },

    /**
     * Fetch a city with its polygon boundary from Nominatim
     */
    fetchCityWithBoundary: async (cityName: string, province: string, country: string): Promise<NominatimResponse | null> => {
        const query = [cityName, province, country].filter(Boolean).join(', ');
        const params = new URLSearchParams({
            q: query,
            format: 'json',
            polygon_geojson: '1',
            addressdetails: '1',
            limit: '5'
        });

        const url = `${GEOCODING_API_BASE}/search?${params.toString()}&key=${GEOCODING_API_KEY}`;
        console.log('Fetching parent city boundary:', url);

        try {
            // Use global rate limiter to ensure 1 req/sec across all users
            const response = await nominatimLimiter.enqueue(() =>
                fetch(url, {
                    headers: NOMINATIM_HEADERS
                })
            );

            if (!response.ok) {
                throw new Error(`Geocoding API error: ${response.statusText}`);
            }

            const data = await response.json() as NominatimResponse[];

            // Find a result that has a proper polygon boundary (not a Point)
            for (const result of data) {
                if (result.geojson && result.geojson.type !== 'Point') {
                    console.log('Found parent city with boundary:', result.display_name, result.geojson.type);
                    return result;
                }
            }

            console.log('No parent city with polygon boundary found');
            return null;
        } catch (error) {
            console.error('Error fetching city with boundary:', error);
            return null;
        }
    },

    /**
     * Save city from Nominatim data
     */
    saveFromNominatim: async (data: NominatimResponse): Promise<City> => {
        data = applyLocationDisplayOverride(data);
        const geoType: string | null = data.geojson?.type ?? null;

        // For Point/LineString geometries, try to fetch the parent city's actual boundary.
        if (geoType === 'Point' || geoType === 'LineString' || geoType === 'MultiLineString') {
            const parentCityName = data.address?.city || data.address?.town || data.address?.village;
            if (parentCityName) {
                const parentProvince = data.address?.state || data.address?.province || data.address?.region || '';
                const parentCountry = data.address?.country || '';

                console.log(`${geoType} geometry detected. Looking for parent city: ${parentCityName}, ${parentProvince}, ${parentCountry}`);

                const parentCityData = await CityService.fetchCityWithBoundary(parentCityName, parentProvince, parentCountry);
                if (parentCityData) {
                    console.log('Using parent city boundary instead of', geoType);
                    // Recursively save the parent city (which has a real boundary)
                    return await CityService.saveFromNominatim(parentCityData);
                }
            }
        }

        const city = data.name
                  || data.display_name?.split(',')[0]?.trim()
                  || data.address?.city
                  || data.address?.administrative
                  || data.address?.town
                  || data.address?.village
                  || 'Unknown';

        // Extract province - try address fields first, then parse from displayName
        let province = data.address?.state || data.address?.province || data.address?.region;
        if (!province && data.display_name) {
            const parts = data.display_name.split(',').map(p => p.trim());
            const country = data.address?.country;
            if (parts.length >= 3 && country) {
                const countryIndex = parts.findIndex(p => p === country);
                if (countryIndex >= 2) {
                    for (let i = countryIndex - 1; i >= 0; i--) {
                        const part = parts[i];
                        if (!part.match(/^\d/) && !part.match(/\d{3,}/)) {
                            province = part;
                            break;
                        }
                    }
                }
            }
        }
        province = province || 'Unknown';
        const country = data.address?.country || 'Unknown';
        const displayOverride = getLocationDisplayOverride(data.osm_id, data.osm_type);

        // Disambiguate name+province when a different osm entity already
        const locationType = getDisplayType(data.type, data.addresstype, data.address as Record<string, string>, city);
        const nameCollision = await pool.query(
            `SELECT osm_id FROM locations WHERE name = $1 AND province = $2 LIMIT 1`,
            [city, province]
        );
        if (nameCollision.rows.length > 0 && String(nameCollision.rows[0].osm_id) !== String(data.osm_id)) {
            // Another entity owns this name+province — append type to province
            province = `${province} [${locationType}]`;
        }

        // Check if this exact location already exists
        // Real placement boundary, not point-derived fallback geometry
        const existingCheck = data.osm_id
            ? await pool.query(`
                SELECT id, name, province, country, osm_id, osm_type,
                       ST_Y(center::geometry) as lat,
                       ST_X(center::geometry) as lng,
                       boundary IS NOT NULL
                           AND NOT ST_IsEmpty(boundary::geometry)
                           AND ST_Area(boundary) >= 1000000 as has_boundary
                FROM locations
                WHERE osm_id = $1 AND osm_type = $2
                LIMIT 1
            `, [data.osm_id, data.osm_type])
            : await pool.query(`
                SELECT id, name, province, country, osm_id, osm_type,
                       ST_Y(center::geometry) as lat,
                       ST_X(center::geometry) as lng,
                       boundary IS NOT NULL
                           AND NOT ST_IsEmpty(boundary::geometry)
                           AND ST_Area(boundary) >= 1000000 as has_boundary
                FROM locations
                WHERE name = $1 AND province = $2
                LIMIT 1
            `, [city, province]);

        if (existingCheck.rows.length > 0 && existingCheck.rows[0].has_boundary) {
            return rowToCity(existingCheck.rows[0]);
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            if (!data.geojson) {
                throw new Error('No geojson data from Nominatim');
            }

            const geometry = data.geojson;
            const geometryType = geometry.type as string;

            // LineString/MultiLineString are handled before pool.connect() above.
            if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
                throw new Error(`Unsupported geometry type: ${geometryType}`);
            }

            // Convert all geometries to MultiPolygon format for database consistency
            let geojson: { type: 'MultiPolygon'; coordinates: number[][][][] };

            if (geometry.type === 'Polygon') {
                // Wrap Polygon in MultiPolygon structure
                geojson = {
                    type: 'MultiPolygon',
                    coordinates: [geometry.coordinates]
                };
            } else if (geometry.type === 'Point') {
                // Fallback: create a small square polygon if no parent city found
                const [lng, lat] = geometry.coordinates;
                const offset = 0.001;
                geojson = {
                    type: 'MultiPolygon',
                    coordinates: [[[
                        [lng - offset, lat - offset],
                        [lng + offset, lat - offset],
                        [lng + offset, lat + offset],
                        [lng - offset, lat + offset],
                        [lng - offset, lat - offset]
                    ]]]
                };
            } else {
                // MultiPolygon - use as-is
                geojson = geometry;
            }

            console.log('Original geojson type:', geometry.type);
            console.log('Converted to:', geojson.type);
            console.log('Processed geojson:', JSON.stringify(geojson).substring(0, 200));

            const result = await client.query(`
                INSERT INTO locations (
                    name, province, country,
                    display_name, osm_id, osm_type, type, class, importance,
                    bounding_box, address_components, localized_names,
                    boundary, raw_boundary, center
                ) VALUES (
                    $1, $2, $3,
                    $4, $5, $6, $7, $8, $9,
                    $10, $11, $12,
                    ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON($13)), 4326)::geography,
                    ST_SetSRID(ST_Force2D(ST_GeomFromGeoJSON($13)), 4326)::geography,
                    ST_SetSRID(ST_MakePoint($14, $15), 4326)::geography
                )
                ON CONFLICT (osm_id, osm_type) DO UPDATE SET
                    name = EXCLUDED.name,
                    province = EXCLUDED.province,
                    country = EXCLUDED.country,
                    type = EXCLUDED.type,
                    class = EXCLUDED.class,
                    importance = EXCLUDED.importance,
                    display_name = EXCLUDED.display_name,
                    bounding_box = EXCLUDED.bounding_box,
                    address_components = EXCLUDED.address_components,
                    localized_names = COALESCE(EXCLUDED.localized_names, locations.localized_names),
                    boundary = EXCLUDED.boundary,
                    raw_boundary = EXCLUDED.raw_boundary,
                    center = EXCLUDED.center,
                    last_updated = NOW()
                RETURNING id
            `, [
                city,
                province,
                country,
                data.display_name,
                data.osm_id,
                data.osm_type,
                getDisplayType(data.type, data.addresstype, data.address as Record<string, string>, city),
                data.class,
                data.importance,
                data.boundingbox,
                JSON.stringify(data.address),
                displayOverride ? JSON.stringify(displayOverride.localizedNames) : null,
                JSON.stringify(geojson),
                parseFloat(data.lon),
                parseFloat(data.lat)
            ]);

            const cityId = result.rows[0].id;

            // Remove ocean areas (existing logic)
            await client.query(`
                UPDATE locations
                SET
                    boundary = COALESCE(
                        ST_Multi(
                            ST_Difference(
                                boundary::geometry,
                                (
                                    SELECT ST_Union(geom::geometry)
                                    FROM water_polygons
                                    WHERE ST_Intersects(locations.boundary::geometry, water_polygons.geom::geometry)
                                )
                            )
                        )::geography,
                        boundary
                    ),
                    center = CASE
                        WHEN (
                            SELECT COUNT(*)
                            FROM water_polygons
                            WHERE ST_Intersects(locations.boundary::geometry, water_polygons.geom::geometry)
                        ) > 0
                        THEN ST_PointOnSurface(
                            COALESCE(
                                ST_Multi(
                                    ST_Difference(
                                        boundary::geometry,
                                        (
                                            SELECT ST_Union(geom::geometry)
                                            FROM water_polygons
                                            WHERE ST_Intersects(locations.boundary::geometry, water_polygons.geom::geometry)
                                        )
                                    )
                                ),
                                boundary::geometry
                            )
                        )::geography
                        ELSE center
                    END
                WHERE id = $1
            `, [cityId]);

            await client.query('COMMIT');

            // Fetch and return the updated city
            const savedCity = await CityService.getById(cityId);
            if (!savedCity) {
                throw new Error('Failed to fetch saved city');
            }
            return savedCity;
        } catch (error) {
            await client.query('ROLLBACK');

            // Handle duplicate key error (race condition) - return existing city
            const pgError = error as { code?: string; constraint?: string };
            if (pgError.code === '23505' && pgError.constraint === 'uq_location_province') {
                console.log('Race condition: city already exists, fetching existing');
                const existing = await pool.query(`
                    SELECT id, name, province, country, osm_id, osm_type,
                           ST_Y(center::geometry) as lat,
                           ST_X(center::geometry) as lng
                    FROM locations
                    WHERE name = $1 AND province = $2
                    LIMIT 1
                `, [city, province]);

                if (existing.rows.length > 0) {
                    return rowToCity(existing.rows[0]);
                }
            }

            console.error('Error saving city from Nominatim:', error);
            throw error;
        } finally {
            client.release();
        }
    },

    /**
     * Get all local boundaries containing the given coordinates
     * Returns multiple results ordered by area (smallest/most specific first)
     */
    reverseGeocodeAll: async (lat: number, lng: number, limit: number = 10): Promise<City[]> => {
        const result = await pool.query(`
            SELECT
                id, name, province, country, display_name,
                osm_id, osm_type, type, class, importance,
                ST_Y(center::geometry) as lat,
                ST_X(center::geometry) as lng
            FROM locations
            WHERE COALESCE(boundary, raw_boundary) IS NOT NULL
              AND ST_Covers(COALESCE(boundary, raw_boundary)::geometry, ST_SetSRID(ST_MakePoint($1, $2), 4326))
            ORDER BY ST_Area(COALESCE(boundary, raw_boundary)::geometry) ASC
            LIMIT $3
        `, [lng, lat, limit]);

        return result.rows.map(rowToCity);
    },

    reverseGeocode: async (lat: number, lng: number): Promise<City | null> => {
        const results = await CityService.reverseGeocodeAll(lat, lng, 1);
        return results[0] ?? await CityService.reverseGeocodeNominatim(lat, lng);
    },

    /**
     * Reverse geocode using Nominatim API only (no local DB check)
     */
    reverseGeocodeNominatim: async (lat: number, lng: number): Promise<City | null> => {
        const params = new URLSearchParams({
            lat: String(lat),
            lon: String(lng),
            format: 'json',
            addressdetails: '1',
            zoom: '18' // Most detailed level to get city/town/village
        });

        const url = `${GEOCODING_API_BASE}/reverse?${params.toString()}&key=${GEOCODING_API_KEY}`;

        try {
            // Use global rate limiter to ensure 1 req/sec across all users
            const response = await nominatimLimiter.enqueue(() =>
                fetch(url, {
                    headers: NOMINATIM_HEADERS
                })
            );

            if (!response.ok) {
                throw new Error(`Geocoding reverse API error: ${response.statusText}`);
            }

            const data = await response.json() as NominatimResponse;

            return {
                id: '',
                displayName: data.display_name,
                osmId: data.osm_id,
                osmType: data.osm_type,
                name: data.address?.city || data.address?.town || data.address?.village || 'Unknown',
                province: data.address?.state || data.address?.province || 'Unknown',
                country: data.address?.country || 'Unknown',
                center: { lat: parseFloat(data.lat), lng: parseFloat(data.lon) },
                type: data.type,
                class: data.class,
                importance: data.importance
            };
        } catch (error) {
            console.error('Error reverse geocoding:', error);
            return null;
        }
    },

    /**
     * Get all administrative boundaries containing a point using Overpass API
     * Returns multiple results (country, state, city, etc.) in one call
     */
    getContainingBoundaries: async (lat: number, lng: number): Promise<City[]> => {
        // Only get admin levels 2-8 (country to city)
        const query = `
            [out:json][timeout:10];
            is_in(${lat},${lng})->.a;
            rel(pivot.a)[boundary=administrative][admin_level~"^[2-8]$"];
            out tags;
        `;

        // Try multiple Overpass endpoints for reliability
        const endpoints = [
            'https://overpass.kumi.systems/api/interpreter',
            'https://overpass-api.de/api/interpreter'
        ];

        for (const url of endpoints) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 8000);

                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `data=${encodeURIComponent(query)}`,
                    signal: controller.signal
                });

                clearTimeout(timeoutId);

                if (!response.ok) {
                    console.warn(`Overpass endpoint ${url} returned ${response.status}, trying next...`);
                    continue;
                }

                const data = await response.json();
                const results: City[] = [];

                // Process each relation (administrative boundary)
                for (const element of data.elements || []) {
                    if (element.type !== 'relation') continue;

                    const tags = element.tags || {};
                    const adminLevel = parseInt(tags.admin_level || '0', 10);

                    // Prefer native name
                    const name = tags.name || tags['name:en'] || '';
                    if (!name) continue;

                    // Determine type based on admin_level
                    let type = 'administrative';
                    if (adminLevel === 2) type = 'country';
                    else if (adminLevel === 4) type = 'state';
                    else if (adminLevel >= 6 && adminLevel <= 8) type = 'city';

                    results.push({
                        id: '',
                        name: name,
                        province: tags['is_in:state'] || tags['is_in:province'] || '',
                        country: tags['is_in:country'] || '',
                        displayName: name,
                        osmId: element.id,
                        osmType: 'relation',
                        type: type,
                        class: 'boundary',
                        importance: 1 - (adminLevel / 10),
                        center: { lat, lng }
                    });
                }

                // Sort by admin level (country first, then province, then city)
                results.sort((a, b) => (b.importance || 0) - (a.importance || 0));

                return results;
            } catch (error) {
                console.warn(`Overpass endpoint ${url} failed:`, error);
                continue;
            }
        }

        console.error('All Overpass endpoints failed');
        return [];
    },

    /**
     * Generate a random point within the city boundary
     */
    generateRandomPoint: async (cityId: string, minDistanceMeters: number = 150, userId?: string): Promise<{lat: number, lng: number} | null> => {
        const candidateCount = 64;
        const distanceRelaxationSteps = [1, 0.75, 0.5, 0.25, 0];
        let bestCandidate: { lat: number; lng: number } | null = null;
        let bestMinDist = -1;

        const result = await pool.query(`
            SELECT
                ST_Y((dumped.point).geom) as lat,
                ST_X((dumped.point).geom) as lng
            FROM (
                SELECT ST_Dump(ST_GeneratePoints(COALESCE(boundary, raw_boundary)::geometry, $2)) as point
                FROM locations
                WHERE id = $1
                  AND COALESCE(boundary, raw_boundary) IS NOT NULL
                  AND NOT ST_IsEmpty(COALESCE(boundary, raw_boundary)::geometry)
            ) as dumped
        `, [cityId, candidateCount]);

        if (result.rows.length === 0) {
            console.warn(`[cityService] no usable placement boundary for location ${cityId}`);
            return null;
        }

        const candidates = result.rows
            .filter((row) => row.lat !== null && row.lng !== null)
            .map((row) => ({
                lat: parseFloat(row.lat),
                lng: parseFloat(row.lng)
            }))
            .filter((candidate) => Number.isFinite(candidate.lat) && Number.isFinite(candidate.lng));

        if (candidates.length === 0) {
            console.warn(`[cityService] failed to generate placement point for location ${cityId}`);
            return null;
        }

        for (const distanceRatio of distanceRelaxationSteps) {
            const targetDistance = minDistanceMeters * distanceRatio;

            if (targetDistance <= 0) {
                // Boundary point fallback avoids city-center marker stacks
                return bestCandidate || candidates[0];
            }

            for (const candidate of candidates) {
                // Placement separation applies to the current map owner only
                const nearbyResult = await pool.query(`
                    SELECT MIN(nearest_dist) as min_dist FROM (
                        SELECT ST_Distance(
                            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                            original_display_coordinates
                        ) as nearest_dist
                        FROM artists
                        WHERE original_display_coordinates IS NOT NULL
                            AND ($4::uuid IS NULL OR user_id = $4::uuid)
                            AND ST_DWithin(
                                original_display_coordinates,
                                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                                $3
                            )
                        UNION ALL
                        SELECT ST_Distance(
                            ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                            active_display_coordinates
                        ) as nearest_dist
                        FROM artists
                        WHERE active_display_coordinates IS NOT NULL
                            AND ($4::uuid IS NULL OR user_id = $4::uuid)
                            AND ST_DWithin(
                                active_display_coordinates,
                                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                                $3
                            )
                    ) as distances
                `, [candidate.lng, candidate.lat, targetDistance, userId || null]);

                const minDist = nearbyResult.rows[0].min_dist;

                if (minDist === null) return candidate;

                if (parseFloat(minDist) >= targetDistance) return candidate;

                if (parseFloat(minDist) > bestMinDist) {
                    bestMinDist = parseFloat(minDist);
                    bestCandidate = candidate;
                }
            }
        }

        return bestCandidate || candidates[0];
    },

    /**
     * Returns a row's localized chain.
     */
    getLocalizedById: async (id: string): Promise<LocalizedLocation | null> => {
        const result = await pool.query(
            `SELECT id, localized_names FROM locations WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        const chain = row.localized_names as LocalizedChain | null;
        if (!chain || !chain.city) return null;

        return { id: row.id, chain };
    },

    getById: async (id: string): Promise<City | null> => {
        return queryOneLocation('id = $1', [id]);
    },

    updateLocalizedNames: async (id: string, patch: LocalizedChain): Promise<void> => {
        // Deep-merge into existing localized_names, preserving all
        // keys not present in the patch.
        const existing = await pool.query(
            `SELECT localized_names, province, country FROM locations WHERE id = $1`,
            [id]
        );
        const row = existing.rows[0];
        if (!row) return;
        const current: LocalizedChain = row.localized_names ?? {};
        const merged: LocalizedChain = {
            city: { ...current.city, ...patch.city },
        };
        if (current.province || patch.province) {
            merged.province = { ...current.province, ...patch.province };
        }
        if (current.country || patch.country) {
            merged.country = { ...current.country, ...patch.country };
        }
        await pool.query(
            `UPDATE locations
             SET localized_names = $2,
                 localized_manual = TRUE,
                 localized_at = NOW()
             WHERE id = $1`,
            [id, merged]
        );

        // Propagate province/country translations to all locations
        // sharing the same province or country name.
        if (patch.province && row.province) {
            const provinceJson = JSON.stringify(merged.province);
            await pool.query(
                `UPDATE locations
                 SET localized_names = jsonb_set(
                     COALESCE(localized_names, '{}'::jsonb),
                     '{province}',
                     $2::jsonb
                 ),
                 localized_at = NOW()
                 WHERE province = $1 AND id != $3 AND localized_names IS NOT NULL`,
                [row.province, provinceJson, id]
            );
        }
        if (patch.country && row.country) {
            const countryJson = JSON.stringify(merged.country);
            await pool.query(
                `UPDATE locations
                 SET localized_names = jsonb_set(
                     COALESCE(localized_names, '{}'::jsonb),
                     '{country}',
                     $2::jsonb
                 ),
                 localized_at = NOW()
                 WHERE country = $1 AND id != $3 AND localized_names IS NOT NULL`,
                [row.country, countryJson, id]
            );
        }
    },

    resetLocalizedNames: async (id: string): Promise<void> => {
        await pool.query(
            `UPDATE locations
             SET localized_manual = FALSE,
                 localized_names = NULL,
                 localized_at = NULL
             WHERE id = $1`,
            [id]
        );
    },
};

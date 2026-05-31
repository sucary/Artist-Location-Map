import pool from '../config/database';
import type { Coordinates } from '../types/artist';

// Point-based provider places used by Tour Mode search

export interface PlaceLocation {
    id: string;
    provider: string;
    providerPlaceId: string;
    name: string;
    formatted?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    province?: string | null;
    country?: string | null;
    countryCode?: string | null;
    coordinates: Coordinates;
    categories: string[];
    isVenue: boolean;
    timezone?: string | null;
    rawProviderData?: unknown;
}

export interface UpsertPlaceLocationInput {
    provider: string;
    providerPlaceId: string;
    name: string;
    formatted?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    province?: string;
    country?: string;
    countryCode?: string;
    coordinates: Coordinates;
    categories?: string[];
    isVenue?: boolean;
    timezone?: string;
    rawProviderData?: unknown;
}

function rowToPlaceLocation(row: Record<string, unknown>): PlaceLocation {
    return {
        id: row.id as string,
        provider: row.provider as string,
        providerPlaceId: row.provider_place_id as string,
        name: row.name as string,
        formatted: row.formatted as string | null | undefined,
        addressLine1: row.address_line1 as string | null | undefined,
        addressLine2: row.address_line2 as string | null | undefined,
        city: row.city as string | null | undefined,
        province: row.province as string | null | undefined,
        country: row.country as string | null | undefined,
        countryCode: row.country_code as string | null | undefined,
        coordinates: {
            lat: parseFloat(row.lat as string),
            lng: parseFloat(row.lng as string),
        },
        categories: Array.isArray(row.categories) ? row.categories as string[] : [],
        isVenue: row.is_venue === true,
        timezone: row.timezone as string | null | undefined,
        rawProviderData: row.raw_provider_data,
    };
}

const PLACE_SELECT_COLUMNS = `
    id, provider, provider_place_id, name, formatted, address_line1, address_line2,
    city, province, country, country_code,
    ST_Y(coordinates::geometry) AS lat,
    ST_X(coordinates::geometry) AS lng,
    categories, is_venue, timezone, raw_provider_data
`;

export const PlaceLocationStore = {
    getById: async (id: string): Promise<PlaceLocation | undefined> => {
        const result = await pool.query(`
            SELECT ${PLACE_SELECT_COLUMNS}
            FROM place_locations
            WHERE id = $1
        `, [id]);

        return result.rows[0] ? rowToPlaceLocation(result.rows[0]) : undefined;
    },

    search: async (query: string, limit: number): Promise<PlaceLocation[]> => {
        const result = await pool.query(`
            SELECT ${PLACE_SELECT_COLUMNS}
            FROM place_locations
            WHERE
                name ILIKE $1
                OR formatted ILIKE $1
                OR city ILIKE $1
                OR province ILIKE $1
                OR country ILIKE $1
            ORDER BY
                CASE WHEN is_venue THEN 0 ELSE 1 END,
                CASE WHEN LOWER(name) = LOWER($2) THEN 0 ELSE 1 END,
                CASE WHEN LOWER(name) LIKE LOWER($2) || '%' THEN 0 ELSE 1 END,
                updated_at DESC
            LIMIT $3
        `, [`%${query}%`, query, limit]);

        return result.rows.map(rowToPlaceLocation);
    },

    upsertMany: async (places: UpsertPlaceLocationInput[]): Promise<PlaceLocation[]> => {
        if (places.length === 0) return [];

        const saved: PlaceLocation[] = [];
        for (const place of places) {
            const result = await pool.query(`
                INSERT INTO place_locations (
                    provider, provider_place_id, name, formatted,
                    address_line1, address_line2,
                    city, province, country, country_code,
                    coordinates, categories, is_venue, timezone, raw_provider_data
                ) VALUES (
                    $1, $2, $3, $4,
                    $5, $6,
                    $7, $8, $9, $10,
                    ST_SetSRID(ST_MakePoint($11, $12), 4326)::geography,
                    $13, $14, $15, $16
                )
                ON CONFLICT (provider, provider_place_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    formatted = EXCLUDED.formatted,
                    address_line1 = EXCLUDED.address_line1,
                    address_line2 = EXCLUDED.address_line2,
                    city = EXCLUDED.city,
                    province = EXCLUDED.province,
                    country = EXCLUDED.country,
                    country_code = EXCLUDED.country_code,
                    coordinates = EXCLUDED.coordinates,
                    categories = EXCLUDED.categories,
                    is_venue = EXCLUDED.is_venue,
                    timezone = EXCLUDED.timezone,
                    raw_provider_data = EXCLUDED.raw_provider_data,
                    updated_at = NOW()
                RETURNING ${PLACE_SELECT_COLUMNS}
            `, [
                place.provider,
                place.providerPlaceId,
                place.name,
                place.formatted || null,
                place.addressLine1 || null,
                place.addressLine2 || null,
                place.city || null,
                place.province || null,
                place.country || null,
                place.countryCode || null,
                place.coordinates.lng,
                place.coordinates.lat,
                place.categories || [],
                place.isVenue === true,
                place.timezone || null,
                place.rawProviderData === undefined ? null : JSON.stringify(place.rawProviderData),
            ]);

            saved.push(rowToPlaceLocation(result.rows[0]));
        }

        return saved;
    },
};

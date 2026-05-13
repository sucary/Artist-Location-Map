import { Artist, StoreArtistDTO, UpdateStoreArtistDTO, LocationCount, LocationView, ArtistQueryParams, CropArea } from '../types/artist';
import type { LocalizedChain } from '../types/city';
import { parseLocalizedNames } from '../services/cityService';
import pool from '../config/database';

// Base columns for artist reads (used with table alias 'a')
const ARTIST_BASE_COLUMNS = `
    a.id, a.user_id, a.musicbrainz_mbid, a.name, a.romanized_name,
    COALESCE(a.source_image, ama.source_image) AS source_image,
    COALESCE(a.avatar_crop, ama.avatar_crop) AS avatar_crop,
    COALESCE(a.profile_crop, ama.profile_crop) AS profile_crop,
    a.original_city, a.original_province, a.original_country, a.original_city_id, a.original_display_name,
    ST_Y(a.original_coordinates::geometry) as original_lat,
    ST_X(a.original_coordinates::geometry) as original_lng,
    a.active_city, a.active_province, a.active_country, a.active_city_id, a.active_display_name,
    ST_Y(a.active_coordinates::geometry) as active_lat,
    ST_X(a.active_coordinates::geometry) as active_lng,
    ST_Y(a.original_display_coordinates::geometry) as original_display_lat,
    ST_X(a.original_display_coordinates::geometry) as original_display_lng,
    ST_Y(a.active_display_coordinates::geometry) as active_display_lat,
    ST_X(a.active_display_coordinates::geometry) as active_display_lng,
    a.instagram_url, a.twitter_url, a.apple_music_url, a.website_url, a.youtube_url,
    a.debut_year, a.inactive_year,
    a.created_at, a.updated_at
`;

// Full SELECT with localized names from joined locations
const ARTIST_SELECT_COLUMNS = `${ARTIST_BASE_COLUMNS},
    ol.localized_names as original_localized_names,
    al.localized_names as active_localized_names
`;

// For INSERT/UPDATE RETURNING (no JOIN available)
const ARTIST_RETURNING_COLUMNS = `
    id, user_id, musicbrainz_mbid, name, romanized_name, source_image, avatar_crop, profile_crop,
    original_city, original_province, original_country, original_city_id, original_display_name,
    ST_Y(original_coordinates::geometry) as original_lat,
    ST_X(original_coordinates::geometry) as original_lng,
    active_city, active_province, active_country, active_city_id, active_display_name,
    ST_Y(active_coordinates::geometry) as active_lat,
    ST_X(active_coordinates::geometry) as active_lng,
    ST_Y(original_display_coordinates::geometry) as original_display_lat,
    ST_X(original_display_coordinates::geometry) as original_display_lng,
    ST_Y(active_display_coordinates::geometry) as active_display_lat,
    ST_X(active_display_coordinates::geometry) as active_display_lng,
    instagram_url, twitter_url, apple_music_url, website_url, youtube_url,
    debut_year, inactive_year,
    created_at, updated_at
`;

/**
 * Helper function to convert database row to Artist object
 */
function rowToArtist(row: Record<string, unknown>): Artist {
    const originalChain = parseLocalizedNames(row.original_localized_names) as LocalizedChain | null;
    const activeChain = parseLocalizedNames(row.active_localized_names) as LocalizedChain | null;

    return {
        id: row.id as string,
        userId: row.user_id as string | undefined,
        musicbrainzMbid: row.musicbrainz_mbid as string | undefined,
        name: row.name as string,
        romanizedName: row.romanized_name as string | undefined,
        sourceImage: row.source_image as string | undefined,
        avatarCrop: row.avatar_crop as CropArea | undefined,
        profileCrop: row.profile_crop as CropArea | undefined,
        originalLocation: {
            city: row.original_city as string,
            province: row.original_province as string,
            country: row.original_country as string | undefined,
            displayName: row.original_display_name as string | undefined,
            coordinates: {
                lat: parseFloat(row.original_lat as string),
                lng: parseFloat(row.original_lng as string)
            },
            ...(originalChain?.city ? { localizedChain: originalChain } : {}),
        },
        activeLocation: {
            city: row.active_city as string,
            province: row.active_province as string,
            country: row.active_country as string | undefined,
            displayName: row.active_display_name as string | undefined,
            coordinates: {
                lat: parseFloat(row.active_lat as string),
                lng: parseFloat(row.active_lng as string)
            },
            ...(activeChain?.city ? { localizedChain: activeChain } : {}),
        },
        socialLinks: {
            instagram: (row.instagram_url as string) || undefined,
            twitter: (row.twitter_url as string) || undefined,
            appleMusic: (row.apple_music_url as string) || undefined,
            website: (row.website_url as string) || undefined,
            youtube: (row.youtube_url as string) || undefined
        },
        debutYear: row.debut_year as number | undefined,
        inactiveYear: row.inactive_year as number | undefined,
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
        originalLocationDisplayCoordinates: row.original_display_lat ? {
            lat: parseFloat(row.original_display_lat as string),
            lng: parseFloat(row.original_display_lng as string)
        } : {
            lat: parseFloat(row.original_lat as string),
            lng: parseFloat(row.original_lng as string)
        },
        activeLocationDisplayCoordinates: row.active_display_lat ? {
            lat: parseFloat(row.active_display_lat as string),
            lng: parseFloat(row.active_display_lng as string)
        } : {
            lat: parseFloat(row.active_lat as string),
            lng: parseFloat(row.active_lng as string)
        },
        originalCityId: (row.original_city_id as string) || '',
        activeCityId: (row.active_city_id as string) || ''
    };
}


/**
 * The following lines convert PostGIS binary coordinates into readable Lat/Lng numbers:
 *      ST_Y(original_coordinates::geometry) extracts the Latitude.
 *      ST_X(original_coordinates::geometry) extracts the Longitude.
 */
export const ArtistStore = {
    getAll: async (params: ArtistQueryParams = {}): Promise<Artist[]> => {
        try {
            const { name, city, province, view = 'active', userId } = params;

            const conditions: string[] = [];
            const values: unknown[] = [];
            let paramIndex = 1;

            // Filter by user if userId provided (non-admin users)
            if (userId) {
                conditions.push(`a.user_id = $${paramIndex++}`);
                values.push(userId);
            }

            if (name) {
                conditions.push(`(a.name ILIKE $${paramIndex} OR a.romanized_name ILIKE $${paramIndex})`);
                values.push(`%${name}%`);
                paramIndex++;
            }

            if (city) {
                const column = view === 'active' ? 'a.active_city' : 'a.original_city';
                conditions.push(`${column} ILIKE $${paramIndex++}`);
                values.push(`%${city}%`);
            }

            if (province) {
                const column = view === 'active' ? 'a.active_province' : 'a.original_province';
                conditions.push(`${column} ILIKE $${paramIndex++}`);
                values.push(`%${province}%`);
            }

            const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

            const result = await pool.query(`
                SELECT ${ARTIST_SELECT_COLUMNS}
                FROM artists a
                LEFT JOIN artist_media_assets ama ON a.musicbrainz_mbid = ama.musicbrainz_mbid
                LEFT JOIN locations ol ON a.original_city_id = ol.id
                LEFT JOIN locations al ON a.active_city_id = al.id
                ${whereClause}
                ORDER BY a.created_at DESC
            `, values);

            return result.rows.map(rowToArtist);
        } catch (error) {
            console.error('Error getting all artists:', error);
            throw error;
        }
    },

    getById: async (id: string): Promise<Artist | undefined> => {
        try {
            const result = await pool.query(`
                SELECT ${ARTIST_SELECT_COLUMNS}
                FROM artists a
                LEFT JOIN artist_media_assets ama ON a.musicbrainz_mbid = ama.musicbrainz_mbid
                LEFT JOIN locations ol ON a.original_city_id = ol.id
                LEFT JOIN locations al ON a.active_city_id = al.id
                WHERE a.id = $1
            `, [id]);

            if (result.rows.length === 0) {
                return undefined;
            }

            return rowToArtist(result.rows[0]);
        } catch (error) {
            console.error('Error getting artist by id:', error);
            throw error;
        }
    },

    create: async (data: StoreArtistDTO): Promise<Artist> => {
        try {
            const result = await pool.query(`
                INSERT INTO artists (
                    user_id, musicbrainz_mbid, name, romanized_name, source_image, avatar_crop, profile_crop,
                    original_city, original_province, original_country, original_coordinates, original_city_id, original_display_name,
                    active_city, active_province, active_country, active_coordinates, active_city_id, active_display_name,
                    original_display_coordinates,
                    active_display_coordinates,
                    instagram_url, twitter_url, apple_music_url, website_url, youtube_url,
                    debut_year, inactive_year
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7,
                    $8, $9, $10, ST_SetSRID(ST_MakePoint($11, $12), 4326)::geography, $23, $31,
                    $13, $14, $15, ST_SetSRID(ST_MakePoint($16, $17), 4326)::geography, $24, $32,
                    ST_SetSRID(ST_MakePoint($25, $26), 4326)::geography,
                    ST_SetSRID(ST_MakePoint($27, $28), 4326)::geography,
                    $18, $19, $20, $21, $22,
                    $29, $30
                )
                RETURNING ${ARTIST_RETURNING_COLUMNS}
            `, [
                data.userId,
                data.musicbrainzMbid || null,
                data.name,
                data.romanizedName || null,
                data.sourceImage || null,
                data.avatarCrop ? JSON.stringify(data.avatarCrop) : null,
                data.profileCrop ? JSON.stringify(data.profileCrop) : null,
                data.originalLocation.city,
                data.originalLocation.province,
                data.originalLocation.country || null,
                data.originalLocation.coordinates.lng,  // PostGIS uses lng first
                data.originalLocation.coordinates.lat,
                data.activeLocation.city,
                data.activeLocation.province,
                data.activeLocation.country || null,
                data.activeLocation.coordinates.lng,
                data.activeLocation.coordinates.lat,
                data.socialLinks?.instagram || null,
                data.socialLinks?.twitter || null,
                data.socialLinks?.appleMusic || null,
                data.socialLinks?.website || null,
                data.socialLinks?.youtube || null,
                data.originalCityId,
                data.activeCityId,
                data.originalLocationDisplayCoordinates.lng,
                data.originalLocationDisplayCoordinates.lat,
                data.activeLocationDisplayCoordinates.lng,
                data.activeLocationDisplayCoordinates.lat,
                data.debutYear || null,
                data.inactiveYear || null,
                data.originalLocation.displayName || null,
                data.activeLocation.displayName || null
            ]);

            return rowToArtist(result.rows[0]);
        } catch (error) {
            console.error('Error creating artist:', error);
            throw error;
        }
    },

    update: async (id: string, data: UpdateStoreArtistDTO): Promise<Artist | undefined> => {
        try {
            // Build dynamic update query based on provided fields
            const updates: string[] = [];
            const values: unknown[] = [];
            let paramIndex = 1;
            
            // The following if-expressions turn data into database redable format

            if (data.name !== undefined) {
                updates.push(`name = $${paramIndex++}`);
                values.push(data.name);
            }

            if (data.musicbrainzMbid !== undefined) {
                updates.push(`musicbrainz_mbid = $${paramIndex++}`);
                values.push(data.musicbrainzMbid || null);
            }

            if (data.romanizedName !== undefined) {
                updates.push(`romanized_name = $${paramIndex++}`);
                values.push(data.romanizedName || null);
            }

            if (data.sourceImage !== undefined) {
                updates.push(`source_image = $${paramIndex++}`);
                values.push(data.sourceImage);
            }

            if (data.avatarCrop !== undefined) {
                updates.push(`avatar_crop = $${paramIndex++}`);
                values.push(data.avatarCrop ? JSON.stringify(data.avatarCrop) : null);
            }

            if (data.profileCrop !== undefined) {
                updates.push(`profile_crop = $${paramIndex++}`);
                values.push(data.profileCrop ? JSON.stringify(data.profileCrop) : null);
            }

            if (data.originalLocation) {
                updates.push(`original_city = $${paramIndex++}`);
                values.push(data.originalLocation.city);
                updates.push(`original_province = $${paramIndex++}`);
                values.push(data.originalLocation.province);
                updates.push(`original_country = $${paramIndex++}`);
                values.push(data.originalLocation.country || null);
                updates.push(`original_display_name = $${paramIndex++}`);
                values.push(data.originalLocation.displayName || null);
                updates.push(`original_coordinates = ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)::geography`);
                values.push(data.originalLocation.coordinates.lng);
                values.push(data.originalLocation.coordinates.lat);
            }

            if (data.originalCityId) {
                updates.push(`original_city_id = $${paramIndex++}`);
                values.push(data.originalCityId);
            }

            if (data.activeLocation) {
                updates.push(`active_city = $${paramIndex++}`);
                values.push(data.activeLocation.city);
                updates.push(`active_province = $${paramIndex++}`);
                values.push(data.activeLocation.province);
                updates.push(`active_country = $${paramIndex++}`);
                values.push(data.activeLocation.country || null);
                updates.push(`active_display_name = $${paramIndex++}`);
                values.push(data.activeLocation.displayName || null);
                updates.push(`active_coordinates = ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)::geography`);
                values.push(data.activeLocation.coordinates.lng);
                values.push(data.activeLocation.coordinates.lat);
            }

            if (data.activeCityId) {
                updates.push(`active_city_id = $${paramIndex++}`);
                values.push(data.activeCityId);
            }

            if (data.originalLocationDisplayCoordinates) {
                updates.push(`original_display_coordinates = ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)::geography`);
                values.push(data.originalLocationDisplayCoordinates.lng);
                values.push(data.originalLocationDisplayCoordinates.lat);
            }

            if (data.activeLocationDisplayCoordinates) {
                updates.push(`active_display_coordinates = ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)::geography`);
                values.push(data.activeLocationDisplayCoordinates.lng);
                values.push(data.activeLocationDisplayCoordinates.lat);
            }

            if (data.socialLinks) {
                if (data.socialLinks.instagram !== undefined) {
                    updates.push(`instagram_url = $${paramIndex++}`);
                    values.push(data.socialLinks.instagram || null);
                }
                if (data.socialLinks.twitter !== undefined) {
                    updates.push(`twitter_url = $${paramIndex++}`);
                    values.push(data.socialLinks.twitter || null);
                }
                if (data.socialLinks.appleMusic !== undefined) {
                    updates.push(`apple_music_url = $${paramIndex++}`);
                    values.push(data.socialLinks.appleMusic || null);
                }
                if (data.socialLinks.website !== undefined) {
                    updates.push(`website_url = $${paramIndex++}`);
                    values.push(data.socialLinks.website || null);
                }
                if (data.socialLinks.youtube !== undefined) {
                    updates.push(`youtube_url = $${paramIndex++}`);
                    values.push(data.socialLinks.youtube || null);
                }
            }

            if (data.debutYear !== undefined) {
                updates.push(`debut_year = $${paramIndex++}`);
                values.push(data.debutYear || null);
            }

            if (data.inactiveYear !== undefined) {
                updates.push(`inactive_year = $${paramIndex++}`);
                values.push(data.inactiveYear || null);
            }

            if (updates.length === 0) {
                // No fields to update, just return the existing artist
                return await ArtistStore.getById(id);
            }

            // Add the id as the last parameter
            values.push(id);

            const result = await pool.query(`
                UPDATE artists
                SET ${updates.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING ${ARTIST_RETURNING_COLUMNS}
            `, values);

            if (result.rows.length === 0) {
                return undefined;
            }

            return rowToArtist(result.rows[0]);
        } catch (error) {
            console.error('Error updating artist:', error);
            throw error;
        }
    },

    delete: async (id: string): Promise<boolean> => {
        try {
            const result = await pool.query(`
                DELETE FROM artists
                WHERE id = $1
            `, [id]);

            return result.rowCount !== null && result.rowCount > 0;
        } catch (error) {
            console.error('Error deleting artist:', error);
            throw error;
        }
    },

    countByCity: async (view: LocationView = 'active', userId?: string): Promise<LocationCount[]> => {
        try {
            const column = view === 'original' ? 'original_city' : 'active_city';
            const whereClause = userId ? 'WHERE user_id = $1' : '';
            const values = userId ? [userId] : [];

            const result = await pool.query(`
                SELECT ${column} as location, COUNT(*)::int as count
                FROM artists
                ${whereClause}
                GROUP BY ${column}
                ORDER BY count DESC
            `, values);

            return result.rows;
        } catch (error) {
            console.error('Error counting artists by city:', error);
            throw error;
        }
    },

    searchForMap: async (query: string, userId: string, limit: number = 10): Promise<Artist[]> => {
        try {
            const searchTerm = `%${query}%`;
            const result = await pool.query(`
                SELECT ${ARTIST_SELECT_COLUMNS}
                FROM artists a
                LEFT JOIN artist_media_assets ama ON a.musicbrainz_mbid = ama.musicbrainz_mbid
                LEFT JOIN locations ol ON a.original_city_id = ol.id
                LEFT JOIN locations al ON a.active_city_id = al.id
                WHERE a.user_id = $1
                  AND (
                    a.name ILIKE $2
                    OR a.romanized_name ILIKE $2
                    OR a.original_city ILIKE $2
                    OR a.original_province ILIKE $2
                    OR a.original_country ILIKE $2
                    OR a.original_display_name ILIKE $2
                    OR a.active_city ILIKE $2
                    OR a.active_province ILIKE $2
                    OR a.active_country ILIKE $2
                    OR a.active_display_name ILIKE $2
                    OR ol.localized_names::text ILIKE $2
                    OR al.localized_names::text ILIKE $2
                  )
                ORDER BY
                    CASE
                        WHEN a.name ILIKE $2 OR a.romanized_name ILIKE $2 THEN 0
                        WHEN a.active_city ILIKE $2 OR a.active_province ILIKE $2 THEN 1
                        WHEN a.original_city ILIKE $2 OR a.original_province ILIKE $2 THEN 2
                        ELSE 3
                    END,
                    a.name
                LIMIT $3
            `, [userId, searchTerm, limit]);

            return result.rows.map(rowToArtist);
        } catch (error) {
            console.error('Error searching artists for map:', error);
            throw error;
        }
    },

    /**
     * Get community artists for anonymous/featured views.
     * Returns one public, MusicBrainz-linked artist per MBID with an image and start year.
     * Duplicate copies prefer admin-owned rows, then rows whose saved location matches
     * MusicBrainz's high-level area data and has more detailed location fields.
     */
    getFeaturedArtists: async (): Promise<Artist[]> => {
        try {
            const result = await pool.query(`
                WITH ranked AS (
                    SELECT ${ARTIST_SELECT_COLUMNS},
                        ROW_NUMBER() OVER (
                            PARTITION BY a.musicbrainz_mbid
                            ORDER BY
                                p.is_admin DESC,
                                (
                                    CASE
                                        WHEN mba.country IS NOT NULL AND (
                                            UPPER(COALESCE(a.original_country, '')) = UPPER(mba.country)
                                            OR UPPER(COALESCE(a.active_country, '')) = UPPER(mba.country)
                                        ) THEN 1 ELSE 0
                                    END
                                    + CASE
                                        WHEN mba.begin_area_name IS NOT NULL AND (
                                            a.original_city ILIKE mba.begin_area_name
                                            OR a.original_province ILIKE mba.begin_area_name
                                            OR COALESCE(a.original_display_name, '') ILIKE '%' || mba.begin_area_name || '%'
                                        ) THEN 2 ELSE 0
                                    END
                                    + CASE
                                        WHEN mba.area_name IS NOT NULL AND (
                                            a.active_city ILIKE mba.area_name
                                            OR a.active_province ILIKE mba.area_name
                                            OR COALESCE(a.active_display_name, '') ILIKE '%' || mba.area_name || '%'
                                            OR COALESCE(a.original_display_name, '') ILIKE '%' || mba.area_name || '%'
                                        ) THEN 1 ELSE 0
                                    END
                                ) DESC,
                                (
                                    CASE WHEN a.original_display_name IS NOT NULL THEN 1 ELSE 0 END
                                    + CASE WHEN a.active_display_name IS NOT NULL THEN 1 ELSE 0 END
                                    + CASE WHEN a.original_city_id IS NOT NULL THEN 1 ELSE 0 END
                                    + CASE WHEN a.active_city_id IS NOT NULL THEN 1 ELSE 0 END
                                    + CASE WHEN a.original_country IS NOT NULL THEN 1 ELSE 0 END
                                    + CASE WHEN a.active_country IS NOT NULL THEN 1 ELSE 0 END
                                ) DESC,
                                a.updated_at DESC,
                                a.created_at DESC
                        ) AS duplicate_rank
                    FROM artists a
                    LEFT JOIN artist_media_assets ama ON a.musicbrainz_mbid = ama.musicbrainz_mbid
                    LEFT JOIN locations ol ON a.original_city_id = ol.id
                    LEFT JOIN locations al ON a.active_city_id = al.id
                    JOIN profiles p ON a.user_id = p.id
                    JOIN musicbrainz_artists mba ON a.musicbrainz_mbid = mba.mbid
                    WHERE p.is_private = false
                      AND a.musicbrainz_mbid IS NOT NULL
                      AND NULLIF(TRIM(COALESCE(a.source_image, ama.source_image)), '') IS NOT NULL
                      AND a.debut_year IS NOT NULL
                      AND (
                          LOWER(COALESCE(mba.type, '')) <> 'person'
                          OR mba.life_span_begin IS NULL
                          OR mba.life_span_begin !~ '^\\d{4}'
                          OR a.debut_year > SUBSTRING(mba.life_span_begin FROM 1 FOR 4)::int
                      )
                )
                SELECT *
                FROM ranked
                WHERE duplicate_rank = 1
                ORDER BY name ASC
            `);

            return result.rows.map(rowToArtist);
        } catch (error) {
            console.error('Error getting featured artists:', error);
            throw error;
        }
    }
};

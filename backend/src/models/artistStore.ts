import { Artist, CreateArtistDTO, UpdateArtistDTO } from '../types/artist';
import pool from '../config/database';

/**
 * Helper function to convert database row to Artist object
 */
function rowToArtist(row: Record<string, unknown>): Artist {
    return {
        id: row.id as string,
        name: row.name as string,
        profilePicture: row.profile_picture as string | undefined,
        originalLocation: {
            city: row.original_city as string,
            province: row.original_province as string,
            coordinates: {
                lat: parseFloat(row.original_lat as string),
                lng: parseFloat(row.original_lng as string)
            }
        },
        activeLocation: {
            city: row.active_city as string,
            province: row.active_province as string,
            coordinates: {
                lat: parseFloat(row.active_lat as string),
                lng: parseFloat(row.active_lng as string)
            }
        },
        socialLinks: {
            instagram: (row.instagram_url as string) || undefined,
            twitter: (row.twitter_url as string) || undefined,
            spotify: (row.spotify_url as string) || undefined,
            website: (row.website_url as string) || undefined
        },
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date
    };
}


/**
 * The following lines convert PostGIS binary coordinates into readable Lat/Lng numbers:
 *      ST_Y(original_coordinates::geometry) extracts the Latitude.
 *      ST_X(original_coordinates::geometry) extracts the Longitude.
 */
export const ArtistStore = {
    getAll: async (): Promise<Artist[]> => {
        try {
            const result = await pool.query(`
                SELECT
                    id, name, profile_picture,
                    original_city, original_province,
                    ST_Y(original_coordinates::geometry) as original_lat,
                    ST_X(original_coordinates::geometry) as original_lng,
                    active_city, active_province,
                    ST_Y(active_coordinates::geometry) as active_lat,
                    ST_X(active_coordinates::geometry) as active_lng,
                    instagram_url, twitter_url, spotify_url, website_url,
                    created_at, updated_at
                FROM artists
            `);

            return result.rows.map(rowToArtist);
        } catch (error) {
            console.error('Error getting all artists:', error);
            throw error;
        }
    },

    getById: async (id: string): Promise<Artist | undefined> => {
        try {
            const result = await pool.query(`
                SELECT
                    id, name, profile_picture,
                    original_city, original_province,
                    ST_Y(original_coordinates::geometry) as original_lat,
                    ST_X(original_coordinates::geometry) as original_lng,
                    active_city, active_province,
                    ST_Y(active_coordinates::geometry) as active_lat,
                    ST_X(active_coordinates::geometry) as active_lng,
                    instagram_url, twitter_url, spotify_url, website_url,
                    created_at, updated_at
                FROM artists
                WHERE id = $1
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

    create: async (data: CreateArtistDTO): Promise<Artist> => {
        try {
            const result = await pool.query(`
                INSERT INTO artists (
                    name, profile_picture,
                    original_city, original_province, original_coordinates,
                    active_city, active_province, active_coordinates,
                    instagram_url, twitter_url, spotify_url, website_url
                ) VALUES (
                    $1, $2,
                    $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
                    $7, $8, ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography,
                    $11, $12, $13, $14
                )
                RETURNING
                    id, name, profile_picture,
                    original_city, original_province,
                    ST_Y(original_coordinates::geometry) as original_lat,
                    ST_X(original_coordinates::geometry) as original_lng,
                    active_city, active_province,
                    ST_Y(active_coordinates::geometry) as active_lat,
                    ST_X(active_coordinates::geometry) as active_lng,
                    instagram_url, twitter_url, spotify_url, website_url,
                    created_at, updated_at
            `, [
                data.name,
                data.profilePicture || null,
                data.originalLocation.city,
                data.originalLocation.province,
                data.originalLocation.coordinates.lng,  // PostGIS uses lng first
                data.originalLocation.coordinates.lat,
                data.activeLocation.city,
                data.activeLocation.province,
                data.activeLocation.coordinates.lng,
                data.activeLocation.coordinates.lat,
                data.socialLinks?.instagram || null,
                data.socialLinks?.twitter || null,
                data.socialLinks?.spotify || null,
                data.socialLinks?.website || null
            ]);

            return rowToArtist(result.rows[0]);
        } catch (error) {
            console.error('Error creating artist:', error);
            throw error;
        }
    },

    update: async (id: string, data: UpdateArtistDTO): Promise<Artist | undefined> => {
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

            if (data.profilePicture !== undefined) {
                updates.push(`profile_picture = $${paramIndex++}`);
                values.push(data.profilePicture);
            }

            if (data.originalLocation) {
                updates.push(`original_city = $${paramIndex++}`);
                values.push(data.originalLocation.city);
                updates.push(`original_province = $${paramIndex++}`);
                values.push(data.originalLocation.province);
                updates.push(`original_coordinates = ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)::geography`);
                values.push(data.originalLocation.coordinates.lng);
                values.push(data.originalLocation.coordinates.lat);
            }

            if (data.activeLocation) {
                updates.push(`active_city = $${paramIndex++}`);
                values.push(data.activeLocation.city);
                updates.push(`active_province = $${paramIndex++}`);
                values.push(data.activeLocation.province);
                updates.push(`active_coordinates = ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)::geography`);
                values.push(data.activeLocation.coordinates.lng);
                values.push(data.activeLocation.coordinates.lat);
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
                if (data.socialLinks.spotify !== undefined) {
                    updates.push(`spotify_url = $${paramIndex++}`);
                    values.push(data.socialLinks.spotify || null);
                }
                if (data.socialLinks.website !== undefined) {
                    updates.push(`website_url = $${paramIndex++}`);
                    values.push(data.socialLinks.website || null);
                }
            }

            if (updates.length === 0) {
                // No fields to update, just return the existing artist
                return await this.getById(id);
            }

            // Add the id as the last parameter
            values.push(id);

            const result = await pool.query(`
                UPDATE artists
                SET ${updates.join(', ')}
                WHERE id = $${paramIndex}
                RETURNING
                    id, name, profile_picture,
                    original_city, original_province,
                    ST_Y(original_coordinates::geometry) as original_lat,
                    ST_X(original_coordinates::geometry) as original_lng,
                    active_city, active_province,
                    ST_Y(active_coordinates::geometry) as active_lat,
                    ST_X(active_coordinates::geometry) as active_lng,
                    instagram_url, twitter_url, spotify_url, website_url,
                    created_at, updated_at
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
    }
};
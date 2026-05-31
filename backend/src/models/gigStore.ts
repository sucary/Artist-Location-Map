import pool from '../config/database';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import type { CropArea } from '../types/artist';
import type { LocalizedChain } from '../types/city';
import type {
    CreateTourDTO,
    Gig,
    GigArtistSummary,
    GigQueryParams,
    StoreGigDTO,
    Tour,
    UpdateStoreGigDTO,
    UpdateTourDTO,
} from '../types/gig';
import { parseLocalizedNames } from '../services/cityService';

// Gig columns with aggregated artists and optional tour data

type QueryExecutor = {
    query: <T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => Promise<QueryResult<T>>;
};

const ARTIST_JSON = `
    jsonb_build_object(
        'id', a.id,
        'name', a.name,
        'romanizedName', a.romanized_name,
        'sourceImage', COALESCE(a.source_image, ama.source_image),
        'avatarCrop', COALESCE(a.avatar_crop, ama.avatar_crop)
    )
`;

const GIG_SELECT_COLUMNS = `
    g.id, g.user_id, g.tour_id, g.gig_name, g.venue_name,
    g.city, g.province, g.country, g.display_name, g.city_id, g.place_location_id,
    ST_Y(g.coordinates::geometry) AS lat,
    ST_X(g.coordinates::geometry) AS lng,
    ST_Y(g.display_coordinates::geometry) AS display_lat,
    ST_X(g.display_coordinates::geometry) AS display_lng,
    g."date", g.timezone,
    g.external_source, g.external_id, g.external_artist_id, g.external_url,
    g.imported_at, g.last_synced_at, g.raw_external_data,
    g.created_at, g.updated_at,
    t.name AS tour_name,
    l.localized_names AS location_localized_names,
    CASE WHEN pl.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', pl.id,
        'provider', pl.provider,
        'providerPlaceId', pl.provider_place_id,
        'name', pl.name,
        'formatted', pl.formatted,
        'categories', pl.categories,
        'isVenue', pl.is_venue
    ) END AS place_location,
    COALESCE(
        jsonb_agg(${ARTIST_JSON} ORDER BY a.name) FILTER (WHERE a.id IS NOT NULL),
        '[]'::jsonb
    ) AS artists
`;

const TOUR_SELECT_COLUMNS = `
    t.id, t.user_id, t.name, t.created_at, t.updated_at,
    MIN(g."date") AS start_date,
    MAX(g."date") AS end_date,
    COUNT(DISTINCT g.id)::int AS gig_count,
    COALESCE(
        jsonb_agg(DISTINCT jsonb_build_object(
            'id', a.id,
            'name', a.name,
            'romanizedName', a.romanized_name,
            'sourceImage', COALESCE(a.source_image, ama.source_image),
            'avatarCrop', COALESCE(a.avatar_crop, ama.avatar_crop)
        )) FILTER (WHERE a.id IS NOT NULL),
        '[]'::jsonb
    ) AS artists
`;

function formatDate(value: Date | string | null | undefined): string | undefined {
    if (!value) return undefined;
    if (typeof value === 'string') return value.slice(0, 10);

    // PostgreSQL DATE values remain calendar dates, not instants
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseArtists(value: unknown): GigArtistSummary[] {
    if (Array.isArray(value)) return value as GigArtistSummary[];
    if (typeof value === 'string') return JSON.parse(value) as GigArtistSummary[];
    return [];
}

function rowToGig(row: Record<string, unknown>): Gig {
    const localizedChain = parseLocalizedNames(row.location_localized_names) as LocalizedChain | null;
    const artists = parseArtists(row.artists);
    const primaryArtist = artists[0] ?? { id: '', name: 'Unknown artist' };

    return {
        id: row.id as string,
        userId: row.user_id as string,
        tourId: row.tour_id as string | undefined,
        tour: row.tour_id ? {
            id: row.tour_id as string,
            name: row.tour_name as string,
        } : undefined,
        artistIds: artists.map((artist) => artist.id),
        artist: primaryArtist,
        artists,
        gigName: row.gig_name as string | null | undefined,
        venueName: row.venue_name as string | undefined,
        placeLocation: row.place_location as Gig['placeLocation'],
        location: {
            city: row.city as string,
            province: row.province as string,
            country: row.country as string | undefined,
            displayName: row.display_name as string | undefined,
            cityId: row.city_id as string | undefined,
            coordinates: {
                lat: parseFloat(row.lat as string),
                lng: parseFloat(row.lng as string),
            },
            ...(localizedChain?.city ? { localizedChain } : {}),
        },
        locationCityId: row.city_id as string | null | undefined,
        placeLocationId: row.place_location_id as string | null | undefined,
        displayCoordinates: {
            lat: parseFloat(row.display_lat as string),
            lng: parseFloat(row.display_lng as string),
        },
        date: formatDate(row.date as Date | string)!,
        timezone: row.timezone as string | undefined,
        externalSource: row.external_source as string | undefined,
        externalId: row.external_id as string | undefined,
        externalArtistId: row.external_artist_id as string | undefined,
        externalUrl: row.external_url as string | undefined,
        importedAt: row.imported_at as Date | string | undefined,
        lastSyncedAt: row.last_synced_at as Date | string | undefined,
        rawExternalData: row.raw_external_data,
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
    };
}

function rowToTour(row: Record<string, unknown>): Tour {
    const artists = parseArtists(row.artists);

    return {
        id: row.id as string,
        userId: row.user_id as string,
        name: row.name as string,
        artistIds: artists.map((artist) => artist.id),
        artists,
        startDate: formatDate(row.start_date as Date | string | null),
        endDate: formatDate(row.end_date as Date | string | null),
        gigCount: Number(row.gig_count ?? 0),
        createdAt: row.created_at as Date,
        updatedAt: row.updated_at as Date,
    };
}

// Multi-write persistence boundary
async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await work(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

async function setGigArtists(gigId: string, artistIds: string[], db: QueryExecutor = pool) {
    await db.query('DELETE FROM gig_artists WHERE gig_id = $1', [gigId]);
    if (artistIds.length === 0) return;

    await db.query(`
        INSERT INTO gig_artists (gig_id, artist_id)
        SELECT $1, unnest($2::uuid[])
        ON CONFLICT DO NOTHING
    `, [gigId, artistIds]);
}

async function addTourArtists(tourId: string, artistIds: string[], db: QueryExecutor = pool) {
    if (artistIds.length === 0) return;

    await db.query(`
        INSERT INTO tour_artists (tour_id, artist_id)
        SELECT $1, unnest($2::uuid[])
        ON CONFLICT DO NOTHING
    `, [tourId, artistIds]);
}

// Shared tour insert path for direct tours and inline gig creation
async function createTourRecord(data: CreateTourDTO, userId: string, db: QueryExecutor): Promise<string> {
    const result = await db.query<{ id: string }>(`
        INSERT INTO artist_tours (user_id, name)
        VALUES ($1, $2)
        RETURNING id
    `, [userId, data.name]);
    const tourId = result.rows[0].id;
    const artistIds = new Set(data.artistIds ?? []);

    if (data.gigIds?.length) {
        const gigs = await db.query(`
            UPDATE artist_gigs
            SET tour_id = $1, gig_name = NULL
            WHERE user_id = $2 AND id = ANY($3::uuid[])
            RETURNING id
        `, [tourId, userId, data.gigIds]);
        if (gigs.rowCount) {
            const gigArtists = await db.query<{ artist_id: string }>(`
                SELECT artist_id
                FROM gig_artists
                WHERE gig_id = ANY($1::uuid[])
            `, [data.gigIds]);
            gigArtists.rows.forEach((row) => artistIds.add(row.artist_id));
        }
    }

    await addTourArtists(tourId, Array.from(artistIds), db);
    return tourId;
}

export const GigStore = {
    getAll: async (params: GigQueryParams): Promise<Gig[]> => {
        const { userId, artistId, from, to, q } = params;
        const conditions = ['g.user_id = $1'];
        const values: unknown[] = [userId];
        let paramIndex = 2;

        if (artistId) {
            conditions.push(`EXISTS (
                SELECT 1 FROM gig_artists filter_ga
                WHERE filter_ga.gig_id = g.id AND filter_ga.artist_id = $${paramIndex++}
            )`);
            values.push(artistId);
        }

        if (from && to) {
            conditions.push(`g."date" BETWEEN $${paramIndex++}::date AND $${paramIndex++}::date`);
            values.push(from, to);
        }

        if (q) {
            conditions.push(`(
                EXISTS (
                    SELECT 1
                    FROM gig_artists qga
                    JOIN artists qa ON qa.id = qga.artist_id
                    WHERE qga.gig_id = g.id
                    AND (qa.name ILIKE $${paramIndex} OR qa.romanized_name ILIKE $${paramIndex})
                )
                OR g.gig_name ILIKE $${paramIndex}
                OR g.venue_name ILIKE $${paramIndex}
                OR g.city ILIKE $${paramIndex}
                OR g.province ILIKE $${paramIndex}
                OR g.country ILIKE $${paramIndex}
                OR g.display_name ILIKE $${paramIndex}
            )`);
            values.push(`%${q}%`);
            paramIndex++;
        }

        const result = await pool.query(`
            SELECT ${GIG_SELECT_COLUMNS}
            FROM artist_gigs g
            JOIN gig_artists ga ON ga.gig_id = g.id
            JOIN artists a ON ga.artist_id = a.id
            LEFT JOIN artist_media_assets ama ON a.musicbrainz_mbid = ama.musicbrainz_mbid
            LEFT JOIN artist_tours t ON g.tour_id = t.id
            LEFT JOIN locations l ON g.city_id = l.id
            LEFT JOIN place_locations pl ON g.place_location_id = pl.id
            WHERE ${conditions.join(' AND ')}
            GROUP BY g.id, t.id, l.localized_names, pl.id
            ORDER BY g."date" ASC, g.created_at ASC
        `, values);

        return result.rows.map(rowToGig);
    },

    getById: async (id: string): Promise<Gig | undefined> => {
        const result = await pool.query(`
            SELECT ${GIG_SELECT_COLUMNS}
            FROM artist_gigs g
            JOIN gig_artists ga ON ga.gig_id = g.id
            JOIN artists a ON ga.artist_id = a.id
            LEFT JOIN artist_media_assets ama ON a.musicbrainz_mbid = ama.musicbrainz_mbid
            LEFT JOIN artist_tours t ON g.tour_id = t.id
            LEFT JOIN locations l ON g.city_id = l.id
            LEFT JOIN place_locations pl ON g.place_location_id = pl.id
            WHERE g.id = $1
            GROUP BY g.id, t.id, l.localized_names, pl.id
        `, [id]);

        return result.rows[0] ? rowToGig(result.rows[0]) : undefined;
    },

    // Owner-scoped gig validation
    getOwnedGigIds: async (ids: string[], userId: string): Promise<string[]> => {
        if (ids.length === 0) return [];

        const result = await pool.query<{ id: string }>(`
            SELECT id
            FROM artist_gigs
            WHERE user_id = $1 AND id = ANY($2::uuid[])
        `, [userId, ids]);

        return result.rows.map((row) => row.id);
    },

    create: async (data: StoreGigDTO): Promise<Gig> => {
        const gigId = await withTransaction(async (client) => {
            let tourId = data.tourId;
            if (!tourId && data.newTourName) {
                tourId = await createTourRecord({
                    name: data.newTourName,
                    artistIds: data.artistIds,
                }, data.userId, client);
            }
            const gigName = tourId ? null : data.gigName || null;

            const result = await client.query<{ id: string }>(`
                INSERT INTO artist_gigs (
                    user_id, tour_id, gig_name, venue_name,
                    city, province, country, display_name, city_id, place_location_id,
                    coordinates, display_coordinates,
                    "date", timezone,
                    external_source, external_id, external_artist_id, external_url,
                    imported_at, last_synced_at, raw_external_data
                ) VALUES (
                    $1, $2, $3, $4,
                    $5, $6, $7, $8, $9, $10,
                    ST_SetSRID(ST_MakePoint($11, $12), 4326)::geography,
                    ST_SetSRID(ST_MakePoint($13, $14), 4326)::geography,
                    $15::date, $16,
                    $17, $18, $19, $20,
                    $21, $22, $23
                )
                RETURNING id
            `, [
                data.userId,
                tourId || null,
                gigName,
                data.venueName || null,
                data.location.city,
                data.location.province,
                data.location.country || null,
                data.location.displayName || null,
                data.locationCityId || null,
                data.placeLocationId || null,
                data.location.coordinates.lng,
                data.location.coordinates.lat,
                data.displayCoordinates.lng,
                data.displayCoordinates.lat,
                data.date,
                data.timezone || null,
                data.externalSource || null,
                data.externalId || null,
                data.externalArtistId || null,
                data.externalUrl || null,
                data.importedAt || null,
                data.lastSyncedAt || null,
                data.rawExternalData === undefined || data.rawExternalData === null ? null : JSON.stringify(data.rawExternalData),
            ]);

            await setGigArtists(result.rows[0].id, data.artistIds, client);
            if (tourId) {
                await addTourArtists(tourId, data.artistIds, client);
            }

            return result.rows[0].id;
        });

        return await GigStore.getById(gigId) as Gig;
    },

    update: async (id: string, data: UpdateStoreGigDTO): Promise<Gig | undefined> => {
        const updated = await withTransaction(async (client) => {
            let tourId = data.tourId;
            if (!tourId && data.newTourName && data.artistIds) {
                const current = await GigStore.getById(id);
                tourId = await createTourRecord({
                    name: data.newTourName,
                    artistIds: data.artistIds,
                }, data.userId || current?.userId || '', client);
            }

            const updates: string[] = [];
            const values: unknown[] = [];
            let paramIndex = 1;

            if (data.userId !== undefined) {
                updates.push(`user_id = $${paramIndex++}`);
                values.push(data.userId);
            }

            if (data.tourId !== undefined || tourId !== undefined) {
                updates.push(`tour_id = $${paramIndex++}`);
                values.push(tourId || null);
            }

            if (data.venueName !== undefined) {
                updates.push(`venue_name = $${paramIndex++}`);
                values.push(data.venueName || null);
            }

            if (data.gigName !== undefined) {
                updates.push(`gig_name = $${paramIndex++}`);
                values.push(data.gigName || null);
            }

            if (data.location) {
                updates.push(`city = $${paramIndex++}`);
                values.push(data.location.city);
                updates.push(`province = $${paramIndex++}`);
                values.push(data.location.province);
                updates.push(`country = $${paramIndex++}`);
                values.push(data.location.country || null);
                updates.push(`display_name = $${paramIndex++}`);
                values.push(data.location.displayName || null);
                updates.push(`coordinates = ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)::geography`);
                values.push(data.location.coordinates.lng, data.location.coordinates.lat);
            }

            if (data.locationCityId !== undefined) {
                updates.push(`city_id = $${paramIndex++}`);
                values.push(data.locationCityId || null);
            }

            if (data.placeLocationId !== undefined) {
                updates.push(`place_location_id = $${paramIndex++}`);
                values.push(data.placeLocationId || null);
            }

            if (data.displayCoordinates) {
                updates.push(`display_coordinates = ST_SetSRID(ST_MakePoint($${paramIndex++}, $${paramIndex++}), 4326)::geography`);
                values.push(data.displayCoordinates.lng, data.displayCoordinates.lat);
            }

            if (data.date !== undefined) {
                updates.push(`"date" = $${paramIndex++}::date`);
                values.push(data.date);
            }

            if (data.timezone !== undefined) {
                updates.push(`timezone = $${paramIndex++}`);
                values.push(data.timezone || null);
            }

            if (data.externalSource !== undefined) {
                updates.push(`external_source = $${paramIndex++}`);
                values.push(data.externalSource || null);
            }

            if (data.externalId !== undefined) {
                updates.push(`external_id = $${paramIndex++}`);
                values.push(data.externalId || null);
            }

            if (data.externalArtistId !== undefined) {
                updates.push(`external_artist_id = $${paramIndex++}`);
                values.push(data.externalArtistId || null);
            }

            if (data.externalUrl !== undefined) {
                updates.push(`external_url = $${paramIndex++}`);
                values.push(data.externalUrl || null);
            }

            if (data.importedAt !== undefined) {
                updates.push(`imported_at = $${paramIndex++}`);
                values.push(data.importedAt || null);
            }

            if (data.lastSyncedAt !== undefined) {
                updates.push(`last_synced_at = $${paramIndex++}`);
                values.push(data.lastSyncedAt || null);
            }

            if (data.rawExternalData !== undefined) {
                updates.push(`raw_external_data = $${paramIndex++}`);
                values.push(data.rawExternalData === null ? null : JSON.stringify(data.rawExternalData));
            }

            if (updates.length > 0) {
                values.push(id);
                const result = await client.query(`
                    UPDATE artist_gigs
                    SET ${updates.join(', ')}
                    WHERE id = $${paramIndex}
                    RETURNING id
                `, values);
                if (!result.rows[0]) return false;
            }

            if (data.artistIds) {
                await setGigArtists(id, data.artistIds, client);
                const currentTourId = tourId ?? (await GigStore.getById(id))?.tourId;
                if (currentTourId) {
                    await addTourArtists(currentTourId, data.artistIds, client);
                }
            }

            return true;
        });

        if (!updated) return undefined;

        return await GigStore.getById(id);
    },

    delete: async (id: string): Promise<boolean> => {
        const result = await pool.query('DELETE FROM artist_gigs WHERE id = $1', [id]);
        return result.rowCount !== null && result.rowCount > 0;
    },

    getTours: async (userId: string): Promise<Tour[]> => {
        const result = await pool.query(`
            SELECT ${TOUR_SELECT_COLUMNS}
            FROM artist_tours t
            LEFT JOIN tour_artists ta ON ta.tour_id = t.id
            LEFT JOIN artists a ON ta.artist_id = a.id
            LEFT JOIN artist_media_assets ama ON a.musicbrainz_mbid = ama.musicbrainz_mbid
            LEFT JOIN artist_gigs g ON g.tour_id = t.id
            WHERE t.user_id = $1
            GROUP BY t.id
            ORDER BY COALESCE(MIN(g."date"), t.created_at::date) ASC, t.name ASC
        `, [userId]);

        return result.rows.map(rowToTour);
    },

    getTourById: async (id: string): Promise<Tour | undefined> => {
        const result = await pool.query(`
            SELECT ${TOUR_SELECT_COLUMNS}
            FROM artist_tours t
            LEFT JOIN tour_artists ta ON ta.tour_id = t.id
            LEFT JOIN artists a ON ta.artist_id = a.id
            LEFT JOIN artist_media_assets ama ON a.musicbrainz_mbid = ama.musicbrainz_mbid
            LEFT JOIN artist_gigs g ON g.tour_id = t.id
            WHERE t.id = $1
            GROUP BY t.id
        `, [id]);

        return result.rows[0] ? rowToTour(result.rows[0]) : undefined;
    },

    createTour: async (data: CreateTourDTO, userId: string): Promise<Tour> => {
        const tourId = await withTransaction((client) => createTourRecord(data, userId, client));
        return await GigStore.getTourById(tourId) as Tour;
    },

    updateTour: async (id: string, data: UpdateTourDTO, userId: string): Promise<Tour | undefined> => {
        const updated = await withTransaction(async (client) => {
            const updates: string[] = [];
            const values: unknown[] = [];
            let paramIndex = 1;

            if (data.name !== undefined) {
                updates.push(`name = $${paramIndex++}`);
                values.push(data.name);
            }

            if (updates.length > 0) {
                values.push(id, userId);
                const result = await client.query(`
                    UPDATE artist_tours
                    SET ${updates.join(', ')}
                    WHERE id = $${paramIndex++} AND user_id = $${paramIndex}
                    RETURNING id
                `, values);
                if (!result.rows[0]) return false;
            }

            if (data.artistIds) {
                await client.query('DELETE FROM tour_artists WHERE tour_id = $1', [id]);
                await addTourArtists(id, data.artistIds, client);
            }

            if (data.gigIds) {
                await client.query('UPDATE artist_gigs SET tour_id = NULL WHERE tour_id = $1 AND user_id = $2', [id, userId]);
                await client.query(`
                    UPDATE artist_gigs
                    SET tour_id = $1, gig_name = NULL
                    WHERE user_id = $2 AND id = ANY($3::uuid[])
                `, [id, userId, data.gigIds]);
            }

            return true;
        });

        if (!updated) return undefined;

        return await GigStore.getTourById(id);
    },

    deleteTour: async (id: string, userId: string): Promise<boolean> => {
        const result = await pool.query('DELETE FROM artist_tours WHERE id = $1 AND user_id = $2', [id, userId]);
        return result.rowCount !== null && result.rowCount > 0;
    },
};

import { Response } from 'express';
import { ArtistService } from '../services/artistService';
import { ArtistQueryParams, LocationView, Artist } from '../types/artist';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { ArtistInputSchema } from '../schemas/artistValidation';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import pool from '../config/database';
import { ArtistStore } from '../models/artistStore';

// Cache for featured artists for anonymous users
interface FeaturedArtistsCache {
    artists: Artist[];
    timestamp: number;
}
let featuredArtistsCache: FeaturedArtistsCache | null = null;
const FEATURED_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

async function getFeaturedArtists(): Promise<Artist[]> {
    const now = Date.now();
    if (featuredArtistsCache && (now - featuredArtistsCache.timestamp) < FEATURED_CACHE_TTL_MS) {
        return featuredArtistsCache.artists;
    }

    const artists = await ArtistStore.getFeaturedArtists(50, 20);   // max count, max distance in km
    featuredArtistsCache = { artists, timestamp: now };
    return artists;
}

// Cache admin user ID to avoid repeated queries
let cachedAdminUserId: string | null = null;

async function getAdminUserId(): Promise<string | null> {
    if (cachedAdminUserId) return cachedAdminUserId;

    const result = await pool.query(
        `SELECT id FROM profiles WHERE is_admin = true LIMIT 1`
    );
    cachedAdminUserId = result.rows[0]?.id || null;
    return cachedAdminUserId;
}

interface UserByUsername {
    id: string;
    isPrivate: boolean;
}

async function getUserByUsername(username: string): Promise<UserByUsername | null> {
    const result = await pool.query(
        `SELECT id, is_private as "isPrivate" FROM profiles WHERE username = $1`,
        [username]
    );
    return result.rows[0] || null;
}

/**
 * Look up a user by username and enforce privacy/access control.
 * Returns the resolved user or throws a 404.
 */
async function resolveUsernameWithAccess(req: AuthenticatedRequest): Promise<UserByUsername> {
    const username = req.params.username;
    const targetUser = await getUserByUsername(username);
    if (!targetUser) {
        throw new AppError('User not found', 404);
    }

    const isAdmin = req.profile?.isAdmin ?? false;
    const isOwnProfile = targetUser.id === req.user?.id;

    if (!isOwnProfile && !isAdmin && targetUser.isPrivate) {
        throw new AppError('User not found', 404);
    }

    return targetUser;
}

async function getTargetUserId(req: AuthenticatedRequest): Promise<string | undefined> {
    const isAdmin = req.profile?.isAdmin ?? false;
    const isAuthenticated = !!req.user;

    if (!isAuthenticated) {
        const adminId = await getAdminUserId();
        return adminId ?? undefined;
    }

    if (isAdmin && req.query.viewAll === 'true') {
        return undefined;
    }

    return req.user!.id;
}

export const getAllArtists = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const isAuthenticated = !!req.user;

    // Anonymous users get featured artists
    if (!isAuthenticated) {
        const featuredArtists = await getFeaturedArtists();
        res.json(featuredArtists);
        return;
    }

    const targetUserId = await getTargetUserId(req);

    const filters: ArtistQueryParams = {
        name: req.query.name as string,
        city: req.query.city as string,
        province: req.query.province as string,
        view: req.query.view as LocationView,
        userId: targetUserId
    };

    const artists = await ArtistService.getAll(filters);
    res.json(artists);
});

export const getArtistsByUsername = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const targetUser = await resolveUsernameWithAccess(req);

    const filters: ArtistQueryParams = {
        name: req.query.name as string,
        city: req.query.city as string,
        province: req.query.province as string,
        view: req.query.view as LocationView,
        userId: targetUser.id
    };

    const artists = await ArtistService.getAll(filters);
    res.json(artists);
});

export const copyArtistsByUsername = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const sourceUser = await resolveUsernameWithAccess(req);
    const targetUserId = req.user!.id;

    if (sourceUser.id === targetUserId) {
        throw new AppError('Cannot copy your own artist collection', 400);
    }

    const result = await pool.query<{
        total: number;
        copied: number;
        skipped_musicbrainz: number;
        skipped_custom: number;
    }>(`
        WITH source_artists AS (
            SELECT *
            FROM artists
            WHERE user_id = $1
        ),
        classified AS (
            SELECT
                s.*,
                CASE
                    WHEN s.musicbrainz_mbid IS NOT NULL AND EXISTS (
                        SELECT 1
                        FROM artists t
                        WHERE t.user_id = $2
                          AND t.musicbrainz_mbid = s.musicbrainz_mbid
                    ) THEN 'musicbrainz'
                    WHEN s.musicbrainz_mbid IS NULL AND EXISTS (
                        SELECT 1
                        FROM artists t
                        WHERE t.user_id = $2
                          AND t.musicbrainz_mbid IS NULL
                          AND t.name = s.name
                          AND t.original_city IS NOT DISTINCT FROM s.original_city
                          AND t.original_province IS NOT DISTINCT FROM s.original_province
                          AND t.original_country IS NOT DISTINCT FROM s.original_country
                          AND t.original_city_id IS NOT DISTINCT FROM s.original_city_id
                          AND t.active_city IS NOT DISTINCT FROM s.active_city
                          AND t.active_province IS NOT DISTINCT FROM s.active_province
                          AND t.active_country IS NOT DISTINCT FROM s.active_country
                          AND t.active_city_id IS NOT DISTINCT FROM s.active_city_id
                    ) THEN 'custom'
                    ELSE NULL
                END AS skip_reason
            FROM source_artists s
        ),
        inserted AS (
            INSERT INTO artists (
                user_id, musicbrainz_mbid, name, romanized_name, source_image, avatar_crop, profile_crop,
                original_city, original_province, original_country, original_display_name,
                original_coordinates, original_city_id, original_display_coordinates,
                active_city, active_province, active_country, active_display_name,
                active_coordinates, active_city_id, active_display_coordinates,
                instagram_url, twitter_url, apple_music_url, website_url, youtube_url,
                debut_year, inactive_year
            )
            SELECT
                $2, musicbrainz_mbid, name, romanized_name, source_image, avatar_crop, profile_crop,
                original_city, original_province, original_country, original_display_name,
                original_coordinates, original_city_id, original_display_coordinates,
                active_city, active_province, active_country, active_display_name,
                active_coordinates, active_city_id, active_display_coordinates,
                instagram_url, twitter_url, apple_music_url, website_url, youtube_url,
                debut_year, inactive_year
            FROM classified
            WHERE skip_reason IS NULL
            RETURNING id
        )
        SELECT
            (SELECT COUNT(*) FROM source_artists)::int AS total,
            (SELECT COUNT(*) FROM inserted)::int AS copied,
            (SELECT COUNT(*) FROM classified WHERE skip_reason = 'musicbrainz')::int AS skipped_musicbrainz,
            (SELECT COUNT(*) FROM classified WHERE skip_reason = 'custom')::int AS skipped_custom
    `, [sourceUser.id, targetUserId]);

    const summary = result.rows[0] ?? {
        total: 0,
        copied: 0,
        skipped_musicbrainz: 0,
        skipped_custom: 0
    };

    res.status(201).json({
        total: summary.total,
        copied: summary.copied,
        skipped: summary.skipped_musicbrainz + summary.skipped_custom,
        skippedMusicBrainz: summary.skipped_musicbrainz,
        skippedCustom: summary.skipped_custom
    });
});

export const getArtistById = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const isAdmin = req.profile?.isAdmin ?? false;
    const userId = req.user!.id;

    const artist = await ArtistService.getById(req.params.id);
    if (!artist) {
        throw new AppError('Artist not found', 404);
    }

    // Check ownership (admin can view any artist)
    if (!isAdmin && artist.userId !== userId) {
        throw new AppError('Artist not found', 404);
    }

    res.json(artist);
});

export const createArtist = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = ArtistInputSchema.parse(req.body);
    const userId = req.user!.id;
    const isAdmin = req.profile?.isAdmin ?? false;

    try {
        const newArtist = await ArtistService.create(data, userId, isAdmin);
        res.status(201).json(newArtist);
    } catch (error) {
        if (error instanceof Error && error.message.includes('City not found')) {
            throw new AppError(error.message, 400);
        }
        throw error;
    }
});

export const updateArtist = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const data = ArtistInputSchema.partial().parse(req.body);
    const userId = req.user!.id;
    const isAdmin = req.profile?.isAdmin ?? false;

    // Check ownership (admin can edit any artist)
    const artist = await ArtistService.getById(req.params.id);
    if (!artist) {
        throw new AppError('Artist not found', 404);
    }
    if (!isAdmin && artist.userId !== userId) {
        throw new AppError('Not authorized to update this artist', 403);
    }

    try {
        const updatedArtist = await ArtistService.update(req.params.id, data, userId, isAdmin);
        res.json(updatedArtist);
    } catch (error) {
        if (error instanceof Error && error.message.includes('City not found')) {
            throw new AppError(error.message, 400);
        }
        throw error;
    }
});

export const deleteArtist = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const userId = req.user!.id;
    const isAdmin = req.profile?.isAdmin ?? false;

    // Check ownership (admin can delete any artist)
    const artist = await ArtistService.getById(req.params.id);
    if (!artist) {
        throw new AppError('Artist not found', 404);
    }
    if (!isAdmin && artist.userId !== userId) {
        throw new AppError('Not authorized to delete this artist', 403);
    }

    await ArtistService.delete(req.params.id, artist.userId || userId);
    res.status(204).send();
});

export const getFeaturedArtistsEndpoint = asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
    const featuredArtists = await getFeaturedArtists();
    res.json(featuredArtists);
});

export const getArtistCountByCity = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const view = (req.query.view as LocationView) || 'active';
    if (view !== 'original' && view !== 'active') {
        throw new AppError('Invalid view parameter. Use "original" or "active"', 400);
    }

    const targetUserId = await getTargetUserId(req);
    const counts = await ArtistService.countByCity(view, targetUserId);
    res.json(counts);
});

export const getArtistCountByUsername = asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
    const targetUser = await resolveUsernameWithAccess(req);

    const view = (req.query.view as LocationView) || 'active';
    if (view !== 'original' && view !== 'active') {
        throw new AppError('Invalid view parameter. Use "original" or "active"', 400);
    }

    const counts = await ArtistService.countByCity(view, targetUser.id);
    res.json(counts);
});

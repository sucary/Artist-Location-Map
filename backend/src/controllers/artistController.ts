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

    await ArtistService.delete(req.params.id);
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

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { SearchService } from '../services/searchService';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { optionalAuth, type AuthenticatedRequest } from '../middleware/authMiddleware';
import pool from '../config/database';

const router = Router();

const searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: 'Too many search requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

async function resolveMapUserId(req: AuthenticatedRequest): Promise<string | undefined> {
    const mapUsername = req.query.mapUsername as string | undefined;
    if (!mapUsername) {
        return req.user?.id;
    }

    const result = await pool.query(
        `SELECT id, is_private FROM profiles WHERE username = $1`,
        [mapUsername]
    );
    const targetUser = result.rows[0];
    if (!targetUser) {
        throw new AppError('User not found', 404);
    }

    const isOwnProfile = targetUser.id === req.user?.id;
    const isAdmin = req.profile?.isAdmin ?? false;
    if (!isOwnProfile && !isAdmin && targetUser.is_private) {
        throw new AppError('User not found', 404);
    }

    return targetUser.id;
}

// GET /api/search - Current-map artist search plus global user search
router.get('/', searchLimiter, optionalAuth, asyncHandler(async (req: AuthenticatedRequest, res) => {
    const query = req.query.q as string;
    const limit = parseInt(req.query.limit as string) || 10;
    const excludeUsername = req.query.excludeUser as string | undefined;

    if (!query || query.trim().length < 2) {
        throw new AppError('Query must be at least 2 characters', 400);
    }

    const artistUserId = await resolveMapUserId(req);
    const results = await SearchService.search(query.trim(), limit, artistUserId, excludeUsername);
    res.json(results);
}));

export default router;

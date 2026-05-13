import { Router } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { optionalAuth, requireAuth, requireApproval, type AuthenticatedRequest } from '../middleware/authMiddleware';
import { MusicBrainzCatalogService } from '../services/musicbrainzCatalogService';

const router = Router();

const userOrIpKey = (req: AuthenticatedRequest) => {
    if (req.user?.id) return `user:${req.user.id}`;
    return `ip:${ipKeyGenerator(req.ip || '')}`;
};

const remoteCacheLimiter = rateLimit({
    windowMs: 2 * 1000,
    max: 1,
    message: 'Too many MusicBrainz cache requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userOrIpKey,
});

const remoteSearchLimiter = rateLimit({
    windowMs: 2 * 1000,
    max: 1,
    message: 'Too many MusicBrainz online searches, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: userOrIpKey,
});

const CacheRequestSchema = z.object({
    mbid: z.string().uuid().optional(),
    query: z.string().min(2).optional()
}).refine((value) => value.mbid || value.query, {
    message: 'Either mbid or query is required'
});

const parseResultLimit = (value: unknown, fallback: number, max: number): number => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return fallback;
    return Math.min(parsed, max);
};

router.get('/search', asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    if (!q || q.length < 2) {
        throw new AppError('Query must be at least 2 characters', 400);
    }

    const results = await MusicBrainzCatalogService.search({
        q,
        country: req.query.country as string | undefined,
        type: req.query.type as string | undefined,
        limit: parseResultLimit(req.query.limit, 20, 50),
        offset: parseInt(req.query.offset as string) || 0
    });

    res.json(results);
}));

router.get('/search-online', optionalAuth, remoteSearchLimiter, asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    if (!q || q.length < 2) {
        throw new AppError('Query must be at least 2 characters', 400);
    }

    const results = await MusicBrainzCatalogService.searchRemote(q, {
        limit: parseResultLimit(req.query.limit, 10, 25),
        offset: parseInt(req.query.offset as string) || 0
    });

    res.json(results);
}));

router.get('/:mbid', asyncHandler(async (req, res) => {
    const result = await MusicBrainzCatalogService.getByMbid(req.params.mbid);
    if (!result) {
        throw new AppError('MusicBrainz artist not found in catalog', 404);
    }

    res.json(result);
}));

router.post('/cache', requireAuth, requireApproval, remoteCacheLimiter, asyncHandler(async (req, res) => {
    const data = CacheRequestSchema.parse(req.body);
    const artist = data.mbid
        ? await MusicBrainzCatalogService.fetchAndCacheByMbid(data.mbid, data.query)
        : await MusicBrainzCatalogService.searchRemoteAndCacheFirst(data.query!);

    if (!artist) {
        throw new AppError('MusicBrainz artist not found', 404);
    }

    res.status(201).json(artist);
}));

export default router;

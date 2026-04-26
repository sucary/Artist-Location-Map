import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { requireAuth, requireApproval } from '../middleware/authMiddleware';
import { MusicBrainzCatalogService } from '../services/musicbrainzCatalogService';

const router = Router();

const remoteCacheLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Too many MusicBrainz cache requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const CacheRequestSchema = z.object({
    mbid: z.string().uuid().optional(),
    query: z.string().min(2).optional()
}).refine((value) => value.mbid || value.query, {
    message: 'Either mbid or query is required'
});

router.get('/search', asyncHandler(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    if (!q || q.length < 2) {
        throw new AppError('Query must be at least 2 characters', 400);
    }

    const results = await MusicBrainzCatalogService.search({
        q,
        country: req.query.country as string | undefined,
        type: req.query.type as string | undefined,
        limit: parseInt(req.query.limit as string) || 20
    });

    res.json({ results });
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
        ? await MusicBrainzCatalogService.fetchAndCacheByMbid(data.mbid)
        : await MusicBrainzCatalogService.searchRemoteAndCacheFirst(data.query!);

    if (!artist) {
        throw new AppError('MusicBrainz artist not found', 404);
    }

    res.status(201).json(artist);
}));

export default router;

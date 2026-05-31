import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireApproval, requireAuth } from '../middleware/authMiddleware';
import type { AuthenticatedRequest } from '../middleware/authMiddleware';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { CoordinatesSchema } from '../schemas/artistValidation';
import { VenueSearchError, VenueSearchService } from '../services/venueSearchService';

// Authenticated tour venue and location search routes

const router = Router();

const venueSearchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many venue search requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const SearchQuerySchema = z.object({
    q: z.string().trim().min(2, 'Query must be at least 2 characters'),
    limit: z.coerce.number().int().min(1).max(20).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    countryCode: z.string().trim().length(2).optional(),
    lang: z.string().trim().regex(/^[a-z]{2}$/i).transform((value) => value.toLowerCase()).optional(),
    nativeName: z.coerce.boolean().optional(),
    source: z.enum(['auto', 'geoapify']).optional(),
});

const ManualVenueSchema = z.object({
    name: z.string().trim().min(1, 'Venue name is required').max(255),
    coordinates: CoordinatesSchema,
    displayName: z.string().trim().min(1).max(500).optional(),
    city: z.string().trim().min(1).max(255).optional(),
    province: z.string().trim().min(1).max(255).optional(),
    country: z.string().trim().min(1).max(100).optional(),
    cityId: z.string().uuid().optional(),
});

const ManualVenueParamsSchema = z.object({
    placeLocationId: z.string().uuid(),
});

function toAppError(error: unknown): AppError {
    if (error instanceof VenueSearchError) {
        return new AppError(error.message, error.statusCode);
    }
    return new AppError('Venue search failed', 502);
}

router.use(requireAuth, requireApproval, venueSearchLimiter);

router.get('/search', asyncHandler(async (req, res) => {
    const query = SearchQuerySchema.parse(req.query);

    try {
        const result = await VenueSearchService.searchVenues({
            query: query.q,
            limit: query.limit,
            lat: query.lat,
            lng: query.lng,
            countryCode: query.countryCode,
            lang: query.lang,
            nativeName: query.nativeName,
        });
        res.json(result);
    } catch (error) {
        throw toAppError(error);
    }
}));

router.get('/location-search', asyncHandler(async (req, res) => {
    const query = SearchQuerySchema.parse(req.query);

    try {
        const result = await VenueSearchService.searchLocations({
            query: query.q,
            limit: query.limit,
            lat: query.lat,
            lng: query.lng,
            countryCode: query.countryCode,
            lang: query.lang,
            nativeName: query.nativeName,
            source: query.source,
        });
        res.json(result);
    } catch (error) {
        throw toAppError(error);
    }
}));

router.post('/reverse-local', asyncHandler(async (req, res) => {
    const coordinates = CoordinatesSchema.parse(req.body);
    const result = await VenueSearchService.reverseLocal(coordinates);

    if (!result) {
        throw new AppError('No saved location found at these coordinates', 404);
    }

    res.json(result);
}));

router.post('/manual-venues', asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = ManualVenueSchema.parse(req.body);
    try {
        const result = await VenueSearchService.createManualVenue({
            name: input.name,
            center: input.coordinates,
            displayName: input.displayName,
            city: input.city,
            province: input.province,
            country: input.country,
            cityId: input.cityId,
            createdByUserId: req.user!.id,
        });

        res.status(201).json(result);
    } catch (error) {
        throw toAppError(error);
    }
}));

router.put('/manual-venues/:placeLocationId', asyncHandler(async (req: AuthenticatedRequest, res) => {
    const params = ManualVenueParamsSchema.parse(req.params);
    const input = ManualVenueSchema.parse(req.body);

    try {
        const result = await VenueSearchService.updateManualVenue({
            placeLocationId: params.placeLocationId,
            name: input.name,
            center: input.coordinates,
            displayName: input.displayName,
            city: input.city,
            province: input.province,
            country: input.country,
            cityId: input.cityId,
            createdByUserId: req.user!.id,
        });

        res.json(result);
    } catch (error) {
        throw toAppError(error);
    }
}));

export default router;

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { CityService } from '../services/cityService';
import { TextSearch, ReverseSearch, VALID_LANGS, type LocationLanguage } from '../services/searchHelper';
import { asyncHandler, AppError } from '../middleware/errorHandler';
import { CoordinatesSchema } from '../schemas/artistValidation';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware';
import { LocalizedChain } from '../types/city';

const router = Router();

const searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: 'Too many search requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

const parseResultLimit = (value: unknown, fallback: number, max: number): number => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) return fallback;
    return Math.min(parsed, max);
};

// GET /api/cities/search - Text-based location search
router.get('/search', searchLimiter, asyncHandler(async (req, res) => {
    const query = req.query.q as string;
    const limit = parseResultLimit(req.query.limit, 50, 50);
    const source = (req.query.source as string || 'auto') as 'auto' | 'local' | 'nominatim';
    const langParam = req.query.lang as string | undefined;
    const lang = langParam && VALID_LANGS.has(langParam as LocationLanguage)
        ? langParam as LocationLanguage
        : undefined;

    if (!query || query.trim().length < 2) {
        throw new AppError('Query must be at least 2 characters', 400);
    }

    console.log(`[SEARCH] Text search: "${query.trim()}" (source: ${source}, limit: ${limit}, lang: ${lang || 'default'})`);

    const result = await TextSearch.search(query.trim(), limit, source, lang);

    console.log(`[SEARCH] Results: ${result.results.length} from ${result.source}, hasMore: ${result.hasMore}`);

    res.json(result);
}));

// POST /api/cities/reverse/search - Coordinate-based search (multiple results)
router.post('/reverse/search', searchLimiter, asyncHandler(async (req, res) => {
    const { lat, lng } = CoordinatesSchema.parse(req.body);
    const limit = parseResultLimit(req.query.limit, 50, 50);
    const source = (req.query.source as string || 'auto') as 'auto' | 'nominatim';

    console.log(`[SEARCH] Reverse search: (${lat}, ${lng}) (source: ${source}, limit: ${limit})`);

    const result = await ReverseSearch.search(lat, lng, limit, source);

    if (result.results.length === 0) {
        throw new AppError('No location found at these coordinates', 404);
    }

    console.log(`[SEARCH] Reverse results: ${result.results.length} from ${result.source}`);

    res.json(result);
}));

// POST /api/cities/reverse - Simple reverse geocode (single result)
router.post('/reverse', searchLimiter, asyncHandler(async (req, res) => {
    const { lat, lng } = CoordinatesSchema.parse(req.body);
    const withBoundary = req.query.withBoundary === 'true';

    let city = await CityService.reverseGeocode(lat, lng);

    if (!city) {
        throw new AppError('No city found at these coordinates', 404);
    }

    if (withBoundary && !city.id) {
        // City found via Nominatim but not in DB - fetch and save
        const nominatimData = await CityService.fetchByOsmId(city.osmId, city.osmType);
        if (nominatimData) {
            city = await CityService.saveFromNominatim(nominatimData);
        }
    } else if (withBoundary && city.id && !city.boundary) {
        // City in DB but boundary not loaded
        const fullCity = await CityService.getById(city.id);
        if (fullCity) {
            city = fullCity;
        }
    }

    res.json(city);
}));

// GET /api/cities/:id - Get city by ID
router.get('/:id', asyncHandler(async (req, res) => {
    const city = await CityService.getById(req.params.id);
    if (!city) {
        throw new AppError('City not found', 404);
    }
    res.json(city);
}));

// GET /api/cities/:id/localized-names - Get localized names for a location (admin only)
router.get('/:id/localized-names', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const localized = await CityService.getLocalizedById(req.params.id);
    if (!localized) {
        throw new AppError('Location not found or not yet localized', 404);
    }
    res.json(localized);
}));

const VALID_CHAIN_KEYS = new Set(['city', 'province', 'country']);
const VALID_NAME_KEYS = new Set(['en', 'zhHans', 'zhHant', 'ja', 'native']);

function validateLocalizedChain(chain: unknown): chain is LocalizedChain {
    if (!chain || typeof chain !== 'object') return false;
    const obj = chain as Record<string, unknown>;
    if (!obj.city || typeof obj.city !== 'object') return false;
    for (const key of Object.keys(obj)) {
        if (!VALID_CHAIN_KEYS.has(key)) return false;
        const names = obj[key];
        if (typeof names !== 'object' || names === null) return false;
        for (const nameKey of Object.keys(names as Record<string, unknown>)) {
            if (!VALID_NAME_KEYS.has(nameKey)) return false;
            if (typeof (names as Record<string, unknown>)[nameKey] !== 'string') return false;
        }
    }
    return true;
}

// PATCH /api/cities/:id/localized-names - Manually update localized names (admin only)
router.patch('/:id/localized-names', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { localizedNames, reset } = req.body;

    const city = await CityService.getById(id);
    if (!city) {
        throw new AppError('City not found', 404);
    }

    // Reset: clear manual flag so ensureLocalized will re-fetch
    if (reset === true) {
        await CityService.resetLocalizedNames(id);
        res.json({ message: 'Localized names reset to auto-fetch', id });
        return;
    }

    if (!validateLocalizedChain(localizedNames)) {
        throw new AppError(
            'Invalid localizedNames. Expected {city: {en?, zhHans?, zhHant?, ja?, native?}, province?: {...}, country?: {...}}',
            400
        );
    }

    await CityService.updateLocalizedNames(id, localizedNames);
    res.json({ message: 'Localized names updated', id, localizedNames });
}));

export default router;

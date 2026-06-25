import { z } from 'zod';

// Venue and tour-location search query validation

// z.coerce.boolean() uses Boolean(value), so the query string "false" coerces
// to true. Parse common truthy/falsy string tokens explicitly instead.
const QueryBooleanSchema = z.preprocess((value) => {
    if (typeof value !== 'string') return value;

    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
    return value;
}, z.boolean().optional());

export const VenueSearchQuerySchema = z.object({
    q: z.string().trim().min(2, 'Query must be at least 2 characters'),
    limit: z.coerce.number().int().min(1).max(20).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    countryCode: z.string().trim().length(2).optional(),
    lang: z.string().trim().regex(/^[a-z]{2}$/i).transform((value) => value.toLowerCase()).optional(),
    nativeName: QueryBooleanSchema,
    source: z.enum(['auto', 'geoapify']).optional(),
});

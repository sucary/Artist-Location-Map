import { z } from 'zod';
import { CoordinatesSchema } from './artistValidation';

// Gig request validation schemas

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');
const LOCAL_TIME = z.string()
    .regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time must use HH:MM format')
    .refine((value) => {
        const [hour, minute, second = 0] = value.split(':').map(Number);
        return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59;
    }, 'Time must be a valid local time');

const OPTIONAL_URL = z.string()
    .trim()
    .url()
    .refine((value) => value.startsWith('https://') || value.startsWith('http://'), {
        message: 'URL must use http or https',
    });

const optionalText = z.string()
    .trim()
    .max(255)
    .optional()
    .nullable()
    .transform((value) => value || undefined);

const clearableText = z.string()
    .trim()
    .max(255)
    .optional()
    .nullable()
    .transform((value) => value || null);

const optionalDateTime = z.string()
    .datetime()
    .optional()
    .nullable()
    .transform((value) => value ?? undefined);

// External tour locations can persist without local city boundaries
const PROVIDER_LOCATION_SOURCES = new Set(['geoapify', 'local', 'manual', 'venue']);

const GigLocationSchema = z.object({
    city: z.string().min(1, 'City is required'),
    province: z.string().min(1, 'Province is required'),
    country: z.string().optional().nullable().transform((value) => value ?? undefined),
    displayName: z.string().optional().nullable().transform((value) => value ?? undefined),
    coordinates: CoordinatesSchema,
    osmId: z.number().optional(),
    osmType: z.string().optional(),
    type: z.string().optional(),
    isManualSelection: z.boolean().optional(),
    cityId: z.string().uuid().optional(),
    source: z.enum(['geoapify', 'local', 'manual', 'venue']).optional(),
}).superRefine((location, context) => {
    if (location.cityId) return;
    if (location.source && PROVIDER_LOCATION_SOURCES.has(location.source)) return;

    if (!location.osmId || !location.osmType) {
        context.addIssue({
            code: 'custom',
            message: 'Gig location must include cityId, provider source, or osmId and osmType',
            path: ['cityId'],
        });
    }
});

const GigBaseSchema = z.object({
    artistIds: z.array(z.string().uuid()).min(1),
    tourId: z.string().uuid().optional().nullable(),
    newTourName: optionalText,
    gigName: clearableText,
    venueName: clearableText,
    placeLocationId: z.string().uuid().optional().nullable(),
    location: GigLocationSchema,
    date: ISO_DATE,
    time: LOCAL_TIME.optional().nullable().transform((value) => value || null),
    timezone: clearableText,
    externalSource: clearableText,
    externalId: clearableText,
    externalArtistId: clearableText,
    externalUrl: OPTIONAL_URL.optional().nullable().or(z.literal('')).transform((value) => value || undefined),
    importedAt: optionalDateTime,
    lastSyncedAt: optionalDateTime,
    rawExternalData: z.unknown().optional(),
});

export const GigInputSchema = GigBaseSchema;

export const GigUpdateSchema = GigBaseSchema.partial();

export const TourInputSchema = z.object({
    name: z.string().trim().min(1).max(255),
    artistIds: z.array(z.string().uuid()).optional(),
    gigIds: z.array(z.string().uuid()).optional(),
});

export const TourUpdateSchema = TourInputSchema.partial();

export const GigQuerySchema = z.object({
    from: ISO_DATE.optional(),
    to: ISO_DATE.optional(),
    q: z.string().trim().min(1).max(100).optional(),
}).refine((value) => !value.from || !value.to || value.to >= value.from, {
    message: 'To date must be on or after from date',
    path: ['to'],
});

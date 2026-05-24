import { z } from 'zod';
import { LocationSchema } from './artistValidation';

// Gig request validation schemas

const ISO_DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD format');

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

const optionalDateTime = z.string()
    .datetime()
    .optional()
    .nullable()
    .transform((value) => value ?? undefined);

const GigBaseSchema = z.object({
    artistIds: z.array(z.string().uuid()).min(1),
    tourId: z.string().uuid().optional().nullable(),
    newTourName: optionalText,
    venueName: optionalText,
    location: LocationSchema,
    date: ISO_DATE,
    timezone: optionalText,
    externalSource: optionalText,
    externalId: optionalText,
    externalArtistId: optionalText,
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

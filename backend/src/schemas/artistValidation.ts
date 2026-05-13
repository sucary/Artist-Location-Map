import { z } from 'zod';

// Artist request validation schemas

const OPTIONAL_URL = z.string()
    .trim()
    .url()
    .refine((value) => value.startsWith('https://') || value.startsWith('http://'), {
        message: 'URL must use http or https',
    });

const optionalUrlField = OPTIONAL_URL.optional().or(z.literal(''));

const hostMatches = (value: string, hosts: string[]) => {
    try {
        const hostname = new URL(value).hostname.replace(/^www\./, '').toLowerCase();
        return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
    } catch {
        return false;
    }
};

export const CoordinatesSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
});

export const LocationSchema = z.object({
    city: z.string().min(1, "City is required"),
    province: z.string().min(1, "Province is required"),
    country: z.string().optional().nullable().transform(val => val ?? undefined),
    displayName: z.string().optional().nullable().transform(val => val ?? undefined),
    coordinates: CoordinatesSchema,
    osmId: z.number().optional(),
    osmType: z.string().optional(),
    isManualSelection: z.boolean().optional(),
});

export const SocialLinksSchema = z.object({
    instagram: optionalUrlField.refine((value) => !value || hostMatches(value, ['instagram.com']), {
        message: 'Instagram URL must be an instagram.com URL',
    }),
    twitter: optionalUrlField.refine((value) => !value || hostMatches(value, ['twitter.com', 'x.com']), {
        message: 'Twitter/X URL must be a twitter.com or x.com URL',
    }),
    appleMusic: optionalUrlField.refine((value) => !value || hostMatches(value, ['music.apple.com', 'itunes.apple.com']), {
        message: 'Apple Music URL must be an Apple Music URL',
    }),
    website: optionalUrlField,
    youtube: optionalUrlField.refine((value) => !value || hostMatches(value, ['youtube.com', 'youtu.be']), {
        message: 'YouTube URL must be a youtube.com or youtu.be URL',
    }),
});

const optionalImageUrlField = OPTIONAL_URL.optional()
    .nullable()
    .or(z.literal(''))
    .transform(val => val || undefined);

export const CropAreaSchema = z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().positive(),
    height: z.number().positive(),
});

export const ArtistInputSchema = z.object({
    musicbrainzMbid: z.string().uuid().optional().nullable().transform(val => val ?? undefined),
    name: z.string().min(1, "Name is required"),
    romanizedName: z.string().optional().nullable().transform(val => val?.trim() || undefined),
    sourceImage: optionalImageUrlField,
    avatarCrop: CropAreaSchema.optional().nullable().transform(val => val ?? undefined),
    profileCrop: CropAreaSchema.optional().nullable().transform(val => val ?? undefined),
    originalLocation: LocationSchema,
    activeLocation: LocationSchema,
    socialLinks: SocialLinksSchema.optional(),
    debutYear: z.number().int().min(1900).max(2100).optional().nullable().transform(val => val ?? undefined),
    inactiveYear: z.number().int().min(1900).max(2100).optional().nullable().transform(val => val ?? undefined),
});

export type ArtistFormData = z.infer<typeof ArtistInputSchema>;

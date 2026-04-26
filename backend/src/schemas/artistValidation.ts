import { z } from 'zod';

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
    instagram: z.string().optional().or(z.literal('')),
    twitter: z.string().optional().or(z.literal('')),
    appleMusic: z.string().optional().or(z.literal('')),
    website: z.string().optional().or(z.literal('')),
    youtube: z.string().optional().or(z.literal('')),
});

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
    sourceImage: z.string().optional().nullable().transform(val => val ?? undefined),
    avatarCrop: CropAreaSchema.optional().nullable().transform(val => val ?? undefined),
    profileCrop: CropAreaSchema.optional().nullable().transform(val => val ?? undefined),
    originalLocation: LocationSchema,
    activeLocation: LocationSchema,
    socialLinks: SocialLinksSchema.optional(),
    debutYear: z.number().int().min(1900).max(2100).optional().nullable().transform(val => val ?? undefined),
    inactiveYear: z.number().int().min(1900).max(2100).optional().nullable().transform(val => val ?? undefined),
});

export type ArtistFormData = z.infer<typeof ArtistInputSchema>;

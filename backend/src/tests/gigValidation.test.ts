import { describe, expect, it } from 'vitest';
import { GigInputSchema } from '../schemas/gigValidation';

// Gig validation provider-location coverage

const baseGig = {
    artistIds: ['11111111-1111-4111-8111-111111111111'],
    date: '2026-06-01',
};

describe('GigInputSchema', () => {
    it('accepts tour provider locations with cityId instead of OSM identifiers', () => {
        const parsed = GigInputSchema.parse({
            ...baseGig,
            gigName: 'Album release show',
            venueName: 'Tokyo Dome',
            location: {
                city: 'Bunkyo',
                province: 'Tokyo',
                country: 'Japan',
                coordinates: { lat: 35.7055706, lng: 139.7519705 },
                cityId: '22222222-2222-4222-8222-222222222222',
                source: 'geoapify',
            },
        });

        expect(parsed.location).toMatchObject({
            cityId: '22222222-2222-4222-8222-222222222222',
            source: 'geoapify',
        });
        expect(parsed.gigName).toBe('Album release show');
    });

    it('normalizes empty optional gig names to null', () => {
        const parsed = GigInputSchema.parse({
            ...baseGig,
            gigName: '   ',
            location: {
                city: 'Bunkyo',
                province: 'Tokyo',
                country: 'Japan',
                coordinates: { lat: 35.7055706, lng: 139.7519705 },
                source: 'geoapify',
            },
        });

        expect(parsed.gigName).toBeNull();
    });

    it('accepts tour provider locations without local cityId', () => {
        const parsed = GigInputSchema.parse({
            ...baseGig,
            venueName: 'Tokyo Dome',
            placeLocationId: '33333333-3333-4333-8333-333333333333',
            location: {
                city: 'Bunkyo',
                province: 'Tokyo',
                country: 'Japan',
                coordinates: { lat: 35.7055706, lng: 139.7519705 },
                source: 'geoapify',
            },
        });

        expect(parsed.location).toMatchObject({
            source: 'geoapify',
        });
        expect(parsed.placeLocationId).toBe('33333333-3333-4333-8333-333333333333');
    });

    it('rejects non-provider gig locations without cityId or OSM identifiers', () => {
        expect(() => GigInputSchema.parse({
            ...baseGig,
            location: {
                city: 'Bunkyo',
                province: 'Tokyo',
                country: 'Japan',
                coordinates: { lat: 35.7055706, lng: 139.7519705 },
            },
        })).toThrow();
    });
});

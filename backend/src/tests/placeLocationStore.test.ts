import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanupTestDb, closeTestDb, getPool, initTestDb } from './setup';

// Place location persistence and search coverage

const runDbIntegration = process.env.RUN_DB_INTEGRATION === 'true';

describe.skipIf(!runDbIntegration)('PlaceLocationStore', () => {
    let PlaceLocationStore: Awaited<typeof import('../models/placeLocationStore')>['PlaceLocationStore'];

    beforeAll(async () => {
        await initTestDb();
        const module = await import('../models/placeLocationStore');
        PlaceLocationStore = module.PlaceLocationStore;
    });

    afterEach(async () => {
        const pool = await getPool();
        await pool.query('TRUNCATE place_locations RESTART IDENTITY CASCADE');
        await cleanupTestDb();
    });

    afterAll(async () => {
        await closeTestDb();
    });

    it('upserts and searches venue places', async () => {
        const saved = await PlaceLocationStore.upsertMany([{
            provider: 'geoapify',
            providerPlaceId: 'tokyo-dome',
            name: 'Tokyo Dome',
            formatted: 'Tokyo Dome, Bunkyo, Tokyo, Japan',
            city: 'Bunkyo',
            province: 'Tokyo',
            country: 'Japan',
            countryCode: 'jp',
            coordinates: { lat: 35.7055706, lng: 139.7519705 },
            categories: ['activity.events_venue', 'sport.stadium'],
            isVenue: true,
            timezone: 'Asia/Tokyo',
            rawProviderData: { source: 'geoapify' },
        }]);

        expect(saved[0]).toMatchObject({
            provider: 'geoapify',
            providerPlaceId: 'tokyo-dome',
            name: 'Tokyo Dome',
            isVenue: true,
            categories: ['activity.events_venue', 'sport.stadium'],
        });

        const results = await PlaceLocationStore.search('dome', 10);
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({
            id: saved[0].id,
            name: 'Tokyo Dome',
            coordinates: { lat: 35.7055706, lng: 139.7519705 },
        });
    });

    it('updates existing provider places instead of duplicating them', async () => {
        await PlaceLocationStore.upsertMany([{
            provider: 'geoapify',
            providerPlaceId: 'www-vinkovci',
            name: 'WWW',
            coordinates: { lat: 45.2881, lng: 18.8053 },
            categories: ['activity.events_venue'],
            isVenue: true,
        }]);

        await PlaceLocationStore.upsertMany([{
            provider: 'geoapify',
            providerPlaceId: 'www-vinkovci',
            name: 'WWW Club',
            coordinates: { lat: 45.2882, lng: 18.8054 },
            categories: ['activity.events_venue'],
            isVenue: true,
        }]);

        const results = await PlaceLocationStore.search('www', 10);
        expect(results).toHaveLength(1);
        expect(results[0].name).toBe('WWW Club');
    });
});

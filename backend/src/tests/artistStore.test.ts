import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { initTestDb, cleanupTestDb, closeTestDb } from './setup';

// Import AFTER setup loads .env.test
import { ArtistStore } from '../models/artistStore';

beforeAll(async () => {
    await initTestDb();
});

afterEach(async () => {
    await cleanupTestDb();
});

afterAll(async () => {
    await closeTestDb();
});

describe('ArtistStore', () => {
    const testArtist = {
        name: 'Test Artist',
        originalLocation: {
            city: 'Tokyo',
            province: 'Tokyo',
            coordinates: { lat: 35.6762, lng: 139.6503 },
        },
        activeLocation: {
            city: 'Osaka',
            province: 'Osaka',
            coordinates: { lat: 34.6937, lng: 135.5023 },
        },
    };

    describe('getAll', () => {
        it('returns empty array when no artists', async () => {
            const result = await ArtistStore.getAll();
            expect(result).toEqual([]);
        });
    });

    describe('create', () => {
        it('creates artist with correct coordinates', async () => {
            const created = await ArtistStore.create(testArtist);

            expect(created.name).toBe('Test Artist');
            expect(created.originalLocation.coordinates.lat).toBeCloseTo(35.6762);
            expect(created.originalLocation.coordinates.lng).toBeCloseTo(139.6503);
        });
    });

    describe('countByCity', () => {
        it('returns empty array when no artists', async () => {
            const result = await ArtistStore.countByCity();
            expect(result).toEqual([]);
        });

        it('returns correct counts by active city', async () => {
            await ArtistStore.create(testArtist);
            await ArtistStore.create({
                ...testArtist,
                name: 'Test Artist 2',
            });
            await ArtistStore.create({
                ...testArtist,
                name: 'Test Artist 3',
                activeLocation: {
                    city: 'Kyoto',
                    province: 'Kyoto',
                    coordinates: { lat: 35.0116, lng: 135.7681 },
                },
            });

            const result = await ArtistStore.countByCity('active');
            expect(result).toHaveLength(2);
            expect(result.find(r => r.location === 'Osaka')?.count).toBe(2);
            expect(result.find(r => r.location === 'Kyoto')?.count).toBe(1);
        });

        it('returns correct counts by original city', async () => {
            await ArtistStore.create(testArtist);
            await ArtistStore.create({
                ...testArtist,
                name: 'Test Artist 2',
                originalLocation: {
                    city: 'Yokohama',
                    province: 'Kanagawa',
                    coordinates: { lat: 35.4437, lng: 139.6380 },
                },
            });

            const result = await ArtistStore.countByCity('original');
            expect(result).toHaveLength(2);
            expect(result.find(r => r.location === 'Tokyo')?.count).toBe(1);
            expect(result.find(r => r.location === 'Yokohama')?.count).toBe(1);
        });
    });
});
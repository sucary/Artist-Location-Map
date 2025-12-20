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
            city: 'Toronto',
            province: 'Ontario',
            coordinates: { lat: 43.6532, lng: -79.3832 },
        },
        activeLocation: {
            city: 'Vancouver',
            province: 'BC',
            coordinates: { lat: 49.2827, lng: -123.1207 },
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
            expect(created.originalLocation.coordinates.lat).toBeCloseTo(43.6532);
            expect(created.originalLocation.coordinates.lng).toBeCloseTo(-79.3832);
        });
    });

    // TODO: add more tests
});
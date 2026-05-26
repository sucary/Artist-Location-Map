import { describe, expect, it } from 'vitest';
import { normalizeGeoapifyResult, normalizeResults } from '../services/venueSearchService';
import type { City } from '../types/city';

// Geoapify normalization safeguards

const localCity: City = {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Bunkyo',
    province: 'Tokyo',
    country: 'Japan',
    center: { lat: 35.7, lng: 139.75 },
    osmId: 1,
    osmType: 'relation',
};

describe('venueSearchService', () => {
    it('normalizes a Geoapify venue result without OSM identifiers', () => {
        const result = normalizeGeoapifyResult({
            place_id: 'geoapify-place',
            name: 'Tokyo Dome',
            city: 'Bunkyo',
            country: 'Japan',
            lon: 139.7519705,
            lat: 35.7055706,
            result_type: 'amenity',
            formatted: 'Tokyo Dome, Bunkyo, Tokyo, Japan',
            category: 'sport.stadium',
            rank: { confidence: 1 },
        }, 'venue', localCity);

        expect(result).toMatchObject({
            source: 'geoapify',
            providerId: 'geoapify-place',
            venueName: 'Tokyo Dome',
            city: 'Bunkyo',
            province: 'Tokyo',
            cityId: localCity.id,
            center: { lat: 35.7055706, lng: 139.7519705 },
            categories: ['sport.stadium'],
        });
        expect(result).not.toHaveProperty('osmId');
    });

    it('keeps location results free of venue metadata', () => {
        const result = normalizeGeoapifyResult({
            place_id: 'tokyo',
            name: 'Tokyo',
            city: 'Tokyo',
            state: 'Tokyo',
            country: 'Japan',
            lon: 139.6917,
            lat: 35.6895,
            result_type: 'city',
            formatted: 'Tokyo, Japan',
        }, 'location', localCity);

        expect(result).toMatchObject({
            source: 'geoapify',
            name: 'Tokyo',
            cityId: localCity.id,
        });
        expect(result).not.toHaveProperty('venueName');
        expect(result).not.toHaveProperty('rawExternalData');
    });

    it('uses Geoapify address fields when no local city is matched', () => {
        const result = normalizeGeoapifyResult({
            place_id: 'geoapify-place',
            name: 'WWW',
            city: 'Vinkovci',
            state: 'Vukovar-Syrmia',
            country: 'Croatia',
            lon: 18.8053,
            lat: 45.2881,
            result_type: 'amenity',
            formatted: 'WWW, Vinkovci, Croatia',
        }, 'venue', null);

        expect(result).toMatchObject({
            city: 'Vinkovci',
            province: 'Vukovar-Syrmia',
            country: 'Croatia',
        });
        expect(result).not.toHaveProperty('cityId');
    });

    it('prefers Geoapify native alternate names when requested', () => {
        const result = normalizeGeoapifyResult({
            place_id: 'tokyo-dome',
            name: 'Tokyo Dome',
            city: 'Bunkyo',
            country: 'Japan',
            lon: 139.7519705,
            lat: 35.7055706,
            result_type: 'amenity',
            formatted: 'Tokyo Dome, Bunkyo, Tokyo, Japan',
            other_names: {
                name: '東京ドーム',
                'name:ja': '東京ドーム',
            },
        }, 'venue', null, { nameLanguage: 'native', isCached: true });

        expect(result).toMatchObject({
            name: '東京ドーム',
            venueName: '東京ドーム',
            isCached: true,
        });
    });

    it('prefers language-specific Geoapify alternate venue names', () => {
        const result = normalizeGeoapifyResult({
            place_id: 'tokyo-dome',
            name: 'Tokyo Dome',
            city: 'Bunkyo',
            country: 'Japan',
            lon: 139.7519705,
            lat: 35.7055706,
            result_type: 'amenity',
            formatted: 'Tokyo Dome, Bunkyo, Tokyo, Japan',
            other_names: {
                name: '東京ドーム',
                'name:ja': '東京ドーム',
            },
        }, 'venue', null, { nameLanguage: 'ja' });

        expect(result).toMatchObject({
            name: '東京ドーム',
            venueName: '東京ドーム',
        });
    });

    it('promotes gig venue categories before normal location results', () => {
        const results = normalizeResults([
            {
                place_id: 'tokyo-city',
                name: 'Tokyo',
                city: 'Tokyo',
                country: 'Japan',
                lon: 139.6917,
                lat: 35.6895,
                result_type: 'city',
                formatted: 'Tokyo, Japan',
            },
            {
                place_id: 'live-house',
                name: 'Live House Example',
                city: 'Tokyo',
                country: 'Japan',
                lon: 139.7,
                lat: 35.69,
                result_type: 'amenity',
                formatted: 'Live House Example, Tokyo, Japan',
                categories: ['activity.events_venue'],
            },
        ], 'location', {});

        expect(results[0]).toMatchObject({
            name: 'Live House Example',
            isVenue: true,
            venueName: 'Live House Example',
        });
        expect(results[1]).toMatchObject({
            name: 'Tokyo',
            isVenue: false,
        });
    });
});

import 'dotenv/config';
import pool from '../config/database';
import { applyLocationDisplayOverride } from '../services/locationDisplayOverrides';

// Priority location seed records from Nominatim

interface PriorityLocationSeed {
    searchQueries: string[];
    nominatimQuery: string;
    rank: number;
}

const TOKYO_PRIORITY_SEARCH_QUERIES = ['tokyo', '东京', 'tokyo, japan', '東京'];

// Product-prioritized city choices
const PRIORITY_SEEDS: PriorityLocationSeed[] = [
    { searchQueries: TOKYO_PRIORITY_SEARCH_QUERIES, nominatimQuery: 'Tokyo, Japan', rank: 1 },
    { searchQueries: TOKYO_PRIORITY_SEARCH_QUERIES, nominatimQuery: 'Tokyo 23 wards, Tokyo, Japan', rank: 0 },
    { searchQueries: ['new york'], nominatimQuery: 'New York City, New York, USA', rank: 0 },
];

interface NominatimResult {
    osm_id: number;
    osm_type: string;
    lat: string;
    lon: string;
    display_name: string;
    name?: string;
    address?: {
        city?: string;
        state?: string;
        province?: string;
        country?: string;
    };
}

async function fetchFromNominatim(query: string): Promise<NominatimResult | null> {
    const params = new URLSearchParams({
        q: query,
        format: 'json',
        addressdetails: '1',
        limit: '1'
    });

    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;
    console.log(`Fetching: ${url}`);

    const response = await fetch(url, {
        headers: { 'User-Agent': 'ArtistLocationMap/1.0' }
    });

    if (!response.ok) {
        throw new Error(`Nominatim error: ${response.statusText}`);
    }

    const results = await response.json() as NominatimResult[];
    return results.length > 0 ? results[0] : null;
}

async function seedPriorityLocations() {
    console.log('Seeding priority locations from Nominatim...\n');

    for (const seed of PRIORITY_SEEDS) {
        try {
            console.log(`Processing: "${seed.searchQueries.join(', ')}" -> "${seed.nominatimQuery}"`);

            const fetchedResult = await fetchFromNominatim(seed.nominatimQuery);

            if (!fetchedResult) {
                console.log(`  No result found for "${seed.nominatimQuery}", skipping\n`);
                continue;
            }

            const result = applyLocationDisplayOverride(fetchedResult);
            const name = result.name
                || result.address?.city
                || result.display_name.split(',')[0].trim();
            const province = result.address?.state || result.address?.province || '';
            const country = result.address?.country || '';

            console.log(`  Found: ${result.display_name}`);
            console.log(`  OSM: ${result.osm_type}/${result.osm_id}`);
            console.log(`  Coordinates: ${result.lat}, ${result.lon}`);

            for (const searchQuery of seed.searchQueries) {
                await pool.query(`
                    INSERT INTO priority_locations
                        (search_query, osm_id, osm_type, name, province, country, display_name, lat, lng, rank)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (search_query, osm_id, osm_type)
                    DO UPDATE SET
                        name = EXCLUDED.name,
                        province = EXCLUDED.province,
                        country = EXCLUDED.country,
                        display_name = EXCLUDED.display_name,
                        lat = EXCLUDED.lat,
                        lng = EXCLUDED.lng,
                        rank = EXCLUDED.rank
                `, [
                    searchQuery.toLowerCase(),
                    result.osm_id,
                    result.osm_type,
                    name,
                    province,
                    country,
                    result.display_name,
                    parseFloat(result.lat),
                    parseFloat(result.lon),
                    seed.rank
                ]);
            }

            console.log('  Saved!\n');

            // Nominatim rate limit boundary
            await new Promise(resolve => setTimeout(resolve, 1100));

        } catch (error) {
            console.error(`  Error processing "${seed.searchQueries.join(', ')}":`, error);
        }
    }

    console.log('Done seeding priority locations.');
    await pool.end();
}

seedPriorityLocations().catch(console.error);

import { CityService } from './cityService';
import { SearchCacheService } from './searchCacheService';
import { TextSearch, type LocationLanguage, type SearchResult as LocalSearchResult } from './searchHelper';
import { PlaceLocationStore, type PlaceLocation, type UpsertPlaceLocationInput } from '../models/placeLocationStore';
import type { City } from '../types/city';
import type { Coordinates } from '../types/artist';
import type {
    TourLocationSearchResponse,
    TourLocationSearchResult,
    VenueSearchResponse,
    VenueSearchResult,
} from '../types/venue';

// Geoapify-backed tour venue and location search

const GEOAPIFY_GEOCODING_URL = 'https://api.geoapify.com/v1/geocode/search';
const GEOAPIFY_TIMEOUT_MS = 9000;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 20;

type SearchMode = 'venue' | 'location';
type NameLanguage = 'native' | 'en' | 'zh' | 'ja';

const GIG_VENUE_CATEGORY_PREFIXES = [
    'activity.events_venue',
    'adult.nightclub',
    'catering.bar',
    'catering.pub',
    'catering.taproom',
    'commercial.video_and_music',
    'entertainment.culture.arts_centre',
    'entertainment.culture.theatre',
    'sport.stadium',
    'sport.sports_hall',
];

const GIG_VENUE_NAME_HINTS = [
    'arena',
    'auditorium',
    'bar',
    'club',
    'concert',
    'dome',
    'hall',
    'live house',
    'music hall',
    'nightclub',
    'stadium',
    'theater',
    'theatre',
    'venue',
];

export class VenueSearchError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.statusCode = statusCode;
    }
}

interface GeoapifyRank {
    importance?: number;
    popularity?: number;
    confidence?: number;
    match_type?: string;
}

interface GeoapifyResult {
    place_id?: string;
    name?: string;
    city?: string;
    state?: string;
    state_district?: string;
    county?: string;
    district?: string;
    suburb?: string;
    country?: string;
    country_code?: string;
    lon?: number;
    lat?: number;
    result_type?: string;
    formatted?: string;
    address_line1?: string;
    address_line2?: string;
    category?: string;
    categories?: string[];
    timezone?: unknown;
    bbox?: unknown;
    rank?: GeoapifyRank;
    other_names?: Record<string, string>;
}

interface GeoapifyResponse {
    results?: GeoapifyResult[];
}

interface SearchInput {
    query: string;
    limit?: number;
    lat?: number;
    lng?: number;
    countryCode?: string;
    lang?: string;
    nativeName?: boolean;
}

interface LocalFirstSearchInput extends SearchInput {
    locationLanguage?: LocationLanguage;
}

function getApiKey(): string {
    const key = process.env.GEOAPIFY_API_KEY;
    if (!key) {
        throw new VenueSearchError('Geoapify API key is not configured', 503);
    }
    return key;
}

function parseLimit(limit: number | undefined): number {
    if (!Number.isInteger(limit) || !limit || limit < 1) return DEFAULT_LIMIT;
    return Math.min(limit, MAX_LIMIT);
}

function buildGeoapifyUrl(input: SearchInput, mode: SearchMode): string {
    const params = new URLSearchParams({
        text: input.query,
        format: 'json',
        limit: String(parseLimit(input.limit)),
        apiKey: getApiKey(),
    });

    if (mode === 'venue') {
        params.set('type', 'amenity');
    }

    if (Number.isFinite(input.lat) && Number.isFinite(input.lng)) {
        params.set('bias', `proximity:${input.lng},${input.lat}`);
    }

    if (input.countryCode) {
        params.set('filter', `countrycode:${input.countryCode.toLowerCase()}`);
    }

    if (input.lang) {
        params.set('lang', input.lang);
    }

    return `${GEOAPIFY_GEOCODING_URL}?${params.toString()}`;
}

function buildCacheKey(input: SearchInput, mode: SearchMode): string {
    const limit = parseLimit(input.limit);
    const country = input.countryCode?.toLowerCase() || 'any';
    const lang = input.lang || 'default';
    const nativeName = input.nativeName ? 'native' : 'localized';
    const proximity = Number.isFinite(input.lat) && Number.isFinite(input.lng)
        ? `${input.lat!.toFixed(3)},${input.lng!.toFixed(3)}`
        : 'none';

    // Provider and search options isolate cache entries from city search
    return `geoapify:${mode}:limit=${limit}:country=${country}:lang=${lang}:names=${nativeName}:bias=${proximity}:q=${input.query}`;
}

function getCategories(result: GeoapifyResult): string[] | undefined {
    if (result.categories?.length) return result.categories;
    return result.category ? [result.category] : undefined;
}

function categoryMatches(category: string, prefix: string): boolean {
    return category === prefix || category.startsWith(`${prefix}.`);
}

function isGigVenueLike(result: GeoapifyResult, categories?: string[]): boolean {
    const categoryList = categories ?? [];
    const categoryMatch = categoryList.some((category) => (
        GIG_VENUE_CATEGORY_PREFIXES.some((prefix) => categoryMatches(category, prefix))
    ));
    if (categoryMatch) return true;

    const name = [result.name, result.address_line1].filter(Boolean).join(' ').toLowerCase();
    return Boolean(name) && GIG_VENUE_NAME_HINTS.some((hint) => name.includes(hint));
}

function getProviderId(result: GeoapifyResult): string | undefined {
    return result.place_id || (Number.isFinite(result.lat) && Number.isFinite(result.lon)
        ? `${result.name || result.formatted}:${result.lon}:${result.lat}`
        : undefined);
}

function getLocalizedName(result: GeoapifyResult, language?: NameLanguage): string | undefined {
    if (language && language !== 'native') {
        return result.other_names?.[`name:${language}`];
    }

    return result.other_names?.name ||
           result.other_names?.['name:local'] ||
           result.other_names?.['name:ja'] ||
           result.other_names?.['name:zh'] ||
           result.other_names?.['name:ko'] ||
           result.other_names?.['name:ru'];
}

function getFallbackCity(result: GeoapifyResult): string {
    return result.city || result.district || result.suburb || result.county || result.name || '';
}

function getFallbackProvince(result: GeoapifyResult): string {
    return result.state || result.state_district || result.county || result.city || '';
}

function getResultName(result: GeoapifyResult, language?: NameLanguage): string {
    if (language) {
        const localizedName = getLocalizedName(result, language);
        if (localizedName) return localizedName;
    }

    return result.name || result.address_line1 || result.formatted || 'Unnamed location';
}

function getRawExternalData(result: GeoapifyResult, center: Coordinates, categories?: string[]) {
    return {
        source: 'geoapify',
        venueProviderId: result.place_id,
        providerName: result.name,
        formatted: result.formatted,
        addressLine1: result.address_line1,
        addressLine2: result.address_line2,
        city: result.city,
        state: result.state,
        country: result.country,
        countryCode: result.country_code,
        coordinates: center,
        categories,
        resultType: result.result_type,
        rank: result.rank,
        timezone: result.timezone,
        bbox: result.bbox,
        otherNames: result.other_names,
    };
}

function getTimezoneName(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const timezone = value as { name?: unknown };
    return typeof timezone.name === 'string' ? timezone.name : undefined;
}

function normalizePlaceLocation(place: PlaceLocation): TourLocationSearchResult {
    return {
        source: 'local',
        providerId: `${place.provider}:${place.providerPlaceId}`,
        placeLocationId: place.id,
        name: place.name,
        displayName: place.formatted || undefined,
        city: place.city || place.name,
        province: place.province || place.city || place.name,
        country: place.country || undefined,
        countryCode: place.countryCode || undefined,
        center: place.coordinates,
        type: 'place',
        categories: place.categories,
        isVenue: place.isVenue,
        ...(place.isVenue ? {
            venueName: place.name,
            rawExternalData: place.rawProviderData,
        } : {}),
    };
}

function normalizeLocalResult(result: LocalSearchResult, isCached = false): TourLocationSearchResult {
    const centerValue = result.center as { lat?: unknown; lng?: unknown } | undefined;
    const center = {
        lat: typeof result.lat === 'number' ? result.lat : Number(centerValue?.lat),
        lng: typeof result.lng === 'number' ? result.lng : Number(centerValue?.lng),
    };
    const address = typeof result.address === 'object' && result.address !== null
        ? result.address as Record<string, string>
        : {};
    const displayName = typeof result.displayName === 'string'
        ? result.displayName
        : [result.name, result.province, result.country].filter(Boolean).join(', ');

    return {
        source: 'local',
        providerId: result.id || `${result.osmType}:${result.osmId}`,
        name: String(result.name || displayName),
        displayName,
        city: String(result.name || address.city || address.town || address.village || displayName),
        province: String(result.province || address.state || address.province || address.region || result.name || ''),
        country: typeof result.country === 'string' ? result.country : address.country,
        center,
        cityId: typeof result.id === 'string' ? result.id : undefined,
        type: typeof result.type === 'string' ? result.type : undefined,
        isVenue: false,
        isCached,
    };
}

function geoapifyResultToPlaceInput(
    result: GeoapifyResult,
    options: { nameLanguage?: NameLanguage } = {}
): UpsertPlaceLocationInput | null {
    if (!Number.isFinite(result.lat) || !Number.isFinite(result.lon)) return null;

    const providerId = getProviderId(result);
    if (!providerId) return null;

    const center = { lat: Number(result.lat), lng: Number(result.lon) };
    const categories = getCategories(result) || [];
    const name = getResultName(result, options.nameLanguage);

    return {
        provider: 'geoapify',
        providerPlaceId: providerId,
        name,
        formatted: result.formatted,
        addressLine1: result.address_line1,
        addressLine2: result.address_line2,
        city: getFallbackCity(result) || undefined,
        province: getFallbackProvince(result) || undefined,
        country: result.country,
        countryCode: result.country_code,
        coordinates: center,
        categories,
        isVenue: isGigVenueLike(result, categories),
        timezone: getTimezoneName(result.timezone),
        rawProviderData: getRawExternalData(result, center, categories),
    };
}

async function persistGeoapifyPlaces(
    results: GeoapifyResult[],
    options: { nameLanguage?: NameLanguage } = {}
): Promise<Map<string, PlaceLocation>> {
    const places = results
        .map((result) => geoapifyResultToPlaceInput(result, options))
        .filter((place): place is UpsertPlaceLocationInput => !!place);
    const saved = await PlaceLocationStore.upsertMany(places);
    return new Map(saved.map((place) => [place.providerPlaceId, place]));
}

async function resolveLocalCity(center: Coordinates): Promise<City | null> {
    const results = await CityService.reverseGeocodeAll(center.lat, center.lng, 1);
    return results[0] ?? null;
}

export function normalizeGeoapifyResult(
    result: GeoapifyResult,
    mode: SearchMode,
    localCity: City | null,
    options: { nameLanguage?: NameLanguage; isCached?: boolean; place?: PlaceLocation } = {}
): VenueSearchResult | TourLocationSearchResult | null {
    if (!Number.isFinite(result.lat) || !Number.isFinite(result.lon)) return null;

    const center = { lat: Number(result.lat), lng: Number(result.lon) };
    const providerId = getProviderId(result);
    if (mode === 'venue' && !providerId) return null;

    const categories = getCategories(result);
    const name = getResultName(result, options.nameLanguage);
    const isVenue = isGigVenueLike(result, categories);
    const city = localCity?.name || getFallbackCity(result);
    const province = localCity?.province || getFallbackProvince(result);
    const country = localCity?.country || result.country || undefined;
    const base = {
        source: 'geoapify' as const,
        providerId,
        ...(options.place ? { placeLocationId: options.place.id } : {}),
        name,
        displayName: result.formatted,
        city,
        province,
        country,
        countryCode: result.country_code,
        center,
        type: result.result_type,
        categories,
        isVenue,
        ...(isVenue ? {
            venueName: name,
            rawExternalData: getRawExternalData(result, center, categories),
        } : {}),
        ...(options.isCached ? { isCached: true } : {}),
        ...(localCity?.id ? { cityId: localCity.id } : {}),
    };

    if (mode === 'venue') {
        return {
            ...base,
            providerId: providerId!,
            venueName: name,
            rawExternalData: getRawExternalData(result, center, categories),
        };
    }

    return base;
}

async function fetchGeoapify(
    input: SearchInput,
    mode: SearchMode,
    useSearchCache = true
): Promise<{ results: GeoapifyResult[]; fromCache: boolean }> {
    const cacheKey = buildCacheKey(input, mode);
    if (useSearchCache) {
        const cached = await SearchCacheService.get<GeoapifyResult>(cacheKey);
        if (cached) {
            return { results: cached, fromCache: true };
        }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEOAPIFY_TIMEOUT_MS);

    try {
        const response = await fetch(buildGeoapifyUrl(input, mode), {
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new VenueSearchError(`Geoapify search failed with status ${response.status}`, 502);
        }

        const data = await response.json() as GeoapifyResponse;
        const results = data.results ?? [];
        if (useSearchCache) {
            void SearchCacheService.set<GeoapifyResult>(cacheKey, results).catch((error) => {
                console.error('Failed to cache Geoapify search results:', error);
            });
        }
        return { results, fromCache: false };
    } catch (error) {
        if (error instanceof VenueSearchError) throw error;
        if (error instanceof Error && error.name === 'AbortError') {
            throw new VenueSearchError('Geoapify search timed out', 504);
        }
        throw new VenueSearchError('Geoapify search failed', 502);
    } finally {
        clearTimeout(timeout);
    }
}

export function normalizeResults(
    results: GeoapifyResult[],
    mode: SearchMode,
    options: { nameLanguage?: NameLanguage; isCached?: boolean; places?: Map<string, PlaceLocation> }
) {
    // Search results should not wait for local boundary matching
    const normalized = results.map((result) => {
        const providerId = getProviderId(result);
        return normalizeGeoapifyResult(result, mode, null, {
            nameLanguage: options.nameLanguage,
            isCached: options.isCached,
            place: providerId ? options.places?.get(providerId) : undefined,
        });
    });
    if (mode === 'venue') return normalized;

    const venueResults = normalized.filter((result) => result?.isVenue);
    const locationResults = normalized.filter((result) => !result?.isVenue);
    return [...venueResults, ...locationResults];
}

export const VenueSearchService = {
    searchVenues: async (input: SearchInput): Promise<VenueSearchResponse> => {
        const { results, fromCache } = await fetchGeoapify(input, 'venue');
        const normalized = normalizeResults(results, 'venue', {
            nameLanguage: input.nativeName ? 'native' : input.lang as NameLanguage | undefined,
            isCached: fromCache,
        });

        return {
            results: normalized.filter((result): result is VenueSearchResult => !!result && 'venueName' in result),
            source: fromCache ? 'cache' : 'geoapify',
        };
    },

    searchLocations: async (input: LocalFirstSearchInput): Promise<TourLocationSearchResponse> => {
        const limit = parseLimit(input.limit);
        const [placeResults, localResults] = await Promise.all([
            PlaceLocationStore.search(input.query, limit),
            TextSearch.getLocalResults(input.query, limit),
        ]);
        const dbResults = [
            ...placeResults.map(normalizePlaceLocation),
            ...localResults.map((result) => normalizeLocalResult(result)),
        ].slice(0, limit);

        if (dbResults.length > 0) {
            return {
                results: dbResults,
                source: 'local',
            };
        }

        const { results, fromCache } = await fetchGeoapify(input, 'location', false);
        const nameLanguage = input.nativeName ? 'native' : input.lang as NameLanguage | undefined;
        const places = await persistGeoapifyPlaces(results, { nameLanguage });
        const normalized = normalizeResults(results, 'location', {
            nameLanguage,
            isCached: fromCache,
            places,
        });

        return {
            results: normalized.filter((result): result is TourLocationSearchResult => !!result),
            source: fromCache ? 'cache' : 'geoapify',
        };
    },

    reverseLocal: async (center: Coordinates): Promise<TourLocationSearchResult | null> => {
        const localCity = await resolveLocalCity(center);
        if (!localCity) return null;

        return {
            source: 'local',
            name: localCity.name,
            displayName: localCity.displayName,
            city: localCity.name,
            province: localCity.province,
            country: localCity.country || undefined,
            center,
            cityId: localCity.id,
            type: localCity.type,
        };
    },
};

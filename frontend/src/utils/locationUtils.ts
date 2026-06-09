import type { SearchResult } from '../services/api';
import type { LocalizedNames, LocalizedChain, LocationLanguage } from '../types/artist';

type LocationLike = {
    city?: string;
    province?: string;
    country?: string;
    displayName?: string;
    localizedChain?: LocalizedChain;
};

const UNKNOWN_PROVINCE_PATTERN = /^unknown(?:\s+\[[^\]]+\])?$/i;

const stripProvinceDisambiguator = (value: string): string => (
    value.replace(/\s+\[[^\]]+\]$/, '')
);

const isDisplayableProvince = (province: string | undefined, city?: string, country?: string): province is string => {
    if (!province || UNKNOWN_PROVINCE_PATTERN.test(province)) return false;

    const normalizedProvince = stripProvinceDisambiguator(province);
    return normalizedProvince !== city && normalizedProvince !== country;
};

/**
 * Formats location for display. Parses displayName to show key parts only.
 */
export const formatLocation = (location: LocationLike): string => {
    if (location.displayName) {
        const parts = location.displayName.split(',').map(p => p.trim());

        // Point locations have more parts; extract name, city, province, country
        if (parts.length > 3) {
            const name = parts[0];
            const country = parts[parts.length - 1];
            let province = '';
            let city = '';

            // Find province (skip postal codes)
            for (let i = parts.length - 2; i >= 0; i--) {
                const part = parts[i];
                if (!part.match(/^\d/) && !part.match(/\d{3,}/)) {
                    province = part;
                    break;
                }
            }

            // Find city/ward
            const cityPatterns = /[区市町村郡]$|County|City|District|Borough|Municipality/i;
            for (let i = 1; i < parts.length - 1; i++) {
                const part = parts[i];
                if (part !== province && part !== country && cityPatterns.test(part)) {
                    city = part;
                    break;
                }
            }

            const result = [name];
            if (city && city !== name && city !== province) result.push(city);
            if (province && province !== name) result.push(province);
            if (country && country !== province) result.push(country);

            return result.join(', ');
        }
    }

    // Fallback for administrative locations
    const parts: string[] = [];
    if (location.city) parts.push(location.city);
    if (isDisplayableProvince(location.province, location.city, location.country)) parts.push(stripProvinceDisambiguator(location.province));
    if (location.country && location.country !== location.province) parts.push(location.country);
    return parts.join(', ');
};

export interface ExtractedLocation {
    city: string;
    province: string;
    country: string;
    coordinates: { lat: number; lng: number };
    displayName: string;
    osmId?: number;
    osmType?: string;
    type?: string;
    isManualSelection?: boolean;
    cityId?: string;
}

interface AddressFields {
    city?: string;
    locality?: string;
    town?: string;
    village?: string;
    province?: string;
    state?: string;
    country?: string;
}

/**
 * Extracts and normalizes location data from a Nominatim search result.
 * Handles edge cases like ISO province codes (e.g., JP-13) and missing fields.
 */
export const extractLocationData = (result: SearchResult): ExtractedLocation => {
    // Nominatim search results return lat/lng as top-level fields instead of a center object
    const raw = result as unknown as { lat?: number; lng?: number; address?: AddressFields };
    const coordinates = result.center ?? (raw.lat != null && raw.lng != null
        ? { lat: raw.lat, lng: raw.lng }
        : { lat: 0, lng: 0 });
    const address = raw.address || {};

    let city = result.name || address.city || address.locality || address.town || address.village || '';
    let province = result.province || address.province || address.state || '';
    const country = result.country || address.country || '';

    // If province is empty or is an ISO code (like JP-13), extract from displayName
    if (!province || province.match(/^[A-Z]{2}-\d+$/)) {
        province = extractProvinceFromDisplayName(result.displayName);
    }

    // Fallback: if one is missing, use the other
    if (!city && province) city = province;
    if (city && !province) province = city;

    return {
        city,
        province,
        country,
        coordinates,
        displayName: result.displayName,
        osmId: result.osmId,
        osmType: result.osmType,
        type: result.type,
        isManualSelection: result.isManualSelection,
        cityId: result.id,
    };
};

/**
 * Attempts to extract a province/state name from a comma-separated display name.
 * Skips numeric values (postal codes) and returns the most likely province segment.
 */
const extractProvinceFromDisplayName = (displayName: string): string => {
    const parts = displayName.split(',').map(p => p.trim());

    if (parts.length < 2) return '';

    // Walk backwards from second-to-last, skip postal codes
    for (let i = parts.length - 2; i >= 0; i--) {
        const part = parts[i];
        // Skip if starts with digit or contains 3+ consecutive digits (postal code)
        if (!part.match(/^\d/) && !part.match(/\d{3,}/)) {
            return part;
        }
    }

    // Fallback to second-to-last segment
    return parts[parts.length - 2];
};

/**
 * Resolves a single localized name with fallback: preferred → en → native → ''.
 */
export const getLocalizedName = (
    names: LocalizedNames | undefined,
    preference: LocationLanguage
): string => {
    if (!names) return '';
    if (preference === 'native') return names.native || '';
    return names[preference] || names.en || names.native || '';
};

/**
 * Formats a full localized location string from a chain using the user's preference.
 * Falls back to the single-language formatLocation when no chain is available.
 */
export const formatLocationLocalized = (
    location: LocationLike,
    preference: LocationLanguage
): string => {
    const chain = location.localizedChain;
    if (!chain) return formatLocation(location);

    const city = getLocalizedName(chain.city, preference) || location.city;

    // Missing localized province is omitted to avoid mixed-language address chains
    const province = getLocalizedName(chain.province, preference) || (chain.province ? location.province : '');
    const country = getLocalizedName(chain.country, preference) || location.country;

    const parts = [
        city,
        isDisplayableProvince(province, city, country) ? stripProvinceDisambiguator(province) : '',
        country,
    ].filter(Boolean);

    // Dedupe adjacent identical parts (e.g. city-state where province == country)
    const deduped = parts.filter((p, i) => i === 0 || p !== parts[i - 1]);
    return deduped.join(', ');
};

/**
 * Collects all name values from a localized chain for search matching.
 * Returns a single lowercase string containing every language variant.
 */
export const getSearchableLocationText = (location: LocationLike): string => {
    const parts: string[] = [];
    if (location.city) parts.push(location.city);
    if (location.province) parts.push(location.province);
    if (location.country) parts.push(location.country);
    const chain = location.localizedChain;
    if (chain) {
        for (const level of [chain.city, chain.province, chain.country]) {
            if (!level) continue;
            for (const val of Object.values(level)) {
                if (val) parts.push(val);
            }
        }
    }
    return parts.join(' ').toLowerCase();
};

/**
 * Creates an empty location object with zeroed coordinates.
 */
export const createEmptyLocation = () => ({
    city: '',
    province: '',
    coordinates: { lat: 0, lng: 0 }
});

/**
 * Checks if a location has valid (non-zero) coordinates.
 */
export const hasValidCoordinates = (location?: { coordinates?: { lat: number; lng: number } }): boolean => {
    if (!location?.coordinates) return false;
    return !(location.coordinates.lat === 0 && location.coordinates.lng === 0);
};

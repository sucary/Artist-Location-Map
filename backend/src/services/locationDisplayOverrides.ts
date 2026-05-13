import type { LocalizedChain, NominatimResponse } from '../types/city';

// Location display overrides for stable product-facing names

const TOKYO_23_WARDS_OSM_ID = 19631009;
const TOKYO_23_WARDS_OSM_TYPE = 'relation';

export const TOKYO_23_WARDS_DISPLAY = {
    name: 'Tokyo',
    province: 'Tokyo',
    country: 'Japan',
    displayName: 'Tokyo, Tokyo, Japan',
    localizedNames: {
        city: {
            en: 'Tokyo',
            native: 'Tokyo',
        },
        province: {
            en: 'Tokyo',
            native: 'Tokyo',
        },
        country: {
            en: 'Japan',
            native: 'Japan',
        },
    } satisfies LocalizedChain,
};

export function isTokyo23Wards(osmId: number | string, osmType: string): boolean {
    return Number(osmId) === TOKYO_23_WARDS_OSM_ID && osmType === TOKYO_23_WARDS_OSM_TYPE;
}

export function getLocationDisplayOverride(osmId: number | string, osmType: string) {
    if (isTokyo23Wards(osmId, osmType)) {
        return TOKYO_23_WARDS_DISPLAY;
    }

    return null;
}

export function applyLocationDisplayOverride<T extends Pick<NominatimResponse, 'osm_id' | 'osm_type' | 'address' | 'display_name' | 'name'>>(data: T): T {
    const override = getLocationDisplayOverride(data.osm_id, data.osm_type);

    if (!override) {
        return data;
    }

    return {
        ...data,
        name: override.name,
        display_name: override.displayName,
        address: {
            ...data.address,
            city: override.name,
            state: override.province,
            province: override.province,
            country: override.country,
        },
    };
}

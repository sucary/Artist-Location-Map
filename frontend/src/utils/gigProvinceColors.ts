import type { Gig } from '../types/gig';
import { buildClusterPalette, getStableColorHash } from './generatedClusterPalette';

// Province aliases keep color identity stable across localized gig data
const JAPAN_PROVINCE_COLOR_ALIASES: Record<string, string> = {
    tokyo: 'tokyo',
    'tokyo metropolis': 'tokyo',
    '\u6771\u4eac': 'tokyo',
    '\u6771\u4eac\u90fd': 'tokyo',
};

const normalizeProvinceColorKey = (value: string) => {
    const normalized = value.trim().toLowerCase();
    return JAPAN_PROVINCE_COLOR_ALIASES[normalized] ?? normalized;
};

export const getGigProvinceColorKey = (gig: Gig) => {
    const provinceNames = gig.location.localizedChain?.province;
    const provinceKey = provinceNames?.en || provinceNames?.native || provinceNames?.ja || gig.location.province;
    const fallbackKey = gig.location.country || gig.location.city || gig.location.displayName || 'unknown';

    return normalizeProvinceColorKey(provinceKey || fallbackKey);
};

export const getGigProvinceColorMap = (gigs: Gig[]) => {
    const provinceKeys = Array.from(new Set(gigs.map(getGigProvinceColorKey)))
        .sort((first, second) => getStableColorHash(first) - getStableColorHash(second));
    const palette = buildClusterPalette(Math.max(1, provinceKeys.length), 0, { strict: true });

    // Visible province set receives spread-out colors
    return new Map(provinceKeys.map((provinceKey, index) => [provinceKey, palette[index]]));
};

export const getGigProvinceColor = (gig: Gig, colors: Map<string, string>) => (
    colors.get(getGigProvinceColorKey(gig)) ?? buildClusterPalette(1)[0]
);

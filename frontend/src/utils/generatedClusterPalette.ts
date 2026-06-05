const DEFAULT_CLUSTER_COLOR_RANGE_SIZE = 720;
const DISTINGUISHABLE_DISTANCE_RATIO = 0.86;
const MIN_WHITE_TEXT_CONTRAST = 4.5;
const paletteCache = new Map<string, string[]>();
let candidateCache: Array<{ hex: string; lab: number[] }> | null = null;

type ClusterPaletteOptions = {
    strict?: boolean;
    distinguishableRatio?: number;
};

const hslToHex = (hue: number, saturation: number, lightness: number) => {
    const normalizedHue = ((hue % 360) + 360) % 360;
    const normalizedSaturation = saturation / 100;
    const normalizedLightness = lightness / 100;
    const alpha = normalizedSaturation * Math.min(normalizedLightness, 1 - normalizedLightness);
    const getChannel = (offset: number) => {
        const key = (offset + normalizedHue / 30) % 12;
        const color = normalizedLightness - alpha * Math.max(-1, Math.min(key - 3, 9 - key, 1));
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };

    return `#${getChannel(0)}${getChannel(8)}${getChannel(4)}`;
};

const hexToLab = (hex: string) => {
    const toLinearRgb = (value: number) => (
        value > 0.04045 ? ((value + 0.055) / 1.055) ** 2.4 : value / 12.92
    );
    const [red, green, blue] = [1, 3, 5].map((index) => toLinearRgb(parseInt(hex.slice(index, index + 2), 16) / 255));
    const x = (red * 0.4124 + green * 0.3576 + blue * 0.1805) / 0.95047;
    const y = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    const z = (red * 0.0193 + green * 0.1192 + blue * 0.9505) / 1.08883;
    const transform = (value: number) => (
        value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116
    );
    const [fx, fy, fz] = [transform(x), transform(y), transform(z)];

    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

const labDistance = (first: number[], second: number[]) => (
    Math.sqrt((first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2 + (first[2] - second[2]) ** 2)
);

const hexToRgb = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
] as const;

const rgbToHsl = (red: number, green: number, blue: number) => {
    const normalizedRed = red / 255;
    const normalizedGreen = green / 255;
    const normalizedBlue = blue / 255;
    const max = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
    const min = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
    const lightness = (max + min) / 2;
    const delta = max - min;

    if (delta === 0) return { hue: 0, saturation: 0, lightness: lightness * 100 };

    const saturation = delta / (1 - Math.abs(2 * lightness - 1));
    let hue = 0;
    if (max === normalizedRed) {
        hue = ((normalizedGreen - normalizedBlue) / delta) % 6;
    } else if (max === normalizedGreen) {
        hue = (normalizedBlue - normalizedRed) / delta + 2;
    } else {
        hue = (normalizedRed - normalizedGreen) / delta + 4;
    }

    return {
        hue: (hue * 60 + 360) % 360,
        saturation: saturation * 100,
        lightness: lightness * 100,
    };
};

const getRelativeLuminance = (hex: string) => {
    const toLinear = (channel: number) => {
        const value = channel / 255;
        return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    const [red, green, blue] = hexToRgb(hex).map(toLinear);

    return red * 0.2126 + green * 0.7152 + blue * 0.0722;
};

const hasReadableWhiteText = (hex: string) => (
    1.05 / (getRelativeLuminance(hex) + 0.05) >= MIN_WHITE_TEXT_CONTRAST
);

export const getDarkClusterColor = (hex: string) => {
    const { hue, saturation, lightness } = rgbToHsl(...hexToRgb(hex));

    // Dark tiles keep the same hue identity with reduced visual intensity
    return hslToHex(hue, Math.max(16, saturation * 0.62), Math.max(30, lightness - 4));
};

const getLightnessRangeForSaturation = (saturation: number) => {
    const saturationOffset = saturation - 28;
    const minLightness = Math.round(35 - saturationOffset * 0.16);
    const maxLightness = Math.round(39 - saturationOffset * 0.22);

    // Higher saturation needs lower lightness; lower saturation avoids muddy darks
    return {
        min: Math.max(30, minLightness),
        max: Math.min(40, maxLightness),
    };
};

const getClusterColorCandidates = () => {
    if (candidateCache) return candidateCache;

    const candidates: Array<{ hex: string; lab: number[] }> = [];

    for (let hueIndex = 0; hueIndex < DEFAULT_CLUSTER_COLOR_RANGE_SIZE; hueIndex += 1) {
        const hue = (hueIndex / DEFAULT_CLUSTER_COLOR_RANGE_SIZE) * 360;

        for (let saturation = 28; saturation <= 44; saturation += 4) {
            const { min, max } = getLightnessRangeForSaturation(saturation);
            for (let lightness = min; lightness <= max; lightness += 1) {
                const hex = hslToHex(hue, saturation, lightness);
                if (!hasReadableWhiteText(hex)) continue;

                candidates.push({ hex, lab: hexToLab(hex) });
            }
        }
    }

    candidateCache = candidates;
    return candidates;
};

export const getStableColorHash = (value: string) => {
    let hash = 0;

    // Stable string hash keeps category colors consistent across renders
    for (let index = 0; index < value.length; index += 1) {
        hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
    }

    return hash;
};

export function buildClusterPalette(count: number, seed = 0, options: ClusterPaletteOptions = {}) {
    const normalizedCount = Math.max(1, Math.floor(count));
    const normalizedSeed = Math.abs(Math.floor(seed));
    const distinguishableDistanceRatio = options.strict ? 1 : options.distinguishableRatio ?? DISTINGUISHABLE_DISTANCE_RATIO;
    const cacheKey = `${normalizedCount}:${normalizedSeed}:${distinguishableDistanceRatio}:s28-44:l30-40:white4.5`;
    const cachedPalette = paletteCache.get(cacheKey);
    if (cachedPalette) return cachedPalette;

    const candidates = getClusterColorCandidates();

    // Farthest-point sampling spreads neighbors across perceived color space
    const startIndex = ((normalizedSeed * 1664525 + 1013904223) >>> 0) % candidates.length;
    const chosen = [candidates[(startIndex + normalizedSeed) % candidates.length]];
    const nearestDistances = candidates.map(() => Infinity);
    for (let index = 1; index < normalizedCount; index += 1) {
        const latestChoice = chosen[chosen.length - 1];
        let bestDistance = -1;

        candidates.forEach((candidate, candidateIndex) => {
            nearestDistances[candidateIndex] = Math.min(nearestDistances[candidateIndex], labDistance(candidate.lab, latestChoice.lab));
            if (nearestDistances[candidateIndex] > bestDistance) {
                bestDistance = nearestDistances[candidateIndex];
            }
        });

        const acceptableDistance = bestDistance * distinguishableDistanceRatio;
        const acceptableCandidates = candidates
            .map((candidate, candidateIndex) => ({ candidate, candidateIndex, distance: nearestDistances[candidateIndex] }))
            .filter((entry) => entry.distance >= acceptableDistance);
        const seededChoice = acceptableCandidates[
            ((normalizedSeed + index * 2654435761) >>> 0) % acceptableCandidates.length
        ];

        const bestCandidateIndex = seededChoice?.candidateIndex ?? 0;
        chosen.push(candidates[bestCandidateIndex]);
    }

    const palette = chosen.map((candidate) => candidate.hex);
    paletteCache.set(cacheKey, palette);
    return palette;
}

export const getGeneratedClusterColor = (key: string, rangeSize = DEFAULT_CLUSTER_COLOR_RANGE_SIZE) => {
    const palette = buildClusterPalette(rangeSize);
    return palette[getStableColorHash(key) % palette.length];
};

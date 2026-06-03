import type maplibregl from 'maplibre-gl';
import { CLUSTER_CONFIG } from '../../../constants/mapCluster';
import i18n from '../../../i18n';
import { getGeneratedClusterColor, getStableColorHash } from '../../../utils/generatedClusterPalette';
import type { ArtistPoint, ClusterPoint, ClusterVisual } from '../types';

// Cluster marker sizing and DOM construction

export type ClusterVisualMetrics = {
    center: [number, number];
    radius: number;
};

type ClusterVisualColors = {
    background: string;
    border: string;
    text: string;
    shadow: string;
    textShadow: string;
    centerFill: string;
    centerRing: string;
    debugFill: string;
    coverageRing: string;
    coverageFill: string;
    pullRing: string;
};

type ClusterMarkerOptions = {
    style?: 'default' | 'venue';
    venueName?: string;
    color?: string;
};

const VENUE_CLUSTER_PIN_COLOR = '#D94F3D';

const generateHue = (lng: number, lat: number) => {
    // Stable cluster color from geographic position
    const hash = Math.sin(lat * 1234.5) * Math.cos(lng * 5678.9) * 10000;
    return Math.abs(hash % 360);
};

const hexToRgb = (hex: string) => {
    const normalized = hex.replace('#', '');
    return [
        parseInt(normalized.slice(0, 2), 16),
        parseInt(normalized.slice(2, 4), 16),
        parseInt(normalized.slice(4, 6), 16),
    ] as const;
};

const rgbToHex = (red: number, green: number, blue: number) => (
    `#${[red, green, blue].map((channel) => Math.min(255, Math.max(0, channel)).toString(16).padStart(2, '0')).join('')}`
);

const shiftHexColor = (hex: string, amount: number) => {
    const [red, green, blue] = hexToRgb(hex);
    return rgbToHex(red + amount, green + amount, blue + amount);
};

const hexToRgba = (hex: string, alpha: number) => {
    const [red, green, blue] = hexToRgb(hex);
    return `rgba(${red},${green},${blue},${alpha})`;
};

const getSoftClusterColor = (center: [number, number], countFactor: number, isDarkTheme: boolean, color?: string) => {
    const [lng, lat] = center;
    const colorKey = `${lng.toFixed(4)}:${lat.toFixed(4)}:${getStableColorHash(`${lng}:${lat}`)}`;
    const baseColor = color ?? getGeneratedClusterColor(colorKey);
    const fillAlpha = isDarkTheme ? 0.80 : 0.70 + countFactor * 0.12;
    const borderShift = isDarkTheme ? -24 : -42;

    return {
        fill: hexToRgba(baseColor, fillAlpha),
        border: hexToRgba(shiftHexColor(baseColor, borderShift), 0.94),
    };
};

const getClusterVisualColors = (count: number, center: [number, number], color?: string): ClusterVisualColors => {
    const [centerLng, centerLat] = center;
    const countFactor = Math.min(1, count / 10);
    const isDarkTheme = document.documentElement.dataset.theme === 'dark';
    const saturation = isDarkTheme ? 20 + countFactor * 30 : 30 + countFactor * 40;
    const lightness = isDarkTheme ? 62 - countFactor * 18 : 50 - countFactor * 20;
    const hue = generateHue(centerLng, centerLat);
    const borderLightness = isDarkTheme ? lightness + 18 : lightness - 10;
    const themeColor = getSoftClusterColor(center, countFactor, isDarkTheme, color);

    return {
        background: themeColor.fill,
        border: themeColor.border,
        text: '#FFFAF0',
        shadow: '0 4px 10px rgba(35,40,38,0.26)',
        textShadow: '0 1px 2px rgba(25,25,25,0.55)',
        centerFill: `hsl(${hue},${Math.min(95, saturation + 20)}%,${isDarkTheme ? 74 : 34}%)`,
        centerRing: isDarkTheme ? '#ffffff' : '#111827',
        debugFill: color ?? `hsl(${hue},${saturation}%,${lightness}%)`,
        coverageRing: `hsla(${hue},${saturation}%,${borderLightness}%,0.95)`,
        coverageFill: `hsla(${hue},${saturation}%,${lightness}%,0.08)`,
        pullRing: `hsla(${hue},${saturation}%,${isDarkTheme ? 84 : 28}%,0.95)`,
    };
};

const createDebugRingElement = (radius: number, color: string, fill: string, dashed = false) => {
    const size = Math.max(CLUSTER_CONFIG.minClusterSize, radius * 2);
    const element = document.createElement('div');

    element.setAttribute('aria-hidden', 'true');
    element.className = 'artist-maplibre-cluster-debug-ring';
    element.style.width = `${size}px`;
    element.style.height = `${size}px`;
    element.style.borderRadius = '9999px';
    element.style.boxSizing = 'border-box';
    element.style.border = `${dashed ? 2 : 3}px ${dashed ? 'dashed' : 'solid'} ${color}`;
    element.style.background = fill;
    element.style.pointerEvents = 'none';
    element.style.boxShadow = dashed ? 'none' : `0 0 0 1px ${color}`;

    return element;
};

const createDebugCenterElement = (colors: ClusterVisualColors) => {
    const element = document.createElement('div');

    element.setAttribute('aria-hidden', 'true');
    element.className = 'artist-maplibre-cluster-debug-center';
    element.style.width = '14px';
    element.style.height = '14px';
    element.style.borderRadius = '9999px';
    element.style.boxSizing = 'border-box';
    element.style.border = `3px solid ${colors.centerRing}`;
    element.style.background = colors.centerFill;
    element.style.pointerEvents = 'none';
    element.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.65), 0 2px 8px rgba(0,0,0,0.45)';

    return element;
};

const createVenueClusterMarkerElement = (
    count: number,
    venueName: string,
    visualSize: number,
    colors: ClusterVisualColors,
    debugSolid: boolean
) => {
    const wrapper = document.createElement('div');
    const pin = document.createElement('div');
    const countText = document.createElement('span');
    const label = document.createElement('span');
    const pinSize = Math.max(30, Math.min(38, visualSize));

    // Visual-only same-venue marker chrome
    wrapper.className = 'absolute top-1/2 flex items-center cursor-pointer';
    wrapper.style.width = 'max-content';
    wrapper.style.height = `${pinSize}px`;
    wrapper.style.overflow = 'visible';
    wrapper.style.left = `calc(50% - ${pinSize / 2}px)`;
    wrapper.style.transform = 'translateY(-50%)';

    pin.className = 'relative flex items-center justify-center border-2 border-white app-dark:border-border-strong font-bold text-white shadow-lg shadow-black/20';
    pin.style.width = `${pinSize}px`;
    pin.style.height = `${pinSize}px`;
    pin.style.borderRadius = '50% 50% 50% 18%';
    pin.style.background = debugSolid ? colors.debugFill : VENUE_CLUSTER_PIN_COLOR;
    pin.style.transform = 'rotate(-45deg)';
    pin.style.transformOrigin = 'center';

    countText.className = 'absolute left-1/2 top-1/2 inline-flex items-center justify-center';
    countText.style.fontSize = `${Math.max(12, Math.min(15, pinSize * 0.45))}px`;
    countText.style.transform = 'translate(-50%, -50%) rotate(45deg)';
    countText.textContent = String(count);

    label.className = 'ml-2 max-w-48 whitespace-normal text-left text-sm font-semibold leading-tight';
    label.style.color = VENUE_CLUSTER_PIN_COLOR;
    label.style.textShadow = '0 2px 0 var(--color-surface), 2px 0 0 var(--color-surface), -2px 0 0 var(--color-surface), 0 -2px 0 var(--color-surface), 1px 1px 0 var(--color-surface), -1px 1px 0 var(--color-surface), 1px -1px 0 var(--color-surface), -1px -1px 0 var(--color-surface)';
    label.textContent = venueName;

    pin.appendChild(countText);
    wrapper.appendChild(pin);
    wrapper.appendChild(label);

    return wrapper;
};

export const getClusterVisualMetrics = (
    feature: ClusterPoint,
    leaves: ArtistPoint[],
    map: maplibregl.Map
): ClusterVisualMetrics => {
    const [fallbackLng, fallbackLat] = feature.geometry.coordinates;
    if (leaves.length === 0) {
        return {
            center: [fallbackLng, fallbackLat],
            radius: CLUSTER_CONFIG.minClusterSize / 2,
        };
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    // Screen-space bounds define both membership and display center
    leaves.forEach((leaf) => {
        const [leafLng, leafLat] = leaf.geometry.coordinates;
        const pixel = map.project([leafLng, leafLat]);
        minX = Math.min(minX, pixel.x);
        maxX = Math.max(maxX, pixel.x);
        minY = Math.min(minY, pixel.y);
        maxY = Math.max(maxY, pixel.y);
    });

    const centerPixel = {
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
    };
    const centerLngLat = map.unproject([centerPixel.x, centerPixel.y]);
    const center: [number, number] = [centerLngLat.lng, centerLngLat.lat];
    let maxDistance = 0;

    // Target range remains the farthest artist center
    leaves.forEach((leaf) => {
        const [leafLng, leafLat] = leaf.geometry.coordinates;
        const leafPixel = map.project([leafLng, leafLat]);
        const dx = leafPixel.x - centerPixel.x;
        const dy = leafPixel.y - centerPixel.y;
        maxDistance = Math.max(maxDistance, Math.sqrt(dx * dx + dy * dy));
    });

    return {
        center,
        radius: Math.min(
            CLUSTER_CONFIG.maxClusterSize / 2,
            Math.max(CLUSTER_CONFIG.minClusterSize / 2, maxDistance)
        ),
    };
};

export const getClusterDebugColor = (
    feature: ClusterPoint,
    leaves: ArtistPoint[],
    map: maplibregl.Map
) => {
    const metrics = getClusterVisualMetrics(feature, leaves, map);
    return getClusterVisualColors(feature.properties.point_count, metrics.center).debugFill;
};

export const createClusterDebugRingElements = (
    feature: ClusterPoint,
    leaves: ArtistPoint[],
    map: maplibregl.Map,
    clusterRadius?: number,
    pullRangeRadius: number = CLUSTER_CONFIG.maxClusterRadius
): ClusterVisual[] => {
    const metrics = getClusterVisualMetrics(feature, leaves, map);
    const colors = getClusterVisualColors(feature.properties.point_count, metrics.center);

    return [
        {
            element: createDebugRingElement(clusterRadius ?? metrics.radius, colors.coverageRing, colors.coverageFill),
            center: metrics.center,
        },
        {
            element: createDebugRingElement(pullRangeRadius, colors.pullRing, 'transparent', true),
            center: metrics.center,
        },
        {
            element: createDebugCenterElement(colors),
            center: metrics.center,
        },
    ];
};

export const createClusterMarkerElement = (
    feature: ClusterPoint,
    leaves: ArtistPoint[],
    map: maplibregl.Map,
    debugSolid = false,
    options: ClusterMarkerOptions = {}
): ClusterVisual => {
    const count = feature.properties.point_count;
    const markerStyle = options.style ?? 'default';
    const metrics = getClusterVisualMetrics(feature, leaves, map);
    const [centerLng, centerLat] = metrics.center;
    const colors = getClusterVisualColors(count, metrics.center, options.color);
    const radius = Math.max(
        CLUSTER_CONFIG.minClusterSize / 2,
        metrics.radius
    );
    const size = radius * 2;
    const visualSize = Math.max(CLUSTER_CONFIG.minClusterSize, size);
    const fontSize = Math.max(13, Math.min(35, visualSize * 0.3));

    const element = document.createElement('button');

    element.type = 'button';
    element.className = `artist-maplibre-cluster custom-cluster-marker${markerStyle === 'venue' ? ' custom-venue-cluster-marker' : ''}`;
    element.setAttribute('aria-label', i18n.t('map.markers.clusterArtists', { count }));
    element.style.width = `${visualSize}px`;
    element.style.height = `${visualSize}px`;
    element.ondblclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };

    element.dataset.clusterDebugColor = colors.debugFill;
    if (markerStyle === 'venue' && options.venueName) {
        element.style.position = 'relative';
        element.style.overflow = 'visible';
        element.appendChild(createVenueClusterMarkerElement(count, options.venueName, visualSize, colors, debugSolid));
    } else {
        const bubble = document.createElement('div');

        bubble.className = 'flex items-center justify-center rounded-full border-[3px] font-extrabold cursor-pointer';
        bubble.style.width = `${visualSize}px`;
        bubble.style.height = `${visualSize}px`;
        bubble.style.background = debugSolid ? colors.debugFill : colors.background;
        bubble.style.borderColor = debugSolid ? colors.coverageRing : colors.border;
        bubble.style.color = debugSolid ? '#ffffff' : colors.text;
        bubble.style.fontSize = `${fontSize}px`;
        bubble.style.boxShadow = colors.shadow;
        bubble.style.textShadow = colors.textShadow;
        bubble.textContent = String(count);
        element.appendChild(bubble);
    }

    return {
        element,
        center: [centerLng, centerLat],
    };
};

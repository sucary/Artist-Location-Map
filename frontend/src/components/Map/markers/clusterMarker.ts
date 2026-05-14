import type maplibregl from 'maplibre-gl';
import { CLUSTER_CONFIG } from '../../../constants/mapCluster';
import i18n from '../../../i18n';
import type { ArtistPoint, ClusterPoint, ClusterVisual } from '../types';

// Cluster marker sizing and DOM construction

export type ClusterVisualMetrics = {
    center: [number, number];
    radius: number;
};

type ClusterVisualColors = {
    background: string;
    border: string;
    centerFill: string;
    centerRing: string;
    debugFill: string;
    coverageRing: string;
    coverageFill: string;
    pullRing: string;
};

const generateHue = (lng: number, lat: number) => {
    // Stable cluster color from geographic position
    const hash = Math.sin(lat * 1234.5) * Math.cos(lng * 5678.9) * 10000;
    return Math.abs(hash % 360);
};

const getClusterVisualColors = (count: number, center: [number, number]): ClusterVisualColors => {
    const [centerLng, centerLat] = center;
    const countFactor = Math.min(1, count / 10);
    const isDarkTheme = document.documentElement.dataset.theme === 'dark';
    const saturation = isDarkTheme ? 20 + countFactor * 30 : 30 + countFactor * 40;
    const lightness = isDarkTheme ? 62 - countFactor * 18 : 50 - countFactor * 20;
    const hue = generateHue(centerLng, centerLat);
    const borderLightness = isDarkTheme ? lightness + 18 : lightness - 10;

    return {
        background: `hsla(${hue},${saturation}%,${lightness}%,0.4)`,
        border: `hsla(${hue},${saturation}%,${borderLightness}%,0.6)`,
        centerFill: `hsl(${hue},${Math.min(95, saturation + 20)}%,${isDarkTheme ? 74 : 34}%)`,
        centerRing: isDarkTheme ? '#ffffff' : '#111827',
        debugFill: `hsl(${hue},${saturation}%,${lightness}%)`,
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
    debugSolid = false
): ClusterVisual => {
    const count = feature.properties.point_count;
    const metrics = getClusterVisualMetrics(feature, leaves, map);
    const [centerLng, centerLat] = metrics.center;
    const colors = getClusterVisualColors(count, metrics.center);
    const radius = Math.max(
        CLUSTER_CONFIG.minClusterSize / 2,
        metrics.radius
    );
    const size = radius * 2;
    const visualSize = Math.min(
        CLUSTER_CONFIG.maxClusterSize,
        Math.max(CLUSTER_CONFIG.minClusterSize, size)
    );
    const fontSize = Math.max(12, Math.min(28, visualSize / 5));

    const element = document.createElement('button');
    const bubble = document.createElement('div');

    element.type = 'button';
    element.className = 'artist-maplibre-cluster custom-cluster-marker';
    element.setAttribute('aria-label', i18n.t('map.markers.clusterArtists', { count }));
    element.style.width = `${visualSize}px`;
    element.style.height = `${visualSize}px`;
    element.ondblclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
    };

    bubble.className = 'flex items-center justify-center rounded-full font-bold border-2 shadow-lg cursor-pointer text-white';
    bubble.style.width = `${visualSize}px`;
    bubble.style.height = `${visualSize}px`;
    bubble.style.background = debugSolid ? colors.debugFill : colors.background;
    bubble.style.borderColor = debugSolid ? colors.coverageRing : colors.border;
    bubble.style.fontSize = `${fontSize}px`;
    bubble.textContent = String(count);
    element.dataset.clusterDebugColor = colors.debugFill;

    element.appendChild(bubble);

    return {
        element,
        center: [centerLng, centerLat],
    };
};

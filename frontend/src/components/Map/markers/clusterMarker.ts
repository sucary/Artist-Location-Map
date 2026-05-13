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
    };
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

    // Radius covers the farthest clustered artist from the geometric center
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

export const createClusterMarkerElement = (
    feature: ClusterPoint,
    leaves: ArtistPoint[],
    map: maplibregl.Map,
    maxRadius?: number
): ClusterVisual => {
    const count = feature.properties.point_count;
    const metrics = getClusterVisualMetrics(feature, leaves, map);
    const [centerLng, centerLat] = metrics.center;
    const ownRadius = metrics.radius;
    const colors = getClusterVisualColors(count, metrics.center);
    // Respect collision caps from neighboring clusters
    const radius = Math.max(
        CLUSTER_CONFIG.minClusterSize / 2,
        Math.min(maxRadius ?? ownRadius, ownRadius)
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
    bubble.style.background = colors.background;
    bubble.style.borderColor = colors.border;
    bubble.style.fontSize = `${fontSize}px`;
    bubble.textContent = String(count);

    element.appendChild(bubble);

    return {
        element,
        center: [centerLng, centerLat],
    };
};

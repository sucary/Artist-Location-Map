import type maplibregl from 'maplibre-gl';
import type Supercluster from 'supercluster';
import { CLUSTER_CONFIG } from '../../../constants/mapCluster';
import type { ArtistPointProperties, ClusterPoint, ClusterProperties, ClusterVisual } from '../types';

const generateHue = (lng: number, lat: number) => {
    // Derive stable cluster color from geographic position.
    const hash = Math.sin(lat * 1234.5) * Math.cos(lng * 5678.9) * 10000;
    return Math.abs(hash % 360);
};

export const getClusterVisualRadius = (
    feature: ClusterPoint,
    index: Supercluster<ArtistPointProperties, ClusterProperties>,
    map: maplibregl.Map
) => {
    const leaves = index.getLeaves(feature.properties.cluster_id, Infinity);
    const [centerLng, centerLat] = feature.geometry.coordinates;
    const centerPixel = map.project([centerLng, centerLat]);
    let maxDistance = 0;

    // Size the visual bubble from the farthest clustered artist.
    leaves.forEach((leaf) => {
        const [leafLng, leafLat] = leaf.geometry.coordinates;
        const leafPixel = map.project([leafLng, leafLat]);
        const dx = leafPixel.x - centerPixel.x;
        const dy = leafPixel.y - centerPixel.y;
        maxDistance = Math.max(maxDistance, Math.sqrt(dx * dx + dy * dy));
    });

    return Math.min(
        CLUSTER_CONFIG.maxClusterSize / 2,
        Math.max(CLUSTER_CONFIG.minClusterSize / 2, maxDistance)
    );
};

export const createClusterMarkerElement = (
    feature: ClusterPoint,
    index: Supercluster<ArtistPointProperties, ClusterProperties>,
    map: maplibregl.Map,
    maxRadius?: number
): ClusterVisual => {
    const count = feature.properties.point_count;
    const [centerLng, centerLat] = feature.geometry.coordinates;
    const ownRadius = getClusterVisualRadius(feature, index, map);
    // Respect collision caps from neighboring clusters.
    const radius = Math.max(
        CLUSTER_CONFIG.minClusterSize / 2,
        Math.min(maxRadius ?? ownRadius, ownRadius)
    );
    const size = radius * 2;
    const visualSize = Math.min(
        CLUSTER_CONFIG.maxClusterSize,
        Math.max(CLUSTER_CONFIG.minClusterSize, size)
    );
    const countFactor = Math.min(1, count / 10);
    const saturation = 30 + countFactor * 40;
    const lightness = 50 - countFactor * 20;
    const hue = generateHue(centerLng, centerLat);
    const fontSize = Math.max(12, Math.min(28, visualSize / 5));

    const element = document.createElement('button');
    const bubble = document.createElement('div');

    element.type = 'button';
    element.className = 'artist-maplibre-cluster custom-cluster-marker';
    element.setAttribute('aria-label', `${count} artists`);
    element.style.width = `${visualSize}px`;
    element.style.height = `${visualSize}px`;

    bubble.className = 'flex items-center justify-center rounded-full font-bold border-2 shadow-lg cursor-pointer text-white';
    bubble.style.width = `${visualSize}px`;
    bubble.style.height = `${visualSize}px`;
    bubble.style.background = `hsla(${hue},${saturation}%,${lightness}%,0.4)`;
    bubble.style.borderColor = `hsla(${hue},${saturation}%,${lightness - 10}%,0.6)`;
    bubble.style.fontSize = `${fontSize}px`;
    bubble.textContent = String(count);

    element.appendChild(bubble);

    return {
        element,
        center: [centerLng, centerLat],
    };
};

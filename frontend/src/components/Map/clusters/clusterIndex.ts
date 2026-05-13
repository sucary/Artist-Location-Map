import { CLUSTER_CONFIG } from '../../../constants/mapCluster';
import type { Artist, LocationView } from '../../../types/artist';
import type { ArtistPoint, ClusterFeature, ClusterPoint } from '../types';

// Artist GeoJSON point and cluster feature helpers

const getArtistCoords = (artist: Artist, view: LocationView) => {
    return view === 'active'
        ? artist.activeLocationDisplayCoordinates
        : artist.originalLocationDisplayCoordinates;
};

export const makeArtistPoint = (artist: Artist, view: LocationView): ArtistPoint => {
    const coords = getArtistCoords(artist, view);
    return {
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [coords.lng, coords.lat],
        },
        properties: {
            artistId: artist.id,
        },
    };
};

export const isClusterFeature = (feature: ClusterFeature): feature is ClusterPoint => (
    feature.properties.cluster === true
);

export const getClusterZoom = (mapZoom: number) => (
    // Keep clusters visible until the configured break point is clearly crossed.
    mapZoom >= CLUSTER_CONFIG.disableClusteringAtZoomLevel + 0.5
        ? CLUSTER_CONFIG.disableClusteringAtZoomLevel
        : Math.floor(mapZoom)
);

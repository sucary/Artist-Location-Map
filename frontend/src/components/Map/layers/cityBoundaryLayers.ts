import type maplibregl from 'maplibre-gl';

type CityBoundaryData = {
    boundary?: unknown;
    rawBoundary?: unknown;
} | null | undefined;

const addBoundaryLayer = (
    map: maplibregl.Map,
    id: string,
    data: unknown,
    type: 'fill' | 'line',
    paint: Record<string, unknown>
) => {
    // Replace the source and layer together to avoid stale GeoJSON after city changes.
    if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(id)) map.removeSource(id);
    if (!data) return;

    map.addSource(id, {
        type: 'geojson',
        data: data as GeoJSON.GeoJSON,
    });
    if (type === 'fill') {
        map.addLayer({
            id,
            type: 'fill',
            source: id,
            paint,
        });
        return;
    }

    map.addLayer({
        id,
        type: 'line',
        source: id,
        paint,
    });
};

export const syncCityBoundaryLayers = (
    map: maplibregl.Map,
    selectedCity: CityBoundaryData,
    isAdmin: boolean
) => {
    // Raw boundaries are admin-only because they are only useful for data review.
    addBoundaryLayer(map, 'selected-city-boundary-fill', selectedCity?.boundary, 'fill', {
        'fill-color': '#c0604a',
        'fill-outline-color': '#c0604a',
        'fill-opacity': 0.06,
    });
    addBoundaryLayer(map, 'selected-city-boundary', selectedCity?.boundary, 'line', {
        'line-color': '#c0604a',
        'line-width': 2,
        'line-opacity': 0.85,
    });
    addBoundaryLayer(map, 'selected-city-raw-boundary', isAdmin ? selectedCity?.rawBoundary : null, 'line', {
        'line-color': '#4a5a9a',
        'line-width': 2,
        'line-opacity': 0.8,
        'line-dasharray': [5, 5],
    });
};

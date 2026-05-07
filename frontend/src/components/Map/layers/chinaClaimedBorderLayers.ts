import type maplibregl from 'maplibre-gl';

const claimedBorderLayerIds = [
    'china-claimed-border-glow',
    'china-claimed-border',
];

const chinaClaimedBorderFilter: maplibregl.FilterSpecification = [
    // Match disputed boundary rows that CARTO marks as China-related claims.
    'all',
    ['in', ['get', 'admin_level'], ['literal', [2, 4]]],
    ['==', ['get', 'disputed'], 1],
    [
        'any',
        ['in', 'CN', ['coalesce', ['get', 'claimed_by'], '']],
        ['in', 'China', ['coalesce', ['get', 'disputed_name'], '']],
        ['in', 'Chinese', ['coalesce', ['get', 'disputed_name'], '']],
        ['in', 'Arunachal', ['coalesce', ['get', 'disputed_name'], '']],
        ['in', 'LineofActualControl', ['coalesce', ['get', 'disputed_name'], '']],
    ],
];

const getFirstSymbolLayerId = (map: maplibregl.Map) => (
    // Insert linework below labels for legibility.
    map.getStyle().layers?.find((layer) => layer.type === 'symbol')?.id
);

export const syncChinaClaimedBorderLayers = (map: maplibregl.Map) => {
    if (!map.getSource('carto')) return;

    claimedBorderLayerIds.forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
    });

    const beforeLayerId = getFirstSymbolLayerId(map);

    // Draw claimed disputed borders below labels and above the base boundary lines.
    map.addLayer({
        id: 'china-claimed-border-glow',
        type: 'line',
        source: 'carto',
        'source-layer': 'boundary',
        minzoom: 4,
        filter: chinaClaimedBorderFilter,
        paint: {
            'line-color': '#f6eeee',
            'line-opacity': 0.55,
            'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.8, 7, 2.8, 10, 4],
        },
    }, beforeLayerId);

    map.addLayer({
        id: 'china-claimed-border',
        type: 'line',
        source: 'carto',
        'source-layer': 'boundary',
        minzoom: 4,
        filter: chinaClaimedBorderFilter,
        paint: {
            'line-color': '#d9a7ad',
            'line-opacity': 0.75,
            'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.7, 7, 1.1, 10, 1.5],
            'line-dasharray': [2, 2],
        },
    }, beforeLayerId);
};

export const getZoomForLocationType = (locationType?: string): number => {
    switch (locationType) {
        case 'country': return 5;
        case 'state':
        case 'province':
        case 'region': return 8;
        case 'county':
        case 'district': return 9;
        case 'city':
        case 'town':
        case 'municipality': return 11;
        case 'village':
        case 'suburb':
        case 'borough': return 13;
        case 'neighbourhood':
        case 'quarter': return 15;
        default: return 12;
    }
};

export const isInteractiveTarget = (target: EventTarget | null) => {
    const element = target as HTMLElement | null;
    // Ignore map clicks that start from controls, popups, or custom marker DOM.
    return !!element?.closest(
        'button,a,.maplibregl-ctrl,.maplibregl-popup,.artist-maplibre-marker,.artist-maplibre-cluster'
    );
};

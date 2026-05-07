export type MapTileLayer = 'voyager' | 'maptilerDataviz' | 'maptilerWinter' | 'maptilerOsm';
export type MapTileTheme = 'light' | 'dark';

export const CARTO_VECTOR_STYLES: Record<'voyager' | 'darkMatter', string> = {
    voyager: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    darkMatter: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

const mapTilerApiKey = import.meta.env.VITE_MAPTILER_API_KEY as string | undefined;
const mapTilerDatavizMapId = import.meta.env.VITE_MAPTILER_DATAVIZ_MAP_ID as string | undefined;
const mapTilerDatavizDarkMapId = import.meta.env.VITE_MAPTILER_DATAVIZ_DARK_MAP_ID as string | undefined;
const mapTilerWinterMapId = import.meta.env.VITE_MAPTILER_WINTER_MAP_ID as string | undefined;
const mapTilerWinterDarkMapId = import.meta.env.VITE_MAPTILER_WINTER_DARK_MAP_ID as string | undefined;
const mapTilerOsmMapId = import.meta.env.VITE_MAPTILER_OSM_MAP_ID as string | undefined;
const mapTilerOsmDarkMapId = import.meta.env.VITE_MAPTILER_OSM_DARK_MAP_ID as string | undefined;

export const hasMapTilerKey = !!mapTilerApiKey;

const getMapTilerStyleUrlFromConfig = (mapIdOrStyleUrl: string) => {
    // Accept either a MapTiler map id or a full style URL.
    if (/^https?:\/\//i.test(mapIdOrStyleUrl)) {
        try {
            const url = new URL(mapIdOrStyleUrl);
            if (!url.searchParams.has('key') && mapTilerApiKey) {
                // Allow env config to provide either a MapTiler map id or a full style URL.
                url.searchParams.set('key', mapTilerApiKey);
            }
            return url.toString();
        } catch {
            return mapIdOrStyleUrl;
        }
    }

    return `https://api.maptiler.com/maps/${mapIdOrStyleUrl}/style.json?key=${mapTilerApiKey}`;
};

const MAPTILER_STYLE_IDS: Record<
    Exclude<MapTileLayer, 'voyager'>,
    { light: string; dark: string | null }
> = {
    maptilerDataviz: {
        light: mapTilerDatavizMapId || 'dataviz',
        dark: mapTilerDatavizDarkMapId || 'dataviz-dark',
    },
    maptilerWinter: {
        light: mapTilerWinterMapId || 'winter-v2',
        dark: mapTilerWinterDarkMapId || 'winter-v2-dark',
    },
    maptilerOsm: {
        light: mapTilerOsmMapId || 'openstreetmap',
        dark: mapTilerOsmDarkMapId || null,
    },
};

export const isMapTilerTileLayer = (
    tileLayer: MapTileLayer
): tileLayer is Exclude<MapTileLayer, 'voyager'> => tileLayer.startsWith('maptiler');

const getMapTilerStyleUrl = (
    tileLayer: Exclude<MapTileLayer, 'voyager'>,
    tileTheme: MapTileTheme
) => {
    // Fall back to the light style when a provider has no dark variant.
    const mapId = MAPTILER_STYLE_IDS[tileLayer][tileTheme] || MAPTILER_STYLE_IDS[tileLayer].light;
    return getMapTilerStyleUrlFromConfig(mapId);
};

export const getMapStyleUrl = (
    tileLayer: MapTileLayer,
    tileTheme: MapTileTheme
) => {
    if (isMapTilerTileLayer(tileLayer) && hasMapTilerKey) {
        return getMapTilerStyleUrl(tileLayer, tileTheme);
    }
    if (tileLayer === 'voyager' && tileTheme === 'dark') {
        return CARTO_VECTOR_STYLES.darkMatter;
    }
    return CARTO_VECTOR_STYLES.voyager;
};

export const canUseDarkTiles = (tileLayer: MapTileLayer) => (
    tileLayer === 'voyager'
    || (isMapTilerTileLayer(tileLayer) && hasMapTilerKey && !!MAPTILER_STYLE_IDS[tileLayer].dark)
);

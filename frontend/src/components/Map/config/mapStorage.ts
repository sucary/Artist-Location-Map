import { hasMapTilerKey, isMapTilerTileLayer, type MapTileLayer, type MapTileTheme } from './mapStyles';
import { TILE_LAYER_STORAGE_KEY, TILE_THEME_STORAGE_KEY, tileLayers, tileThemes } from './mapConstants';

export const getStoredTileLayer = (): MapTileLayer => {
    const stored = localStorage.getItem(TILE_LAYER_STORAGE_KEY);
    if (!tileLayers.includes(stored as MapTileLayer)) return 'voyager';

    const storedLayer = stored as MapTileLayer;
    // Ignore stored MapTiler choices when the current runtime cannot load them.
    return !hasMapTilerKey && isMapTilerTileLayer(storedLayer) ? 'voyager' : storedLayer;
};

export const getStoredTileTheme = (): MapTileTheme => {
    const stored = localStorage.getItem(TILE_THEME_STORAGE_KEY);
    return tileThemes.includes(stored as MapTileTheme) ? stored as MapTileTheme : 'light';
};

export const storeTileLayer = (tileLayer: MapTileLayer) => {
    localStorage.setItem(TILE_LAYER_STORAGE_KEY, tileLayer);
};

export const storeTileTheme = (tileTheme: MapTileTheme) => {
    localStorage.setItem(TILE_THEME_STORAGE_KEY, tileTheme);
};

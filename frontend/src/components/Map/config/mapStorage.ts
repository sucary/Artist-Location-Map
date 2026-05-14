import { hasMapTilerKey, isMapTilerTileLayer, type MapTileLayer, type MapTileTheme } from './mapStyles';
import {
    CLUSTER_DEBUG_CONTROLS_STORAGE_EVENT,
    CLUSTER_DEBUG_CONTROLS_STORAGE_KEY,
    TILE_LAYER_STORAGE_KEY,
    TILE_THEME_STORAGE_KEY,
    tileLayers,
    tileThemes,
} from './mapConstants';

// Browser-local map preference persistence

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

// Cluster diagnostics are hidden until an admin opts in locally
export const getStoredClusterDebugControlsEnabled = () => (
    localStorage.getItem(CLUSTER_DEBUG_CONTROLS_STORAGE_KEY) === 'true'
);

export const storeClusterDebugControlsEnabled = (enabled: boolean) => {
    localStorage.setItem(CLUSTER_DEBUG_CONTROLS_STORAGE_KEY, enabled ? 'true' : 'false');
    // Same-tab settings changes need an explicit map notification
    window.dispatchEvent(new CustomEvent(CLUSTER_DEBUG_CONTROLS_STORAGE_EVENT, { detail: { enabled } }));
};

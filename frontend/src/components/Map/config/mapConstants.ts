import type { MapTileLayer, MapTileTheme } from './mapStyles';

export const defaultCenter: [number, number] = [139.6503, 35.6762];
export const defaultZoom = 4;
export const scrollWheelZoomRate = 1 / 300;
export const trackpadZoomRate = 1 / 60;

// Local CJK glyph generation avoids mixed hosted font fallbacks
export const localCjkIdeographFontFamily = [
    'Microsoft YaHei',
    'PingFang SC',
    'Noto Sans CJK SC',
    'Noto Sans SC',
    'Source Han Sans SC',
    'SimHei',
    'Microsoft JhengHei',
    'PingFang TC',
    'Noto Sans CJK TC',
    'Source Han Sans TC',
    'Yu Gothic',
    'Meiryo',
    'Noto Sans CJK JP',
    'Source Han Sans JP',
    'Hiragino Sans GB',
    'sans-serif',
].join(', ');

export const TILE_LAYER_STORAGE_KEY = 'mapLibreTileLayer';
export const TILE_THEME_STORAGE_KEY = 'mapLibreTileTheme';

// Admin diagnostics remain an opt-in browser preference
export const CLUSTER_DEBUG_CONTROLS_STORAGE_KEY = 'achizuClusterDebugControlsEnabled';
export const CLUSTER_DEBUG_CONTROLS_STORAGE_EVENT = 'achizuClusterDebugControlsChanged';

export const tileLayers: MapTileLayer[] = ['voyager', 'maptilerDataviz', 'maptilerWinter', 'maptilerOsm'];
export const tileThemes: MapTileTheme[] = ['light', 'dark'];

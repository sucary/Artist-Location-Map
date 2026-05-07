import type maplibregl from 'maplibre-gl';
import type { LocationLanguage } from '../../../types/artist';

type MapStyleLayer = NonNullable<ReturnType<maplibregl.Map['getStyle']>['layers']>[number];

const getNameFields = (language: LocationLanguage): string[] => {
    switch (language) {
        case 'en':
            return ['name:en', 'name_en', 'name:latin', 'name'];
        case 'ja':
            return ['name:ja', 'name_ja', 'name', 'name:en', 'name_en', 'name:latin'];
        case 'zhHans':
            return [
                'name:zh-Hans',
                'name_zh-Hans',
                'name:zh-CN',
                'name_zh-CN',
                'name:zh',
                'name_zh',
                'name',
                'name:en',
                'name_en',
                'name:latin',
            ];
        case 'zhHant':
            return [
                'name:zh-Hant',
                'name_zh-Hant',
                'name:zh-TW',
                'name_zh-TW',
                'name:zh-HK',
                'name_zh-HK',
                'name:zh',
                'name_zh',
                'name',
                'name:en',
                'name_en',
                'name:latin',
            ];
        case 'native':
        default:
            return ['name'];
    }
};

const referencesName = (value: unknown): boolean => {
    // Walk MapLibre expressions for any name field reference.
    if (typeof value === 'string') return value.includes('name');
    if (Array.isArray(value)) return value.some(referencesName);
    if (value && typeof value === 'object') return Object.values(value).some(referencesName);
    return false;
};

const referencesRouteOrShield = (value: unknown): boolean => {
    // Leave route labels and shields owned by the base style.
    if (typeof value === 'string') {
        return /\b(ref|shield|route|network)\b/i.test(value);
    }
    if (Array.isArray(value)) return value.some(referencesRouteOrShield);
    if (value && typeof value === 'object') return Object.values(value).some(referencesRouteOrShield);
    return false;
};

const shouldPatchSymbolLayer = (layer: MapStyleLayer) => {
    if (layer.type !== 'symbol') return false;

    const currentTextField = layer.layout?.['text-field'];
    if (!currentTextField) return false;
    if (!referencesName(currentTextField)) return false;

    // Keep route shields and road refs on their original label expressions.
    return !referencesRouteOrShield(currentTextField);
};

export const patchMapLabelLanguage = (
    map: maplibregl.Map,
    language: LocationLanguage
) => {
    const style = map.getStyle();
    if (!style?.layers) return;

    const layers = style.layers;
    const textField = [
        'coalesce',
        ...getNameFields(language).map((field) => ['get', field]),
    ];

    // Patch only text-bearing symbol layers that already use name fields.
    layers.forEach((layer) => {
        if (!shouldPatchSymbolLayer(layer)) return;

        try {
            map.setLayoutProperty(layer.id, 'text-field', textField);
        } catch (error) {
            console.warn(`Failed to localize map label layer "${layer.id}":`, error);
        }
    });
};

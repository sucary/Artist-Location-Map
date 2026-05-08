import type maplibregl from 'maplibre-gl';
import type { Root } from 'react-dom/client';
import type { Artist, SelectionMode } from '../../types/artist';

export interface Coordinates {
    lat: number;
    lng: number;
    locationType?: string;
}

export interface MapViewProps {
    username?: string;
    viewingFeatured?: boolean;
    selectionMode?: SelectionMode | null;
    onLocationPick?: ((coordinates: Coordinates | null) => void) | null;
    onEditArtist?: (artist: Artist) => void;
    onDeleteArtist?: (artist: Artist) => void;
    onEmptyClick?: () => void;
    focusedArtist?: Artist | null;
    onFocusedArtistHandled?: () => void;
    focusedLocation?: Coordinates | null;
    onFocusedLocationHandled?: () => void;
    focusedCityId?: string | null;
    isAuthenticated?: boolean;
    suppressArtistPopup?: boolean;
    onArtistPopupOpenChange?: (open: boolean) => void;
    interactionsDisabled?: boolean;
}

export type ArtistPointProperties = {
    artistId: string;
    cluster?: false;
};

export type ClusterProperties = {
    cluster: true;
    cluster_id: number;
    point_count: number;
    point_count_abbreviated: number | string;
};

export type ClusterVisual = {
    element: HTMLElement;
    center: [number, number];
};

export type ArtistPoint = GeoJSON.Feature<GeoJSON.Point, ArtistPointProperties>;
export type ClusterPoint = GeoJSON.Feature<GeoJSON.Point, ClusterProperties>;
export type ClusterFeature = ArtistPoint | ClusterPoint;

export type MarkerEntry = {
    marker: maplibregl.Marker;
    kind: 'artist' | 'cluster';
    leafKey?: string;
    popup?: maplibregl.Popup;
    root?: Root;
};

export type ExpandedClusterState = {
    markers: maplibregl.Marker[];
    sourceId: string;
    layerId: string;
    hiddenClusterKey: string;
    hiddenClusterLeafKey: string;
    clusterCenter: [number, number];
};

export type ArtistPopupLifecycleState = {
    open: boolean;
    closedAt: number;
};

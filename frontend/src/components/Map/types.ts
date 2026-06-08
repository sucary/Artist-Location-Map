import type maplibregl from 'maplibre-gl';
import type { ReactNode } from 'react';
import type { Root } from 'react-dom/client';
import type { Artist, SelectionMode } from '../../types/artist';
import type { Gig, TourModeState } from '../../types/gig';

// Map component contracts and marker state types

export interface Coordinates {
    lat: number;
    lng: number;
    locationType?: string;
}

export interface MapViewProps {
    username?: string;
    viewingFeatured?: boolean;
    tourMode?: TourModeState;
    selectionMode?: SelectionMode | null;
    onLocationPick?: ((coordinates: Coordinates | null) => void) | null;
    onEditArtist?: (artist: Artist) => void;
    onDeleteArtist?: (artist: Artist) => void;
    onEditGig?: (gig: Gig) => void;
    onDeleteGig?: (gig: Gig) => void;
    starredGigIds?: Set<string>;
    onToggleGigStar?: (gig: Gig) => void;
    onEmptyClick?: () => void;
    focusedArtist?: Artist | null;
    onFocusedArtistHandled?: () => void;
    focusedGigId?: string | null;
    onFocusedGigHandled?: () => void;
    focusedLocation?: Coordinates | null;
    onFocusedLocationHandled?: () => void;
    focusedCityId?: string | null;
    isAuthenticated?: boolean;
    suppressArtistPopup?: boolean;
    onArtistPopupOpenChange?: (open: boolean) => void;
    interactionsDisabled?: boolean;
    canAdjustDisplayCoordinates?: boolean;
    tourControlSlot?: ReactNode;
    onDisplayCoordinateChange?: (
        artist: Artist,
        view: 'original' | 'active',
        coordinates: Coordinates
    ) => Promise<void> | void;
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

export type VenueClusterPopupData = {
    key: string;
    name: string;
    gigs: Gig[];
};

export type MarkerEntry = {
    marker: maplibregl.Marker;
    kind: 'artist' | 'cluster';
    // Visible marker content identity
    markerRenderKey?: string;
    leafKey?: string;
    clusterFeature?: ClusterPoint;
    artistIds?: string[];
    venueCluster?: VenueClusterPopupData;
    popup?: maplibregl.Popup;
    root?: Root;
};

export type ExpandedClusterMarkerEntry = {
    marker: maplibregl.Marker;
    kind: 'artist';
    artistId: string;
    gigId?: string;
} | {
    marker: maplibregl.Marker;
    kind: 'venue';
    venueCluster: VenueClusterPopupData;
    gigIds: string[];
};

export type ExpandedClusterState = {
    markers: maplibregl.Marker[];
    markerEntries: ExpandedClusterMarkerEntry[];
    debugRingMarkers: maplibregl.Marker[];
    artistClusterColors: Map<string, string>;
    markerTargets: [number, number][];
    sourceId: string;
    layerId: string;
    hiddenClusterKey: string;
    hiddenClusterLeafKey: string;
    clusterCenter: [number, number];
};

export type ArtistPopupLifecycleState = {
    open: boolean;
    openedAt: number;
    closedAt: number;
};

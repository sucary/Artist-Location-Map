import { useMapEvents, useMap } from 'react-leaflet';
import { useEffect } from 'react';

interface Coordinates {
    lat: number;
    lng: number;
}

interface MapClickHandlerProps {
    onLocationPick: ((coordinates: Coordinates | null) => void) | null;
}

const MapClickHandler = ({ onLocationPick }: MapClickHandlerProps) => {
    const map = useMap();

    // Add/remove class to map container for cursor styling
    useEffect(() => {
        const container = map.getContainer();
        container.classList.add('location-selection-mode');

        return () => {
            container.classList.remove('location-selection-mode');
        };
    }, [map]);

    useMapEvents({
        click: (e) => {
            // Check if the click originated from a Leaflet control or button
            const target = e.originalEvent?.target as HTMLElement | null;
            if (target) {
                // Check if click was on a control or its children
                const isControl = target.closest('.leaflet-control') ||
                                 target.closest('.leaflet-bar') ||
                                 target.closest('button') ||
                                 target.closest('a.leaflet-control');

                if (isControl) {
                    return; // Ignore clicks on controls
                }
            }

            // Just pass coordinates - LocationSearch will handle reverse search
            if (onLocationPick) {
                onLocationPick({ lat: e.latlng.lat, lng: e.latlng.lng });
            }
        }
    });

    return (
        <>
            {/* Banner-style location selection prompt */}
            <div className="absolute top-16 inset-x-2 z-[1100] flex justify-center sm:inset-x-auto sm:top-auto sm:bottom-6 sm:left-1/2 sm:-translate-x-1/2">
                <div role="alert" className="flex h-10 max-w-full items-center overflow-hidden bg-surface border-2 border-primary rounded-lg shadow-md font-sans">
                    <span className="min-w-0 flex-1 truncate whitespace-nowrap px-4 text-sm text-text">
                        Click on the map to select a location
                    </span>
                    <div aria-hidden="true" className="h-6 w-px shrink-0 bg-border" />
                    <button
                        onClick={() => onLocationPick?.(null)}
                        className="h-full shrink-0 px-3 text-sm text-text hover:bg-surface-muted transition-colors rounded-r-lg font-medium"
                        style={{ cursor: 'default' }}
                    >
                        Cancel
                    </button>
                </div>
            </div>

            {/* CSS for crosshair cursor */}
            <style>{`
                /* Apply crosshair to entire map in selection mode */
                .leaflet-container.location-selection-mode,
                .leaflet-container.location-selection-mode .leaflet-pane,
                .leaflet-container.location-selection-mode .leaflet-tile-pane,
                .leaflet-container.location-selection-mode .leaflet-overlay-pane,
                .leaflet-container.location-selection-mode .leaflet-marker-pane,
                .leaflet-container.location-selection-mode .leaflet-tile,
                .leaflet-container.location-selection-mode .leaflet-map-pane,
                .leaflet-container.location-selection-mode .leaflet-proxy,
                .leaflet-container.location-selection-mode .leaflet-grab,
                .leaflet-container.location-selection-mode .leaflet-interactive {
                    cursor: crosshair !important;
                }
                /* Override for buttons - must come after and use higher specificity */
                .location-selection-mode button,
                .leaflet-container.location-selection-mode button,
                .leaflet-container.location-selection-mode .leaflet-control button,
                .leaflet-container.location-selection-mode .leaflet-control a,
                .leaflet-container.location-selection-mode .leaflet-bar a {
                    cursor: default !important;
                }
            `}</style>
        </>
    );
};

export default MapClickHandler;

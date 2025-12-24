import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import type { LatLngExpression } from 'leaflet';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { getArtists } from '../../services/api';
import type { Artist } from '../../types/artist';

const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const LocateControl = () => {
    const map = useMap();

    const handleLocate = () => {
        // Requests location from the browser
        map.locate({ setView: true, maxZoom: 12});
    };
    
    return (
    <div className="absolute bottom-25 right-2 z-[1000]">
        <button 
            onClick={handleLocate}
            className="bg-white w-10 h-10 flex items-center justify-center rounded-full shadow-xl/30 hover:bg-gray-100 transition-colors"

            title="Locate Me"
        >
            <div>X</div>
        </button>
    </div>
    );
}
const MapView = () => {
    const defaultCenter: LatLngExpression = [35.6762, 139.6503]; // Tokyo
    const defaultZoom = 4;
    const [artists, setArtists] = useState<Artist[]>([]);

    useEffect(() => {
        const fetchArtists = async () => {
            try {
                const data = await getArtists();
                setArtists(data);
            } catch (error) {
                console.error('Error fetching artists:', error);
            }
        };

        fetchArtists();
    }, []);

    return (
        <MapContainer
            center={defaultCenter}
            zoom={defaultZoom}
            className="h-full w-full"
            zoomControl={false}
        >
            <ZoomControl position="bottomright" />
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <LocateControl />
            {artists.map((artist) => (
                <Marker
                    key={artist.id}
                    position={[artist.activeLocation.coordinates.lat, artist.activeLocation.coordinates.lng]}
                >
                    <Popup>
                        <div className="p-2">
                            <h3 className="font-bold text-lg">{artist.name}</h3>
                            <p className="text-sm text-gray-600">
                                {artist.activeLocation.city}, {artist.activeLocation.province}
                            </p>
                        </div>
                    </Popup>
                </Marker>
            ))}
        </MapContainer>
    );
};

export default MapView;
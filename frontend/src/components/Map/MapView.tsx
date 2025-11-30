import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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

const MapView = () => {
    const defaultCenter: LatLngExpression = [43.6532, -79.3832]; // Toronto
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
            style={{ height: '100vh', width: '100%' }}
        >
            <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
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
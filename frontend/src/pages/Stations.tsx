import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { Map as MapIcon, Table as TableIcon } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import styles from './Stations.module.css';

// Fix for Leaflet default marker icon in Vite/React
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

interface Station {
    station_id: string;
    station_name: string;
    latitude: number;
    longitude: number;
    last_reading_at: string;
}

const Stations = () => {
    const [stations, setStations] = useState<Station[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'table' | 'map'>('table');

    useEffect(() => {
        const fetchStations = async () => {
            try {
                const response = await axios.get('/api/dataloggers');
                if (response.data.success) {
                    setStations(response.data.data);
                }
            } catch (error) {
                console.error("Error fetching stations", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStations();
    }, []);

    // Calculate center based on stations, default to Nigeria roughly
    const defaultCenter: [number, number] = [9.0820, 8.6753];
    const mapCenter: [number, number] = stations.length > 0
        ? [stations[0].latitude, stations[0].longitude]
        : defaultCenter;

    if (loading) return <div>Loading stations...</div>;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2> Data Loggers</h2>
                <div className={styles.toggleContainer}>
                    <button
                        className={`${styles.toggleBtn} ${viewMode === 'table' ? styles.activeToggle : ''}`}
                        onClick={() => setViewMode('table')}
                    >
                        <TableIcon size={16} />
                        Table
                    </button>
                    <button
                        className={`${styles.toggleBtn} ${viewMode === 'map' ? styles.activeToggle : ''}`}
                        onClick={() => setViewMode('map')}
                    >
                        <MapIcon size={16} />
                        Map
                    </button>
                </div>
            </div>

            {viewMode === 'table' ? (
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Station Name</th>
                                <th>Coordinates</th>
                                <th>Latest Reading</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stations.map((station) => {
                                const lastUpdate = new Date(station.last_reading_at);
                                const diffMs = new Date().getTime() - lastUpdate.getTime();
                                const isActive = diffMs < 3 * 60 * 60 * 1000; // 3 hours

                                return (
                                    <tr key={station.station_id}>
                                        <td>
                                            <Link to={`/stations/${station.station_id}`} style={{ fontWeight: '500', color: 'inherit', textDecoration: 'none' }}>
                                                {station.station_name}
                                            </Link>
                                        </td>
                                        <td>{station.latitude}, {station.longitude}</td>
                                        <td className={styles.lastUpdate}>
                                            {lastUpdate.toLocaleString()}
                                        </td>
                                        <td>
                                            <span
                                                className={styles.status}
                                                style={{
                                                    backgroundColor: isActive ? '#d1fae5' : '#f3f4f6',
                                                    color: isActive ? '#065f46' : '#374151'
                                                }}
                                            >
                                                {isActive ? 'Active' : 'Inactive'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {stations.length === 0 && (
                                <tr>
                                    <td colSpan={5}>No active stations found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className={styles.mapContainer}>
                    <MapContainer
                        center={mapCenter}
                        zoom={6}
                        style={{ height: '100%', width: '100%' }}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        {stations.map((station) => (
                            <Marker
                                key={station.station_id}
                                position={[station.latitude, station.longitude]}
                            >
                                <Popup>
                                    <Link to={`/stations/${station.station_id}`} style={{ fontWeight: 'bold', fontSize: '1.1em', textDecoration: 'none', color: '#333' }}>
                                        {station.station_name}
                                    </Link><br />
                                    ID: {station.station_id}<br />
                                    Last Update: {new Date(station.last_reading_at).toLocaleString()}
                                </Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                </div>
            )}
        </div>
    );
};

export default Stations;

import { useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { Map as MapIcon, Table as TableIcon } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Skeleton } from '../components/ui/Skeleton';
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
    organization?: string;
    last_reading_at: string;
    is_active: boolean;
    provider: string;
}

const Stations = () => {
    const [viewMode, setViewMode] = useState<'table' | 'map'>('table');
    const [filterProvider, setFilterProvider] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');

    const { data: stations = [], isLoading, isError, error, refetch } = useQuery({
        queryKey: ['stations'],
        queryFn: async () => {
            const res = await axios.get('/api/dataloggers');
            return res.data.success ? res.data.data : [];
        },
    });

    const filteredStations = stations.filter((station: Station) => {
        const matchesProvider = filterProvider === 'all' || station.provider === filterProvider;
        const matchesStatus = filterStatus === 'all' || (filterStatus === 'active' ? station.is_active : !station.is_active);
        return matchesProvider && matchesStatus;
    });

    // Calculate center based on filtered stations, default to Nigeria roughly
    const defaultCenter: [number, number] = [9.0820, 8.6753];
    const mapCenter: [number, number] = filteredStations.length > 0
        ? [filteredStations[0].latitude, filteredStations[0].longitude]
        : defaultCenter;

    if (isLoading) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h2> Data Loggers</h2>
                </div>
                <div className={styles.filters}>
                    <div className={styles.filterGroup}>
                        <span className={styles.filterLabel}>Provider</span>
                        <Skeleton width={150} height={38} />
                    </div>
                    <div className={styles.filterGroup}>
                        <span className={styles.filterLabel}>Status</span>
                        <Skeleton width={150} height={38} />
                    </div>
                </div>
                {viewMode === 'table' ? (
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Station Name</th>
                                    <th>Provider</th>
                                    <th>Coordinates</th>
                                    <th>Organization</th>
                                    <th>Latest Reading</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...Array(8)].map((_, i) => (
                                    <tr key={i}>
                                        <td><Skeleton width={150} height={20} /></td>
                                        <td><Skeleton width={80} height={20} /></td>
                                        <td><Skeleton width={120} height={20} /></td>
                                        <td><Skeleton width={100} height={20} /></td>
                                        <td><Skeleton width={140} height={20} /></td>
                                        <td><Skeleton width={80} height={24} style={{ borderRadius: 99 }} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className={styles.mapContainer}>
                        <Skeleton width="100%" height="100%" />
                    </div>
                )}
            </div>
        );
    }

    if (isError) {
        return (
            <div className={styles.container} style={{ justifyContent: 'center', alignItems: 'center', height: '50vh', textAlign: 'center' }}>
                <div style={{ color: '#ef4444', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Error Loading Stations</h3>
                    <p>{(error as Error)?.message || 'Failed to fetch station data.'}</p>
                </div>
                <button
                    onClick={() => refetch()}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: '#2563eb',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontWeight: 500
                    }}
                >
                    Retry
                </button>
            </div>
        );
    }

    // Get unique providers from data
    const providers = Array.from(new Set(stations.map((s: Station) => s.provider))).filter(Boolean);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                    <h2> Data Loggers</h2>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        {filteredStations.length} {filteredStations.length === 1 ? 'station' : 'stations'} found
                    </span>
                </div>
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

            <div className={styles.filters}>
                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel} htmlFor="provider-filter">Provider</label>
                    <select
                        id="provider-filter"
                        className={styles.select}
                        value={filterProvider}
                        onChange={(e) => setFilterProvider(e.target.value)}
                    >
                        <option value="all">All Providers</option>
                        {providers.map((p: any) => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                </div>

                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel} htmlFor="status-filter">Status</label>
                    <select
                        id="status-filter"
                        className={styles.select}
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                    >
                        <option value="all">All Statuses</option>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                    </select>
                </div>
            </div>

            {viewMode === 'table' ? (
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Station Name</th>
                                <th>Provider</th>
                                <th>Coordinates</th>
                                <th>Organization</th>
                                <th>Latest Reading</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStations.map((station: Station) => {
                                const lastUpdate = station.last_reading_at ? new Date(station.last_reading_at) : null;
                                const isActive = station.is_active;

                                return (
                                    <tr key={station.station_id}>
                                        <td>
                                            <Link to={`/stations/${station.station_id}`} style={{ fontWeight: '500', color: 'inherit', textDecoration: 'none' }}>
                                                {station.station_name}
                                            </Link>
                                        </td>
                                        <td>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                                {station.provider}
                                            </span>
                                        </td>
                                        <td>{station.latitude}, {station.longitude}</td>
                                        <td>{station.organization || '-'}</td>
                                        <td className={styles.lastUpdate}>
                                            {lastUpdate ? lastUpdate.toLocaleString() : 'Never'}
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
                            {filteredStations.length === 0 && (
                                <tr>
                                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                        No stations match the selected filters.
                                    </td>
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
                        {filteredStations.map((station: Station) => (
                            <Marker
                                key={station.station_id}
                                position={[station.latitude, station.longitude]}
                            >
                                <Popup>
                                    <Link to={`/stations/${station.station_id}`} style={{ fontWeight: 'bold', fontSize: '1.1em', textDecoration: 'none', color: '#333' }}>
                                        {station.station_name}
                                    </Link><br />
                                    Provider: {station.provider}<br />
                                    ID: {station.station_id}<br />
                                    Last Update: {station.last_reading_at ? new Date(station.last_reading_at).toLocaleString() : 'Never'}
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

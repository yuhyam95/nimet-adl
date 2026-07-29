import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { Map as MapIcon, Table as TableIcon, Plus as PlusIcon, ShieldCheck, AlertTriangle, FileSpreadsheet, Maximize2, Minimize2 } from 'lucide-react';
import { MapContainer, TileLayer, Popup, CircleMarker } from 'react-leaflet';
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
    avg_interval_seconds?: number | null;
    readings_count_24h?: number;
    reporting_frequency_minutes?: number | null;
    reporting_frequency_text?: string;
}

const Stations = () => {
    const { user } = useAuth();
    const [viewMode, setViewMode] = useState<'table' | 'map'>('table');
    const [filterProvider, setFilterProvider] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterTransmission, setFilterTransmission] = useState<string>('all');
    const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    const toggleFullscreen = () => {
        const mapElem = document.getElementById('stations-map-container');
        if (!mapElem) return;

        if (!document.fullscreenElement) {
            mapElem.requestFullscreen().catch((err) => {
                console.error('Error entering fullscreen:', err);
            });
        } else {
            document.exitFullscreen().catch((err) => {
                console.error('Error exiting fullscreen:', err);
            });
        }
    };

    const { data: health } = useQuery({
        queryKey: ['health'],
        queryFn: async () => {
            const res = await axios.get('/api/health');
            return res.data;
        },
        refetchInterval: 60000, // Poll every minute
    });

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

        const lastUpdate = station.last_reading_at ? new Date(station.last_reading_at) : null;
        const isTransmitting = lastUpdate ? (Date.now() - lastUpdate.getTime() <= 24 * 60 * 60 * 1000) : false;
        const matchesTransmission = filterTransmission === 'all' ||
            (filterTransmission === 'transmitting' ? isTransmitting : !isTransmitting);

        return matchesProvider && matchesStatus && matchesTransmission;
    }).sort((a: Station, b: Station) => (a.station_name || '').localeCompare(b.station_name || ''));

    // Calculate center based on filtered stations, default to Nigeria roughly
    const defaultCenter: [number, number] = [9.0820, 8.6753];
    const mapCenter: [number, number] = filteredStations.length > 0
        ? [filteredStations[0].latitude, filteredStations[0].longitude]
        : defaultCenter;

    if (isLoading) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h2>Stations</h2>
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
                                    <th>Functional Status</th>
                                    <th>Transmission Status</th>
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
                    <h2>Stations</h2>
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
                    {(user?.role === 'Admin' || user?.role === 'Data Manager') && (
                        <Link to="/stations/add" className={styles.toggleBtn} style={{ backgroundColor: 'var(--primary)', color: 'white', borderColor: 'var(--primary)' }}>
                            <PlusIcon size={16} />
                            Add Station
                        </Link>
                    )}
                </div>
            </div>

            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h3>Data Synchronization</h3>
                        {health?.lastSync?.status === 'success' ? <ShieldCheck size={18} color="#059669" /> : <AlertTriangle size={18} color="#ef4444" />}
                    </div>
                    <div className={styles.healthValue}>
                        {health?.lastSync?.time ? new Date(health.lastSync.time).toLocaleTimeString() : 'Waiting...'}
                    </div>
                    <p className={styles.healthLabel}>Last Successful Sync</p>
                </div>
                <div className={styles.statCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h3>CSV Exports</h3>
                        <FileSpreadsheet size={18} color="#2563eb" />
                    </div>
                    <div className={styles.healthValue}>
                        {health?.lastExport?.time ? new Date(health.lastExport.time).toLocaleTimeString() : 'Waiting...'}
                    </div>
                    <p className={styles.healthLabel}>Last CSV Dump</p>
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
                    <label className={styles.filterLabel} htmlFor="status-filter">Functional Status</label>
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

                <div className={styles.filterGroup}>
                    <label className={styles.filterLabel} htmlFor="transmission-filter">Transmission Status</label>
                    <select
                        id="transmission-filter"
                        className={styles.select}
                        value={filterTransmission}
                        onChange={(e) => setFilterTransmission(e.target.value)}
                    >
                        <option value="all">All Transmission</option>
                        <option value="transmitting">Transmitting</option>
                        <option value="offline">Offline</option>
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
                                <th>Functional Status</th>
                                <th>Transmission Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStations.map((station: Station) => {
                                const lastUpdate = station.last_reading_at ? new Date(station.last_reading_at) : null;
                                const isActive = station.is_active;
                                const isTransmitting = lastUpdate ? (Date.now() - lastUpdate.getTime() <= 24 * 60 * 60 * 1000) : false;

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
                                        <td>
                                            <span
                                                className={styles.status}
                                                style={{
                                                    backgroundColor: isTransmitting ? '#d1fae5' : '#fee2e2',
                                                    color: isTransmitting ? '#065f46' : '#991b1b'
                                                }}
                                            >
                                                {isTransmitting ? 'Transmitting' : 'Offline'}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredStations.length === 0 && (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                        No stations match the selected filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div id="stations-map-container" className={styles.mapContainer} style={{ position: 'relative' }}>
                    <button
                        onClick={toggleFullscreen}
                        title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Map"}
                        style={{
                            position: 'absolute',
                            top: '12px',
                            right: '12px',
                            zIndex: 1000,
                            background: 'white',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            color: '#374151'
                        }}
                    >
                        {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        {isFullscreen ? 'Exit Full Screen' : 'Full Screen'}
                    </button>
                    <MapContainer
                        center={mapCenter}
                        zoom={6}
                        style={{ height: '100%', width: '100%' }}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        {filteredStations.map((station: Station) => {
                            const lat = Number(station.latitude);
                            const lng = Number(station.longitude);
                            if (isNaN(lat) || isNaN(lng)) return null;

                            const lastUpdate = station.last_reading_at ? new Date(station.last_reading_at) : null;
                            const isActive = station.is_active;
                            const isTransmitting = lastUpdate ? (Date.now() - lastUpdate.getTime() <= 24 * 60 * 60 * 1000) : false;

                            let fillColor = '#9ca3af'; // Gray (Inactive)
                            let color = '#4b5563'; // Dark Gray
                            if (isActive) {
                                if (isTransmitting) {
                                    fillColor = '#10b981'; // Green (Active & Transmitting)
                                    color = '#047857';
                                } else {
                                    fillColor = '#f59e0b'; // Amber/Orange (Active but Offline)
                                    color = '#b45309';
                                }
                            }

                            return (
                                <CircleMarker
                                    key={station.station_id}
                                    center={[lat, lng]}
                                    radius={8}
                                    pathOptions={{
                                        fillColor,
                                        color,
                                        weight: 2,
                                        opacity: 1,
                                        fillOpacity: 0.9
                                    }}
                                >
                                    <Popup>
                                        <Link to={`/stations/${station.station_id}`} style={{ fontWeight: 'bold', fontSize: '1.1em', textDecoration: 'none', color: '#333' }}>
                                            {station.station_name}
                                        </Link><br />
                                        Provider: {station.provider}<br />
                                        ID: {station.station_id}<br />
                                        Last Update: {station.last_reading_at ? new Date(station.last_reading_at).toLocaleString() : 'Never'}
                                    </Popup>
                                </CircleMarker>
                            );
                        })}
                    </MapContainer>
                </div>
            )}
        </div>
    );
};

export default Stations;

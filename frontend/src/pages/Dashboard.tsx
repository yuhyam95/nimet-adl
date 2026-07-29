import { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
    Thermometer,
    Droplets,
    Wind,
    Activity,
    MapPin,
    Clock,
    ArrowRight,
    Gauge,
    CloudRain,
    Sun,
    Map as MapIcon,
    Table as TableIcon,
    LayoutGrid,
    Maximize2,
    Minimize2
} from 'lucide-react';
import { MapContainer, TileLayer, Popup, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { Skeleton } from '../components/ui/Skeleton';
import styles from './Dashboard.module.css';

// Fix for Leaflet default marker icon in Vite/React
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
    air_temperature: number;
    relative_humidity: number;
    wind_speed: number;
    wind_direction: number;
    precipitation: number;
    solar_radiation: number;
    atmospheric_pressure: number;
    soil_temperature: number;
    battery_voltage: number;
    last_reading_at: string;
    is_active: boolean;
    provider: string;
    organization?: string;
}

const Dashboard = () => {
    const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>('map');
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
        const mapElem = document.getElementById('dashboard-map-container');
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

    const { data: stations = [], isLoading, isError, error, refetch } = useQuery({
        queryKey: ['stations'],
        queryFn: async () => {
            const res = await axios.get('/api/dataloggers');
            return res.data.success ? res.data.data : [];
        },
        refetchInterval: 30000, // Poll every 30 seconds
    });

    const providers = useMemo(() => {
        return Array.from(new Set(stations.map((s: Station) => s.provider))).filter(Boolean);
    }, [stations]);

    const filteredStations = useMemo(() => {
        const filtered = stations.filter((station: Station) => {
            const matchesProvider = filterProvider === 'all' || station.provider === filterProvider;
            const matchesStatus = filterStatus === 'all' || (filterStatus === 'active' ? station.is_active : !station.is_active);

            const lastUpdate = station.last_reading_at ? new Date(station.last_reading_at) : null;
            const isTransmitting = lastUpdate ? (Date.now() - lastUpdate.getTime() <= 24 * 60 * 60 * 1000) : false;
            const matchesTransmission = filterTransmission === 'all' ||
                (filterTransmission === 'transmitting' ? isTransmitting : !isTransmitting);

            return matchesProvider && matchesStatus && matchesTransmission;
        });

        // Sort stations alphabetically by station_name
        return filtered.sort((a: Station, b: Station) => (a.station_name || '').localeCompare(b.station_name || ''));
    }, [stations, filterProvider, filterStatus, filterTransmission]);

    const stats = useMemo(() => {
        if (!stations.length) {
            return {
                totalStations: 0,
                activeStations: 0,
                transmittingStations: 0,
                avgTemp: 0,
                avgHumidity: 0,
                maxWindSpeed: 0
            };
        }

        const validTemps = stations.filter((s: Station) => s.air_temperature != null).map((s: Station) => Number(s.air_temperature));
        const avgTemp = validTemps.length ? validTemps.reduce((a: number, b: number) => a + b, 0) / validTemps.length : 0;

        const validHums = stations.filter((s: Station) => s.relative_humidity != null).map((s: Station) => Number(s.relative_humidity));
        const avgHum = validHums.length ? validHums.reduce((a: number, b: number) => a + b, 0) / validHums.length : 0;

        const validWinds = stations.filter((s: Station) => s.wind_speed != null).map((s: Station) => Number(s.wind_speed));
        const maxWind = validWinds.length ? Math.max(...validWinds) : 0;

        // Count active stations based on is_active flag
        const activeCount = stations.filter((s: Station) => s.is_active).length;

        // Count transmitting stations based on last reading within 24 hours
        const transmittingCount = stations.filter((s: Station) => {
            if (!s.last_reading_at) return false;
            const diff = Date.now() - new Date(s.last_reading_at).getTime();
            return diff <= 24 * 60 * 60 * 1000; // 24 hours
        }).length;

        return {
            totalStations: stations.length,
            activeStations: activeCount,
            transmittingStations: transmittingCount,
            avgTemp,
            avgHumidity: avgHum,
            maxWindSpeed: maxWind
        };
    }, [stations]);

    if (isLoading) {
        return (
            <div className={styles.dashboard}>
                <div className={styles.statsGrid}>
                    {[...Array(4)].map((_, i) => (
                        <div key={i} className={styles.statCard}>
                            <Skeleton width={120} height={20} style={{ marginBottom: 8 }} />
                            <Skeleton width={60} height={32} />
                        </div>
                    ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <Skeleton width={200} height={24} />
                    <div className={styles.statsGrid}>
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className={styles.stationCard} style={{ height: '220px', padding: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                                    <Skeleton width={150} height={24} />
                                    <Skeleton width={60} height={24} style={{ borderRadius: 99 }} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '16px' }}>
                                    {[...Array(6)].map((_, j) => (
                                        <div key={j}>
                                            <Skeleton width="100%" height={16} style={{ marginBottom: 4 }} />
                                            <Skeleton width="80%" height={20} />
                                        </div>
                                    ))}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto' }}>
                                    <Skeleton width={100} height={16} />
                                    <Skeleton width={60} height={16} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (isError) {
        return (
            <div className={styles.dashboard} style={{ justifyContent: 'center', alignItems: 'center', minHeight: '50vh', textAlign: 'center' }}>
                <div style={{ color: '#ef4444', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Error Loading Dashboard</h3>
                    <p>{(error as Error)?.message || 'Failed to fetch station data. Please try again.'}</p>
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

    const defaultCenter: [number, number] = [9.0820, 8.6753];
    const mapCenter: [number, number] = filteredStations.length > 0 && filteredStations[0].latitude && filteredStations[0].longitude
        ? [Number(filteredStations[0].latitude), Number(filteredStations[0].longitude)]
        : defaultCenter;

    return (
        <div className={styles.dashboard}>
            <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                    <h3>Total Stations</h3>
                    <div className={styles.value}>{stats.totalStations}</div>
                </div>
                <div className={styles.statCard}>
                    <h3>Active Stations</h3>
                    <div className={styles.value} style={{ color: '#059669' }}>{stats.activeStations}</div>
                </div>
                <div className={styles.statCard}>
                    <h3>Transmitting Stations</h3>
                    <div className={styles.value} style={{ color: '#2563eb' }}>{stats.transmittingStations}</div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>Station Status & Readings</h3>

                    <div className={styles.toggleContainer}>
                        <button
                            className={`${styles.toggleBtn} ${viewMode === 'grid' ? styles.activeToggle : ''}`}
                            onClick={() => setViewMode('grid')}
                        >
                            <LayoutGrid size={16} />
                            Grid
                        </button>
                        <button
                            className={`${styles.toggleBtn} ${viewMode === 'list' ? styles.activeToggle : ''}`}
                            onClick={() => setViewMode('list')}
                        >
                            <TableIcon size={16} />
                            List
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

                {/* Filters */}
                <div className={styles.filters}>
                    <div className={styles.filterGroup}>
                        <label className={styles.filterLabel} htmlFor="dashboard-provider-filter">Provider</label>
                        <select
                            id="dashboard-provider-filter"
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
                        <label className={styles.filterLabel} htmlFor="dashboard-status-filter">Functional Status</label>
                        <select
                            id="dashboard-status-filter"
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
                        <label className={styles.filterLabel} htmlFor="dashboard-transmission-filter">Transmission Status</label>
                        <select
                            id="dashboard-transmission-filter"
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

                {/* Conditional Views */}
                {viewMode === 'grid' && (
                    <div className={styles.statsGrid}>
                        {filteredStations.map((station: Station) => {
                            const isActive = station.is_active;
                            const status = isActive ? 'Active' : 'Inactive';
                            const lastUpdate = station.last_reading_at ? new Date(station.last_reading_at) : null;
                            const isTransmitting = lastUpdate ? (Date.now() - lastUpdate.getTime() <= 24 * 60 * 60 * 1000) : false;

                            return (
                                <Link
                                    to={`/stations/${station.station_id}`}
                                    key={station.station_id}
                                    className={styles.stationCard}
                                >
                                    <div className={styles.cardHeader}>
                                        <div className={styles.cardTitle}>
                                            <MapPin size={18} />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                                                    {station.station_name}
                                                </span>
                                                <span style={{ fontSize: '0.7rem', color: '#6b7280', fontWeight: 500 }}>
                                                    {station.provider || 'CLIMDES'}
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                                            <div className={`${styles.statusBadge} ${isActive ? styles.statusActive : styles.statusInactive}`}>
                                                <Activity size={12} />
                                                {status}
                                            </div>
                                            <div className={`${styles.statusBadge} ${isTransmitting ? styles.statusActive : styles.statusInactive}`}>
                                                <Clock size={12} />
                                                {isTransmitting ? 'Transmitting' : 'Offline'}
                                            </div>
                                        </div>
                                    </div>

                                    <div className={styles.readingsGrid} style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                                        {/* Primary Readings */}
                                        <div className={styles.readingItem}>
                                            <span className={styles.readingLabel}><Thermometer size={14} /> Temp</span>
                                            <span className={styles.readingValue}>
                                                {station.air_temperature != null ? Number(station.air_temperature).toFixed(1) : '--'}°C
                                            </span>
                                        </div>
                                        <div className={styles.readingItem}>
                                            <span className={styles.readingLabel}><Droplets size={14} /> Hum</span>
                                            <span className={styles.readingValue}>
                                                {station.relative_humidity != null ? Number(station.relative_humidity).toFixed(1) : '--'}%
                                            </span>
                                        </div>
                                        <div className={styles.readingItem}>
                                            <span className={styles.readingLabel}><Wind size={14} /> Wind</span>
                                            <span className={styles.readingValue}>
                                                {station.wind_speed != null ? Number(station.wind_speed).toFixed(1) : '--'}m/s
                                            </span>
                                        </div>

                                        {/* Secondary Readings */}
                                        <div className={styles.readingItem} style={{ marginTop: '8px' }}>
                                            <span className={styles.readingLabel}><Gauge size={14} /> Baro</span>
                                            <span className={styles.readingValue} style={{ fontSize: '1rem' }}>
                                                {station.atmospheric_pressure != null ? Number(station.atmospheric_pressure).toFixed(0) : '--'}
                                            </span>
                                        </div>
                                        <div className={styles.readingItem} style={{ marginTop: '8px' }}>
                                            <span className={styles.readingLabel}><CloudRain size={14} /> Rain</span>
                                            <span className={styles.readingValue} style={{ fontSize: '1rem' }}>
                                                {station.precipitation != null ? Number(station.precipitation).toFixed(1) : '--'}mm
                                            </span>
                                        </div>
                                        <div className={styles.readingItem} style={{ marginTop: '8px' }}>
                                            <span className={styles.readingLabel}><Sun size={14} /> Solar</span>
                                            <span className={styles.readingValue} style={{ fontSize: '1rem' }}>
                                                {station.solar_radiation != null ? Number(station.solar_radiation).toFixed(0) : '--'}W
                                            </span>
                                        </div>
                                    </div>

                                    <div className={styles.cardFooter}>
                                        <div className={styles.lastUpdated}>
                                            <Clock size={12} />
                                            {station.last_reading_at ? new Date(station.last_reading_at).toLocaleString() : 'Never'}
                                        </div>
                                        <div className={styles.viewDetails}>
                                            Details <ArrowRight size={14} />
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                        {filteredStations.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', width: '100%', gridColumn: '1 / -1' }}>
                                No stations match the selected filters.
                            </div>
                        )}
                    </div>
                )}

                {viewMode === 'list' && (
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
                                                    className={styles.tableStatus}
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
                                                    className={styles.tableStatus}
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
                )}

                {viewMode === 'map' && (
                    <div id="dashboard-map-container" className={styles.mapContainer} style={{ position: 'relative' }}>
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
        </div>
    );
};

export default Dashboard;

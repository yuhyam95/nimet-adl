import { useMemo } from 'react';
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
    ShieldCheck,
    AlertTriangle,
    FileSpreadsheet
} from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';
import styles from './Dashboard.module.css';

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
}

const Dashboard = () => {
    const { data: health, isLoading: healthLoading } = useQuery({
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
        refetchInterval: 30000, // Poll every 30 seconds
    });

    const stats = useMemo(() => {
        if (!stations.length) {
            return {
                totalStations: 0,
                activeStations: 0,
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

        return {
            totalStations: stations.length,
            activeStations: activeCount,
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

    return (
        <div className={styles.dashboard}>
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
                <div className={styles.statCard}>
                    <h3>Total Stations</h3>
                    <div className={styles.value}>{stats.totalStations}</div>
                </div>
                <div className={styles.statCard}>
                    <h3>Active Stations</h3>
                    <div className={styles.value} style={{ color: '#059669' }}>{stats.activeStations}</div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>Station Status & Readings</h3>

                <div className={styles.statsGrid}>
                    {stations.map((station: Station) => {
                        const isActive = station.is_active;
                        const status = isActive ? 'Active' : 'Inactive';

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
                                    <div className={`${styles.statusBadge} ${isActive ? styles.statusActive : styles.statusInactive}`}>
                                        <Activity size={12} />
                                        {status}
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
                </div>
            </div>
        </div>
    );
};

export default Dashboard;

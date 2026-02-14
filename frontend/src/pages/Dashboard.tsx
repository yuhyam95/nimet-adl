import { useEffect, useState } from 'react';
import axios from 'axios';
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
    Sun
} from 'lucide-react';
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
}

const Dashboard = () => {
    const [stations, setStations] = useState<Station[]>([]);
    const [stats, setStats] = useState({
        totalStations: 0,
        activeStations: 0,
        avgTemp: 0,
        avgHumidity: 0,
        maxWindSpeed: 0
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStations = async () => {
            try {
                const res = await axios.get('/api/dataloggers');

                if (res.data.success) {
                    const data: Station[] = res.data.data;
                    setStations(data);

                    // Compute stats from the latest reading of each station
                    if (data.length > 0) {
                        const validTemps = data.filter(s => s.air_temperature != null).map(s => Number(s.air_temperature));
                        const avgTemp = validTemps.length ? validTemps.reduce((a, b) => a + b, 0) / validTemps.length : 0;

                        const validHums = data.filter(s => s.relative_humidity != null).map(s => Number(s.relative_humidity));
                        const avgHum = validHums.length ? validHums.reduce((a, b) => a + b, 0) / validHums.length : 0;

                        const validWinds = data.filter(s => s.wind_speed != null).map(s => Number(s.wind_speed));
                        const maxWind = validWinds.length ? Math.max(...validWinds) : 0;

                        // Count active stations (e.g. updated in the last hour)
                        const now = new Date();
                        const activeCount = data.filter(s => {
                            if (!s.last_reading_at) return false;
                            const lastUpdate = new Date(s.last_reading_at);
                            const diffMs = now.getTime() - lastUpdate.getTime();
                            return diffMs < 60 * 60 * 1000; // 1 hour
                        }).length;

                        setStats({
                            totalStations: data.length,
                            activeStations: activeCount,
                            avgTemp,
                            avgHumidity: avgHum,
                            maxWindSpeed: maxWind
                        });
                    }
                }
            } catch (error) {
                console.error("Error fetching dashboard data", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStations();
        // Poll every 30 seconds
        const interval = setInterval(fetchStations, 30000);
        return () => clearInterval(interval);
    }, []);

    const getStatus = (lastReading: string) => {
        const diff = new Date().getTime() - new Date(lastReading).getTime();
        const isOnline = diff < 60 * 60 * 1000; // 1 hour
        return isOnline ? 'Active' : 'Inactive';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div style={{ padding: '20px', textAlign: 'center' }}>Loading dashboard...</div>
            </div>
        );
    }

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
                    <h3>Avg. Temperature</h3>
                    <div className={styles.value}>{stats.avgTemp.toFixed(1)}°C</div>
                </div>
                <div className={styles.statCard}>
                    <h3>Avg. Humidity</h3>
                    <div className={styles.value}>{stats.avgHumidity.toFixed(1)}%</div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: '#111827' }}>Station Status & Readings</h3>

                <div className={styles.statsGrid}>
                    {stations.map((station) => {
                        const status = getStatus(station.last_reading_at);
                        const isActive = status === 'Active';

                        return (
                            <Link
                                to={`/stations/${station.station_id}`}
                                key={station.station_id}
                                className={styles.stationCard}
                            >
                                <div className={styles.cardHeader}>
                                    <div className={styles.cardTitle}>
                                        <MapPin size={18} />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                                            {station.station_name}
                                        </span>
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
                                        {new Date(station.last_reading_at).toLocaleString()}
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

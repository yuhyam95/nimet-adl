import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import {
    AreaChart,
    Area,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer
} from 'recharts';
import { ArrowLeft, MapPin, Clock, ChevronLeft, ChevronRight, Download, Filter, RefreshCw, Thermometer, Droplets, Wind, Compass, CloudRain, Globe, Radio, Activity, Database, ShieldCheck, CheckCircle2, XCircle, Award } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Skeleton } from '../components/ui/Skeleton';
import styles from './StationDetails.module.css';

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

interface WeatherReading {
    id: number;
    station_name: string;
    air_temperature: number;
    relative_humidity: number;
    wind_speed: number;
    wind_direction?: number;
    precipitation?: number;
    solar_radiation?: number;
    atmospheric_pressure?: number;
    soil_temperature?: number;
    battery_voltage?: number;
    timestamp: string;
    wind_gust?: number;
    lightning_strike_count?: number;
    lightning_strike_distance?: number;
    vapor_pressure?: number;
    humidity_sensor_temperature?: number;
    x_orientation?: number;
    y_orientation?: number;
    atoms_gen2?: number;
    north_wind_speed?: number;
    east_wind_speed?: number;
    soil_electrical_conductivity?: number;
    soil_ph?: number;
    panel_temperature?: number;
    volumetric_water_content?: number;
}

interface Station {
    station_id: string;
    station_name: string;
    latitude: number;
    longitude: number;
    model?: string;
    location_type?: string;
    organization?: string;
    country?: string;
    last_reading_at: string;
    is_active: boolean;
    provider: string;
    wigos_id?: string;
    wsi_series?: string;
    wsi_issuer?: string;
    wsi_issue_number?: string;
    wsi_local?: string;
    wmo_block_number?: string;
    wmo_station_number?: string;
    station_height_above_msl?: number;
    barometer_height_above_msl?: number;
    anemometer_height?: number;
    rain_sensor_height?: number;
    method_of_ground_state_measurement?: string;
    method_of_snow_depth_measurement?: string;
    time_period_of_wind?: number;
    share_to_wis2box?: boolean;
    avg_interval_seconds?: number | null;
    readings_count_24h?: number;
    reporting_frequency_minutes?: number | null;
    reporting_frequency_text?: string;
}

const StationDetails = () => {
    const { id } = useParams<{ id: string }>();
    const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
    const [isFiltered, setIsFiltered] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // WIGOS Form State
    const [isEditingWigos, setIsEditingWigos] = useState(false);
    const [wigosForm, setWigosForm] = useState<Partial<Station>>({});
    const [savingWigos, setSavingWigos] = useState(false);
    const [wigosError, setWigosError] = useState<string | null>(null);

    const handleWigosSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (wigosForm.share_to_wis2box && (!wigosForm.wigos_id || wigosForm.wigos_id.trim() === '')) {
            setWigosError('WIGOS ID is required to share data to WIS2BOX.');
            return;
        }

        setSavingWigos(true);
        setWigosError(null);
        try {
            const token = localStorage.getItem('token');
            await axios.patch(`/api/stations/${id}/wigos`, wigosForm, {
                headers: { Authorization: `Bearer ${token}` }
            });
            await refetchStations();
            setIsEditingWigos(false);
        } catch (err: any) {
            setWigosError(err.response?.data?.message || err.message || 'Failed to save WIGOS metadata');
        } finally {
            setSavingWigos(false);
        }
    };

    // 1. Fetch Station Metadata
    const {
        data: stations = [],
        isLoading: isLoadingStations,
        isError: isErrorStations,
        error: errorStations,
        refetch: refetchStations
    } = useQuery({
        queryKey: ['stations'],
        queryFn: async () => {
            const res = await axios.get('/api/dataloggers');
            return res.data.success ? res.data.data : [];
        },
        staleTime: 5 * 60 * 1000,
    });

    const station = stations.find((s: Station) => s.station_id === id) || null;

    // 2. Fetch Weather Readings
    // Construct query parameters
    const getReadingsQuery = async () => {
        let query = `/api/weather?stationId=${id}`;
        if (isFiltered && dateFilter.start && dateFilter.end) {
            const endDateTime = `${dateFilter.end}T23:59:59`;
            query += `&startDate=${dateFilter.start}&endDate=${endDateTime}&limit=10000`;
        } else {
            query += `&limit=500`; // Default latest
        }
        const res = await axios.get(query);
        return res.data.success ? res.data.data : [];
    };

    const {
        data: rawReadings = [],
        isLoading: isLoadingReadings,
        isError: isErrorReadings,
        error: errorReadings,
        refetch: refetchReadings
    } = useQuery({
        queryKey: ['readings', id, isFiltered, dateFilter],
        queryFn: getReadingsQuery,
        enabled: !!id,
        refetchInterval: isFiltered ? false : 30000,
    });

    // Process readings (sort for chart vs table)
    const readings = useMemo(() => [...rawReadings].reverse(), [rawReadings]); // Chart needs chronological
    const readingsForTable = useMemo(() => [...readings].reverse(), [readings]); // Table needs reverse chronological

    // Compute stats
    const stats = useMemo(() => {
        if (!rawReadings.length) return { avgTemp: 0, avgHumidity: 0, maxWindSpeed: 0 };
        const totalTemp = rawReadings.reduce((acc: number, r: WeatherReading) => acc + Number(r.air_temperature), 0);
        const totalHum = rawReadings.reduce((acc: number, r: WeatherReading) => acc + Number(r.relative_humidity), 0);
        const maxWind = Math.max(...rawReadings.map((r: WeatherReading) => Number(r.wind_speed)));

        return {
            avgTemp: totalTemp / rawReadings.length,
            avgHumidity: totalHum / rawReadings.length,
            maxWindSpeed: maxWind
        };
    }, [rawReadings]);

    // Evaluate WMO GBON Compliance Criteria
    const gbonEvaluation = useMemo(() => {
        if (!station) return null;

        const hasWigos = !!station.wigos_id && station.wigos_id.trim().length > 0;
        const isWis2Enabled = !!station.share_to_wis2box;
        const isWis2Success = station.last_wis2box_dispatch_status === 'Success';
        const mins = station.reporting_frequency_minutes;
        const isHighFreq = mins !== null && mins !== undefined && mins <= 60; // WMO GBON surface observing target <= 60m
        const isOptimalFreq = mins !== null && mins !== undefined && mins <= 15;
        const isTransmitting = station.last_reading_at ? (Date.now() - new Date(station.last_reading_at).getTime() <= 24 * 60 * 60 * 1000) : false;

        const checks = [
            {
                id: 'wigos',
                title: 'WIGOS Station Identifier (WSI)',
                passed: hasWigos,
                statusText: hasWigos ? station.wigos_id! : 'Not Assigned',
                subtext: 'Mandatory WMO unique station identifier for global indexing',
                tip: !hasWigos ? 'Assign a WIGOS ID in the WIGOS Metadata section below' : null
            },
            {
                id: 'wis2_sharing',
                title: 'WIS2box Dispatch Channel',
                passed: isWis2Enabled,
                statusText: isWis2Enabled ? 'Enabled' : 'Disabled',
                subtext: 'Data routing to local/global WIS2box ingestion endpoint',
                tip: !isWis2Enabled ? 'Enable "Share to WIS2BOX" in the WIGOS settings below' : null
            },
            {
                id: 'wis2_status',
                title: 'WIS2 Broadcast Status',
                passed: isWis2Success,
                statusText: station.last_wis2box_dispatch_status || 'Never Dispatched',
                subtext: station.last_wis2box_dispatch_at ? `Last broadcast: ${new Date(station.last_wis2box_dispatch_at).toLocaleString()}` : 'No dispatch record',
                tip: !isWis2Success ? (station.last_wis2box_dispatch_error || 'Verify MinIO / WIS2box endpoint connection') : null
            },
            {
                id: 'frequency',
                title: 'Observational Reporting Frequency',
                passed: isHighFreq,
                optimal: isOptimalFreq,
                statusText: station.reporting_frequency_text || 'No recent data',
                subtext: station.readings_count_24h ? `Target: ≤ 60m interval (${station.readings_count_24h} readings in 24h)` : 'Target: ≤ 60m interval',
                tip: !isHighFreq ? 'GBON requires continuous surface observations at least hourly (≤ 60m)' : null
            },
            {
                id: 'transmission',
                title: '24-Hour Real-Time Transmission',
                passed: isTransmitting,
                statusText: isTransmitting ? 'Active Transmission' : 'Offline / Interrupted',
                subtext: station.last_reading_at ? `Latest: ${new Date(station.last_reading_at).toLocaleString()}` : 'No readings received',
                tip: !isTransmitting ? 'Check station datalogger power or cellular network connectivity' : null
            }
        ];

        const passedCount = checks.filter(c => c.passed).length;
        const totalCount = checks.length;
        const scorePct = Math.round((passedCount / totalCount) * 100);

        let overallStatus = 'Non-Compliant';
        let badgeClass = styles.gbonBadgeNonCompliant;

        if (scorePct === 100) {
            overallStatus = 'GBON Compliant';
            badgeClass = styles.gbonBadgeCompliant;
        } else if (scorePct >= 60) {
            overallStatus = 'Partially Compliant';
            badgeClass = styles.gbonBadgePartial;
        }

        return {
            checks,
            passedCount,
            totalCount,
            scorePct,
            overallStatus,
            badgeClass
        };
    }, [station]);

    const handleFilter = () => {
        if (dateFilter.start && dateFilter.end) {
            setIsFiltered(true);
            setCurrentPage(1);
        }
    };

    const handleReset = () => {
        setDateFilter({ start: '', end: '' });
        setIsFiltered(false);
        setCurrentPage(1);
    };

    // Pagination logic
    const totalPages = Math.ceil(readingsForTable.length / itemsPerPage);
    const paginatedReadings = readingsForTable.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handlePageChange = (page: number) => {
        if (page >= 1 && page <= totalPages) {
            setCurrentPage(page);
        }
    };

    const downloadCSV = () => {
        if (!readingsForTable.length) return;

        const headers = [
            "Timestamp",
            "Station Name",
            "Air Temperature (°C)",
            "Relative Humidity (%)",
            "Wind Speed (m/s)",
            "Wind Direction (°)",
            "Wind Gust (m/s)",
            "Precipitation (mm)",
            "Solar Radiation (W)",
            "Atmospheric Pressure (hPa)",
            "Soil Temperature (°C)",
            "Soil Moisture (VWC)",
            "Soil EC (dS/m)",
            "Soil pH",
            "Battery Voltage (V)",
            "Panel Temp (°C)",
            "Lightning Count",
            "Lightning Dist (km)",
            "Vapor Pressure (kPa)",
            "Sensor Temp (°C)",
            "X Orient",
            "Y Orient",
            "North Wind",
            "East Wind"
        ];

        const csvContent = [
            headers.join(","),
            ...readingsForTable.map(r => [
                `"${new Date(r.timestamp).toLocaleString()}"`,
                `"${r.station_name || station?.station_name || ''}"`,
                r.air_temperature,
                r.relative_humidity,
                r.wind_speed,
                r.wind_direction ?? '',
                r.wind_gust ?? '',
                r.precipitation ?? '',
                r.solar_radiation ?? '',
                r.atmospheric_pressure ?? '',
                r.soil_temperature ?? '',
                r.volumetric_water_content ?? '',
                r.soil_electrical_conductivity ?? '',
                r.soil_ph ?? '',
                r.battery_voltage ?? '',
                r.panel_temperature ?? '',
                r.lightning_strike_count ?? '',
                r.lightning_strike_distance ?? '',
                r.vapor_pressure ?? '',
                r.humidity_sensor_temperature ?? '',
                r.x_orientation ?? '',
                r.y_orientation ?? '',
                r.north_wind_speed ?? '',
                r.east_wind_speed ?? ''
            ].join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `${station?.station_name || 'station'}_weather_data.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (isLoadingStations || (isLoadingReadings && !station)) { // Show loading if searching for station
        return (
            <div className={styles.container}>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <Skeleton width={100} height={20} />
                </div>
                <div className={styles.header}>
                    <div>
                        <Skeleton width={300} height={40} style={{ marginBottom: 8 }} />
                        <div style={{ display: 'flex', gap: 16 }}>
                            <Skeleton width={150} height={20} />
                            <Skeleton width={200} height={20} />
                        </div>
                    </div>
                </div>

                <div className={styles.chartsGrid}>
                    <div className={styles.chartCard} style={{ gridColumn: '1 / -1', height: 300 }}>
                        <Skeleton width="100%" height="100%" />
                    </div>
                    <div className={styles.chartCard} style={{ height: 350 }}>
                        <Skeleton width="100%" height="100%" />
                    </div>
                    <div className={styles.chartCard} style={{ height: 350 }}>
                        <Skeleton width="100%" height="100%" />
                    </div>
                </div>

                <div className={styles.tableSection}>
                    <Skeleton width={200} height={32} style={{ marginBottom: 16 }} />
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Timestamp</th>
                                    <th>Temp</th>
                                    <th>Hum</th>
                                    <th>Wind</th>
                                    <th>Gust</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...Array(5)].map((_, i) => (
                                    <tr key={i}>
                                        <td><Skeleton width={150} height={20} /></td>
                                        <td><Skeleton width={50} height={20} /></td>
                                        <td><Skeleton width={50} height={20} /></td>
                                        <td><Skeleton width={50} height={20} /></td>
                                        <td><Skeleton width={50} height={20} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        );
    }

    if (isErrorStations || isErrorReadings) {
        return (
            <div className={styles.container} style={{ justifyContent: 'center', alignItems: 'center', minHeight: '50vh', textAlign: 'center' }}>
                <div style={{ color: '#ef4444', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Error Loading Data</h3>
                    <p>{(errorStations as Error)?.message || (errorReadings as Error)?.message || 'Failed to fetch data.'}</p>
                </div>
                <button
                    onClick={() => {
                        if (isErrorStations) refetchStations();
                        if (isErrorReadings) refetchReadings();
                    }}
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

    if (!station) return <div>Station not found</div>;

    const lastUpdateDate = station.last_reading_at ? new Date(station.last_reading_at) : null;
    const isOnline = station.is_active;
    const isTransmitting = lastUpdateDate ? (Date.now() - lastUpdateDate.getTime() <= 24 * 60 * 60 * 1000) : false;

    return (
        <div className={styles.container}>
            <Link to="/stations" className={styles.backLink}>
                <ArrowLeft size={20} />
                Back to Stations
            </Link>

            <div className={styles.header}>
                <div className={styles.stationInfo}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                        <h1>{station.station_name}</h1>
                        <span style={{ fontSize: '0.9rem', color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: '4px' }}>
                            {station.provider || 'CLIMDES'}
                        </span>
                    </div>
                    <div className={styles.meta}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <MapPin size={16} />
                            {station.latitude}, {station.longitude}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={16} />
                            Last updated: {lastUpdateDate ? lastUpdateDate.toLocaleString() : 'Never'}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div
                        className={styles.statusBadge}
                        style={{
                            backgroundColor: isOnline ? '#d1fae5' : '#f3f4f6',
                            color: isOnline ? '#065f46' : '#374151'
                        }}
                    >
                        Functional: {isOnline ? 'Active' : 'Inactive'}
                    </div>
                    <div
                        className={styles.statusBadge}
                        style={{
                            backgroundColor: isTransmitting ? '#d1fae5' : '#fee2e2',
                            color: isTransmitting ? '#065f46' : '#991b1b'
                        }}
                    >
                        Transmission: {isTransmitting ? 'Transmitting' : 'Offline'}
                    </div>
                </div>
            </div>

            {/* Latest Readings Cards */}
            {!isLoadingReadings && paginatedReadings.length > 0 && (
                <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: '#fee2e2', color: '#dc2626' }}>
                            <Thermometer size={24} />
                        </div>
                        <div className={styles.statLabel}>Temperature</div>
                        <div className={styles.statValue}>
                            {paginatedReadings[0].air_temperature}
                            <span className={styles.statUnit}>°C</span>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: '#e0f2fe', color: '#0284c7' }}>
                            <Droplets size={24} />
                        </div>
                        <div className={styles.statLabel}>Humidity</div>
                        <div className={styles.statValue}>
                            {paginatedReadings[0].relative_humidity}
                            <span className={styles.statUnit}>%</span>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: '#fef3c7', color: '#d97706' }}>
                            <Wind size={24} />
                        </div>
                        <div className={styles.statLabel}>Wind Speed</div>
                        <div className={styles.statValue}>
                            {paginatedReadings[0].wind_speed}
                            <span className={styles.statUnit}>m/s</span>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: '#f5f3ff', color: '#7c3aed' }}>
                            <Compass size={24} />
                        </div>
                        <div className={styles.statLabel}>Wind Direction</div>
                        <div className={styles.statValue}>
                            {paginatedReadings[0].wind_direction ?? '-'}
                            <span className={styles.statUnit}>°</span>
                        </div>
                    </div>

                    <div className={styles.statCard}>
                        <div className={styles.statIcon} style={{ background: '#dcfce7', color: '#16a34a' }}>
                            <CloudRain size={24} />
                        </div>
                        <div className={styles.statLabel}>Precipitation</div>
                        <div className={styles.statValue}>
                            {paginatedReadings[0].precipitation ?? '0'}
                            <span className={styles.statUnit}>mm</span>
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.chartsGrid}>
                {/* Station Overview & Map */}
                <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
                        <div style={{ flex: '1', minWidth: '250px' }}>
                            <h3>Station Information</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '12px 24px', marginTop: '16px' }}>
                                <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>Data Logger Model:</div>
                                <div style={{ fontWeight: 500, color: '#111827' }}>{station.model || 'N/A'}</div>

                                <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>Location Type:</div>
                                <div style={{ fontWeight: 500, color: '#111827' }}>{station.location_type || 'Point'}</div>

                                <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>Organization:</div>
                                <div style={{ fontWeight: 500, color: '#111827' }}>{station.organization || 'N/A'}</div>

                                <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>Coordinates:</div>
                                <div style={{ fontWeight: 500, color: '#111827' }}>{station.latitude}, {station.longitude}</div>

                                <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>Reporting Frequency:</div>
                                <div style={{ fontWeight: 500, color: '#111827', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span>{station.reporting_frequency_text || 'No recent data'}</span>
                                    {station.readings_count_24h !== undefined && station.readings_count_24h > 0 && (
                                        <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                            ({station.readings_count_24h} readings/24h)
                                        </span>
                                    )}
                                </div>

                                {station.country && (
                                    <>
                                        <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>Country:</div>
                                        <div style={{ fontWeight: 500, color: '#111827' }}>{station.country}</div>
                                    </>
                                )}
                            </div>
                        </div>

                        <div style={{ flex: '1', minWidth: '300px', height: '250px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                            <MapContainer
                                center={[station.latitude, station.longitude]}
                                zoom={13}
                                style={{ height: '100%', width: '100%' }}
                            >
                                <TileLayer
                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                <Marker position={[station.latitude, station.longitude]}>
                                    <Popup>
                                        <strong>{station.station_name}</strong>
                                    </Popup>
                                </Marker>
                            </MapContainer>
                        </div>
                    </div>
                </div>

                {/* WIGOS Settings Card */}
                <div className={styles.chartCard} style={{ gridColumn: '1 / -1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3>WIGOS & WIS2BOX Metadata</h3>
                        {!isEditingWigos ? (
                            <button 
                                onClick={() => {
                                    setWigosForm({
                                        wigos_id: station.wigos_id || '',
                                        wsi_series: station.wsi_series || '',
                                        wsi_issuer: station.wsi_issuer || '',
                                        wsi_issue_number: station.wsi_issue_number || '',
                                        wsi_local: station.wsi_local || '',
                                        wmo_block_number: station.wmo_block_number || '',
                                        wmo_station_number: station.wmo_station_number || '',
                                        station_height_above_msl: station.station_height_above_msl || '',
                                        barometer_height_above_msl: station.barometer_height_above_msl || '',
                                        anemometer_height: station.anemometer_height || '',
                                        rain_sensor_height: station.rain_sensor_height || '',
                                        method_of_ground_state_measurement: station.method_of_ground_state_measurement || '',
                                        method_of_snow_depth_measurement: station.method_of_snow_depth_measurement || '',
                                        time_period_of_wind: station.time_period_of_wind || '',
                                        share_to_wis2box: station.share_to_wis2box || false
                                    } as any);
                                    setIsEditingWigos(true);
                                }}
                                style={{ padding: '6px 12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Edit Metadata
                            </button>
                        ) : (
                            <button 
                                onClick={() => setIsEditingWigos(false)}
                                style={{ padding: '6px 12px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                    
                    {isEditingWigos ? (
                        <form onSubmit={handleWigosSubmit} style={{ marginTop: '16px' }}>
                            {wigosError && <div style={{ color: 'red', marginBottom: '12px' }}>{wigosError}</div>}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#4b5563', marginBottom: '4px' }}>WIGOS ID (e.g. 0-288-0-12345)</label>
                                    <input type="text" value={wigosForm.wigos_id || ''} onChange={(e) => {
                                        const val = e.target.value;
                                        setWigosForm({
                                            ...wigosForm, 
                                            wigos_id: val,
                                            ...((!val || val.trim() === '') && { share_to_wis2box: false })
                                        });
                                    }} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#4b5563', marginBottom: '4px' }}>WSI Series</label>
                                    <input type="text" value={wigosForm.wsi_series || ''} onChange={(e) => setWigosForm({...wigosForm, wsi_series: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#4b5563', marginBottom: '4px' }}>WSI Issuer</label>
                                    <input type="text" value={wigosForm.wsi_issuer || ''} onChange={(e) => setWigosForm({...wigosForm, wsi_issuer: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#4b5563', marginBottom: '4px' }}>WSI Issue Number</label>
                                    <input type="text" value={wigosForm.wsi_issue_number || ''} onChange={(e) => setWigosForm({...wigosForm, wsi_issue_number: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#4b5563', marginBottom: '4px' }}>WSI Local</label>
                                    <input type="text" value={wigosForm.wsi_local || ''} onChange={(e) => setWigosForm({...wigosForm, wsi_local: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#4b5563', marginBottom: '4px' }}>WMO Block Number</label>
                                    <input type="text" value={wigosForm.wmo_block_number || ''} onChange={(e) => setWigosForm({...wigosForm, wmo_block_number: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#4b5563', marginBottom: '4px' }}>WMO Station Number</label>
                                    <input type="text" value={wigosForm.wmo_station_number || ''} onChange={(e) => setWigosForm({...wigosForm, wmo_station_number: e.target.value})} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#4b5563', marginBottom: '4px' }}>Station Height Above MSL</label>
                                    <input type="number" step="0.1" value={wigosForm.station_height_above_msl || ''} onChange={(e) => setWigosForm({...wigosForm, station_height_above_msl: Number(e.target.value)})} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#4b5563', marginBottom: '4px' }}>Barometer Height</label>
                                    <input type="number" step="0.1" value={wigosForm.barometer_height_above_msl || ''} onChange={(e) => setWigosForm({...wigosForm, barometer_height_above_msl: Number(e.target.value)})} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#4b5563', marginBottom: '4px' }}>Anemometer Height</label>
                                    <input type="number" step="0.1" value={wigosForm.anemometer_height || ''} onChange={(e) => setWigosForm({...wigosForm, anemometer_height: Number(e.target.value)})} style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '4px' }} />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', marginTop: '24px' }}>
                                    <input 
                                        type="checkbox" 
                                        id="shareToWis2box" 
                                        checked={wigosForm.share_to_wis2box || false} 
                                        disabled={!wigosForm.wigos_id || wigosForm.wigos_id.trim() === ''}
                                        onChange={(e) => setWigosForm({...wigosForm, share_to_wis2box: e.target.checked})} 
                                        style={{ marginRight: '8px', transform: 'scale(1.2)' }} 
                                    />
                                    <label htmlFor="shareToWis2box" style={{ fontSize: '0.9rem', color: (!wigosForm.wigos_id || wigosForm.wigos_id.trim() === '') ? '#9ca3af' : '#111827', fontWeight: 500 }}>Share data to WIS2BOX</label>
                                </div>
                            </div>
                            <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                                <button type="submit" disabled={savingWigos} style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                    {savingWigos ? 'Saving...' : 'Save Metadata'}
                                </button>
                            </div>
                        </form>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '16px' }}>
                            <div><span style={{ color: '#6b7280', fontSize: '0.85rem' }}>WIGOS ID:</span><div style={{ fontWeight: 500 }}>{station.wigos_id || '-'}</div></div>
                            <div><span style={{ color: '#6b7280', fontSize: '0.85rem' }}>WSI Series:</span><div style={{ fontWeight: 500 }}>{station.wsi_series || '-'}</div></div>
                            <div><span style={{ color: '#6b7280', fontSize: '0.85rem' }}>WSI Issuer:</span><div style={{ fontWeight: 500 }}>{station.wsi_issuer || '-'}</div></div>
                            <div><span style={{ color: '#6b7280', fontSize: '0.85rem' }}>WMO Station No:</span><div style={{ fontWeight: 500 }}>{station.wmo_station_number || '-'}</div></div>
                            <div><span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Station Elevation:</span><div style={{ fontWeight: 500 }}>{station.station_height_above_msl ? `${station.station_height_above_msl} m` : '-'}</div></div>
                            <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                                <span style={{ padding: '4px 8px', borderRadius: '4px', fontSize: '0.85rem', fontWeight: 600, background: station.share_to_wis2box ? '#d1fae5' : '#f3f4f6', color: station.share_to_wis2box ? '#065f46' : '#6b7280' }}>
                                    {station.share_to_wis2box ? '✓ Sharing to WIS2BOX' : '✗ Not sharing to WIS2BOX'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Temperature Chart */}
                <div className={styles.chartCard}>
                    <h3>Temperature History</h3>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                            <AreaChart data={readings}>
                                <defs>
                                    <linearGradient id="colorTempDetails" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis
                                    dataKey="timestamp"
                                    tickFormatter={(tick) => new Date(tick).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    minTickGap={50}
                                />
                                <YAxis unit="°C" domain={['auto', 'auto']} />
                                <Tooltip
                                    labelFormatter={(label) => new Date(label).toLocaleString()}
                                    formatter={(value: number | undefined) => [value !== undefined ? `${value}°C` : "N/A", 'Temperature']}
                                />
                                <Legend />
                                <Area
                                    type="monotone"
                                    dataKey="air_temperature"
                                    stroke="#8884d8"
                                    fillOpacity={1}
                                    fill="url(#colorTempDetails)"
                                    name="Temperature"
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                    <div style={{ marginTop: '16px', fontSize: '0.9rem', color: '#666' }}>
                        Average: {stats.avgTemp.toFixed(1)}°C
                    </div>
                </div>

                {/* Humidity & Wind Chart */}
                <div className={styles.chartCard}>
                    <h3>Humidity & Wind Speed</h3>
                    <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer>
                            <LineChart data={readings}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis
                                    dataKey="timestamp"
                                    tickFormatter={(tick) => new Date(tick).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    minTickGap={50}
                                />
                                <YAxis yAxisId="left" unit="%" domain={[0, 100]} />
                                <YAxis yAxisId="right" orientation="right" unit="m/s" />
                                <Tooltip labelFormatter={(label) => new Date(label).toLocaleString()} />
                                <Legend />
                                <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="relative_humidity"
                                    stroke="#82ca9d"
                                    name="Humidity"
                                    dot={false}
                                />
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="wind_speed"
                                    stroke="#ff7300"
                                    name="Wind Speed"
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div style={{ marginTop: '16px', fontSize: '0.9rem', color: '#666', display: 'flex', gap: '16px' }}>
                        <span>Avg Humidity: {(stats.avgHumidity).toFixed(1)}%</span>
                        <span>Max Wind: {stats.maxWindSpeed} m/s</span>
                    </div>
                </div>
            </div>

            <div className={styles.tableSection}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '16px' }}>
                    <h3 style={{ margin: 0 }}>Reading History</h3>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="date"
                                className={styles.dateInput}
                                value={dateFilter.start}
                                onChange={(e) => setDateFilter({ ...dateFilter, start: e.target.value })}
                                style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }}
                            />
                            <span style={{ color: '#666' }}>to</span>
                            <input
                                type="date"
                                className={styles.dateInput}
                                value={dateFilter.end}
                                onChange={(e) => setDateFilter({ ...dateFilter, end: e.target.value })}
                                style={{ padding: '8px', border: '1px solid #ddd', borderRadius: '6px' }}
                            />
                        </div>

                        <button
                            onClick={handleFilter}
                            style={{
                                padding: '8px 12px',
                                background: '#2563eb',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <Filter size={16} /> Filter
                        </button>

                        {isFiltered && (
                            <button
                                onClick={handleReset}
                                style={{
                                    padding: '8px 12px',
                                    background: '#f3f4f6',
                                    color: '#374151',
                                    border: '1px solid #ddd',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <RefreshCw size={16} /> Reset
                            </button>
                        )}


                        <button
                            onClick={downloadCSV}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '8px 16px',
                                borderRadius: '6px',
                                border: '1px solid #10b981',
                                background: '#ecfdf5',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                fontWeight: 500,
                                color: '#047857'
                            }}
                        >
                            <Download size={16} />
                            Download
                        </button>
                    </div>
                </div>
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Temp (°C)</th>
                                <th>Hum (%)</th>
                                <th>Wind (m/s)</th>
                                <th>Gust (m/s)</th>
                                <th>Dir (°)</th>
                                <th>Rain (mm)</th>
                                <th>Solar (W)</th>
                                <th>Press (hPa)</th>
                                <th>Soil (°C)</th>
                                <th>VWC</th>
                                <th>Batt (V)</th>
                                <th>Lightning</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedReadings.map((reading: WeatherReading) => (
                                <tr key={reading.id || reading.timestamp}>
                                    <td>{new Date(reading.timestamp).toLocaleString()}</td>
                                    <td>{reading.air_temperature}</td>
                                    <td>{reading.relative_humidity}</td>
                                    <td>{reading.wind_speed}</td>
                                    <td>{reading.wind_gust ?? '-'}</td>
                                    <td>{reading.wind_direction ?? '-'}</td>
                                    <td>{reading.precipitation ?? '-'}</td>
                                    <td>{reading.solar_radiation ?? '-'}</td>
                                    <td>{reading.atmospheric_pressure ?? '-'}</td>
                                    <td>{reading.soil_temperature ?? '-'}</td>
                                    <td>{reading.volumetric_water_content ? Number(reading.volumetric_water_content).toFixed(2) : '-'}</td>
                                    <td>{reading.battery_voltage ?? '-'}</td>
                                    <td>{reading.lightning_strike_count ?? '-'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className={styles.pagination}>
                    <div className={styles.pageInfo}>
                        Showing {paginatedReadings.length} of {readingsForTable.length} readings
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                            className={styles.pageBtn}
                            disabled={currentPage === 1}
                            onClick={() => handlePageChange(currentPage - 1)}
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span style={{ fontSize: '0.9rem', width: '60px', textAlign: 'center' }}>
                            Page {currentPage} of {totalPages}
                        </span>
                        <button
                            className={styles.pageBtn}
                            disabled={currentPage === totalPages}
                            onClick={() => handlePageChange(currentPage + 1)}
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {/* WMO GBON Compliance & Reporting Tracker */}
            {gbonEvaluation && (
                <div className={styles.gbonCard} style={{ marginTop: '24px' }}>
                    <div className={styles.gbonHeader}>
                        <div className={styles.gbonHeaderTitle}>
                            <Globe size={22} color="#0284c7" />
                            <div>
                                <h3>WMO GBON Compliance & Reporting Tracker</h3>
                                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                                    Global Basic Observing Network (GBON) Standards Evaluation
                                </span>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                            <div className={styles.gbonProgressContainer}>
                                <div className={styles.gbonProgressBarTrack}>
                                    <div
                                        className={styles.gbonProgressBarFill}
                                        style={{
                                            width: `${gbonEvaluation.scorePct}%`,
                                            backgroundColor: gbonEvaluation.scorePct === 100 ? '#10b981' : (gbonEvaluation.scorePct >= 60 ? '#f59e0b' : '#ef4444')
                                        }}
                                    />
                                </div>
                                <span className={styles.gbonProgressText}>
                                    {gbonEvaluation.scorePct}% ({gbonEvaluation.passedCount}/{gbonEvaluation.totalCount})
                                </span>
                            </div>

                            <div className={`${styles.gbonBadge} ${gbonEvaluation.badgeClass}`}>
                                <Award size={16} />
                                {gbonEvaluation.overallStatus}
                            </div>
                        </div>
                    </div>

                    <div className={styles.gbonGrid}>
                        {gbonEvaluation.checks.map(c => {
                            const itemClass = c.passed
                                ? styles.gbonItemPass
                                : (c.id === 'frequency' && station?.reporting_frequency_minutes && station.reporting_frequency_minutes <= 120 ? styles.gbonItemWarning : styles.gbonItemFail);

                            return (
                                <div key={c.id} className={`${styles.gbonItem} ${itemClass}`}>
                                    <div className={styles.gbonItemHeader}>
                                        <span className={styles.gbonItemLabel}>
                                            {c.id === 'wigos' && <Database size={15} color="#2563eb" />}
                                            {c.id === 'wis2_sharing' && <Radio size={15} color="#0284c7" />}
                                            {c.id === 'wis2_status' && <ShieldCheck size={15} color="#059669" />}
                                            {c.id === 'frequency' && <Activity size={15} color="#d97706" />}
                                            {c.id === 'transmission' && <Clock size={15} color="#7c3aed" />}
                                            {c.title}
                                        </span>
                                        {c.passed ? (
                                            <CheckCircle2 size={18} color="#059669" />
                                        ) : (
                                            <XCircle size={18} color="#dc2626" />
                                        )}
                                    </div>

                                    <div className={styles.gbonItemValue}>
                                        {c.statusText}
                                    </div>

                                    <div className={styles.gbonItemSubtext}>
                                        {c.subtext}
                                    </div>

                                    {c.tip && (
                                        <div className={styles.gbonItemTip}>
                                            💡 {c.tip}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default StationDetails;

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
import { ArrowLeft, MapPin, Clock, ChevronLeft, ChevronRight, Download, Filter, RefreshCw, Thermometer, Droplets, Wind, Compass, CloudRain } from 'lucide-react';
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
}

const StationDetails = () => {
    const { id } = useParams<{ id: string }>();
    const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
    const [isFiltered, setIsFiltered] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

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

    const lastUpdate = new Date(station.last_reading_at);
    const isOnline = station.is_active;

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
                            Last updated: {lastUpdate.toLocaleString()}
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
                        {isOnline ? 'Active' : 'Inactive'}
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
        </div>
    );
};

export default StationDetails;

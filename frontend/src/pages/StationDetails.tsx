import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
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
import { ArrowLeft, MapPin, Clock, ChevronLeft, ChevronRight, Download, Filter, RefreshCw } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
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
}

const StationDetails = () => {
    const { id } = useParams<{ id: string }>();
    const [station, setStation] = useState<Station | null>(null);
    const [readings, setReadings] = useState<WeatherReading[]>([]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        avgTemp: 0,
        avgHumidity: 0,
        maxWindSpeed: 0
    });

    const [dateFilter, setDateFilter] = useState({ start: '', end: '' });
    const [isFiltered, setIsFiltered] = useState(false);

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const fetchStationData = async (forceFilterString = '') => {
        if (!id) return;

        try {
            // Fetch station details (from all stations for now)
            const stationsRes = await axios.get('/api/dataloggers');
            if (stationsRes.data.success) {
                const foundStation = stationsRes.data.data.find((s: Station) => s.station_id === id);
                if (foundStation) {
                    setStation(foundStation);
                }
            }

            // Build query
            let query = `/api/weather?stationId=${id}`;

            if (forceFilterString && forceFilterString !== 'RESET') {
                query += forceFilterString;
                query += `&limit=10000`; // Get all for the range
            } else {
                query += `&limit=500`; // Default latest
            }

            const weatherRes = await axios.get(query);
            if (weatherRes.data.success) {
                const data = weatherRes.data.data;
                const sortedForChart = [...data].reverse();
                setReadings(sortedForChart);

                // Compute stats
                if (data.length > 0) {
                    const totalTemp = data.reduce((acc: number, r: WeatherReading) => acc + Number(r.air_temperature), 0);
                    const totalHum = data.reduce((acc: number, r: WeatherReading) => acc + Number(r.relative_humidity), 0);
                    const maxWind = Math.max(...data.map((r: WeatherReading) => Number(r.wind_speed)));

                    setStats({
                        avgTemp: totalTemp / data.length,
                        avgHumidity: totalHum / data.length,
                        maxWindSpeed: maxWind
                    });
                } else {
                    setStats({ avgTemp: 0, avgHumidity: 0, maxWindSpeed: 0 });
                }
            }
        } catch (error) {
            console.error("Error fetching station details", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Initial load
        fetchStationData();

        // Poll every 30 seconds ONLY if not filtered
        const interval = setInterval(() => {
            if (!isFiltered) {
                fetchStationData();
            }
        }, 30000);

        return () => clearInterval(interval);
    }, [id, isFiltered]);

    const handleFilter = () => {
        if (dateFilter.start && dateFilter.end) {
            setIsFiltered(true);
            setCurrentPage(1);
            // Append end of day to end date
            const endDateTime = `${dateFilter.end}T23:59:59`;
            const queryString = `&startDate=${dateFilter.start}&endDate=${endDateTime}`;
            fetchStationData(queryString);
        }
    };

    const handleReset = () => {
        setDateFilter({ start: '', end: '' });
        setIsFiltered(false);
        setCurrentPage(1);
        fetchStationData('RESET');
    };

    // Pagination logic
    const readingsForTable = [...readings].reverse();
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
            "Precipitation (mm)",
            "Solar Radiation (W)",
            "Atmospheric Pressure (hPa)",
            "Soil Temperature (°C)",
            "Battery Voltage (V)"
        ];

        const csvContent = [
            headers.join(","),
            ...readingsForTable.map(r => [
                `"${new Date(r.timestamp).toLocaleString()}"`, // Quote timestamp to handle commas
                `"${r.station_name || station?.station_name || ''}"`,
                r.air_temperature,
                r.relative_humidity,
                r.wind_speed,
                r.wind_direction ?? '',
                r.precipitation ?? '',
                r.solar_radiation ?? '',
                r.atmospheric_pressure ?? '',
                r.soil_temperature ?? '',
                r.battery_voltage ?? ''
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

    if (loading) return <div>Loading station details...</div>;
    if (!station) return <div>Station not found</div>;

    const lastUpdate = new Date(station.last_reading_at);
    const isOnline = (new Date().getTime() - lastUpdate.getTime()) < 3 * 60 * 60 * 1000;

    return (
        <div className={styles.container}>
            <Link to="/stations" className={styles.backLink}>
                <ArrowLeft size={20} />
                Back to Stations
            </Link>

            <div className={styles.header}>
                <div className={styles.stationInfo}>
                    <h1>{station.station_name}</h1>
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
                                <th>Dir (°)</th>
                                <th>Rain (mm)</th>
                                <th>Solar (W)</th>
                                <th>Press (hPa)</th>
                                <th>Soil (°C)</th>
                                <th>Batt (V)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedReadings.map((reading) => (
                                <tr key={reading.id || reading.timestamp}>
                                    <td>{new Date(reading.timestamp).toLocaleString()}</td>
                                    <td>{reading.air_temperature}</td>
                                    <td>{reading.relative_humidity}</td>
                                    <td>{reading.wind_speed}</td>
                                    <td>{reading.wind_direction ?? '-'}</td>
                                    <td>{reading.precipitation ?? '-'}</td>
                                    <td>{reading.solar_radiation ?? '-'}</td>
                                    <td>{reading.atmospheric_pressure ?? '-'}</td>
                                    <td>{reading.soil_temperature ?? '-'}</td>
                                    <td>{reading.battery_voltage ?? '-'}</td>
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

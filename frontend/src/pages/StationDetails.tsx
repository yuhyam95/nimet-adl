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
import { ArrowLeft, MapPin, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './StationDetails.module.css';

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

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        const fetchStationData = async () => {
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

                // Fetch weather history for this station
                const weatherRes = await axios.get(`/api/weather?stationId=${id}&limit=500`);
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
                    }
                }
            } catch (error) {
                console.error("Error fetching station details", error);
            } finally {
                setLoading(false);
            }
        };

        fetchStationData();
        // Poll every 30 seconds
        const interval = setInterval(fetchStationData, 30000);
        return () => clearInterval(interval);
    }, [id]);

    // Pagination logic
    // readings is sorted ascending for charts (oldest -> newest), we want table to show newest first?
    // Actually `readings` state says `sortedForChart` which is `[...data].reverse()`.
    // API returns `ORDER BY timestamp DESC` (newest first).
    // So `data` (from API) is Newest -> Oldest.
    // `sortedForChart` (assigned to `readings`) is Oldest -> Newest.
    // So for Table, we want Newest -> Oldest. So we should reverse `readings` or use original `data` order.
    // Let's reverse a copy for the table.
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

    if (loading) return <div>Loading station details...</div>;
    if (!station) return <div>Station not found</div>;

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
                            Last updated: {new Date(station.last_reading_at).toLocaleString()}
                        </span>
                    </div>
                </div>
                <div className={styles.statusBadge}>Active</div>
            </div>

            <div className={styles.chartsGrid}>
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
                <h3>Reading History</h3>
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

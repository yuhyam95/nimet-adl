const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');

// Try to load .env from project root or current working directory
const rootEnvPath = path.resolve(__dirname, '../../../../.env');
const cwdEnvPath = path.resolve(process.cwd(), '.env');

if (fs.existsSync(rootEnvPath)) {
    require('dotenv').config({ path: rootEnvPath });
} else if (fs.existsSync(cwdEnvPath)) {
    require('dotenv').config({ path: cwdEnvPath });
} else {
    require('dotenv').config(); // Fallback to default behavior
}

const pool = new Pool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
});

// Parse command line arguments
const args = process.argv.slice(2);
let days = 1;
let stationId = null;
let listStations = false;
let outputJson = false;

for (let i = 0; i < args.length; i++) {
    if (args[i] === '--days' && args[i + 1]) {
        days = parseInt(args[i + 1], 10);
        i++;
    } else if (args[i] === '--station' && args[i + 1]) {
        stationId = args[i + 1];
        i++;
    } else if (args[i] === '--list-stations') {
        listStations = true;
    } else if (args[i] === '--json') {
        outputJson = true;
    }
}

async function run() {
    try {
        if (listStations) {
            await printStations();
        } else if (stationId) {
            await printStationDetails(stationId, days);
        } else {
            await printSummary(days);
        }
    } catch (err) {
        console.error('Error running query:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

async function printStations() {
    const query = `
        SELECT station_id, station_name, country, provider, last_reading_at, is_active 
        FROM stations 
        ORDER BY station_name ASC
    `;
    const res = await pool.query(query);
    
    if (outputJson) {
        console.log(JSON.stringify(res.rows, null, 2));
        return;
    }

    console.log('### Registered Weather Stations\n');
    console.log('| Station ID | Station Name | Country | Provider | Last Reading | Active |');
    console.log('|------------|--------------|---------|----------|--------------|--------|');
    res.rows.forEach(row => {
        const lastRead = row.last_reading_at ? new Date(row.last_reading_at).toLocaleString() : 'Never';
        console.log(`| ${row.station_id} | ${row.station_name} | ${row.country || '--'} | ${row.provider} | ${lastRead} | ${row.is_active ? 'Yes' : 'No'} |`);
    });
}

async function printSummary(daysLimit) {
    const query = `
        SELECT 
            station_id,
            station_name,
            COUNT(*) as total_readings,
            ROUND(AVG(air_temperature), 2) as avg_temp,
            ROUND(MAX(air_temperature), 2) as max_temp,
            ROUND(MIN(air_temperature), 2) as min_temp,
            ROUND(AVG(relative_humidity), 2) as avg_humidity,
            ROUND(SUM(precipitation), 2) as total_precipitation,
            ROUND(AVG(wind_speed), 2) as avg_wind_speed,
            ROUND(MAX(wind_gust), 2) as max_wind_gust,
            ROUND(AVG(soil_temperature), 2) as avg_soil_temp,
            ROUND(AVG(volumetric_water_content), 2) as avg_soil_moisture
        FROM weather_readings
        WHERE timestamp >= NOW() - INTERVAL '1 day' * $1
        GROUP BY station_id, station_name
        ORDER BY station_name ASC
    `;
    const res = await pool.query(query, [daysLimit]);

    if (outputJson) {
        console.log(JSON.stringify(res.rows, null, 2));
        return;
    }

    console.log(`### Weather Summary (Past ${daysLimit} Days)\n`);
    if (res.rows.length === 0) {
        console.log('No weather readings found in this timeframe.');
        return;
    }

    console.log('| Station ID | Station Name | Readings | Avg/Max/Min Temp (°C) | Avg Hum (%) | Total Rain (mm) | Avg/Max Wind (m/s) | Avg Soil Temp (°C) | Soil Moisture (%) |');
    console.log('|------------|--------------|----------|-----------------------|-------------|-----------------|--------------------|--------------------|-------------------|');
    res.rows.forEach(row => {
        const tempRange = `${row.avg_temp || '--'} / ${row.max_temp || '--'} / ${row.min_temp || '--'}`;
        const windRange = `${row.avg_wind_speed || '--'} / ${row.max_wind_gust || '--'}`;
        console.log(`| ${row.station_id} | ${row.station_name} | ${row.total_readings} | ${tempRange} | ${row.avg_humidity || '--'} | ${row.total_precipitation || '0'} | ${windRange} | ${row.avg_soil_temp || '--'} | ${row.avg_soil_moisture ? (row.avg_soil_moisture * 100).toFixed(1) : '--'} |`);
    });
}

async function printStationDetails(station, daysLimit) {
    // Fetch station metadata first
    const metaRes = await pool.query('SELECT station_name, provider FROM stations WHERE station_id = $1', [station]);
    const meta = metaRes.rows[0] || { station_name: station, provider: 'Unknown' };

    const query = `
        SELECT 
            timestamp,
            air_temperature,
            relative_humidity,
            wind_speed,
            precipitation,
            wind_gust,
            soil_temperature,
            volumetric_water_content
        FROM weather_readings
        WHERE station_id = $1 AND timestamp >= NOW() - INTERVAL '1 day' * $2
        ORDER BY timestamp DESC
    `;
    const res = await pool.query(query, [station, daysLimit]);

    if (outputJson) {
        console.log(JSON.stringify({ station: meta, readings: res.rows }, null, 2));
        return;
    }

    console.log(`### Readings for ${meta.station_name} (${station}) - Past ${daysLimit} Days\n`);
    if (res.rows.length === 0) {
        console.log('No readings found for this station in the specified timeframe.');
        return;
    }

    console.log('| Timestamp | Temp (°C) | Humidity (%) | Wind Speed (m/s) | Wind Gust (m/s) | Rain (mm) | Soil Temp (°C) | Soil Moisture (%) |');
    console.log('|-----------|-----------|--------------|------------------|-----------------|-----------|----------------|-------------------|');
    res.rows.forEach(row => {
        const timeStr = new Date(row.timestamp).toLocaleString();
        console.log(`| ${timeStr} | ${row.air_temperature || '--'} | ${row.relative_humidity || '--'} | ${row.wind_speed || '--'} | ${row.wind_gust || '--'} | ${row.precipitation || '0'} | ${row.soil_temperature || '--'} | ${row.volumetric_water_content ? (row.volumetric_water_content * 100).toFixed(1) : '--'} |`);
    });
}

run();

const express = require('express');
const cors = require('cors');
const db = require('./db/index.js');
const apiService = require('./services/api.js');
const { syncData } = require('./index.js');

const app = express();
const port = 3000; // You can change this port as needed

app.use(cors());
app.use(express.json());

// --- ROUTES ---

// 1. Get weather readings
// Query params:
// - limit: number of records to return (default 50)
// - stationId: filter by station ID
// - startDate, endDate: filter by date range
app.get('/api/weather', async (req, res) => {
    try {
        const { limit = 50, stationId, startDate, endDate } = req.query;
        let queryArgs = [];
        let conditions = [];

        // Build dynamic SQL query
        let queryText = 'SELECT * FROM weather_readings';

        if (stationId) {
            conditions.push(`station_id = $${conditions.length + 1}`);
            queryArgs.push(stationId);
        }

        if (startDate) {
            conditions.push(`timestamp >= $${conditions.length + 1}`);
            queryArgs.push(startDate);
        }

        if (endDate) {
            conditions.push(`timestamp <= $${conditions.length + 1}`);
            queryArgs.push(endDate);
        }

        if (conditions.length > 0) {
            queryText += ' WHERE ' + conditions.join(' AND ');
        }

        // Default sorting and limit
        queryText += ` ORDER BY timestamp DESC LIMIT $${conditions.length + 1}`;
        queryArgs.push(limit);

        const result = await db.query(queryText, queryArgs);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching weather data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 2. Get active data loggers from local database
// Retrieves distinct stations that have data recorded
app.get('/api/dataloggers', async (req, res) => {
    try {
        const query = `
      SELECT DISTINCT ON (wr.station_id) 
        wr.station_id, 
        wr.station_name, 
        wr.latitude, 
        wr.longitude,
        wr.air_temperature,
        wr.relative_humidity,
        wr.wind_speed,
        wr.wind_direction,
        wr.precipitation,
        wr.solar_radiation,
        wr.atmospheric_pressure,
        wr.soil_temperature,
        wr.battery_voltage,
        wr.timestamp as last_reading_at,
        s.model,
        s.location_type,
        s.organization,
        s.country
      FROM weather_readings wr
      LEFT JOIN stations s ON wr.station_id = s.station_id
      ORDER BY wr.station_id, wr.timestamp DESC;
    `;

        const result = await db.query(query);

        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching data loggers:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 3. (Optional) Force fetch latest data loggers from external API
// This simply proxies the external API call we set up earlier
app.get('/api/external/pysical-dataloggers', async (req, res) => {
    try {
        const result = await apiService.fetchDataLoggers();
        res.json(result);
    } catch (error) {
        console.error('Error fetching from external API:', error);
        res.status(502).json({ error: 'Failed to fetch from external API' });
    }
});

// --- START SERVER ---

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`- GET /api/weather`);
    console.log(`- GET /api/dataloggers`);

    // Initial sync
    console.log('Running initial data sync...');
    syncData();

    // Periodic sync every 15 minutes
    setInterval(() => {
        console.log('Running periodic data sync...');
        syncData();
    }, 15 * 60 * 1000);
});

const express = require('express');
const cors = require('cors');
const db = require('./db/index.js');
const climdesService = require('./services/climdes.js');
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
      SELECT DISTINCT ON (s.station_id) 
        s.station_id, 
        s.station_name, 
        s.latitude, 
        s.longitude,
        wr.air_temperature,
        wr.relative_humidity,
        wr.wind_speed,
        wr.wind_direction,
        wr.precipitation,
        wr.solar_radiation,
        wr.atmospheric_pressure,
        wr.soil_temperature,
        wr.battery_voltage,
        wr.wind_gust,
        wr.lightning_strike_count,
        wr.lightning_strike_distance,
        wr.vapor_pressure,
        wr.humidity_sensor_temperature,
        wr.x_orientation,
        wr.y_orientation,
        wr.atoms_gen2,
        wr.north_wind_speed,
        wr.east_wind_speed,
        wr.soil_electrical_conductivity,
        wr.soil_ph,
        wr.panel_temperature,
        wr.volumetric_water_content,
        wr.timestamp as last_reading_at,
        s.model,
        s.location_type,
        s.organization,
        s.country,
        s.is_active,
        s.provider
      FROM stations s
      LEFT JOIN weather_readings wr ON s.station_id = wr.station_id
      ORDER BY s.station_id, wr.timestamp DESC;
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
        const result = await climdesService.fetchDataLoggers();
        res.json(result);
    } catch (error) {
        console.error('Error fetching from external API:', error);
        res.status(502).json({ error: 'Failed to fetch from external API' });
    }
});

const configManager = require('./utils/configManager.js');

// 4. Get active providers and their basic configuration (masked)
app.get('/api/config', (req, res) => {
    const config = require('./config/index.js');
    res.json({
        success: true,
        data: {
            providers: [
                {
                    name: 'CLIMDES',
                    baseUrl: config.api.baseUrl,
                    email: config.api.email,
                    password: config.api.password ? '********' : null,
                    isActive: !!config.api.baseUrl && !!config.api.email
                },
                {
                    name: 'TAHMO',
                    baseUrl: config.tahmo.baseUrl,
                    username: config.tahmo.apiKey ? '********' + config.tahmo.apiKey.slice(-4) : null,
                    password: config.tahmo.apiSecret ? '********' : null,
                    isActive: !!config.tahmo.apiKey && !!config.tahmo.apiSecret
                }
            ]
        }
    });
});

// 5. Update configuration
app.post('/api/config', (req, res) => {
    const { provider, credentials } = req.body;
    
    if (!provider || !credentials) {
        return res.status(400).json({ success: false, message: 'Missing provider or credentials' });
    }

    const updates = {};
    if (provider === 'CLIMDES') {
        if (credentials.email) updates.API_EMAIL = credentials.email;
        if (credentials.password) updates.API_PASSWORD = credentials.password;
        if (credentials.baseUrl) updates.API_BASE_URL = credentials.baseUrl;
    } else if (provider === 'TAHMO') {
        if (credentials.apiKey) updates.TAHMO_API_KEY = credentials.apiKey;
        if (credentials.apiSecret) updates.TAHMO_API_SECRET = credentials.apiSecret;
        if (credentials.baseUrl) updates.TAHMO_API_BASE_URL = credentials.baseUrl;
    }

    const success = configManager.updateEnv(updates);
    
    if (success) {
        res.json({ success: true, message: 'Configuration updated successfully. Note: some changes might require a server restart.' });
    } else {
        res.status(500).json({ success: false, message: 'Failed to update configuration' });
    }
});

// 6. Get all mappings for a specific provider
app.get('/api/mappings/:provider', async (req, res) => {
    try {
        const { provider } = req.params;
        const result = await db.query(
            "SELECT * FROM provider_mappings WHERE provider = $1 ORDER BY external_key",
            [provider.toUpperCase()]
        );
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Error fetching mappings:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// 7. Create or update a mapping
app.post('/api/mappings', async (req, res) => {
    try {
        const { provider, external_key, internal_field, conversion_formula } = req.body;
        
        if (!provider || !external_key || !internal_field) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const result = await db.query(`
            INSERT INTO provider_mappings (provider, external_key, internal_field, conversion_formula)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (provider, external_key) DO UPDATE SET
                internal_field = EXCLUDED.internal_field,
                conversion_formula = EXCLUDED.conversion_formula
            RETURNING *
        `, [provider.toUpperCase(), external_key, internal_field, conversion_formula || null]);

        res.json({ success: true, data: result.rows[0], message: 'Mapping saved successfully' });
    } catch (error) {
        console.error('Error saving mapping:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// 8. Delete a mapping
app.delete('/api/mappings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("DELETE FROM provider_mappings WHERE id = $1", [id]);
        res.json({ success: true, message: 'Mapping deleted successfully' });
    } catch (error) {
        console.error('Error deleting mapping:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
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

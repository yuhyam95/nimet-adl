const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const db = require('./db/index.js');
const climdesService = require('./services/climdes.js');
const pulsowebService = require('./services/pulsoweb.js');
const { reverseGeocode } = require('./services/geocoding.js');
const { importProviderStations, geocodeProviderStations, syncData, syncProviderData } = require('./index.js');
const { exportAllStationsToCSV, isExportEnabled } = require('./utils/exporter.js');
const { hashPassword, comparePassword, generateToken } = require('./utils/auth.js');
const { protect } = require('./middleware/auth.js');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// System state for monitoring
let systemStatus = {
    lastSyncAt: null,
    lastSyncStatus: 'never',
    lastExportAt: null,
    lastExportStatus: 'never',
    uptime: new Date()
};

// --- ROUTES ---

// 1. Get weather readings
// Query params:
// - limit: number of records to return (default 50)
// - stationId: filter by station ID
// - startDate, endDate: filter by date range
app.get('/api/weather', protect(['Admin', 'Data Manager', 'Data Viewer']), async (req, res) => {
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
// Retrieves distinct stations that have data recorded along with reporting frequency stats
app.get('/api/dataloggers', protect(['Admin', 'Data Manager', 'Data Viewer']), async (req, res) => {
    try {
        const query = `
      SELECT 
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
        s.state,
        s.lga,
        s.geocoded_at,
        s.is_active,
        s.provider,
        s.source_station_id,
        s.source_timezone,
        s.collection_start_at,
        s.wigos_id,
        s.wsi_series,
        s.wsi_issuer,
        s.wsi_issue_number,
        s.wsi_local,
        s.wmo_block_number,
        s.wmo_station_number,
        s.station_height_above_msl,
        s.barometer_height_above_msl,
        s.anemometer_height,
        s.rain_sensor_height,
        s.method_of_ground_state_measurement,
        s.method_of_snow_depth_measurement,
        s.time_period_of_wind,
        s.share_to_wis2box,
        s.last_wis2box_dispatch_at,
        s.last_wis2box_dispatch_status,
        s.last_wis2box_dispatch_error,
        rs.avg_interval_seconds,
        COALESCE(c24.readings_count_24h, 0) as readings_count_24h
      FROM stations s
      LEFT JOIN LATERAL (
          SELECT * FROM weather_readings
          WHERE station_id = s.station_id
          ORDER BY timestamp DESC
          LIMIT 1
      ) wr ON true
      LEFT JOIN LATERAL (
          SELECT EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) / NULLIF(COUNT(*) - 1, 0) as avg_interval_seconds
          FROM (
              SELECT timestamp FROM weather_readings
              WHERE station_id = s.station_id
              ORDER BY timestamp DESC
              LIMIT 30
          ) sub
      ) rs ON true
      LEFT JOIN LATERAL (
          SELECT COUNT(*) as readings_count_24h
          FROM weather_readings
          WHERE station_id = s.station_id AND timestamp >= NOW() - INTERVAL '24 hours'
      ) c24 ON true
      ORDER BY s.station_id;
    `;

        const result = await db.query(query);

        const mappedData = result.rows.map(row => {
            let freqMins = null;
            let freqText = 'No recent data';

            if (row.avg_interval_seconds !== null && row.avg_interval_seconds !== undefined) {
                const sec = parseFloat(row.avg_interval_seconds);
                if (!isNaN(sec) && sec > 0) {
                    freqMins = Math.round(sec / 60);
                    if (freqMins < 1) {
                        freqText = '< 1 min';
                    } else if (freqMins < 60) {
                        freqText = `Every ${freqMins} mins`;
                    } else if (freqMins < 1440) {
                        const hrs = (freqMins / 60).toFixed(1).replace(/\.0$/, '');
                        freqText = hrs === '1' ? 'Every 1 hr' : `Every ${hrs} hrs`;
                    } else {
                        const days = (freqMins / 1440).toFixed(1).replace(/\.0$/, '');
                        freqText = days === '1' ? 'Every 1 day' : `Every ${days} days`;
                    }
                }
            }

            return {
                ...row,
                avg_interval_seconds: row.avg_interval_seconds ? parseFloat(row.avg_interval_seconds) : null,
                readings_count_24h: parseInt(row.readings_count_24h || '0', 10),
                reporting_frequency_minutes: freqMins,
                reporting_frequency_text: freqText
            };
        });

        res.json({
            success: true,
            count: mappedData.length,
            data: mappedData
        });
    } catch (error) {
        console.error('Error fetching data loggers:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 2c. Add a single station manually
app.post('/api/stations', protect(['Admin', 'Data Manager']), async (req, res) => {
    try {
        const {
            station_id, station_name, latitude, longitude, model, location_type,
            organization, country, provider, wigos_id, wsi_series, wsi_issuer,
            wsi_issue_number, wsi_local, wmo_block_number, wmo_station_number,
            station_height_above_msl, barometer_height_above_msl, anemometer_height,
            rain_sensor_height, method_of_ground_state_measurement, method_of_snow_depth_measurement,
            time_period_of_wind
        } = req.body;

        if (!station_id) {
            return res.status(400).json({ error: 'station_id is required' });
        }

        if (provider === 'CLIMDES') {
            const latVal = parseFloat(latitude);
            const lonVal = parseFloat(longitude);
            if (isNaN(latVal) || isNaN(lonVal) || latVal < 4.0 || latVal > 14.0 || lonVal < 2.5 || lonVal > 15.0) {
                return res.status(400).json({ error: 'CLIMDES station coordinates must be within Nigeria (Latitude 4.0 to 14.0, Longitude 2.5 to 15.0)' });
            }
        }

        const query = `
            INSERT INTO stations (
                station_id, station_name, latitude, longitude, model, location_type,
                organization, country, provider, wigos_id, wsi_series, wsi_issuer,
                wsi_issue_number, wsi_local, wmo_block_number, wmo_station_number,
                station_height_above_msl, barometer_height_above_msl, anemometer_height,
                rain_sensor_height, method_of_ground_state_measurement, method_of_snow_depth_measurement,
                time_period_of_wind, is_active
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                $17, $18, $19, $20, $21, $22, $23, true
            ) ON CONFLICT (station_id) DO UPDATE SET
                station_name = EXCLUDED.station_name,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                model = EXCLUDED.model,
                location_type = EXCLUDED.location_type,
                organization = EXCLUDED.organization,
                country = EXCLUDED.country,
                provider = EXCLUDED.provider,
                wigos_id = EXCLUDED.wigos_id,
                wsi_series = EXCLUDED.wsi_series,
                wsi_issuer = EXCLUDED.wsi_issuer,
                wsi_issue_number = EXCLUDED.wsi_issue_number,
                wsi_local = EXCLUDED.wsi_local,
                wmo_block_number = EXCLUDED.wmo_block_number,
                wmo_station_number = EXCLUDED.wmo_station_number,
                station_height_above_msl = EXCLUDED.station_height_above_msl,
                barometer_height_above_msl = EXCLUDED.barometer_height_above_msl,
                anemometer_height = EXCLUDED.anemometer_height,
                rain_sensor_height = EXCLUDED.rain_sensor_height,
                method_of_ground_state_measurement = EXCLUDED.method_of_ground_state_measurement,
                method_of_snow_depth_measurement = EXCLUDED.method_of_snow_depth_measurement,
                time_period_of_wind = EXCLUDED.time_period_of_wind,
                updated_at = NOW()
            RETURNING *;
        `;
        const params = [
            station_id, station_name, latitude, longitude, model, location_type,
            organization, country, provider || 'MANUAL', wigos_id, wsi_series, wsi_issuer,
            wsi_issue_number, wsi_local, wmo_block_number, wmo_station_number,
            station_height_above_msl, barometer_height_above_msl, anemometer_height,
            rain_sensor_height, method_of_ground_state_measurement, method_of_snow_depth_measurement,
            time_period_of_wind
        ];

        const result = await db.query(query, params);
        res.status(201).json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error adding station:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 2d. Add multiple stations (bulk import)
app.post('/api/stations/bulk', protect(['Admin', 'Data Manager']), async (req, res) => {
    try {
        const { stations } = req.body;
        if (!stations || !Array.isArray(stations) || stations.length === 0) {
            return res.status(400).json({ error: 'An array of stations is required' });
        }

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            const results = [];
            for (const s of stations) {
                if (!s.station_id) continue;

                if (s.provider === 'CLIMDES') {
                    const latVal = parseFloat(s.latitude);
                    const lonVal = parseFloat(s.longitude);
                    if (isNaN(latVal) || isNaN(lonVal) || latVal < 4.0 || latVal > 14.0 || lonVal < 2.5 || lonVal > 15.0) {
                        continue; // Skip CLIMDES stations outside Nigeria
                    }
                }

                const query = `
                    INSERT INTO stations (
                        station_id, station_name, latitude, longitude, model, location_type,
                        organization, country, provider, wigos_id, wsi_series, wsi_issuer,
                        wsi_issue_number, wsi_local, wmo_block_number, wmo_station_number,
                        station_height_above_msl, barometer_height_above_msl, anemometer_height,
                        rain_sensor_height, method_of_ground_state_measurement, method_of_snow_depth_measurement,
                        time_period_of_wind, is_active
                    ) VALUES (
                        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                        $17, $18, $19, $20, $21, $22, $23, $24
                    ) ON CONFLICT (station_id) DO UPDATE SET
                        station_name = EXCLUDED.station_name,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        model = EXCLUDED.model,
                        location_type = EXCLUDED.location_type,
                        organization = EXCLUDED.organization,
                        country = EXCLUDED.country,
                        provider = EXCLUDED.provider,
                        wigos_id = EXCLUDED.wigos_id,
                        wsi_series = EXCLUDED.wsi_series,
                        wsi_issuer = EXCLUDED.wsi_issuer,
                        wsi_issue_number = EXCLUDED.wsi_issue_number,
                        wsi_local = EXCLUDED.wsi_local,
                        wmo_block_number = EXCLUDED.wmo_block_number,
                        wmo_station_number = EXCLUDED.wmo_station_number,
                        station_height_above_msl = EXCLUDED.station_height_above_msl,
                        barometer_height_above_msl = EXCLUDED.barometer_height_above_msl,
                        anemometer_height = EXCLUDED.anemometer_height,
                        rain_sensor_height = EXCLUDED.rain_sensor_height,
                        method_of_ground_state_measurement = EXCLUDED.method_of_ground_state_measurement,
                        method_of_snow_depth_measurement = EXCLUDED.method_of_snow_depth_measurement,
                        time_period_of_wind = EXCLUDED.time_period_of_wind,
                        is_active = EXCLUDED.is_active,
                        updated_at = NOW()
                    RETURNING *;
                `;

                const isActive = s.status === 'inactive' ? false : (s.status === 'active' ? true : (s.is_active !== undefined ? String(s.is_active).toLowerCase() === 'true' : true));

                const params = [
                    s.station_id, s.station_name, s.latitude, s.longitude, s.model, s.location_type,
                    s.organization, s.country, s.provider || 'MANUAL', s.wigos_id, s.wsi_series, s.wsi_issuer,
                    s.wsi_issue_number, s.wsi_local, s.wmo_block_number, s.wmo_station_number,
                    s.station_height_above_msl, s.barometer_height_above_msl, s.anemometer_height,
                    s.rain_sensor_height, s.method_of_ground_state_measurement, s.method_of_snow_depth_measurement,
                    s.time_period_of_wind, isActive
                ];

                const result = await client.query(query, params);
                results.push(result.rows[0]);
            }

            await client.query('COMMIT');
            res.status(201).json({ success: true, count: results.length, data: results });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('Error in bulk importing stations:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 2b. Update WIGOS metadata for a station
app.patch('/api/stations/:stationId/wigos', protect(['Admin', 'Data Manager']), async (req, res) => {
    try {
        const { stationId } = req.params;
        const {
            wigos_id, wsi_series, wsi_issuer, wsi_issue_number, wsi_local,
            wmo_block_number, wmo_station_number, station_height_above_msl,
            barometer_height_above_msl, anemometer_height, rain_sensor_height,
            method_of_ground_state_measurement, method_of_snow_depth_measurement,
            time_period_of_wind, share_to_wis2box
        } = req.body;

        const updateQuery = `
            UPDATE stations
            SET wigos_id = $1, wsi_series = $2, wsi_issuer = $3, wsi_issue_number = $4,
                wsi_local = $5, wmo_block_number = $6, wmo_station_number = $7,
                station_height_above_msl = $8, barometer_height_above_msl = $9,
                anemometer_height = $10, rain_sensor_height = $11,
                method_of_ground_state_measurement = $12, method_of_snow_depth_measurement = $13,
                time_period_of_wind = $14, share_to_wis2box = $15, updated_at = NOW()
            WHERE station_id = $16
            RETURNING *;
        `;

        const params = [
            wigos_id, wsi_series, wsi_issuer, wsi_issue_number, wsi_local,
            wmo_block_number, wmo_station_number, station_height_above_msl,
            barometer_height_above_msl, anemometer_height, rain_sensor_height,
            method_of_ground_state_measurement, method_of_snow_depth_measurement,
            time_period_of_wind, share_to_wis2box, stationId
        ];

        const result = await db.query(updateQuery, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Station not found' });
        }

        res.json({ success: true, data: result.rows[0], message: 'WIGOS metadata updated successfully' });
    } catch (error) {
        console.error('Error updating WIGOS metadata:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// 2e. Update provider-specific station collection settings
app.patch('/api/stations/:stationId/source', protect(['Admin', 'Data Manager']), async (req, res) => {
    try {
        const { stationId } = req.params;
        const { source_timezone, collection_start_at } = req.body;

        if (source_timezone) {
            try {
                new Intl.DateTimeFormat('en-US', { timeZone: source_timezone }).format();
            } catch (error) {
                return res.status(400).json({ success: false, message: 'Invalid IANA timezone.' });
            }
        }

        let normalizedCollectionStart = null;
        if (collection_start_at) {
            try {
                const timezone = source_timezone || require('./config/index.js').pulsoweb.defaultTimezone;
                normalizedCollectionStart = pulsowebService.localDateTimeToIso(collection_start_at, timezone);
            } catch (error) {
                return res.status(400).json({ success: false, message: 'Invalid collection start date.' });
            }
            if (new Date(normalizedCollectionStart) > new Date()) {
                return res.status(400).json({ success: false, message: 'Collection start date must be in the past.' });
            }
        }

        const result = await db.query(
            `UPDATE stations
             SET source_timezone = COALESCE($1, source_timezone),
                 collection_start_at = $2,
                 updated_at = NOW()
             WHERE station_id = $3
             RETURNING *`,
            [source_timezone || null, normalizedCollectionStart, stationId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Station not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error('Error updating station source settings:', error);
        res.status(500).json({ success: false, message: 'Failed to update station source settings.' });
    }
});

// 2f. Manually update station coordinates (admin only)
app.patch('/api/stations/:stationId/location', protect(['Admin']), async (req, res) => {
    try {
        const { stationId } = req.params;
        const { latitude, longitude } = req.body;

        if (latitude === null || latitude === undefined || latitude === '' ||
            longitude === null || longitude === undefined || longitude === '') {
            return res.status(400).json({ success: false, message: 'Latitude and longitude are required.' });
        }

        const normalizedLatitude = Number(latitude);
        const normalizedLongitude = Number(longitude);

        if (!Number.isFinite(normalizedLatitude) || normalizedLatitude < -90 || normalizedLatitude > 90) {
            return res.status(400).json({ success: false, message: 'Latitude must be a number between -90 and 90.' });
        }

        if (!Number.isFinite(normalizedLongitude) || normalizedLongitude < -180 || normalizedLongitude > 180) {
            return res.status(400).json({ success: false, message: 'Longitude must be a number between -180 and 180.' });
        }

        let detectedLocation = null;
        try {
            detectedLocation = await reverseGeocode(normalizedLatitude, normalizedLongitude);
        } catch (error) {
            console.error(`Could not automatically detect State/LGA for ${stationId}:`, error.message);
        }

        const result = await db.query(
            `UPDATE stations
             SET latitude = $1,
                 longitude = $2,
                 state = $3,
                 lga = $4,
                 country = COALESCE($5, country),
                 geocoded_at = NOW(),
                 updated_at = NOW()
             WHERE station_id = $6
             RETURNING *`,
            [
                normalizedLatitude,
                normalizedLongitude,
                detectedLocation?.state,
                detectedLocation?.lga,
                detectedLocation?.country,
                stationId
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Station not found.' });
        }

        res.json({
            success: true,
            data: result.rows[0],
            message: detectedLocation
                ? 'Station coordinates, State and LGA updated successfully.'
                : 'Station coordinates saved, but automatic State/LGA detection was unavailable. Use Retry Detection to try again.'
        });
    } catch (error) {
        console.error('Error updating station coordinates:', error);
        res.status(500).json({ success: false, message: 'Failed to update station coordinates.' });
    }
});

app.post('/api/stations/:stationId/geocode', protect(['Admin']), async (req, res) => {
    try {
        const { stationId } = req.params;
        const stationResult = await db.query(
            'SELECT latitude, longitude FROM stations WHERE station_id = $1',
            [stationId]
        );

        if (stationResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Station not found.' });
        }

        const station = stationResult.rows[0];
        if (station.latitude == null || station.longitude == null) {
            return res.status(400).json({ success: false, message: 'Add station coordinates before detecting State and LGA.' });
        }

        const location = await reverseGeocode(station.latitude, station.longitude);
        const result = await db.query(
            `UPDATE stations
             SET state = $1, lga = $2, country = COALESCE($3, country), geocoded_at = NOW(), updated_at = NOW()
             WHERE station_id = $4
             RETURNING *`,
            [location.state, location.lga, location.country, stationId]
        );

        res.json({
            success: true,
            data: result.rows[0],
            attribution: location.attribution,
            message: 'State and LGA detected successfully.'
        });
    } catch (error) {
        console.error('Error reverse geocoding station:', error.message);
        res.status(502).json({ success: false, message: error.message || 'Failed to detect State and LGA.' });
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
app.get('/api/config', protect(['Admin', 'Data Manager']), (req, res) => {
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
                },
                {
                    name: 'PULSOWEB',
                    baseUrl: config.pulsoweb.baseUrl,
                    apiToken: config.pulsoweb.apiToken ? '********' + config.pulsoweb.apiToken.slice(-4) : null,
                    defaultTimezone: config.pulsoweb.defaultTimezone,
                    isActive: !!config.pulsoweb.baseUrl && !!config.pulsoweb.apiToken
                },
                {
                    name: 'WAGTECH',
                    ftpHost: config.wagtech.ftpHost,
                    ftpPort: config.wagtech.ftpPort,
                    ftpUser: config.wagtech.ftpUser,
                    ftpPassword: config.wagtech.ftpPassword ? '********' : null,
                    isActive: !!config.wagtech.ftpHost && !!config.wagtech.ftpUser && !!config.wagtech.ftpPassword
                }
            ],
            exportPath: config.exportPath
        }
    });
});

// 5. Update configuration
app.post('/api/config', protect(['Admin']), (req, res) => {
    const { provider, credentials, system } = req.body;
    const normalizedProvider = provider ? String(provider).toUpperCase() : null;

    if (!provider && !credentials && !system) {
        return res.status(400).json({ success: false, message: 'Missing configuration update details' });
    }

    const updates = {};
    if (normalizedProvider === 'CLIMDES' && credentials) {
        if (credentials.email) updates.API_EMAIL = credentials.email;
        if (credentials.password) updates.API_PASSWORD = credentials.password;
        if (credentials.baseUrl) updates.API_BASE_URL = credentials.baseUrl;
    } else if (normalizedProvider === 'TAHMO' && credentials) {
        if (credentials.apiKey) updates.TAHMO_API_KEY = credentials.apiKey;
        if (credentials.apiSecret) updates.TAHMO_API_SECRET = credentials.apiSecret;
        if (credentials.baseUrl) updates.TAHMO_API_BASE_URL = credentials.baseUrl;
    } else if (normalizedProvider === 'PULSOWEB' && credentials) {
        if (credentials.defaultTimezone) {
            try {
                new Intl.DateTimeFormat('en-US', { timeZone: credentials.defaultTimezone }).format();
            } catch (error) {
                return res.status(400).json({ success: false, message: 'Invalid PulsoWeb IANA timezone.' });
            }
        }
        if (credentials.apiToken) updates.PULSOWEB_API_TOKEN = credentials.apiToken;
        if (credentials.baseUrl) updates.PULSOWEB_API_BASE_URL = credentials.baseUrl;
        if (credentials.defaultTimezone) updates.PULSOWEB_DEFAULT_TIMEZONE = credentials.defaultTimezone;
    } else if (normalizedProvider === 'WAGTECH' && credentials) {
        if (credentials.ftpHost) updates.WAGTECH_FTP_HOST = credentials.ftpHost;
        if (credentials.ftpPort) updates.WAGTECH_FTP_PORT = credentials.ftpPort;
        if (credentials.ftpUser) updates.WAGTECH_FTP_USER = credentials.ftpUser;
        if (credentials.ftpPassword) updates.WAGTECH_FTP_PASSWORD = credentials.ftpPassword;
    } else if (system) {
        if (system.exportPath) updates.EXPORT_PATH = system.exportPath;
    }

    const success = configManager.updateEnv(updates);

    if (success) {
        if (normalizedProvider === 'PULSOWEB') pulsowebService.clearContextCache();
        res.json({ success: true, message: 'Configuration updated successfully. Note: some changes might require a server restart.' });
    } else {
        res.status(500).json({ success: false, message: 'Failed to update configuration' });
    }
});

// 5b. PulsoWeb connection diagnostics and metadata discovery
app.post('/api/providers/pulsoweb/test', protect(['Admin', 'Data Manager']), async (req, res) => {
    try {
        const context = await pulsowebService.fetchContext({
            force: true,
            skipCache: true,
            timeout: 10000,
            retries: 0
        });
        res.json({
            success: true,
            message: `PulsoWeb accepted the API token and returned ${context.stations.length} station(s).`,
            data: {
                stations: context.stations.length,
                observations: context.observations.length,
                granularities: context.granularities.length
            }
        });
    } catch (error) {
        res.status(error.status || 502).json({ success: false, message: error.message });
    }
});

app.post('/api/providers/:provider/import-stations', protect(['Admin', 'Data Manager']), async (req, res) => {
    try {
        const provider = String(req.params.provider || '').toUpperCase();
        if (!['CLIMDES', 'TAHMO', 'PULSOWEB'].includes(provider)) {
            return res.status(400).json({ success: false, message: `Station import is not supported for ${provider}.` });
        }

        const result = await importProviderStations(provider);
        const geocoding = await geocodeProviderStations(provider);
        res.json({
            success: true,
            message: `Imported ${result.count} ${provider} station(s); detected State/LGA for ${geocoding.updated} station(s).`,
            data: { count: result.count, geocoding }
        });
    } catch (error) {
        res.status(error.status || 502).json({ success: false, message: error.message });
    }
});

app.get('/api/providers/pulsoweb/context', protect(['Admin', 'Data Manager']), async (req, res) => {
    try {
        const context = await pulsowebService.fetchContext();
        res.json({ success: true, data: context });
    } catch (error) {
        res.status(error.status || 502).json({ success: false, message: error.message });
    }
});

app.get('/api/providers/pulsoweb/granularities', protect(['Admin', 'Data Manager']), async (req, res) => {
    try {
        const context = await pulsowebService.fetchContext();
        res.json({ success: true, data: context.granularities });
    } catch (error) {
        res.status(error.status || 502).json({ success: false, message: error.message });
    }
});

app.get('/api/providers/pulsoweb/observations/:granularity', protect(['Admin', 'Data Manager']), async (req, res) => {
    try {
        const context = await pulsowebService.fetchContext();
        const granularity = String(req.params.granularity);
        const observations = context.observations
            .filter(observation => String(observation.granularity) === granularity)
            .map(observation => ({
                ...observation,
                stationsCount: context.stations.filter(station =>
                    Array.isArray(station.observations) &&
                    station.observations.map(String).includes(String(observation.code))
                ).length
            }));
        res.json({ success: true, data: observations });
    } catch (error) {
        res.status(error.status || 502).json({ success: false, message: error.message });
    }
});

app.get('/api/providers/pulsoweb/stations/:observationCode', protect(['Admin', 'Data Manager']), async (req, res) => {
    try {
        const context = await pulsowebService.fetchContext();
        const observationCode = String(req.params.observationCode);
        const stations = context.stations
            .filter(station => Array.isArray(station.observations) && station.observations.map(String).includes(observationCode))
            .map(station => ({ code: station.code, name: station.name }));
        res.json({ success: true, data: stations });
    } catch (error) {
        res.status(error.status || 502).json({ success: false, message: error.message });
    }
});

// 6. Get all mappings for a specific provider
app.get('/api/mappings/:provider', protect(['Admin', 'Data Manager']), async (req, res) => {
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
app.post('/api/mappings', protect(['Admin', 'Data Manager']), async (req, res) => {
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
app.delete('/api/mappings/:id', protect(['Admin']), async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("DELETE FROM provider_mappings WHERE id = $1", [id]);
        res.json({ success: true, message: 'Mapping deleted successfully' });
    } catch (error) {
        console.error('Error deleting mapping:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

// 9. Export all stations to CSV
app.post('/api/export/csv', protect(['Admin', 'Data Manager']), async (req, res) => {
    if (!isExportEnabled()) {
        return res.status(403).json({ success: false, error: 'Export functionality is disabled in this environment.' });
    }
    try {
        const result = await exportAllStationsToCSV();
        res.json({
            success: true,
            message: `Exported data for ${result.count} stations.`,
            directory: result.directory
        });
    } catch (error) {
        console.error('Error exporting CSV:', error);
        res.status(500).json({ success: false, error: 'Failed to export CSV files' });
    }
});

// 9b. Upload specific station CSV to wis2box
app.post('/api/export/wis2box', protect(['Admin', 'Data Manager']), async (req, res) => {
    if (!isExportEnabled()) {
        return res.status(403).json({ success: false, message: 'Export functionality is disabled in this environment.' });
    }
    try {
        const { stationId } = req.body;
        if (!stationId) {
            return res.status(400).json({ success: false, message: 'stationId is required' });
        }

        const result = await db.query('SELECT station_name FROM weather_readings WHERE station_id = $1 LIMIT 1', [stationId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Station not found or has no readings' });
        }

        const stationName = result.rows[0].station_name;
        const safeName = (stationName || stationId).replace(/[^a-z0-9]/gi, '_');
        const fileName = `${safeName}.csv`;

        const path = require('path');
        const fs = require('fs');
        const config = require('./config/index.js');
        const filePath = path.join(config.exportPath, safeName, fileName);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: `Export file not found. Please run CSV export first.` });
        }

        const { uploadToWis2box } = require('./services/wis2box.js');
        await uploadToWis2box(filePath, fileName);

        await db.query(`UPDATE stations SET last_wis2box_dispatch_at = NOW(), last_wis2box_dispatch_status = 'Success', last_wis2box_dispatch_error = NULL WHERE station_id = $1`, [stationId]);

        res.json({ success: true, message: `Successfully uploaded ${fileName} to wis2box.` });
    } catch (error) {
        console.error('wis2box upload error:', error);
        if (req.body.stationId) {
            await db.query(`UPDATE stations SET last_wis2box_dispatch_at = NOW(), last_wis2box_dispatch_status = 'Failed', last_wis2box_dispatch_error = $1 WHERE station_id = $2`, [error.message || 'Unknown error', req.body.stationId]).catch(() => { });
        }
        res.status(500).json({ success: false, message: error.message || 'Failed to upload to wis2box' });
    }
});

// 10. Manual Sync Route
app.post('/api/sync/provider', protect(['Admin', 'Data Manager']), async (req, res) => {
    try {
        const { provider, startDate, endDate } = req.body;

        if (!provider || !startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'Please provide provider name, startDate and endDate' });
        }

        const parsedStartDate = new Date(startDate);
        const parsedEndDate = new Date(endDate);
        if (Number.isNaN(parsedStartDate.getTime()) || Number.isNaN(parsedEndDate.getTime()) || parsedStartDate > parsedEndDate) {
            return res.status(400).json({ success: false, message: 'Please provide a valid date range.' });
        }

        const normalizedProvider = String(provider).toUpperCase();
        if (!['CLIMDES', 'TAHMO', 'PULSOWEB'].includes(normalizedProvider)) {
            return res.status(400).json({ success: false, message: `Unsupported provider: ${provider}` });
        }

        console.log(`Manual sync requested for ${provider} from ${startDate} to ${endDate}`);

        // Run in background so request doesn't timeout
        syncProviderData(normalizedProvider, startDate, endDate)
            .then(() => console.log(`Manual sync completed for ${provider}`))
            .catch(err => console.error(`Manual sync failed for ${provider}:`, err));

        res.json({
            success: true,
            message: `Synchronization started for ${provider}. It will continue in the background.`
        });
    } catch (error) {
        console.error('Manual sync error:', error);
        res.status(500).json({ success: false, error: 'Failed to start manual synchronization' });
    }
});

// 11. Authentication Routes
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Please provide username and password' });
        }

        const result = await db.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (!user || !(await comparePassword(password, user.password))) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }

        const token = generateToken(user);

        res.json({
            success: true,
            token,
            user: {
                id: user.id,
                username: user.username,
                name: user.name,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, error: 'Internal Server Error' });
    }
});

app.get('/api/auth/me', protect(), (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

// 11. User Management (Admin only)
app.get('/api/users', protect(['Admin']), async (req, res) => {
    try {
        const result = await db.query('SELECT id, username, name, role, created_at FROM users ORDER BY created_at DESC');
        res.json({ success: true, data: result.rows });
    } catch (error) {
        console.error('Fetch users error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch users' });
    }
});

app.post('/api/users', protect(['Admin']), async (req, res) => {
    try {
        const { username, name, role, password } = req.body;

        if (!username || !password || !role) {
            return res.status(400).json({ success: false, message: 'Username, password and role are required' });
        }

        const passwordHash = await hashPassword(password);
        await db.query(
            'INSERT INTO users (username, name, role, password) VALUES ($1, $2, $3, $4)',
            [username, name, role, passwordHash]
        );

        res.json({ success: true, message: 'User created successfully' });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(400).json({ success: false, message: 'Username already exists' });
        }
        console.error('Create user error:', error);
        res.status(500).json({ success: false, error: 'Failed to create user' });
    }
});

app.delete('/api/users/:id', protect(['Admin']), async (req, res) => {
    try {
        const { id } = req.params;

        if (parseInt(id) === req.user.id) {
            return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
        }

        await db.query('DELETE FROM users WHERE id = $1', [id]);
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ success: false, error: 'Failed to delete user' });
    }
});

app.patch('/api/users/:id/role', protect(['Admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        if (!role) return res.status(400).json({ success: false, message: 'Role is required' });

        await db.query('UPDATE users SET role = $1 WHERE id = $2', [role, id]);
        res.json({ success: true, message: 'User role updated successfully' });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ success: false, error: 'Failed to update user role' });
    }
});

app.post('/api/auth/change-password', protect(), async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        const result = await db.query('SELECT password FROM users WHERE id = $1', [req.user.id]);
        const user = result.rows[0];

        if (!(await comparePassword(currentPassword, user.password))) {
            return res.status(400).json({ success: false, message: 'Incorrect current password' });
        }

        const newHash = await hashPassword(newPassword);
        await db.query('UPDATE users SET password = $1 WHERE id = $2', [newHash, req.user.id]);

        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ success: false, error: 'Failed to change password' });
    }
});

// 12. Health check and monitoring
app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        status: 'online',
        uptime: Math.floor((new Date() - systemStatus.uptime) / 1000), // seconds
        lastSync: {
            time: systemStatus.lastSyncAt,
            status: systemStatus.lastSyncStatus
        },
        lastExport: {
            time: systemStatus.lastExportAt,
            status: systemStatus.lastExportStatus
        }
    });
});

app.listen(port, '127.0.0.1', () => {
    console.log(`Server running at http://127.0.0.1:${port}`);
    // console.log(`- GET /api/weather`);
    // console.log(`- GET /api/dataloggers`);

    // Initial sync
    console.log('Running initial data sync...');
    const runSync = async () => {
        try {
            await syncData();
            systemStatus.lastSyncAt = new Date();
            systemStatus.lastSyncStatus = 'success';
        } catch (err) {
            systemStatus.lastSyncStatus = 'failed: ' + err.message;
        }
    };
    runSync();

    // Periodic sync every 15 minutes
    setInterval(runSync, 15 * 60 * 1000);

    // Initial and Periodic CSV export
    const runExport = async () => {
        try {
            await exportAllStationsToCSV();
            systemStatus.lastExportAt = new Date();
            systemStatus.lastExportStatus = 'success';
        } catch (err) {
            systemStatus.lastExportStatus = 'failed: ' + err.message;
        }
    };

    // Periodic CSV export every 15 minutes (offset by 5 mins)
    if (isExportEnabled()) {
        setTimeout(() => {
            console.log('Starting periodic CSV export...');
            runExport();

            setInterval(runExport, 15 * 60 * 1000);
        }, 5 * 60 * 1000);
    }
});

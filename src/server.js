const express = require('express');
const cors = require('cors');
const db = require('./db/index.js');
const climdesService = require('./services/climdes.js');
const { syncData, syncProviderData } = require('./index.js');
const { exportAllStationsToCSV } = require('./utils/exporter.js');
const { hashPassword, comparePassword, generateToken } = require('./utils/auth.js');
const { protect } = require('./middleware/auth.js');

const app = express();
const port = 3000; // You can change this port as needed

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
// Retrieves distinct stations that have data recorded
app.get('/api/dataloggers', protect(['Admin', 'Data Manager', 'Data Viewer']), async (req, res) => {
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
                }
            ],
            exportPath: config.exportPath
        }
    });
});

// 5. Update configuration
app.post('/api/config', protect(['Admin']), (req, res) => {
    const { provider, credentials, system } = req.body;
    
    if (!provider && !credentials && !system) {
        return res.status(400).json({ success: false, message: 'Missing configuration update details' });
    }

    const updates = {};
    if (provider === 'CLIMDES' && credentials) {
        if (credentials.email) updates.API_EMAIL = credentials.email;
        if (credentials.password) updates.API_PASSWORD = credentials.password;
        if (credentials.baseUrl) updates.API_BASE_URL = credentials.baseUrl;
    } else if (provider === 'TAHMO' && credentials) {
        if (credentials.apiKey) updates.TAHMO_API_KEY = credentials.apiKey;
        if (credentials.apiSecret) updates.TAHMO_API_SECRET = credentials.apiSecret;
        if (credentials.baseUrl) updates.TAHMO_API_BASE_URL = credentials.baseUrl;
    } else if (system) {
        if (system.exportPath) updates.EXPORT_PATH = system.exportPath;
    }

    const success = configManager.updateEnv(updates);
    
    if (success) {
        res.json({ success: true, message: 'Configuration updated successfully. Note: some changes might require a server restart.' });
    } else {
        res.status(500).json({ success: false, message: 'Failed to update configuration' });
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

// 10. Manual Sync Route
app.post('/api/sync/provider', protect(['Admin', 'Data Manager']), async (req, res) => {
    try {
        const { provider, startDate, endDate } = req.body;
        
        if (!provider || !startDate || !endDate) {
            return res.status(400).json({ success: false, message: 'Please provide provider name, startDate and endDate' });
        }

        console.log(`Manual sync requested for ${provider} from ${startDate} to ${endDate}`);
        
        // Run in background so request doesn't timeout
        syncProviderData(provider, startDate, endDate)
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

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log(`- GET /api/weather`);
    console.log(`- GET /api/dataloggers`);

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
    setTimeout(() => {
        console.log('Starting periodic CSV export...');
        runExport();
        
        setInterval(runExport, 15 * 60 * 1000);
    }, 5 * 60 * 1000);
});

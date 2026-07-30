const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const db = require('./index.js');
require('dotenv').config();

const seedStations = async () => {
    try {
        const csvPath = path.join(__dirname, '../../clean_stations.csv');
        if (!fs.existsSync(csvPath)) {
            console.error(`CSV file not found at ${csvPath}`);
            return;
        }

        const csvContent = fs.readFileSync(csvPath, 'utf8');
        
        Papa.parse(csvContent, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const stations = results.data;
                console.log(`Parsed ${stations.length} stations from CSV. Importing...`);

                for (const s of stations) {
                    const stationId = s.station_id || s.site_code;
                    if (!stationId) continue;

                    const name = s.station_name || '';
                    const lat = parseFloat(s.latitude) || null;
                    const lon = parseFloat(s.longitude) || null;
                    const provider = s.provider || 'WAGTECH';
                    const org = s.organization || 'NiMet';
                    const isActive = s.status === 'active' || s.is_active === 'true' || s.is_active === true || false;
                    const model = s.model || '';
                    const locType = s.location_type || '';
                    const country = s.country || 'Nigeria';

                    await db.query(`
                        INSERT INTO stations (
                            station_id, station_name, latitude, longitude, 
                            provider, organization, is_active, model, location_type, country, updated_at
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
                        ON CONFLICT (station_id) DO UPDATE SET
                            station_name = EXCLUDED.station_name,
                            latitude = EXCLUDED.latitude,
                            longitude = EXCLUDED.longitude,
                            provider = EXCLUDED.provider,
                            organization = EXCLUDED.organization,
                            is_active = EXCLUDED.is_active,
                            model = EXCLUDED.model,
                            location_type = EXCLUDED.location_type,
                            country = EXCLUDED.country,
                            updated_at = NOW()
                    `, [stationId, name, lat, lon, provider, org, isActive, model, locType, country]);
                }

                console.log('Successfully imported all stations into the database.');
                await db.pool.end();
            }
        });
    } catch (error) {
        console.error('Error seeding stations:', error);
        await db.pool.end();
    }
};

seedStations();

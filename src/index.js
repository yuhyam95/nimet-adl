const db = require('./db/index.js');
const climdesService = require('./services/climdes.js');
const tahmoService = require('./services/tahmo.js');
require('dotenv').config();

const syncData = async (shouldClosePool = false) => {
    try {
        // Ensure stations table exists with provider column
        const createStationsTableQuery = `
            CREATE TABLE IF NOT EXISTS stations (
                station_id VARCHAR(255) PRIMARY KEY,
                station_name VARCHAR(255),
                latitude NUMERIC,
                longitude NUMERIC,
                model VARCHAR(255),
                location_type VARCHAR(255),
                organization VARCHAR(255),
                country VARCHAR(255),
                last_reading_at TIMESTAMP,
                is_active BOOLEAN DEFAULT FALSE,
                provider VARCHAR(50) DEFAULT 'CLIMDES',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await db.query(createStationsTableQuery);

        // Migration: Add provider column if it doesn't exist
        try {
            await db.query(`ALTER TABLE stations ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'CLIMDES';`);
        } catch (err) { /* ignore */ }

        const providers = [
            { name: 'CLIMDES', service: climdesService },
            { name: 'TAHMO', service: tahmoService }
        ];

        const today = new Date().toISOString().split('T')[0];
        const startDate = today;
        const endDate = today;

        for (const provider of providers) {
            console.log(`Starting data sync for provider: ${provider.name}...`);
            try {
                const loggersResponse = await provider.service.fetchDataLoggers();
                if (!loggersResponse || !loggersResponse.data) {
                    console.error(`Failed to fetch loggers for ${provider.name}`);
                    continue;
                }

                const loggers = loggersResponse.data;
                console.log(`Found ${loggers.length} loggers for ${provider.name}.`);

                for (const logger of loggers) {
                    try {
                        // Upsert station metadata
                        const stationParams = [
                            logger._id,
                            logger.stationName,
                            logger.location?.coordinates?.[1],
                            logger.location?.coordinates?.[0],
                            logger.dataLoggerModel,
                            logger.location?.type,
                            logger.organization?.name,
                            logger.location?.country,
                            logger.lastReading,
                            logger.isActive,
                            provider.name
                        ];

                        const upsertStationQuery = `
                            INSERT INTO stations (
                                station_id, station_name, latitude, longitude, 
                                model, location_type, organization, country, last_reading_at, is_active, provider, updated_at
                            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
                            ON CONFLICT (station_id) DO UPDATE SET
                                station_name = EXCLUDED.station_name,
                                latitude = EXCLUDED.latitude,
                                longitude = EXCLUDED.longitude,
                                model = EXCLUDED.model,
                                location_type = EXCLUDED.location_type,
                                organization = EXCLUDED.organization,
                                country = EXCLUDED.country,
                                last_reading_at = EXCLUDED.last_reading_at,
                                is_active = EXCLUDED.is_active,
                                provider = EXCLUDED.provider,
                                updated_at = NOW();
                        `;

                        await db.query(upsertStationQuery, stationParams);

                        if (!logger.isActive) continue;

                        const apiResponse = await provider.service.fetchWeatherData(startDate, endDate, logger._id);
                        if (!apiResponse || !apiResponse.success || !apiResponse.data) continue;

                        const { readings } = apiResponse.data;
                        if (!readings || readings.length === 0) continue;

                        const insertQuery = `
                            INSERT INTO weather_readings (
                                station_name, station_id, latitude, longitude, timestamp,
                                air_temperature, relative_humidity, wind_speed, wind_direction,
                                precipitation, solar_radiation, atmospheric_pressure,
                                soil_temperature, battery_voltage
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                            ON CONFLICT (station_id, timestamp) DO NOTHING;
                        `;

                        for (const record of readings) {
                            const params = [
                                logger.stationName,
                                logger._id,
                                logger.location?.coordinates?.[1],
                                logger.location?.coordinates?.[0],
                                record.timestamp,
                                record.airTemperature,
                                record.relativeHumidity != null ? Math.round(record.relativeHumidity * 100) : null,
                                record.windSpeed,
                                record.windDirection,
                                record.precipitation,
                                record.solarRadiation,
                                record.atmosphericPressure,
                                record.soilTemperature,
                                record.batteryVoltage
                            ];
                            await db.query(insertQuery, params).catch(e => console.error(`Insert error: ${e.message}`));
                        }
                    } catch (loggerError) {
                        console.error(`Error processing logger ${logger._id}: ${loggerError.message}`);
                    }
                }
            } catch (providerError) {
                console.error(`Error syncing provider ${provider.name}: ${providerError.message}`);
            }
        }
        console.log('Data sync completed successfully.');
    } catch (error) {
        console.error('Fatal error during sync:', error);
    } finally {
        if (shouldClosePool) {
            await db.pool.end();
        }
    }
};

if (require.main === module) {
    syncData(true);
}

module.exports = { syncData };

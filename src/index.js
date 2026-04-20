const db = require('./db/index.js');
const climdesService = require('./services/climdes.js');
const tahmoService = require('./services/tahmo.js');
require('dotenv').config();

/**
 * Main periodic sync function
 * Syncs the last 48 hours of data for all providers
 */
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

        const providers = ['CLIMDES', 'TAHMO'];
        const today = new Date().toISOString().split('T')[0];
        const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().split('T')[0];

        for (const provider of providers) {
            console.log(`Starting periodic data sync for provider: ${provider} (last 48h)...`);
            await syncProviderData(provider, fortyEightHoursAgo, today).catch(err => {
                console.error(`Error during periodic sync for ${provider}:`, err.message);
            });
        }
        console.log('Periodic data sync completed.');
    } catch (error) {
        console.error('Fatal error during sync:', error);
    } finally {
        if (shouldClosePool) {
            await db.pool.end();
        }
    }
};

/**
 * Syncs data for a specific provider within a date range
 * @param {string} providerName - 'CLIMDES' or 'TAHMO'
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 */
const syncProviderData = async (providerName, startDate, endDate) => {
    const providerService = providerName === 'TAHMO' ? tahmoService : climdesService;
    
    try {
        const loggersResponse = await providerService.fetchDataLoggers();
        if (!loggersResponse || !loggersResponse.data) {
            throw new Error(`Failed to fetch loggers for ${providerName}`);
        }

        const loggers = loggersResponse.data;
        console.log(`Found ${loggers.length} loggers for ${providerName}. Syncing range: ${startDate} to ${endDate}`);

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
                    providerName
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

                // Split large ranges into chunks if needed (e.g. for TAHMO)
                const timeRanges = [];
                let currentStart = new Date(startDate);
                const finalEnd = new Date(endDate);

                while (currentStart <= finalEnd) {
                    let currentEndPeriod = new Date(currentStart);
                    currentEndPeriod.setDate(currentStart.getDate() + 30); // 30-day chunks
                    if (currentEndPeriod > finalEnd) currentEndPeriod = finalEnd;
                    
                    timeRanges.push({
                        start: currentStart.toISOString().split('T')[0],
                        end: currentEndPeriod.toISOString().split('T')[0]
                    });
                    
                    if (currentEndPeriod >= finalEnd) break;
                    currentStart = new Date(currentEndPeriod);
                    currentStart.setDate(currentStart.getDate() + 1);
                }

                for (const range of timeRanges) {
                    const apiResponse = await providerService.fetchWeatherData(range.start, range.end, logger._id);
                    const readings = apiResponse?.data?.readings;
                    if (!readings || readings.length === 0) continue;

                    for (const record of readings) {
                        const {
                            timestamp, airTemperature, relativeHumidity, windSpeed, 
                            windDirection, precipitation, solarRadiation, 
                            atmosphericPressure, soilTemperature, batteryVoltage,
                            windGust, lightningStrikeCount, lightningStrikeDistance,
                            xOrientation, yOrientation, humiditySensorTemperature,
                            volumetricWaterContent,
                            ...rest
                        } = record;

                        const params = [
                            logger.stationName, logger._id,
                            logger.location?.coordinates?.[1], logger.location?.coordinates?.[0],
                            timestamp, airTemperature, relativeHumidity, windSpeed, windDirection,
                            precipitation, solarRadiation, atmosphericPressure, soilTemperature,
                            batteryVoltage, JSON.stringify(rest), windGust, lightningStrikeCount,
                            lightningStrikeDistance, xOrientation, yOrientation,
                            humiditySensorTemperature, volumetricWaterContent
                        ];

                        const insertQuery = `
                            INSERT INTO weather_readings (
                                station_name, station_id, latitude, longitude, timestamp,
                                air_temperature, relative_humidity, wind_speed, wind_direction,
                                precipitation, solar_radiation, atmospheric_pressure,
                                soil_temperature, battery_voltage, metadata,
                                wind_gust, lightning_strike_count, lightning_strike_distance,
                                x_orientation, y_orientation, humidity_sensor_temperature,
                                volumetric_water_content
                            )
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
                            ON CONFLICT (station_id, timestamp) DO UPDATE SET
                                air_temperature = EXCLUDED.air_temperature,
                                relative_humidity = EXCLUDED.relative_humidity,
                                wind_speed = EXCLUDED.wind_speed,
                                wind_direction = EXCLUDED.wind_direction,
                                precipitation = EXCLUDED.precipitation,
                                solar_radiation = EXCLUDED.solar_radiation,
                                atmospheric_pressure = EXCLUDED.atmospheric_pressure,
                                wind_gust = EXCLUDED.wind_gust,
                                lightning_strike_count = EXCLUDED.lightning_strike_count,
                                lightning_strike_distance = EXCLUDED.lightning_strike_distance,
                                x_orientation = EXCLUDED.x_orientation,
                                y_orientation = EXCLUDED.y_orientation,
                                humidity_sensor_temperature = EXCLUDED.humidity_sensor_temperature,
                                volumetric_water_content = EXCLUDED.volumetric_water_content,
                                metadata = EXCLUDED.metadata;
                        `;
                        await db.query(insertQuery, params).catch(e => {
                            if (!e.message.includes('unique constraint')) {
                                console.error(`Insert error for ${logger._id}: ${e.message}`);
                            }
                        });
                    }
                }
            } catch (err) {
                console.error(`Error processing logger ${logger._id}: ${err.message}`);
            }
        }
    } catch (error) {
        console.error(`Sync provider error for ${providerName}:`, error.message);
        throw error;
    }
};

if (require.main === module) {
    syncData(true);
}

module.exports = { syncData, syncProviderData };

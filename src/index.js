const db = require('./db/index.js');
const apiService = require('./services/api.js');
require('dotenv').config();

const syncData = async (shouldClosePool = false) => {
    try {
        // Ensure stations table exists
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
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await db.query(createStationsTableQuery);

        // Determine the date range (e.g., today)
        const today = new Date().toISOString().split('T')[0];
        const startDate = today;
        const endDate = today;

        console.log(`Starting data sync for ${startDate}...`);

        console.log('Fetching active data loggers...');
        const loggersResponse = await apiService.fetchDataLoggers();

        if (!loggersResponse || !loggersResponse.data) {
            throw new Error('Failed to fetch data loggers list');
        }

        const loggers = loggersResponse.data.filter(l => l.isActive); // Only sync active loggers
        console.log(`Found ${loggers.length} active data loggers.`);

        for (const logger of loggers) {
            try {
                // Upsert station metadata
                const stationParams = [
                    logger._id,
                    logger.stationName,
                    logger.location?.coordinates?.[1], // Latitude (y)
                    logger.location?.coordinates?.[0], // Longitude (x)
                    logger.dataLoggerModel,
                    logger.location?.type,
                    logger.organization?.name,
                    logger.location?.country,
                    logger.lastReading
                ];

                const upsertStationQuery = `
                    INSERT INTO stations (
                        station_id, station_name, latitude, longitude, 
                        model, location_type, organization, country, last_reading_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
                    ON CONFLICT (station_id) DO UPDATE SET
                        station_name = EXCLUDED.station_name,
                        latitude = EXCLUDED.latitude,
                        longitude = EXCLUDED.longitude,
                        model = EXCLUDED.model,
                        location_type = EXCLUDED.location_type,
                        organization = EXCLUDED.organization,
                        country = EXCLUDED.country,
                        last_reading_at = EXCLUDED.last_reading_at,
                        updated_at = NOW();
                `;

                await db.query(upsertStationQuery, stationParams);

                console.log(`Processing Station: ${logger.stationName} (${logger._id})`);

                const apiResponse = await apiService.fetchWeatherData(startDate, endDate, logger._id);

                if (!apiResponse || !apiResponse.success || !apiResponse.data) {
                    console.error(`Invalid API response for logger ${logger._id}`);
                    continue;
                }

                const { stationName, dataLoggerId, location, readings } = apiResponse.data;

                if (readings.length === 0) continue;

                // Improved Table Schema (weather_readings) - handled elsewhere or assumed existing
                const insertQuery = `
      INSERT INTO weather_readings (
        station_name, station_id, latitude, longitude, timestamp,
        air_temperature, relative_humidity, wind_speed, wind_direction,
        precipitation, solar_radiation, atmospheric_pressure,
        soil_temperature, battery_voltage
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (station_id, timestamp) DO NOTHING
      RETURNING id;
    `;

                let insertedCount = 0;

                for (const record of readings) {
                    // Map API response fields to DB columns
                    const params = [
                        stationName,
                        dataLoggerId,
                        location.latitude,
                        location.longitude,
                        record.timestamp,
                        record.airTemperature,
                        record.relativeHumidity,
                        record.windSpeed,
                        record.windDirection,
                        record.precipitation,
                        record.solarRadiation,
                        record.atmosphericPressure,
                        record.soilTemperature,
                        record.batteryVoltage
                    ];

                    try {
                        await db.query(insertQuery, params);
                        insertedCount++;
                    } catch (dbError) {
                        console.error(`  ! Failed to insert: ${dbError.message}`);
                    }
                }
                // console.log(`  > ${insertedCount} records inserted.`);

            } catch (loggerError) {
                console.error(`Error processing logger ${logger._id}: ${loggerError.message}`);
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

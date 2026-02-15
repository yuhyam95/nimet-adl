const db = require('./db/index.js');
const apiService = require('./services/api.js');

const syncData = async (shouldClosePool = false) => {
    try {
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
                // console.log(`\nProcessing Station: ${logger.stationName} (${logger._id})`);

                const apiResponse = await apiService.fetchWeatherData(startDate, endDate, logger._id);

                if (!apiResponse || !apiResponse.success || !apiResponse.data) {
                    console.error(`Invalid API response for logger ${logger._id}`);
                    continue;
                }

                const { stationName, dataLoggerId, location, readings } = apiResponse.data;

                // console.log(`  > Found ${readings.length} readings.`);

                if (readings.length === 0) continue;

                // Improved Table Schema
                /*
                CREATE TABLE weather_readings (
                    id SERIAL PRIMARY KEY,
                    station_name VARCHAR(255),
                    station_id VARCHAR(255),
                    latitude NUMERIC,
                    longitude NUMERIC,
                    timestamp TIMESTAMP,
                    air_temperature NUMERIC,
                    relative_humidity NUMERIC,
                    wind_speed NUMERIC,
                    wind_direction NUMERIC,
                    precipitation NUMERIC,
                    solar_radiation NUMERIC,
                    atmospheric_pressure NUMERIC,
                    soil_temperature NUMERIC,
                    battery_voltage NUMERIC,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                */

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

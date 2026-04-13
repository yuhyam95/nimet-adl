const db = require('./db/index.js');
const climdesService = require('./services/climdes.js');
const tahmoService = require('./services/tahmo.js');
require('dotenv').config();

const fullSync = async () => {
    const startDate = '2025-07-07';
    const endDate = new Date().toISOString().split('T')[0];

    const providers = [
        { name: 'CLIMDES', service: climdesService },
        { name: 'TAHMO', service: tahmoService }
    ];

    console.log(`Starting FULL data sync from ${startDate} to ${endDate}...`);

    try {
        for (const provider of providers) {
            console.log(`--- Syncing Provider: ${provider.name} ---`);
            try {
                const loggersResponse = await provider.service.fetchDataLoggers();
                if (!loggersResponse || !loggersResponse.data) {
                    console.error(`Failed to fetch loggers for ${provider.name}`);
                    continue;
                }

                const loggers = loggersResponse.data;
                console.log(`Found ${loggers.length} total data loggers for ${provider.name}.`);

                for (const logger of loggers) {
                    console.log(`Processing Station: ${logger.stationName} (${logger._id})`);

                    let currentStart = new Date(startDate);
                    const finalEnd = new Date(endDate);

                    while (currentStart <= finalEnd) {
                        let currentEnd = new Date(currentStart);
                        currentEnd.setDate(currentEnd.getDate() + 30);
                        if (currentEnd > finalEnd) currentEnd = finalEnd;

                        const startStr = currentStart.toISOString().split('T')[0];
                        const endStr = currentEnd.toISOString().split('T')[0];

                        console.log(`  -> Fetching batch: ${startStr} to ${endStr}`);

                        try {
                            const apiResponse = await provider.service.fetchWeatherData(startStr, endStr, logger._id);
                            if (apiResponse && apiResponse.success && apiResponse.data) {
                                const { readings } = apiResponse.data;
                                if (readings && readings.length > 0) {
                                    await insertReadings(logger.stationName, logger._id, apiResponse.data.location || logger.location, readings);
                                    console.log(`     -> Synced ${readings.length} readings.`);
                                } else {
                                    console.log(`     -> No readings found in this batch.`);
                                }
                            } else {
                                console.error(`     -> API Error or no data for batch.`);
                            }
                        } catch (batchError) {
                            console.error(`     -> Error processing batch ${startStr} to ${endStr}: ${batchError.message}`);
                        }

                        currentStart = new Date(currentEnd);
                        currentStart.setDate(currentStart.getDate() + 1);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            } catch (providerError) {
                console.error(`Error syncing provider ${provider.name}: ${providerError.message}`);
            }
        }
    } catch (error) {
        console.error('Fatal error during full sync:', error);
    } finally {
        await db.pool.end();
    }
};

const insertReadings = async (stationName, dataLoggerId, location, readings) => {
    const insertQuery = `
        INSERT INTO weather_readings (
            station_name, station_id, latitude, longitude, timestamp,
            air_temperature, relative_humidity, wind_speed, wind_direction,
            precipitation, solar_radiation, atmospheric_pressure,
            soil_temperature, battery_voltage
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (station_id, timestamp) DO UPDATE SET
            air_temperature = EXCLUDED.air_temperature,
            relative_humidity = EXCLUDED.relative_humidity,
            wind_speed = EXCLUDED.wind_speed,
            wind_direction = EXCLUDED.wind_direction,
            precipitation = EXCLUDED.precipitation,
            solar_radiation = EXCLUDED.solar_radiation,
            atmospheric_pressure = EXCLUDED.atmospheric_pressure,
            soil_temperature = EXCLUDED.soil_temperature,
            battery_voltage = EXCLUDED.battery_voltage;
    `;

    for (const record of readings) {
        const params = [
            stationName,
            dataLoggerId,
            location?.latitude || location?.coordinates?.[1],
            location?.longitude || location?.coordinates?.[0],
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

        try {
            await db.query(insertQuery, params);
        } catch (dbError) {
            console.error(`  ! Failed to insert: ${dbError.message}`);
        }
    }
};

if (require.main === module) {
    fullSync();
} else {
    module.exports = { fullSync };
}

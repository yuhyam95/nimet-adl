const db = require('./db/index.js');
const apiService = require('./services/api.js');
require('dotenv').config();

const fullSync = async () => {
    const startDate = '2025-07-07';
    // Use yesterday as end date to ensure full days, or today. 
    // Let's use today's date.
    const endDate = new Date().toISOString().split('T')[0];

    console.log(`Starting FULL data sync from ${startDate} to ${endDate}...`);

    try {
        console.log('Fetching active data loggers...');
        const loggersResponse = await apiService.fetchDataLoggers();

        if (!loggersResponse || !loggersResponse.data) {
            throw new Error('Failed to fetch data loggers list');
        }

        const loggers = loggersResponse.data;
        console.log(`Found ${loggers.length} total data loggers.`);

        for (const logger of loggers) {
            console.log(`--------------------------------------------------`);
            console.log(`Processing Station: ${logger.stationName} (${logger._id})`);

            if (!logger.isActive) {
                console.log(`  -> Station is Inactive, but syncing historical data...`);
            }

            // We will fetch in 30-day chunks to avoid timeouts or massive payloads
            let currentStart = new Date(startDate);
            const finalEnd = new Date(endDate);

            while (currentStart <= finalEnd) {
                let currentEnd = new Date(currentStart);
                currentEnd.setDate(currentEnd.getDate() + 30);

                if (currentEnd > finalEnd) {
                    currentEnd = finalEnd;
                }

                const startStr = currentStart.toISOString().split('T')[0];
                const endStr = currentEnd.toISOString().split('T')[0];

                console.log(`  -> Fetching batch: ${startStr} to ${endStr}`);

                try {
                    const apiResponse = await apiService.fetchWeatherData(startStr, endStr, logger._id);

                    if (apiResponse && apiResponse.success && apiResponse.data) {
                        const { readings } = apiResponse.data;
                        if (readings.length > 0) {
                            await insertReadings(logger.stationName, logger._id, apiResponse.data.location, readings);
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

                // Move to next batch (next day after currentEnd)
                currentStart = new Date(currentEnd);
                currentStart.setDate(currentStart.getDate() + 1);

                // Small delay to be nice to the API
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        console.log('--------------------------------------------------');
        console.log('Full data sync completed successfully.');

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
            soil_temperature, battery_voltage,
            wind_gust, lightning_strike_count, lightning_strike_distance,
            vapor_pressure, humidity_sensor_temperature,
            x_orientation, y_orientation, atoms_gen2,
            north_wind_speed, east_wind_speed,
            soil_electrical_conductivity, soil_ph,
            panel_temperature, volumetric_water_content
        )
        VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
        )
        ON CONFLICT (station_id, timestamp) DO UPDATE SET
            air_temperature = EXCLUDED.air_temperature,
            relative_humidity = EXCLUDED.relative_humidity,
            wind_speed = EXCLUDED.wind_speed,
            wind_direction = EXCLUDED.wind_direction,
            precipitation = EXCLUDED.precipitation,
            solar_radiation = EXCLUDED.solar_radiation,
            atmospheric_pressure = EXCLUDED.atmospheric_pressure,
            soil_temperature = EXCLUDED.soil_temperature,
            battery_voltage = EXCLUDED.battery_voltage,
            wind_gust = EXCLUDED.wind_gust,
            lightning_strike_count = EXCLUDED.lightning_strike_count,
            lightning_strike_distance = EXCLUDED.lightning_strike_distance,
            vapor_pressure = EXCLUDED.vapor_pressure,
            humidity_sensor_temperature = EXCLUDED.humidity_sensor_temperature,
            x_orientation = EXCLUDED.x_orientation,
            y_orientation = EXCLUDED.y_orientation,
            atoms_gen2 = EXCLUDED.atoms_gen2,
            north_wind_speed = EXCLUDED.north_wind_speed,
            east_wind_speed = EXCLUDED.east_wind_speed,
            soil_electrical_conductivity = EXCLUDED.soil_electrical_conductivity,
            soil_ph = EXCLUDED.soil_ph,
            panel_temperature = EXCLUDED.panel_temperature,
            volumetric_water_content = EXCLUDED.volumetric_water_content;
    `;

    for (const record of readings) {
        // Map API response fields to DB columns
        const params = [
            stationName,
            dataLoggerId,
            location.latitude,
            location.longitude,
            record.timestamp,
            record.airTemperature,
            record.relativeHumidity != null ? Math.round(record.relativeHumidity * 100) : null, // Apply fix here too!
            record.windSpeed,
            record.windDirection,
            record.precipitation,
            record.solarRadiation,
            record.atmosphericPressure,
            record.soilTemperature,
            record.batteryVoltage,
            record.windGust,
            record.lightningStrikeCount,
            record.lightningStrikeDistance,
            record.vaporPressure,
            record.humidityOfSensorTemperature,
            record.xOrientation,
            record.yOrientation,
            record.atomsGen2,
            record.northWindSpeed,
            record.eastWindSpeed,
            record.soilElectricalConductivity,
            record.soilPH,
            record.panelTemperature,
            record.volumetricWaterContent
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

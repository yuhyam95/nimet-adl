const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('./db/index.js');
const climdesService = require('./services/climdes.js');
const tahmoService = require('./services/tahmo.js');
const pulsowebService = require('./services/pulsoweb.js');
const { processFtpData } = require('./services/ftpImporter.js');
const { reverseGeocode } = require('./services/geocoding.js');

const providerServices = {
    CLIMDES: climdesService,
    TAHMO: tahmoService,
    PULSOWEB: pulsowebService
};

async function upsertProviderStation(logger, providerName) {
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
        providerName,
        logger.sourceStationId || logger._id,
        logger.sourceTimezone || null,
        logger.collectionStartAt || null
    ];

    return db.query(`
        INSERT INTO stations (
            station_id, station_name, latitude, longitude,
            model, location_type, organization, country, last_reading_at, is_active, provider,
            source_station_id, source_timezone, collection_start_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
        ON CONFLICT (station_id) DO UPDATE SET
            station_name = EXCLUDED.station_name,
            latitude = CASE
                WHEN EXCLUDED.provider = 'PULSOWEB' THEN COALESCE(stations.latitude, EXCLUDED.latitude)
                ELSE COALESCE(EXCLUDED.latitude, stations.latitude)
            END,
            longitude = CASE
                WHEN EXCLUDED.provider = 'PULSOWEB' THEN COALESCE(stations.longitude, EXCLUDED.longitude)
                ELSE COALESCE(EXCLUDED.longitude, stations.longitude)
            END,
            model = EXCLUDED.model,
            location_type = EXCLUDED.location_type,
            organization = EXCLUDED.organization,
            country = COALESCE(EXCLUDED.country, stations.country),
            last_reading_at = COALESCE(EXCLUDED.last_reading_at, stations.last_reading_at),
            is_active = EXCLUDED.is_active,
            provider = EXCLUDED.provider,
            source_station_id = EXCLUDED.source_station_id,
            source_timezone = COALESCE(stations.source_timezone, EXCLUDED.source_timezone),
            collection_start_at = COALESCE(stations.collection_start_at, EXCLUDED.collection_start_at),
            updated_at = NOW()
        RETURNING source_timezone, collection_start_at;
    `, stationParams);
}

async function importProviderStations(providerName) {
    const normalizedProvider = String(providerName || '').toUpperCase();
    const providerService = providerServices[normalizedProvider];
    if (!providerService) throw new Error(`Unsupported provider: ${providerName}`);

    const loggersResponse = await providerService.fetchDataLoggers();
    if (!loggersResponse || !Array.isArray(loggersResponse.data)) {
        throw new Error(`Failed to fetch loggers for ${normalizedProvider}`);
    }

    for (const logger of loggersResponse.data) {
        await upsertProviderStation(logger, normalizedProvider);
    }

    return { count: loggersResponse.data.length, stations: loggersResponse.data };
}

async function geocodeProviderStations(providerName) {
    const normalizedProvider = String(providerName || '').toUpperCase();
    const result = await db.query(
        `SELECT station_id, latitude, longitude
         FROM stations
         WHERE provider = $1
           AND latitude IS NOT NULL
           AND longitude IS NOT NULL
           AND (state IS NULL OR lga IS NULL)
           AND geocoded_at IS NULL
         ORDER BY station_id`,
        [normalizedProvider]
    );

    let updated = 0;
    let failed = 0;

    for (const station of result.rows) {
        try {
            const location = await reverseGeocode(station.latitude, station.longitude);
            await db.query(
                `UPDATE stations
                 SET state = $1,
                     lga = $2,
                     country = COALESCE($3, country),
                     geocoded_at = NOW(),
                     updated_at = NOW()
                 WHERE station_id = $4`,
                [location.state, location.lga, location.country, station.station_id]
            );
            updated += 1;
        } catch (error) {
            failed += 1;
            await db.query(
                'UPDATE stations SET geocoded_at = NOW() WHERE station_id = $1',
                [station.station_id]
            );
            console.error(`Could not detect State/LGA for ${station.station_id}:`, error.message);
        }
    }

    return { attempted: result.rows.length, updated, failed };
}

/**
 * Main periodic sync function
 * Syncs the last 48 hours of data for all providers
 */
const syncData = async (shouldClosePool = false) => {
    try {
        // Ensure stations table exists with provider and WIGOS columns
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
                state VARCHAR(255),
                lga VARCHAR(255),
                geocoded_at TIMESTAMPTZ,
                last_reading_at TIMESTAMP,
                is_active BOOLEAN DEFAULT FALSE,
                provider VARCHAR(50) DEFAULT 'CLIMDES',
                source_station_id VARCHAR(255),
                source_timezone VARCHAR(64),
                collection_start_at TIMESTAMPTZ,
                wigos_id VARCHAR(255),
                wsi_series VARCHAR(255),
                wsi_issuer VARCHAR(255),
                wsi_issue_number VARCHAR(255),
                wsi_local VARCHAR(255),
                wmo_block_number VARCHAR(255),
                wmo_station_number VARCHAR(255),
                station_height_above_msl NUMERIC,
                barometer_height_above_msl NUMERIC,
                anemometer_height NUMERIC,
                rain_sensor_height NUMERIC,
                method_of_ground_state_measurement VARCHAR(255),
                method_of_snow_depth_measurement VARCHAR(255),
                time_period_of_wind NUMERIC,
                share_to_wis2box BOOLEAN DEFAULT FALSE,
                last_wis2box_dispatch_at TIMESTAMP,
                last_wis2box_dispatch_status VARCHAR(50),
                last_wis2box_dispatch_error TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;
        await db.query(createStationsTableQuery);

        // Migration: Add provider and WIGOS columns if they don't exist
        try {
            await db.query(`
                ALTER TABLE stations 
                ADD COLUMN IF NOT EXISTS provider VARCHAR(50) DEFAULT 'CLIMDES',
                ADD COLUMN IF NOT EXISTS source_station_id VARCHAR(255),
                ADD COLUMN IF NOT EXISTS source_timezone VARCHAR(64),
                ADD COLUMN IF NOT EXISTS collection_start_at TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS state VARCHAR(255),
                ADD COLUMN IF NOT EXISTS lga VARCHAR(255),
                ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS wigos_id VARCHAR(255),
                ADD COLUMN IF NOT EXISTS wsi_series VARCHAR(255),
                ADD COLUMN IF NOT EXISTS wsi_issuer VARCHAR(255),
                ADD COLUMN IF NOT EXISTS wsi_issue_number VARCHAR(255),
                ADD COLUMN IF NOT EXISTS wsi_local VARCHAR(255),
                ADD COLUMN IF NOT EXISTS wmo_block_number VARCHAR(255),
                ADD COLUMN IF NOT EXISTS wmo_station_number VARCHAR(255),
                ADD COLUMN IF NOT EXISTS station_height_above_msl NUMERIC,
                ADD COLUMN IF NOT EXISTS barometer_height_above_msl NUMERIC,
                ADD COLUMN IF NOT EXISTS anemometer_height NUMERIC,
                ADD COLUMN IF NOT EXISTS rain_sensor_height NUMERIC,
                ADD COLUMN IF NOT EXISTS method_of_ground_state_measurement VARCHAR(255),
                ADD COLUMN IF NOT EXISTS method_of_snow_depth_measurement VARCHAR(255),
                ADD COLUMN IF NOT EXISTS time_period_of_wind NUMERIC,
                ADD COLUMN IF NOT EXISTS share_to_wis2box BOOLEAN DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS last_wis2box_dispatch_at TIMESTAMP,
                ADD COLUMN IF NOT EXISTS last_wis2box_dispatch_status VARCHAR(50),
                ADD COLUMN IF NOT EXISTS last_wis2box_dispatch_error TEXT;
            `);
        } catch (err) { /* ignore */ }

        try {
            await db.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS stations_provider_source_id_idx
                ON stations (provider, source_station_id)
                WHERE source_station_id IS NOT NULL;
            `);
        } catch (err) {
            console.error('Could not create provider/source station index:', err.message);
        }

        // Migration for FTP processed files
        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS processed_ftp_files (
                    filename VARCHAR(255) PRIMARY KEY,
                    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } catch (err) { /* ignore */ }

        const providers = ['CLIMDES', 'TAHMO'];
        if (process.env.PULSOWEB_API_TOKEN) providers.push('PULSOWEB');
        const today = new Date().toISOString().split('T')[0];
        const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().split('T')[0];

        for (const provider of providers) {
            console.log(`Starting periodic data sync for provider: ${provider} (last 48h)...`);
            await syncProviderData(provider, fortyEightHoursAgo, today, {
                incremental: provider === 'PULSOWEB'
            }).catch(err => {
                console.error(`Error during periodic sync for ${provider}:`, err.message);
            });
        }
        
        // Add FTP Sync
        console.log(`Starting periodic FTP data sync...`);
        await processFtpData().catch(err => {
             console.error(`Error during FTP sync:`, err.message);
        });

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
 * @param {string} providerName - configured provider name
 * @param {string} startDate - YYYY-MM-DD
 * @param {string} endDate - YYYY-MM-DD
 * @param {{incremental?: boolean}} options - provider sync options
 */
const syncProviderData = async (providerName, startDate, endDate, options = {}) => {
    const normalizedProvider = String(providerName || '').toUpperCase();
    const providerService = providerServices[normalizedProvider];
    if (!providerService) throw new Error(`Unsupported provider: ${providerName}`);
    
    try {
        const loggersResponse = await providerService.fetchDataLoggers();
        if (!loggersResponse || !loggersResponse.data) {
            throw new Error(`Failed to fetch loggers for ${providerName}`);
        }

        const loggers = loggersResponse.data;
        console.log(`Found ${loggers.length} loggers for ${normalizedProvider}. Syncing range: ${startDate} to ${endDate}`);

        for (const logger of loggers) {
            try {
                // Upsert station metadata
                const upsertedStation = await upsertProviderStation(logger, normalizedProvider);
                const stationSourceTimezone = upsertedStation.rows[0]?.source_timezone || logger.sourceTimezone;
                const stationCollectionStart = upsertedStation.rows[0]?.collection_start_at || logger.collectionStartAt;

                if (!logger.isActive) continue;

                let effectiveStartDate = startDate;
                let effectiveEndDate = endDate;

                if (normalizedProvider === 'PULSOWEB' && options.incremental) {
                    const latestResult = await db.query(
                        'SELECT MAX(timestamp) AS latest_timestamp FROM weather_readings WHERE station_id = $1',
                        [logger._id]
                    );
                    const latestTimestamp = latestResult.rows[0]?.latest_timestamp;

                    if (latestTimestamp) {
                        const overlapStart = new Date(new Date(latestTimestamp).getTime() - 5 * 60 * 1000);
                        const configuredStart = stationCollectionStart ? new Date(stationCollectionStart) : null;
                        effectiveStartDate = configuredStart && configuredStart > overlapStart
                            ? configuredStart.toISOString()
                            : overlapStart.toISOString();
                    } else if (stationCollectionStart) {
                        effectiveStartDate = new Date(stationCollectionStart).toISOString();
                    }

                    const localNow = pulsowebService.formatDateInTimezone(
                        new Date(),
                        stationSourceTimezone
                    );
                    const completedLocalHour = `${localNow.slice(0, 13)}:00:00`;
                    effectiveEndDate = pulsowebService.localDateTimeToIso(
                        completedLocalHour,
                        stationSourceTimezone
                    );
                }

                // Split large ranges into chunks to keep upstream requests bounded.
                const timeRanges = [];
                let currentStart = new Date(effectiveStartDate);
                const finalEnd = new Date(effectiveEndDate);
                const preserveTime = String(effectiveStartDate).includes('T') || String(effectiveEndDate).includes('T');

                if (Number.isNaN(currentStart.getTime()) || Number.isNaN(finalEnd.getTime())) {
                    throw new Error(`Invalid sync range: ${effectiveStartDate} to ${effectiveEndDate}`);
                }

                let firstRange = true;
                while (currentStart <= finalEnd) {
                    let currentEndPeriod = new Date(currentStart);
                    currentEndPeriod.setDate(currentStart.getDate() + 30); // 30-day chunks
                    if (currentEndPeriod > finalEnd) currentEndPeriod = finalEnd;
                    
                    timeRanges.push({
                        start: firstRange
                            ? effectiveStartDate
                            : (preserveTime ? currentStart.toISOString() : currentStart.toISOString().split('T')[0]),
                        end: currentEndPeriod >= finalEnd
                            ? effectiveEndDate
                            : (preserveTime ? currentEndPeriod.toISOString() : currentEndPeriod.toISOString().split('T')[0])
                    });
                    firstRange = false;
                    
                    if (currentEndPeriod >= finalEnd) break;
                    currentStart = new Date(currentEndPeriod);
                    if (!preserveTime) currentStart.setDate(currentStart.getDate() + 1);
                }

                let latestInsertedTimestamp = null;
                for (const range of timeRanges) {
                    const apiResponse = await providerService.fetchWeatherData(
                        range.start,
                        range.end,
                        logger.sourceStationId || logger._id,
                        { timezone: stationSourceTimezone }
                    );
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

                        // Skip future timestamps (buggy datalogger clocks)
                        if (new Date(timestamp) > new Date()) {
                            continue;
                        }

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
                                soil_temperature = EXCLUDED.soil_temperature,
                                battery_voltage = EXCLUDED.battery_voltage,
                                wind_gust = EXCLUDED.wind_gust,
                                lightning_strike_count = EXCLUDED.lightning_strike_count,
                                lightning_strike_distance = EXCLUDED.lightning_strike_distance,
                                x_orientation = EXCLUDED.x_orientation,
                                y_orientation = EXCLUDED.y_orientation,
                                humidity_sensor_temperature = EXCLUDED.humidity_sensor_temperature,
                                volumetric_water_content = EXCLUDED.volumetric_water_content,
                                metadata = EXCLUDED.metadata;
                        `;
                        try {
                            await db.query(insertQuery, params);
                            if (!latestInsertedTimestamp || new Date(timestamp) > new Date(latestInsertedTimestamp)) {
                                latestInsertedTimestamp = timestamp;
                            }
                        } catch (e) {
                            if (!e.message.includes('unique constraint')) {
                                console.error(`Insert error for ${logger._id}: ${e.message}`);
                            }
                        }
                    }
                }

                if (latestInsertedTimestamp) {
                    await db.query(
                        `UPDATE stations
                         SET last_reading_at = GREATEST(COALESCE(last_reading_at, $1), $1), updated_at = NOW()
                         WHERE station_id = $2`,
                        [latestInsertedTimestamp, logger._id]
                    );
                }
                
                // Dispatch newly fetched data to WIS2BOX
                const fullStationRes = await db.query('SELECT * FROM stations WHERE station_id = $1', [logger._id]);
                if (fullStationRes.rows.length > 0) {
                    const fullStation = fullStationRes.rows[0];
                    if (fullStation.wigos_id && fullStation.share_to_wis2box) {
                        const endDateTime = endDate.includes('T') ? endDate : endDate + 'T23:59:59';
                        const dbReadingsResult = await db.query(
                            'SELECT * FROM weather_readings WHERE station_id = $1 AND timestamp >= $2 AND timestamp <= $3',
                            [logger._id, startDate, new Date(endDateTime).toISOString()]
                        );
                        if (dbReadingsResult.rows.length > 0) {
                            const { dispatchToWis2box } = require('./services/wis2box.js');
                            await dispatchToWis2box(fullStation, dbReadingsResult.rows);
                        }
                    }
                }
            } catch (err) {
                console.error(`Error processing logger ${logger._id}: ${err.message}`);
            }
        }

        const geocoding = await geocodeProviderStations(normalizedProvider);
        console.log(
            `Location detection for ${normalizedProvider}: ${geocoding.updated} updated, ${geocoding.failed} failed.`
        );
        return { geocoding };
    } catch (error) {
        console.error(`Sync provider error for ${normalizedProvider}:`, error.message);
        throw error;
    }
};

if (require.main === module) {
    syncData(true);
}

module.exports = { importProviderStations, geocodeProviderStations, syncData, syncProviderData };

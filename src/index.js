const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('./db/index.js');
const climdesService = require('./services/climdes.js');
const tahmoService = require('./services/tahmo.js');
const pulsowebService = require('./services/pulsoweb.js');
const { processFtpData } = require('./services/ftpImporter.js');
const { reverseGeocode } = require('./services/geocoding.js');
const syncTracker = require('./services/syncTracker.js');
const { validateStationInput, validateCoordinates } = require('./utils/stationSecurity.js');

const providerServices = {
    CLIMDES: climdesService,
    TAHMO: tahmoService,
    PULSOWEB: pulsowebService
};

const configuredOverlapMinutes = Number(process.env.SYNC_OVERLAP_MINUTES || 60);
const configuredStationConcurrency = Number(process.env.SYNC_STATION_CONCURRENCY || 5);
const SYNC_OVERLAP_MINUTES = Number.isFinite(configuredOverlapMinutes)
    ? Math.max(configuredOverlapMinutes, 0)
    : 60;
const SYNC_STATION_CONCURRENCY = Number.isFinite(configuredStationConcurrency)
    ? Math.max(Math.floor(configuredStationConcurrency), 1)
    : 5;
const METADATA_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const READING_BATCH_SIZE = 500;
const providerMetadataRefreshedAt = new Map();

function shouldRefreshProviderMetadata(providerName, now = Date.now()) {
    const lastRefresh = providerMetadataRefreshedAt.get(providerName);
    return !lastRefresh || now - lastRefresh >= METADATA_REFRESH_INTERVAL_MS;
}

async function mapWithConcurrency(items, concurrency, worker) {
    let nextIndex = 0;
    const requestedConcurrency = Number(concurrency);
    const workerCount = Math.min(
        Number.isFinite(requestedConcurrency) ? Math.max(Math.floor(requestedConcurrency), 1) : 1,
        items.length
    );
    await Promise.all(Array.from({ length: workerCount }, async () => {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            await worker(items[currentIndex], currentIndex);
        }
    }));
}

async function loadProviderStations(providerName) {
    const result = await db.query(
        `SELECT station_id, station_name, latitude, longitude, model, location_type,
                organization, country, last_reading_at, is_active, source_station_id,
                source_timezone, collection_start_at, is_quarantined
         FROM stations
         WHERE provider = $1
         ORDER BY station_id`,
        [providerName]
    );

    return result.rows.map(station => ({
        _id: station.station_id,
        sourceStationId: station.source_station_id || station.station_id,
        sourceTimezone: station.source_timezone,
        collectionStartAt: station.collection_start_at,
        stationName: station.station_name,
        location: {
            type: station.location_type || 'Point',
            coordinates: [station.longitude, station.latitude],
            country: station.country
        },
        dataLoggerModel: station.model,
        organization: { name: station.organization },
        lastReading: station.last_reading_at,
        isActive: station.is_active,
        provider: providerName,
        cachedStationState: {
            source_timezone: station.source_timezone,
            collection_start_at: station.collection_start_at,
            is_quarantined: station.is_quarantined
        }
    }));
}

function buildIncrementalStart(startDate, latestTimestamp, collectionStartAt, overlapMinutes = SYNC_OVERLAP_MINUTES) {
    const candidates = [new Date(startDate)];
    if (latestTimestamp) {
        candidates.push(new Date(new Date(latestTimestamp).getTime() - overlapMinutes * 60 * 1000));
    }
    if (collectionStartAt) candidates.push(new Date(collectionStartAt));

    const validCandidates = candidates.filter(date => !Number.isNaN(date.getTime()));
    if (validCandidates.length === 0) throw new Error(`Invalid incremental start date: ${startDate}`);
    return new Date(Math.max(...validCandidates.map(date => date.getTime()))).toISOString();
}

function readingToParams(logger, record) {
    const {
        timestamp, airTemperature, relativeHumidity, windSpeed,
        windDirection, precipitation, solarRadiation,
        atmosphericPressure, soilTemperature, batteryVoltage,
        windGust, lightningStrikeCount, lightningStrikeDistance,
        xOrientation, yOrientation, humiditySensorTemperature,
        volumetricWaterContent,
        ...rest
    } = record;

    return {
        timestamp,
        params: [
            logger.stationName, logger._id,
            logger.location?.coordinates?.[1], logger.location?.coordinates?.[0],
            timestamp, airTemperature, relativeHumidity, windSpeed, windDirection,
            precipitation, solarRadiation, atmosphericPressure, soilTemperature,
            batteryVoltage, JSON.stringify(rest), windGust, lightningStrikeCount,
            lightningStrikeDistance, xOrientation, yOrientation,
            humiditySensorTemperature, volumetricWaterContent
        ]
    };
}

async function upsertReadingBatch(rows, stationId) {
    if (rows.length === 0) return { count: 0, latestTimestamp: null };
    const columnCount = rows[0].params.length;
    const valuesSql = rows.map((_, rowIndex) => {
        const offset = rowIndex * columnCount;
        return `(${Array.from({ length: columnCount }, (__, columnIndex) => `$${offset + columnIndex + 1}`).join(', ')})`;
    }).join(', ');
    const params = rows.flatMap(row => row.params);

    try {
        await db.query(`
            INSERT INTO weather_readings (
                station_name, station_id, latitude, longitude, timestamp,
                air_temperature, relative_humidity, wind_speed, wind_direction,
                precipitation, solar_radiation, atmospheric_pressure,
                soil_temperature, battery_voltage, metadata,
                wind_gust, lightning_strike_count, lightning_strike_distance,
                x_orientation, y_orientation, humidity_sensor_temperature,
                volumetric_water_content
            ) VALUES ${valuesSql}
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
                metadata = EXCLUDED.metadata
        `, params);
        return { count: rows.length, latestTimestamp: rows.at(-1).timestamp };
    } catch (error) {
        if (rows.length === 1) {
            console.error(`Insert error for ${stationId} at ${rows[0].timestamp}: ${error.message}`);
            return { count: 0, latestTimestamp: null };
        }

        const canIsolateBadRow = String(error.code || '').startsWith('22')
            || ['23502', '23514'].includes(error.code);
        if (!canIsolateBadRow) throw error;

        const midpoint = Math.ceil(rows.length / 2);
        const [left, right] = await Promise.all([
            upsertReadingBatch(rows.slice(0, midpoint), stationId),
            upsertReadingBatch(rows.slice(midpoint), stationId)
        ]);
        const timestamps = [left.latestTimestamp, right.latestTimestamp].filter(Boolean);
        return {
            count: left.count + right.count,
            latestTimestamp: timestamps.sort().at(-1) || null
        };
    }
}

async function upsertReadings(logger, readings) {
    const now = Date.now();
    const rows = readings
        .filter(record => record?.timestamp && new Date(record.timestamp).getTime() <= now)
        .map(record => readingToParams(logger, record))
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let count = 0;
    let latestTimestamp = null;
    for (let index = 0; index < rows.length; index += READING_BATCH_SIZE) {
        const result = await upsertReadingBatch(rows.slice(index, index + READING_BATCH_SIZE), logger._id);
        count += result.count;
        if (result.latestTimestamp && (!latestTimestamp || new Date(result.latestTimestamp) > new Date(latestTimestamp))) {
            latestTimestamp = result.latestTimestamp;
        }
    }
    return { count, latestTimestamp };
}

async function upsertProviderStation(logger, providerName) {
    const { stationId, stationName } = validateStationInput(logger);
    const coordinates = validateCoordinates(
        logger.location?.coordinates?.[1],
        logger.location?.coordinates?.[0]
    );
    const stationParams = [
        stationId,
        stationName,
        coordinates.latitude,
        coordinates.longitude,
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

    const result = await db.query(`
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
        WHERE stations.provider = EXCLUDED.provider
        RETURNING source_timezone, collection_start_at, is_quarantined;
    `, stationParams);

    if (result.rows.length === 0) {
        throw new Error(`Station ID ${stationId} is already owned by another provider.`);
    }
    return result;
}

async function importProviderStations(providerName) {
    const normalizedProvider = String(providerName || '').toUpperCase();
    const providerService = providerServices[normalizedProvider];
    if (!providerService) throw new Error(`Unsupported provider: ${providerName}`);

    const loggersResponse = await providerService.fetchDataLoggers();
    if (!loggersResponse || !Array.isArray(loggersResponse.data)) {
        throw new Error(`Failed to fetch loggers for ${normalizedProvider}`);
    }

    let imported = 0;
    const rejected = [];
    for (const logger of loggersResponse.data) {
        try {
            await upsertProviderStation(logger, normalizedProvider);
            imported += 1;
        } catch (error) {
            rejected.push({ stationId: String(logger?._id || ''), reason: error.message });
            console.error(`Rejected unsafe ${normalizedProvider} station metadata:`, error.message);
        }
    }

    return { count: imported, received: loggersResponse.data.length, rejected };
}

async function geocodeProviderStations(providerName) {
    const normalizedProvider = String(providerName || '').toUpperCase();
    const result = await db.query(
        `SELECT station_id, latitude, longitude
         FROM stations
         WHERE provider = $1
           AND latitude IS NOT NULL
           AND longitude IS NOT NULL
           AND COALESCE(is_quarantined, FALSE) = FALSE
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
 * Main periodic sync function.
 * Uses each station's latest reading with a bounded overlap for corrections.
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
                is_quarantined BOOLEAN DEFAULT FALSE,
                quarantine_reason TEXT,
                quarantined_at TIMESTAMPTZ,
                quarantined_by INTEGER,
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
                ADD COLUMN IF NOT EXISTS last_wis2box_dispatch_error TEXT,
                ADD COLUMN IF NOT EXISTS is_quarantined BOOLEAN DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS quarantine_reason TEXT,
                ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMPTZ,
                ADD COLUMN IF NOT EXISTS quarantined_by INTEGER;
            `);
        } catch (err) { /* ignore */ }

        try {
            await db.query(`
                CREATE TABLE IF NOT EXISTS security_audit_log (
                    id BIGSERIAL PRIMARY KEY,
                    action VARCHAR(100) NOT NULL,
                    user_id INTEGER,
                    username VARCHAR(255),
                    target_type VARCHAR(100),
                    target_id VARCHAR(255),
                    details JSONB NOT NULL DEFAULT '{}'::jsonb,
                    ip_address VARCHAR(100),
                    user_agent TEXT,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                CREATE INDEX IF NOT EXISTS security_audit_log_created_at_idx
                    ON security_audit_log (created_at DESC);
                CREATE INDEX IF NOT EXISTS security_audit_log_target_idx
                    ON security_audit_log (target_type, target_id);
            `);
        } catch (err) {
            console.error('Could not initialize security audit log:', err.message);
        }

        try {
            await db.query(`
                WITH quarantined AS (
                    UPDATE stations
                    SET is_quarantined = TRUE,
                        is_active = FALSE,
                        quarantine_reason = 'Automatically quarantined: unsafe or blank station identity',
                        quarantined_at = NOW(),
                        quarantined_by = NULL,
                        updated_at = NOW()
                    WHERE COALESCE(is_quarantined, FALSE) = FALSE
                      AND (
                          station_id IS NULL
                          OR station_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$'
                          OR station_id LIKE '%..%'
                          OR station_name IS NULL
                          OR BTRIM(station_name) = ''
                          OR POSITION('../' IN station_name) > 0
                          OR POSITION('..' || CHR(92) IN station_name) > 0
                          OR LEFT(station_name, 1) = '/'
                          OR LEFT(station_name, 1) = CHR(92)
                      )
                    RETURNING station_id, station_name, provider, quarantine_reason
                )
                INSERT INTO security_audit_log (
                    action, target_type, target_id, details
                )
                SELECT
                    'station.auto_quarantined',
                    'station',
                    station_id,
                    jsonb_build_object(
                        'stationName', station_name,
                        'provider', provider,
                        'reason', quarantine_reason
                    )
                FROM quarantined;
            `);
        } catch (err) {
            console.error('Could not auto-quarantine unsafe station records:', err.message);
        }

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
            const refreshStations = shouldRefreshProviderMetadata(provider);
            console.log(`Starting incremental data sync for provider: ${provider}...`);
            await syncProviderData(provider, fortyEightHoursAgo, today, {
                incremental: true,
                triggerType: 'automatic',
                refreshStations
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
 * @param {{incremental?: boolean, refreshStations?: boolean, concurrency?: number}} options - provider sync options
 */
const syncProviderData = async (providerName, startDate, endDate, options = {}) => {
    const normalizedProvider = String(providerName || '').toUpperCase();
    const providerService = providerServices[normalizedProvider];
    if (!providerService) throw new Error(`Unsupported provider: ${providerName}`);

    let runId = options.runId || null;
    try {
        if (!runId && options.track !== false) {
            const run = await syncTracker.createSyncRun({
                provider: normalizedProvider,
                triggerType: options.triggerType || 'automatic',
                startDate,
                endDate,
                requestedBy: options.requestedBy
            });
            runId = run.id;
        }
        if (runId) await syncTracker.startRun(runId);

        const refreshStations = options.refreshStations !== false;
        let metadataWasRefreshed = refreshStations;
        let loggers;
        if (refreshStations) {
            const loggersResponse = await providerService.fetchDataLoggers();
            if (!loggersResponse || !Array.isArray(loggersResponse.data)) {
                throw new Error(`Failed to fetch loggers for ${providerName}`);
            }
            loggers = loggersResponse.data;
            providerMetadataRefreshedAt.set(normalizedProvider, Date.now());
        } else {
            loggers = await loadProviderStations(normalizedProvider);
            if (loggers.length === 0) {
                const loggersResponse = await providerService.fetchDataLoggers();
                if (!loggersResponse || !Array.isArray(loggersResponse.data)) {
                    throw new Error(`Failed to fetch loggers for ${providerName}`);
                }
                loggers = loggersResponse.data;
                providerMetadataRefreshedAt.set(normalizedProvider, Date.now());
                metadataWasRefreshed = true;
            }
        }

        let latestReadingsByStation = new Map();
        if (options.incremental && loggers.length > 0) {
            const latestReadings = await db.query(
                `SELECT station_id, MAX(timestamp) AS latest_timestamp
                 FROM weather_readings
                 WHERE station_id = ANY($1::varchar[])
                 GROUP BY station_id`,
                [loggers.map(logger => logger._id)]
            );
            latestReadingsByStation = new Map(
                latestReadings.rows.map(row => [row.station_id, row.latest_timestamp])
            );
        }

        if (runId) await syncTracker.setRunStations(runId, loggers.length);
        console.log(`Found ${loggers.length} loggers for ${normalizedProvider}. Syncing range: ${startDate} to ${endDate}`);

        await mapWithConcurrency(loggers, options.concurrency || SYNC_STATION_CONCURRENCY, async (logger, loggerIndex) => {
            const trackedStationId = String(logger?._id || logger?.sourceStationId || `unknown-${loggerIndex + 1}`);
            if (runId) {
                await syncTracker.startStation(runId, trackedStationId, logger?.stationName);
            }
            try {
                // Metadata is refreshed daily. Incremental runs reuse the stored station state.
                const stationState = logger.cachedStationState
                    || (await upsertProviderStation(logger, normalizedProvider)).rows[0];
                const stationSourceTimezone = stationState?.source_timezone || logger.sourceTimezone;
                const stationCollectionStart = stationState?.collection_start_at || logger.collectionStartAt;

                if (stationState?.is_quarantined) {
                    if (runId) await syncTracker.finishStation(runId, trackedStationId, 'skipped', 'Station is quarantined.');
                    return;
                }
                if (!logger.isActive) {
                    if (runId) await syncTracker.finishStation(runId, trackedStationId, 'skipped', 'Station is inactive.');
                    return;
                }

                let effectiveStartDate = startDate;
                let effectiveEndDate = endDate;

                if (options.incremental) {
                    const latestTimestamp = latestReadingsByStation.get(logger._id);
                    effectiveStartDate = buildIncrementalStart(
                        startDate,
                        latestTimestamp,
                        stationCollectionStart
                    );

                    if (normalizedProvider === 'PULSOWEB') {
                        const localNow = pulsowebService.formatDateInTimezone(
                            new Date(),
                            stationSourceTimezone
                        );
                        const completedLocalHour = `${localNow.slice(0, 13)}:00:00`;
                        effectiveEndDate = pulsowebService.localDateTimeToIso(
                            completedLocalHour,
                            stationSourceTimezone
                        );
                    } else {
                        effectiveEndDate = new Date().toISOString();
                    }
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
                if (runId) await syncTracker.setStationChunks(runId, trackedStationId, 0, timeRanges.length, 0);
                for (let rangeIndex = 0; rangeIndex < timeRanges.length; rangeIndex += 1) {
                    const range = timeRanges[rangeIndex];
                    if (runId) {
                        await syncTracker.setStationChunks(
                            runId, trackedStationId, rangeIndex + 1, timeRanges.length, rangeIndex
                        );
                    }
                    const providerOptions = normalizedProvider === 'PULSOWEB'
                        ? { timezone: stationSourceTimezone }
                        : undefined;
                    const apiResponse = await providerService.fetchWeatherData(
                        range.start,
                        range.end,
                        logger.sourceStationId || logger._id,
                        providerOptions
                    );
                    const readings = apiResponse?.data?.readings;
                    const insertResult = await upsertReadings(logger, readings || []);
                    const processedInRange = insertResult.count;
                    if (insertResult.latestTimestamp && (
                        !latestInsertedTimestamp || new Date(insertResult.latestTimestamp) > new Date(latestInsertedTimestamp)
                    )) {
                        latestInsertedTimestamp = insertResult.latestTimestamp;
                    }
                    if (runId) {
                        await syncTracker.addStationReadings(runId, trackedStationId, processedInRange);
                        await syncTracker.setStationChunks(
                            runId, trackedStationId, rangeIndex + 1, timeRanges.length, rangeIndex + 1
                        );
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
                        const endDateTime = effectiveEndDate.includes('T')
                            ? effectiveEndDate
                            : effectiveEndDate + 'T23:59:59';
                        const dbReadingsResult = await db.query(
                            'SELECT * FROM weather_readings WHERE station_id = $1 AND timestamp >= $2 AND timestamp <= $3',
                            [logger._id, effectiveStartDate, new Date(endDateTime).toISOString()]
                        );
                        if (dbReadingsResult.rows.length > 0) {
                            const { dispatchToWis2box } = require('./services/wis2box.js');
                            await dispatchToWis2box(fullStation, dbReadingsResult.rows);
                        }
                    }
                }
                if (runId) await syncTracker.finishStation(runId, trackedStationId, 'completed');
            } catch (err) {
                console.error(`Error processing logger ${logger._id}: ${err.message}`);
                if (runId) {
                    await syncTracker.finishStation(runId, trackedStationId, 'failed', err.message).catch(trackerError => {
                        console.error(`Could not record sync failure for ${trackedStationId}:`, trackerError.message);
                    });
                }
            }
        });

        let geocoding = { attempted: 0, updated: 0, failed: 0, skipped: true };
        if (metadataWasRefreshed) {
            if (runId) await syncTracker.setRunPhase(runId, 'detecting_locations');
            geocoding = await geocodeProviderStations(normalizedProvider);
            console.log(
                `Location detection for ${normalizedProvider}: ${geocoding.updated} updated, ${geocoding.failed} failed.`
            );
        }
        if (runId) await syncTracker.finishRun(runId);
        return { runId, geocoding };
    } catch (error) {
        console.error(`Sync provider error for ${normalizedProvider}:`, error.message);
        if (runId) await syncTracker.finishRun(runId, error).catch(() => {});
        throw error;
    }
};

if (require.main === module) {
    syncData(true);
}

module.exports = {
    importProviderStations,
    geocodeProviderStations,
    syncData,
    syncProviderData,
    __test: { buildIncrementalStart, mapWithConcurrency, upsertReadings }
};

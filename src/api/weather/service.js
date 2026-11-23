const EARTH_RADIUS_KM = 6371;
const { getParameterDefinition, publicParameterDefinition } = require('./parameters.js');
const { normalizeMeasurement, normalizedSqlExpression } = require('./normalization.js');

const STATE_FILTER_ALIASES = Object.freeze({
    fct: 'Federal Capital Territory'
});

const LGA_FILTER_ALIASES = Object.freeze({
    amac: 'Municipal Area Council'
});

function resolveFilterAlias(value, aliases) {
    if (!value) return value;
    return aliases[String(value).trim().toLowerCase()] || value;
}

function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function integerOrZero(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 0 ? number : 0;
}

function roundedOrNull(value, decimals = 3) {
    const number = numberOrNull(value);
    if (number === null) return null;
    const factor = 10 ** decimals;
    return Math.round((number + Number.EPSILON) * factor) / factor;
}

function mapStation(row) {
    return {
        id: row.station_id,
        name: row.station_name,
        latitude: numberOrNull(row.latitude),
        longitude: numberOrNull(row.longitude),
        country: row.country || null,
        state: row.state || null,
        lga: row.lga || null,
        provider: row.provider || null,
        sourceStationId: row.source_station_id || null,
        active: Boolean(row.is_active),
        lastReadingAt: row.last_reading_at || null,
        distanceKm: numberOrNull(row.distance_km)
    };
}

function mapLatestObservation(row) {
    const measurementNames = [
        'airTemperature',
        'relativeHumidity',
        'windSpeed',
        'windDirection',
        'precipitation',
        'solarRadiation',
        'atmosphericPressure',
        'soilTemperature'
    ];
    const metadata = Object.fromEntries(measurementNames.map(name => {
        const definition = getParameterDefinition(name);
        return [name, {
            unit: definition.unit
        }];
    }));

    return {
        station: mapStation(row),
        observedAt: row.timestamp,
        measurements: {
            airTemperature: normalizeMeasurement('airTemperature', row.air_temperature),
            relativeHumidity: normalizeMeasurement('relativeHumidity', row.relative_humidity),
            windSpeed: normalizeMeasurement('windSpeed', row.wind_speed),
            windDirection: normalizeMeasurement('windDirection', row.wind_direction),
            precipitation: normalizeMeasurement('precipitation', row.precipitation),
            solarRadiation: normalizeMeasurement('solarRadiation', row.solar_radiation),
            atmosphericPressure: normalizeMeasurement('atmosphericPressure', row.atmospheric_pressure),
            soilTemperature: normalizeMeasurement('soilTemperature', row.soil_temperature)
        },
        units: Object.fromEntries(
            Object.entries(metadata).map(([name, item]) => [name, item.unit])
        ),
        measurementMetadata: metadata,
        provenance: {
            provider: row.provider || null,
            sourceStationId: row.source_station_id || null
        }
    };
}

const SUMMARY_VARIABLES = [
    ['airTemperature', 'air_temperature_count'],
    ['relativeHumidity', 'relative_humidity_count'],
    ['precipitation', 'precipitation_count'],
    ['windSpeed', 'wind_speed_count'],
    ['solarRadiation', 'solar_radiation_count'],
    ['soilTemperature', 'soil_temperature_count']
];

function mapObservationSummary(row, station, start, endExclusive) {
    const readingCount = integerOrZero(row.reading_count);
    const variables = Object.fromEntries(SUMMARY_VARIABLES.map(([name, column]) => {
        const availableCount = integerOrZero(row[column]);
        return [name, {
            availableCount,
            missingCount: Math.max(readingCount - availableCount, 0)
        }];
    }));

    return {
        station,
        period: { start, endExclusive },
        summary: {
            airTemperature: {
                minimum: roundedOrNull(row.air_temperature_min),
                maximum: roundedOrNull(row.air_temperature_max),
                average: roundedOrNull(row.air_temperature_avg),
                ...publicParameterDefinition(getParameterDefinition('airTemperature'))
            },
            relativeHumidity: {
                minimum: roundedOrNull(row.relative_humidity_min),
                maximum: roundedOrNull(row.relative_humidity_max),
                average: roundedOrNull(row.relative_humidity_avg),
                ...publicParameterDefinition(getParameterDefinition('relativeHumidity'))
            },
            precipitation: {
                total: roundedOrNull(row.precipitation_total),
                maximum: roundedOrNull(row.precipitation_max),
                average: roundedOrNull(row.precipitation_avg),
                ...publicParameterDefinition(getParameterDefinition('precipitation')),
                aggregation: 'sum-of-observations'
            },
            windSpeed: {
                maximum: roundedOrNull(row.wind_speed_max),
                average: roundedOrNull(row.wind_speed_avg),
                ...publicParameterDefinition(getParameterDefinition('windSpeed'))
            },
            solarRadiation: {
                average: roundedOrNull(row.solar_radiation_avg),
                ...publicParameterDefinition(getParameterDefinition('solarRadiation'))
            },
            soilTemperature: {
                average: roundedOrNull(row.soil_temperature_avg),
                ...publicParameterDefinition(getParameterDefinition('soilTemperature'))
            }
        },
        coverage: {
            readingCount,
            firstObservedAt: row.first_observed_at || null,
            lastObservedAt: row.last_observed_at || null,
            variables
        },
        provenance: {
            provider: station.provider,
            sourceStationId: station.sourceStationId
        }
    };
}

function createWeatherService(db) {
    async function listStations({ provider, state, lga, search, active, limit, offset }) {
        const conditions = ['COALESCE(is_quarantined, FALSE) = FALSE'];
        const params = [];

        function addCondition(sql, value) {
            params.push(value);
            conditions.push(sql.replace('?', `$${params.length}`));
        }

        if (provider) addCondition('UPPER(provider) = UPPER(?)', provider);
        if (state) {
            params.push(resolveFilterAlias(state, STATE_FILTER_ALIASES));
            const placeholder = `$${params.length}`;
            conditions.push(
                `(LOWER(state) = LOWER(${placeholder}) OR LOWER(state) = LOWER(${placeholder} || ' State'))`
            );
        }
        if (lga) addCondition('LOWER(lga) = LOWER(?)', resolveFilterAlias(lga, LGA_FILTER_ALIASES));
        if (active !== null) addCondition('COALESCE(is_active, FALSE) = ?', active);
        if (search) {
            params.push(`%${search}%`);
            const placeholder = `$${params.length}`;
            conditions.push(`(station_id ILIKE ${placeholder} OR station_name ILIKE ${placeholder})`);
        }

        params.push(limit + 1, offset);
        const limitPlaceholder = `$${params.length - 1}`;
        const offsetPlaceholder = `$${params.length}`;
        const result = await db.query(
            `SELECT station_id, station_name, latitude, longitude, country, state, lga,
                    provider, source_station_id, is_active, last_reading_at
             FROM stations
             WHERE ${conditions.join(' AND ')}
             ORDER BY station_name ASC NULLS LAST, station_id ASC
             LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
            params
        );

        const hasMore = result.rows.length > limit;
        const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
        return {
            stations: rows.map(mapStation),
            pagination: {
                limit,
                offset,
                count: rows.length,
                hasMore,
                nextOffset: hasMore ? offset + rows.length : null
            }
        };
    }

    async function findNearestStations({ latitude, longitude, limit, radiusKm }) {
        const result = await db.query(
            `WITH station_distances AS (
                SELECT
                    s.*,
                    $5::double precision * 2 * ASIN(LEAST(1, SQRT(
                        POWER(SIN(RADIANS((s.latitude::double precision - $1) / 2)), 2)
                        + COS(RADIANS($1))
                        * COS(RADIANS(s.latitude::double precision))
                        * POWER(SIN(RADIANS((s.longitude::double precision - $2) / 2)), 2)
                    ))) AS distance_km
                FROM stations s
                WHERE s.latitude IS NOT NULL
                  AND s.longitude IS NOT NULL
                  AND COALESCE(s.is_quarantined, FALSE) = FALSE
                  AND COALESCE(s.is_active, FALSE) = TRUE
            )
            SELECT *
            FROM station_distances
            WHERE distance_km <= $3
            ORDER BY distance_km ASC, station_id ASC
            LIMIT $4`,
            [latitude, longitude, radiusKm, limit, EARTH_RADIUS_KM]
        );
        return result.rows.map(mapStation);
    }

    async function getLatestObservation(stationId) {
        const result = await db.query(
            `SELECT
                s.station_id,
                s.station_name,
                s.latitude,
                s.longitude,
                s.country,
                s.state,
                s.lga,
                s.provider,
                s.source_station_id,
                s.is_active,
                s.last_reading_at,
                wr.timestamp,
                wr.air_temperature,
                wr.relative_humidity,
                wr.wind_speed,
                wr.wind_direction,
                wr.precipitation,
                wr.solar_radiation,
                wr.atmospheric_pressure,
                wr.soil_temperature
             FROM stations s
             JOIN LATERAL (
                SELECT *
                FROM weather_readings
                WHERE station_id = s.station_id
                ORDER BY timestamp DESC
                LIMIT 1
             ) wr ON TRUE
             WHERE s.station_id = $1
               AND COALESCE(s.is_quarantined, FALSE) = FALSE
             LIMIT 1`,
            [stationId]
        );
        return result.rows[0] ? mapLatestObservation(result.rows[0]) : null;
    }

    async function getStationById(stationId) {
        const result = await db.query(
            `SELECT station_id, station_name, latitude, longitude, country, state, lga,
                    provider, source_station_id, is_active, last_reading_at
             FROM stations
             WHERE station_id = $1
               AND COALESCE(is_quarantined, FALSE) = FALSE
             LIMIT 1`,
            [stationId]
        );
        return result.rows[0] ? mapStation(result.rows[0]) : null;
    }

    async function getObservationSummary(station, start, endExclusive) {
        const expression = name => {
            const definition = getParameterDefinition(name);
            return normalizedSqlExpression(name, definition.column);
        };
        const result = await db.query(
            `WITH normalized AS (
                SELECT
                    timestamp,
                    ${expression('airTemperature')} AS air_temperature,
                    ${expression('relativeHumidity')} AS relative_humidity,
                    ${expression('precipitation')} AS precipitation,
                    ${expression('windSpeed')} AS wind_speed,
                    ${expression('solarRadiation')} AS solar_radiation,
                    ${expression('soilTemperature')} AS soil_temperature
                FROM weather_readings
                WHERE station_id = $1
                  AND timestamp >= $2
                  AND timestamp < $3
            )
            SELECT
                COUNT(*) AS reading_count,
                MIN(timestamp) AS first_observed_at,
                MAX(timestamp) AS last_observed_at,
                COUNT(air_temperature) AS air_temperature_count,
                MIN(air_temperature) AS air_temperature_min,
                MAX(air_temperature) AS air_temperature_max,
                AVG(air_temperature) AS air_temperature_avg,
                COUNT(relative_humidity) AS relative_humidity_count,
                MIN(relative_humidity) AS relative_humidity_min,
                MAX(relative_humidity) AS relative_humidity_max,
                AVG(relative_humidity) AS relative_humidity_avg,
                COUNT(precipitation) AS precipitation_count,
                SUM(precipitation) AS precipitation_total,
                MAX(precipitation) AS precipitation_max,
                AVG(precipitation) AS precipitation_avg,
                COUNT(wind_speed) AS wind_speed_count,
                MAX(wind_speed) AS wind_speed_max,
                AVG(wind_speed) AS wind_speed_avg,
                COUNT(solar_radiation) AS solar_radiation_count,
                AVG(solar_radiation) AS solar_radiation_avg,
                COUNT(soil_temperature) AS soil_temperature_count,
                AVG(soil_temperature) AS soil_temperature_avg
             FROM normalized`,
            [station.id, start, endExclusive]
        );
        return mapObservationSummary(result.rows[0] || {}, station, start, endExclusive);
    }

    async function getParameterObservations({
        station,
        parameter,
        start,
        endExclusive,
        order,
        limit,
        offset
    }) {
        // The column and order values come only from server-side allowlists.
        const column = parameter.column;
        const valueExpression = normalizedSqlExpression(parameter.name, column);
        const direction = order === 'desc' ? 'DESC' : 'ASC';
        const result = await db.query(
            `SELECT timestamp, ${valueExpression} AS value
             FROM weather_readings
             WHERE station_id = $1
               AND timestamp >= $2
               AND timestamp < $3
               AND (${valueExpression}) IS NOT NULL
             ORDER BY timestamp ${direction}
             LIMIT $4 OFFSET $5`,
            [station.id, start, endExclusive, limit + 1, offset]
        );

        const hasMore = result.rows.length > limit;
        const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
        return {
            station,
            parameter: publicParameterDefinition(parameter),
            period: { start, endExclusive },
            observations: rows.map(row => ({
                observedAt: row.timestamp,
                value: numberOrNull(row.value)
            })),
            pagination: {
                limit,
                offset,
                count: rows.length,
                hasMore,
                nextOffset: hasMore ? offset + rows.length : null
            },
            provenance: {
                provider: station.provider,
                sourceStationId: station.sourceStationId
            }
        };
    }

    return {
        findNearestStations,
        getLatestObservation,
        getObservationSummary,
        getParameterObservations,
        getStationById,
        listStations
    };
}

module.exports = {
    EARTH_RADIUS_KM,
    createWeatherService,
    mapLatestObservation,
    mapObservationSummary,
    mapStation,
    numberOrNull,
    resolveFilterAlias
};

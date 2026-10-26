const axios = require('axios');
const config = require('../config/index.js');
const db = require('../db/index.js');
const { applyConversionFormula, normalizeInternalField } = require('../utils/variableMappings.js');

const CONTEXT_CACHE_TTL_MS = 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 60 * 1000;
const INTERNAL_STATION_PREFIX = 'PULSOWEB:';

let contextCache = null;

function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || '').replace(/\/+$/, '');
}

function requireConfiguration() {
    if (!config.pulsoweb.baseUrl || !config.pulsoweb.apiToken) {
        throw new Error('PulsoWeb API base URL and token must be configured.');
    }
}

function sanitizeRequestError(error, path) {
    if (error.response) {
        const status = error.response.status;
        const messages = {
            401: 'PulsoWeb rejected the API token.',
            403: 'The PulsoWeb API token does not have permission for this request.',
            404: `The PulsoWeb endpoint /${path}/ was not found. Check the API base URL.`,
            429: 'PulsoWeb rate-limited the request. Please try again later.'
        };
        const safeError = new Error(messages[status] || `PulsoWeb returned HTTP ${status} for /${path}/.`);
        safeError.status = status;
        return safeError;
    }

    if (error.code === 'ECONNABORTED') {
        return new Error(`PulsoWeb timed out while calling /${path}/.`);
    }

    return new Error(`PulsoWeb could not be reached while calling /${path}/.`);
}

async function post(path, payload = {}, options = {}) {
    requireConfiguration();

    const retries = options.retries ?? 1;
    const url = `${normalizeBaseUrl(config.pulsoweb.baseUrl)}/${path}/`;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
            const response = await axios.post(url, {
                key: config.pulsoweb.apiToken,
                ...payload
            }, {
                timeout: options.timeout ?? REQUEST_TIMEOUT_MS,
                headers: { 'Content-Type': 'application/json' }
            });

            return response.data;
        } catch (error) {
            const status = error.response?.status;
            const retryable = !status || status === 429 || status >= 500;
            if (!retryable || attempt === retries) throw sanitizeRequestError(error, path);
            await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
        }
    }

    throw new Error(`PulsoWeb request to /${path}/ failed.`);
}

function validateContext(context) {
    if (!context || typeof context !== 'object' || Array.isArray(context) || !Array.isArray(context.stations)) {
        throw new Error('PulsoWeb returned an invalid context response.');
    }

    return {
        ...context,
        stations: context.stations,
        observations: Array.isArray(context.observations) ? context.observations : [],
        granularities: Array.isArray(context.granularities) ? context.granularities : []
    };
}

async function fetchContext(options = {}) {
    const cacheKey = `${normalizeBaseUrl(config.pulsoweb.baseUrl)}:${config.pulsoweb.apiToken || ''}`;
    const now = Date.now();

    if (!options.force && contextCache && contextCache.key === cacheKey && contextCache.expiresAt > now) {
        return contextCache.value;
    }

    const context = validateContext(await post('get_context', {}, {
        retries: options.retries,
        timeout: options.timeout
    }));

    if (!options.skipCache) {
        contextCache = { key: cacheKey, value: context, expiresAt: now + CONTEXT_CACHE_TTL_MS };
    }

    return context;
}

function clearContextCache() {
    contextCache = null;
}

function getCoordinate(station, key) {
    const candidates = [
        station?.[key],
        station?.coordinates?.[key],
        station?.location?.[key]
    ];

    for (const candidate of candidates) {
        if (candidate === null || candidate === undefined || candidate === '') continue;
        const numericValue = Number(candidate);
        if (Number.isFinite(numericValue)) return numericValue;
    }

    return null;
}

async function fetchDataLoggers() {
    const context = await fetchContext();

    return {
        success: true,
        data: context.stations
            .filter(station => station && station.code !== undefined && station.code !== null)
            .map(station => {
                const sourceStationId = String(station.code);
                let latitude = getCoordinate(station, 'latitude');
                let longitude = getCoordinate(station, 'longitude');

                // PulsoWeb uses 0,0 when a station has no configured location.
                if (latitude === 0 && longitude === 0) {
                    latitude = null;
                    longitude = null;
                }

                return {
                    _id: `${INTERNAL_STATION_PREFIX}${sourceStationId}`,
                    sourceStationId,
                    sourceTimezone: station.timezone || config.pulsoweb.defaultTimezone,
                    collectionStartAt: null,
                    stationName: station.name || `PulsoWeb ${sourceStationId}`,
                    location: {
                        type: 'Point',
                        coordinates: [longitude, latitude],
                        country: station.country || null
                    },
                    dataLoggerModel: 'PULSONIC',
                    organization: { name: 'PULSONIC' },
                    lastReading: null,
                    isActive: true,
                    provider: 'PULSOWEB'
                };
            })
    };
}

function formatDateInTimezone(date, timezone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    });
    const parts = Object.fromEntries(
        formatter.formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value])
    );

    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

function toPulsoDateTime(value, endOfDay = false, timezone = config.pulsoweb.defaultTimezone) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return `${value}T${endOfDay ? '23:59:59' : '00:00:00'}`;
    }

    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) {
        return value;
    }

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid PulsoWeb collection date: ${value}`);
    return formatDateInTimezone(date, timezone);
}

function getTimezoneOffsetMs(date, timezone) {
    const formatted = formatDateInTimezone(date, timezone);
    const match = formatted.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
    const representedAsUtc = Date.UTC(
        Number(match[1]), Number(match[2]) - 1, Number(match[3]),
        Number(match[4]), Number(match[5]), Number(match[6])
    );
    return representedAsUtc - date.getTime();
}

function localDateTimeToIso(value, timezone = config.pulsoweb.defaultTimezone) {
    if (value instanceof Date) return value.toISOString();
    if (typeof value !== 'string') throw new Error('PulsoWeb returned a reading without a valid date.');

    if (/Z$|[+\-]\d{2}:?\d{2}$/.test(value)) {
        const absoluteDate = new Date(value);
        if (Number.isNaN(absoluteDate.getTime())) throw new Error(`Invalid PulsoWeb reading date: ${value}`);
        return absoluteDate.toISOString();
    }

    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    if (!match) throw new Error(`Invalid PulsoWeb reading date: ${value}`);

    const localAsUtc = Date.UTC(
        Number(match[1]), Number(match[2]) - 1, Number(match[3]),
        Number(match[4]), Number(match[5]), Number(match[6])
    );
    let candidate = new Date(localAsUtc);
    candidate = new Date(localAsUtc - getTimezoneOffsetMs(candidate, timezone));
    // A second pass handles offset changes around daylight-saving boundaries.
    candidate = new Date(localAsUtc - getTimezoneOffsetMs(candidate, timezone));
    return candidate.toISOString();
}

async function getActiveMappings() {
    const result = await db.query(
        `SELECT external_key, internal_field, conversion_formula
         FROM provider_mappings
         WHERE provider = 'PULSOWEB' AND is_active = true
         ORDER BY external_key`
    );

    if (result.rows.length === 0) {
        throw new Error('No active PulsoWeb variable mappings are configured.');
    }

    return result.rows;
}

function transformObservationData(response, mappings, timezone) {
    if (!response || typeof response !== 'object' || Array.isArray(response)) {
        throw new Error('PulsoWeb returned an invalid observation response.');
    }

    const mappingsByCode = new Map(mappings.map(mapping => [String(mapping.external_key), mapping]));
    const recordsByTimestamp = new Map();

    for (const [observationCode, items] of Object.entries(response)) {
        const mapping = mappingsByCode.get(String(observationCode));
        if (!mapping || !Array.isArray(items)) continue;

        for (const item of items) {
            if (!item || item.date === undefined) continue;
            const timestamp = localDateTimeToIso(item.date, timezone);
            if (!recordsByTimestamp.has(timestamp)) recordsByTimestamp.set(timestamp, { timestamp });

            const field = normalizeInternalField(mapping.internal_field);
            const convertedValue = applyConversionFormula(item.value, mapping.conversion_formula);
            recordsByTimestamp.get(timestamp)[field] = field === 'solarRadiation' && Number.isFinite(Number(convertedValue))
                ? Math.round(Number(convertedValue))
                : convertedValue;
        }
    }

    return Array.from(recordsByTimestamp.values()).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

async function fetchWeatherData(startDate, endDate, sourceStationId, options = {}) {
    if (!sourceStationId) throw new Error('PulsoWeb station ID is required.');

    const timezone = options.timezone || config.pulsoweb.defaultTimezone;
    const mappings = await getActiveMappings();
    const observations = mappings.map(mapping => String(mapping.external_key));
    const response = await post('get_data', {
        station: Number.isNaN(Number(sourceStationId)) ? sourceStationId : Number(sourceStationId),
        observations,
        from: toPulsoDateTime(startDate, false, timezone),
        to: toPulsoDateTime(endDate, true, timezone)
    });

    return {
        success: true,
        data: {
            stationName: String(sourceStationId),
            readings: transformObservationData(response, mappings, timezone)
        }
    };
}

module.exports = {
    clearContextCache,
    fetchContext,
    fetchDataLoggers,
    fetchWeatherData,
    formatDateInTimezone,
    localDateTimeToIso,
    toPulsoDateTime,
    transformObservationData
};

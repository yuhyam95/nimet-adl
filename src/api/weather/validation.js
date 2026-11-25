class RequestValidationError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'RequestValidationError';
        this.code = 'INVALID_REQUEST';
        this.details = details;
    }
}

function scalarQueryValue(value, name) {
    if (Array.isArray(value)) {
        throw new RequestValidationError(`${name} must be provided once.`, { field: name });
    }
    return value;
}

function requiredNumber(value, name, minimum, maximum) {
    const scalar = scalarQueryValue(value, name);
    if (scalar === undefined || scalar === null || String(scalar).trim() === '') {
        throw new RequestValidationError(`${name} is required.`, { field: name });
    }

    const number = Number(scalar);
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
        throw new RequestValidationError(
            `${name} must be a number between ${minimum} and ${maximum}.`,
            { field: name, minimum, maximum }
        );
    }
    return number;
}

function optionalInteger(value, name, fallback, minimum, maximum) {
    const scalar = scalarQueryValue(value, name);
    if (scalar === undefined || scalar === null || String(scalar).trim() === '') return fallback;

    const number = Number(scalar);
    if (!Number.isInteger(number) || number < minimum || number > maximum) {
        throw new RequestValidationError(
            `${name} must be an integer between ${minimum} and ${maximum}.`,
            { field: name, minimum, maximum }
        );
    }
    return number;
}

function optionalNumber(value, name, fallback, minimum, maximum) {
    const scalar = scalarQueryValue(value, name);
    if (scalar === undefined || scalar === null || String(scalar).trim() === '') return fallback;

    const number = Number(scalar);
    if (!Number.isFinite(number) || number < minimum || number > maximum) {
        throw new RequestValidationError(
            `${name} must be a number between ${minimum} and ${maximum}.`,
            { field: name, minimum, maximum }
        );
    }
    return number;
}

function optionalString(value, name, maximumLength) {
    const scalar = scalarQueryValue(value, name);
    if (scalar === undefined || scalar === null || String(scalar).trim() === '') return null;
    if (typeof scalar !== 'string') {
        throw new RequestValidationError(`${name} must be a string.`, { field: name });
    }
    const text = scalar.trim();
    if (text.length > maximumLength) {
        throw new RequestValidationError(
            `${name} must not exceed ${maximumLength} characters.`,
            { field: name, maximumLength }
        );
    }
    return text;
}

function optionalBoolean(value, name) {
    const scalar = scalarQueryValue(value, name);
    if (scalar === undefined || scalar === null || scalar === '') return null;
    if (scalar === true || scalar === 'true') return true;
    if (scalar === false || scalar === 'false') return false;
    throw new RequestValidationError(`${name} must be true or false.`, {
        field: name,
        allowed: [true, false]
    });
}

function requiredStationId(value) {
    const scalar = scalarQueryValue(value, 'stationId');
    if (typeof scalar !== 'string' || !scalar.trim()) {
        throw new RequestValidationError('stationId is required.', { field: 'stationId' });
    }

    const stationId = scalar.trim();
    if (stationId.length > 255) {
        throw new RequestValidationError('stationId must not exceed 255 characters.', {
            field: 'stationId',
            maximumLength: 255
        });
    }
    return stationId;
}

function optionalStationId(value) {
    if (value === undefined || value === null || value === '') return null;
    return requiredStationId(value);
}

function parseDateBoundary(value, name, endOfDate = false) {
    const scalar = scalarQueryValue(value, name);
    if (typeof scalar !== 'string' || !scalar.trim()) {
        throw new RequestValidationError(`${name} is required.`, { field: name });
    }

    const text = scalar.trim();
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
    const date = new Date(dateOnly ? `${text}T00:00:00.000Z` : text);
    const invalidCalendarDate = dateOnly
        && !Number.isNaN(date.getTime())
        && date.toISOString().slice(0, 10) !== text;
    if (Number.isNaN(date.getTime()) || invalidCalendarDate) {
        throw new RequestValidationError(
            `${name} must be an ISO 8601 date or timestamp.`,
            { field: name }
        );
    }
    if (dateOnly && endOfDate) date.setUTCDate(date.getUTCDate() + 1);
    return date;
}

function parseNearestStationQuery(query) {
    return {
        latitude: requiredNumber(query.latitude, 'latitude', -90, 90),
        longitude: requiredNumber(query.longitude, 'longitude', -180, 180),
        limit: optionalInteger(query.limit, 'limit', 1, 1, 10),
        radiusKm: optionalNumber(query.radiusKm, 'radiusKm', 100, 1, 500)
    };
}

function parseStationsQuery(query) {
    return {
        provider: optionalString(query.provider, 'provider', 50),
        state: optionalString(query.state, 'state', 255),
        lga: optionalString(query.lga, 'lga', 255),
        search: optionalString(query.search, 'search', 100),
        active: optionalBoolean(query.active, 'active'),
        limit: optionalInteger(query.limit, 'limit', 100, 1, 500),
        offset: optionalInteger(query.offset, 'offset', 0, 0, 1000000)
    };
}

function parseObservationSummaryQuery(query) {
    const stationId = optionalStationId(query.stationId);
    const hasLatitude = query.latitude !== undefined && query.latitude !== '';
    const hasLongitude = query.longitude !== undefined && query.longitude !== '';

    if (stationId && (hasLatitude || hasLongitude)) {
        throw new RequestValidationError(
            'Use stationId or latitude and longitude, not both.',
            { fields: ['stationId', 'latitude', 'longitude'] }
        );
    }
    if (!stationId && (!hasLatitude || !hasLongitude)) {
        throw new RequestValidationError(
            'Provide stationId or both latitude and longitude.',
            { fields: ['stationId', 'latitude', 'longitude'] }
        );
    }

    const start = parseDateBoundary(query.start, 'start');
    const end = parseDateBoundary(query.end, 'end', true);
    if (start >= end) {
        throw new RequestValidationError('start must be earlier than end.', {
            fields: ['start', 'end']
        });
    }

    const rangeDays = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    if (rangeDays > 366) {
        throw new RequestValidationError('The requested period must not exceed 366 days.', {
            fields: ['start', 'end'],
            maximumDays: 366
        });
    }

    const parsed = {
        stationId,
        start: start.toISOString(),
        endExclusive: end.toISOString()
    };
    if (!stationId) {
        parsed.latitude = requiredNumber(query.latitude, 'latitude', -90, 90);
        parsed.longitude = requiredNumber(query.longitude, 'longitude', -180, 180);
        parsed.radiusKm = optionalNumber(query.radiusKm, 'radiusKm', 100, 1, 500);
    }
    return parsed;
}

function parseParameterObservationsQuery(query) {
    const parsed = parseObservationSummaryQuery(query);
    const orderValue = scalarQueryValue(query.order, 'order');
    const order = orderValue === undefined || orderValue === null || orderValue === ''
        ? 'asc'
        : String(orderValue).trim().toLowerCase();
    if (!['asc', 'desc'].includes(order)) {
        throw new RequestValidationError('order must be asc or desc.', {
            field: 'order',
            allowed: ['asc', 'desc']
        });
    }

    return {
        ...parsed,
        order,
        limit: optionalInteger(query.limit, 'limit', 100, 1, 1000),
        offset: optionalInteger(query.offset, 'offset', 0, 0, 1000000)
    };
}

module.exports = {
    RequestValidationError,
    parseNearestStationQuery,
    parseObservationSummaryQuery,
    parseParameterObservationsQuery,
    parseStationsQuery,
    requiredStationId
};

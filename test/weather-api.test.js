const test = require('node:test');
const assert = require('node:assert/strict');

const {
    RequestValidationError,
    parseNearestStationQuery,
    parseObservationSummaryQuery,
    parseParameterObservationsQuery,
    parseStationsQuery,
    requiredStationId
} = require('../src/api/weather/validation.js');
const {
    createWeatherService,
    mapLatestObservation,
    mapObservationSummary,
    numberOrNull
} = require('../src/api/weather/service.js');
const { createWeatherRouter } = require('../src/api/weather/routes.js');
const {
    createWeatherAccessMiddleware,
    hashApiKey,
    parseApiKeyHashes
} = require('../src/api/weather/auth.js');
const { getParameterDefinition, listParameters } = require('../src/api/weather/parameters.js');
const { normalizeMeasurement, normalizedSqlExpression } = require('../src/api/weather/normalization.js');
const { createWeatherDocsRouter, loadOpenApiDocument } = require('../src/api/weather/swagger.js');
const SwaggerParser = require('@apidevtools/swagger-parser');

function mockResponse() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };
}

test('nearest-station query applies safe defaults', () => {
    assert.deepEqual(
        parseNearestStationQuery({ latitude: '9.0765', longitude: '7.3986' }),
        { latitude: 9.0765, longitude: 7.3986, limit: 1, radiusKm: 100 }
    );
});

test('station catalogue query applies defaults and normalizes filters', () => {
    assert.deepEqual(parseStationsQuery({}), {
        provider: null,
        state: null,
        lga: null,
        search: null,
        active: null,
        limit: 100,
        offset: 0
    });
    assert.deepEqual(parseStationsQuery({
        provider: ' TAHMO ',
        state: 'FCT',
        lga: 'AMAC',
        search: 'Abuja',
        active: 'true',
        limit: '50',
        offset: '100'
    }), {
        provider: 'TAHMO',
        state: 'FCT',
        lga: 'AMAC',
        search: 'Abuja',
        active: true,
        limit: 50,
        offset: 100
    });
    assert.throws(
        () => parseStationsQuery({ active: 'yes' }),
        error => error instanceof RequestValidationError && error.details.field === 'active'
    );
});

test('nearest-station query rejects invalid coordinates and limits', () => {
    assert.throws(
        () => parseNearestStationQuery({ latitude: '91', longitude: '7', limit: '50' }),
        error => error instanceof RequestValidationError && error.details.field === 'latitude'
    );
    assert.throws(
        () => parseNearestStationQuery({ latitude: '9', longitude: '7', limit: '50' }),
        error => error instanceof RequestValidationError && error.details.field === 'limit'
    );
});

test('station ID validation trims valid IDs and rejects missing IDs', () => {
    assert.equal(requiredStationId('  TAHMO:ABUJA  '), 'TAHMO:ABUJA');
    assert.throws(() => requiredStationId(''), RequestValidationError);
});

test('summary query accepts coordinates and treats an end date as inclusive', () => {
    assert.deepEqual(
        parseObservationSummaryQuery({
            latitude: '9.0765',
            longitude: '7.3986',
            start: '2026-11-10',
            end: '2026-11-17'
        }),
        {
            stationId: null,
            latitude: 9.0765,
            longitude: 7.3986,
            radiusKm: 100,
            start: '2026-11-10T00:00:00.000Z',
            endExclusive: '2026-11-18T00:00:00.000Z'
        }
    );
});

test('summary query rejects ambiguous locations and oversized periods', () => {
    assert.throws(
        () => parseObservationSummaryQuery({
            stationId: 'ABUJA-1',
            latitude: '9',
            longitude: '7',
            start: '2026-11-10',
            end: '2026-11-17'
        }),
        RequestValidationError
    );
    assert.throws(
        () => parseObservationSummaryQuery({
            stationId: 'ABUJA-1',
            start: '2025-01-01',
            end: '2026-11-17'
        }),
        error => error instanceof RequestValidationError && error.details.maximumDays === 366
    );
    assert.throws(
        () => parseObservationSummaryQuery({
            stationId: 'ABUJA-1',
            start: '2026-02-30',
            end: '2026-03-02'
        }),
        error => error instanceof RequestValidationError && error.details.field === 'start'
    );
});

test('parameter query validates pagination and ordering', () => {
    assert.deepEqual(
        parseParameterObservationsQuery({
            stationId: 'ABUJA-1',
            start: '2026-11-10',
            end: '2026-11-17',
            order: 'DESC',
            limit: '250',
            offset: '500'
        }),
        {
            stationId: 'ABUJA-1',
            start: '2026-11-10T00:00:00.000Z',
            endExclusive: '2026-11-18T00:00:00.000Z',
            order: 'desc',
            limit: 250,
            offset: 500
        }
    );
    assert.throws(
        () => parseParameterObservationsQuery({
            stationId: 'ABUJA-1',
            start: '2026-11-10',
            end: '2026-11-17',
            order: 'sideways'
        }),
        error => error instanceof RequestValidationError && error.details.field === 'order'
    );
});

test('parameter catalogue resolves canonical names and common aliases', () => {
    assert.equal(getParameterDefinition('airTemperature').column, 'air_temperature');
    assert.equal(getParameterDefinition('temperature').name, 'airTemperature');
    assert.equal(getParameterDefinition('pressure').name, 'atmosphericPressure');
    assert.equal(getParameterDefinition('rainfall').name, 'precipitation');
    assert.equal(getParameterDefinition('not_a_database_column'), null);
    assert.equal(listParameters().length, 19);
    assert.equal(getParameterDefinition('humidity').unit, 'percent');
    assert.equal(getParameterDefinition('pressure').unit, 'hPa');
    assert.equal(getParameterDefinition('soilmoisture').exposed, false);
    assert.equal(listParameters().some(item => item.name === 'volumetricWaterContent'), false);
});

test('normalization converts mixed scales and rejects invalid values', () => {
    assert.equal(normalizeMeasurement('relativeHumidity', 0.75), 75);
    assert.equal(normalizeMeasurement('relativeHumidity', 75), 75);
    assert.equal(normalizeMeasurement('relativeHumidity', 110), null);
    assert.equal(normalizeMeasurement('atmosphericPressure', 98.4), 984);
    assert.equal(normalizeMeasurement('atmosphericPressure', 1008), 1008);
    assert.equal(normalizeMeasurement('airTemperature', -9999), null);
    assert.match(
        normalizedSqlExpression('atmosphericPressure', 'atmospheric_pressure'),
        /atmospheric_pressure \* 10/
    );
});

test('numeric database values are normalized without converting null to zero', () => {
    assert.equal(numberOrNull('28.4'), 28.4);
    assert.equal(numberOrNull(null), null);
    assert.equal(numberOrNull('not-a-number'), null);
});

test('nearest-station service uses parameterized distance inputs', async () => {
    const calls = [];
    const db = {
        async query(text, params) {
            calls.push({ text, params });
            return {
                rows: [{
                    station_id: 'ABUJA-1',
                    station_name: 'Abuja',
                    latitude: '9.07',
                    longitude: '7.39',
                    is_active: true,
                    distance_km: '2.5'
                }]
            };
        }
    };

    const service = createWeatherService(db);
    const stations = await service.findNearestStations({
        latitude: 9.0765,
        longitude: 7.3986,
        limit: 2,
        radiusKm: 50
    });

    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].params.slice(0, 4), [9.0765, 7.3986, 50, 2]);
    assert.match(calls[0].text, /COALESCE\(s\.is_quarantined, FALSE\) = FALSE/);
    assert.equal(stations[0].distanceKm, 2.5);
});

test('station catalogue service parameterizes filters and paginates', async () => {
    const calls = [];
    const db = {
        async query(text, params) {
            calls.push({ text, params });
            return {
                rows: [
                    { station_id: 'A', station_name: 'Abuja A', provider: 'TAHMO', is_active: true },
                    { station_id: 'B', station_name: 'Abuja B', provider: 'TAHMO', is_active: true },
                    { station_id: 'C', station_name: 'Abuja C', provider: 'TAHMO', is_active: true }
                ]
            };
        }
    };
    const service = createWeatherService(db);
    const result = await service.listStations({
        provider: 'TAHMO',
        state: 'FCT',
        lga: null,
        search: 'Abuja',
        active: true,
        limit: 2,
        offset: 10
    });

    assert.match(calls[0].text, /UPPER\(provider\) = UPPER\(\$1\)/);
    assert.match(calls[0].text, /LOWER\(state\) = LOWER\(\$2 \|\| ' State'\)/);
    assert.match(calls[0].text, /station_name ILIKE \$4/);
    assert.deepEqual(calls[0].params, [
        'TAHMO',
        'Federal Capital Territory',
        true,
        '%Abuja%',
        3,
        10
    ]);
    assert.equal(result.stations.length, 2);
    assert.equal(result.pagination.hasMore, true);
    assert.equal(result.pagination.nextOffset, 12);
});

test('station catalogue recognizes state and LGA naming aliases', async () => {
    const calls = [];
    const db = {
        async query(text, params) {
            calls.push({ text, params });
            return { rows: [] };
        }
    };
    const service = createWeatherService(db);
    await service.listStations({
        provider: null,
        state: 'Kano',
        lga: 'AMAC',
        search: null,
        active: null,
        limit: 100,
        offset: 0
    });

    assert.deepEqual(calls[0].params, ['Kano', 'Municipal Area Council', 101, 0]);
    assert.match(calls[0].text, /LOWER\(state\) = LOWER\(\$1 \|\| ' State'\)/);
    assert.match(calls[0].text, /LOWER\(lga\) = LOWER\(\$2\)/);
});

test('latest observation exposes normalized measurements and provenance', () => {
    const observation = mapLatestObservation({
        station_id: 'ABUJA-1',
        station_name: 'Abuja',
        latitude: '9.07',
        longitude: '7.39',
        provider: 'TAHMO',
        source_station_id: 'TA001',
        is_active: true,
        timestamp: '2026-11-17T09:00:00.000Z',
        air_temperature: '28.4',
        relative_humidity: '70',
        atmospheric_pressure: '98.4',
        precipitation: null
    });

    assert.equal(observation.measurements.airTemperature, 28.4);
    assert.equal(observation.measurements.atmosphericPressure, 984);
    assert.equal(observation.measurements.precipitation, null);
    assert.equal(observation.measurementMetadata.airTemperature.unit, 'degC');
    assert.equal(observation.measurementMetadata.relativeHumidity.unit, 'percent');
    assert.equal(observation.measurementMetadata.atmosphericPressure.unit, 'hPa');
    assert.deepEqual(observation.provenance, {
        provider: 'TAHMO',
        sourceStationId: 'TA001'
    });
});

test('observation summary reports aggregates and missing-value coverage', () => {
    const summary = mapObservationSummary({
        reading_count: '10',
        first_observed_at: '2026-11-10T00:00:00.000Z',
        last_observed_at: '2026-11-17T23:00:00.000Z',
        air_temperature_count: '10',
        air_temperature_min: '20.1256',
        air_temperature_max: '31.1',
        air_temperature_avg: '26.55555',
        relative_humidity_count: '8',
        precipitation_count: '9',
        precipitation_total: '42.3499',
        wind_speed_count: '10'
    }, {
        id: 'ABUJA-1',
        provider: 'TAHMO',
        sourceStationId: 'TA001'
    }, '2026-11-10T00:00:00.000Z', '2026-11-18T00:00:00.000Z');

    assert.equal(summary.summary.airTemperature.average, 26.556);
    assert.equal(summary.summary.precipitation.total, 42.35);
    assert.deepEqual(summary.coverage.variables.relativeHumidity, {
        availableCount: 8,
        missingCount: 2
    });
    assert.equal(summary.provenance.provider, 'TAHMO');
});

test('parameter observations use an allowlisted column and cursor-like pagination', async () => {
    const calls = [];
    const db = {
        async query(text, params) {
            calls.push({ text, params });
            return {
                rows: [
                    { timestamp: '2026-11-10T00:00:00.000Z', value: '28.1' },
                    { timestamp: '2026-11-10T01:00:00.000Z', value: '28.4' },
                    { timestamp: '2026-11-10T02:00:00.000Z', value: '28.8' }
                ]
            };
        }
    };
    const service = createWeatherService(db);
    const result = await service.getParameterObservations({
        station: { id: 'ABUJA-1', provider: 'TAHMO', sourceStationId: 'TA001' },
        parameter: getParameterDefinition('temperature'),
        start: '2026-11-10T00:00:00.000Z',
        endExclusive: '2026-11-11T00:00:00.000Z',
        order: 'asc',
        limit: 2,
        offset: 0
    });

    assert.match(calls[0].text, /CASE WHEN air_temperature BETWEEN -90 AND 60/);
    assert.deepEqual(calls[0].params, [
        'ABUJA-1',
        '2026-11-10T00:00:00.000Z',
        '2026-11-11T00:00:00.000Z',
        3,
        0
    ]);
    assert.equal(result.parameter.name, 'airTemperature');
    assert.equal(result.observations.length, 2);
    assert.equal(result.pagination.hasMore, true);
    assert.equal(result.pagination.nextOffset, 2);
});

test('versioned router keeps health public and data endpoints protected', () => {
    const db = { query: async () => ({ rows: [] }) };
    const authorize = (req, res, next) => next();
    const router = createWeatherRouter({ db, authorize });
    const routes = Object.fromEntries(
        router.stack
            .filter(layer => layer.route)
            .map(layer => [layer.route.path, layer.route.stack.length])
    );

    assert.equal(routes['/health'], 1);
    assert.equal(routes['/parameters'], 2);
    assert.equal(routes['/stations'], 2);
    assert.equal(routes['/stations/nearest'], 2);
    assert.equal(routes['/observations/latest'], 2);
    assert.equal(routes['/observations/summary'], 2);
    assert.equal(routes['/parameters/:parameter/observations'], 2);
});

test('unverified parameters are rejected before querying the database', async () => {
    const db = {
        async query() {
            assert.fail('An unavailable parameter must not reach the database.');
        }
    };
    const router = createWeatherRouter({ db, authorize: (req, res, next) => next() });
    const route = router.stack.find(layer => (
        layer.route?.path === '/parameters/:parameter/observations'
    ));
    const handler = route.route.stack.at(-1).handle;
    const response = mockResponse();

    await handler({ params: { parameter: 'soilmoisture' }, query: {} }, response);

    assert.equal(response.statusCode, 422);
    assert.deepEqual(response.body, {
        success: false,
        error: {
            code: 'PARAMETER_NOT_AVAILABLE',
            message: 'This parameter is not available through the normalized weather API.'
        }
    });
});

test('OpenAPI document is valid and covers every weather API route', async () => {
    const document = loadOpenApiDocument();
    await SwaggerParser.validate(document);

    const router = createWeatherRouter({
        db: { query: async () => ({ rows: [] }) },
        authorize: (req, res, next) => next()
    });
    const implementedPaths = router.stack
        .filter(layer => layer.route)
        .map(layer => `/weather/v1${layer.route.path}`.replace(/:([A-Za-z0-9_]+)/g, '{$1}'))
        .sort();
    const documentedPaths = Object.keys(document.paths).sort();

    assert.deepEqual(documentedPaths, implementedPaths);
    assert.equal(document.components.securitySchemes.ApiKeyAuth.name, 'X-API-Key');
    assert.deepEqual(document.paths['/weather/v1/health'].get.security, []);
});

test('weather documentation router exposes Swagger UI and the raw specification', () => {
    const router = createWeatherDocsRouter();
    const rawSpecRoute = router.stack.find(layer => layer.route?.path === '/openapi.yaml');

    assert.ok(rawSpecRoute);
    assert.ok(router.stack.length > 1);
});

test('weather access accepts a configured service API key', () => {
    const apiKey = 'farmcast.test-secret';
    const middleware = createWeatherAccessMiddleware({
        apiKeyHashes: `farmcast:${hashApiKey(apiKey)}`
    });
    const request = { headers: { 'x-api-key': apiKey } };
    const response = mockResponse();
    let continued = false;

    middleware(request, response, () => { continued = true; });

    assert.equal(continued, true);
    assert.deepEqual(request.apiClient, { type: 'service', id: 'farmcast' });
});

test('weather access preserves authorized staff bearer tokens', () => {
    const middleware = createWeatherAccessMiddleware({
        tokenVerifier: token => token === 'valid-token'
            ? { id: 4, username: 'viewer', role: 'Data Viewer' }
            : null
    });
    const request = { headers: { authorization: 'Bearer valid-token' } };
    const response = mockResponse();
    let continued = false;

    middleware(request, response, () => { continued = true; });

    assert.equal(continued, true);
    assert.equal(request.apiClient.type, 'user');
});

test('weather access rejects invalid API keys without exposing configuration', () => {
    const middleware = createWeatherAccessMiddleware({
        apiKeyHashes: `farmcast:${hashApiKey('farmcast.correct-secret')}`
    });
    const request = { headers: { 'x-api-key': 'farmcast.wrong-secret' } };
    const response = mockResponse();

    middleware(request, response, () => assert.fail('Invalid key must not continue.'));

    assert.equal(response.statusCode, 401);
    assert.equal(response.body.error.code, 'INVALID_API_KEY');
});

test('malformed weather API key configuration entries are ignored', () => {
    const validDigest = hashApiKey('farmcast.secret');
    const parsed = parseApiKeyHashes(`bad,also-bad:nope,farmcast:${validDigest}`);
    assert.equal(parsed.size, 1);
    assert.equal(parsed.get('farmcast'), validDigest);
});

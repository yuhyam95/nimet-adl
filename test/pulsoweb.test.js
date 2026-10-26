const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const {
    clearContextCache,
    fetchContext,
    fetchDataLoggers,
    localDateTimeToIso,
    toPulsoDateTime,
    transformObservationData
} = require('../src/services/pulsoweb.js');

test('uses the PulsoWeb POST protocol and creates collision-safe station IDs', async () => {
    const originalPost = axios.post;
    const originalBaseUrl = process.env.PULSOWEB_API_BASE_URL;
    const originalToken = process.env.PULSOWEB_API_TOKEN;
    process.env.PULSOWEB_API_BASE_URL = 'https://pulso.example/rest/';
    process.env.PULSOWEB_API_TOKEN = 'test-token';
    clearContextCache();

    let capturedRequest;
    axios.post = async (url, body, options) => {
        capturedRequest = { url, body, options };
        return {
            data: {
                stations: [{
                    code: 1234,
                    name: 'Niamey',
                    coordinates: { latitude: 13.5116, longitude: 2.1254 },
                    observations: ['32000']
                }],
                observations: [{ code: '32000', granularity: 32, unit: '°C' }],
                granularities: [{ code: 32, label: 'Hourly' }]
            }
        };
    };

    try {
        await fetchContext({ force: true });
        const stations = await fetchDataLoggers();

        assert.equal(capturedRequest.url, 'https://pulso.example/rest/get_context/');
        assert.deepEqual(capturedRequest.body, { key: 'test-token' });
        assert.equal(stations.data[0]._id, 'PULSOWEB:1234');
        assert.equal(stations.data[0].sourceStationId, '1234');
        assert.deepEqual(stations.data[0].location.coordinates, [2.1254, 13.5116]);
    } finally {
        axios.post = originalPost;
        clearContextCache();
        if (originalBaseUrl === undefined) delete process.env.PULSOWEB_API_BASE_URL;
        else process.env.PULSOWEB_API_BASE_URL = originalBaseUrl;
        if (originalToken === undefined) delete process.env.PULSOWEB_API_TOKEN;
        else process.env.PULSOWEB_API_TOKEN = originalToken;
    }
});

test('formats date-only PulsoWeb collection boundaries', () => {
    assert.equal(toPulsoDateTime('2026-10-25', false), '2026-10-25T00:00:00');
    assert.equal(toPulsoDateTime('2026-10-25', true), '2026-10-25T23:59:59');
});

test('converts PulsoWeb local timestamps to UTC', () => {
    assert.equal(localDateTimeToIso('2026-10-25T10:00:00', 'Africa/Lagos'), '2026-10-25T09:00:00.000Z');
});

test('pivots observation series into one mapped record per timestamp', () => {
    const response = {
        32000: [
            { date: '2026-10-25T10:00:00', value: 20 },
            { date: '2026-10-25T11:00:00', value: 21 }
        ],
        32001: [
            { date: '2026-10-25T10:00:00', value: 0.62 }
        ]
    };
    const mappings = [
        { external_key: '32000', internal_field: 'air_temperature', conversion_formula: null },
        { external_key: '32001', internal_field: 'relativeHumidity', conversion_formula: 'x * 100' }
    ];

    assert.deepEqual(transformObservationData(response, mappings, 'Africa/Lagos'), [
        { timestamp: '2026-10-25T09:00:00.000Z', airTemperature: 20, relativeHumidity: 62 },
        { timestamp: '2026-10-25T10:00:00.000Z', airTemperature: 21 }
    ]);
});

test('rounds converted PulsoWeb solar radiation to a whole number', () => {
    const response = {
        32219: [{ date: '2026-10-25T10:00:00', value: 12345 }]
    };
    const mappings = [
        { external_key: '32219', internal_field: 'solarRadiation', conversion_formula: 'x / 3600' }
    ];

    assert.deepEqual(transformObservationData(response, mappings, 'Africa/Lagos'), [
        { timestamp: '2026-10-25T09:00:00.000Z', solarRadiation: 3 }
    ]);
});

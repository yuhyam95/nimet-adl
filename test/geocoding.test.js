const test = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const { reverseGeocode } = require('../src/services/geocoding.js');

test('maps Nominatim state and county to State and LGA', async () => {
    const originalGet = axios.get;
    let capturedRequest;
    axios.get = async (url, options) => {
        capturedRequest = { url, options };
        return {
            data: {
                address: {
                    county: 'Wase',
                    state: 'Plateau',
                    country: 'Nigeria'
                }
            }
        };
    };

    try {
        const result = await reverseGeocode(9.17047, 10.09719);
        assert.equal(capturedRequest.url, 'https://nominatim.openstreetmap.org/reverse');
        assert.equal(capturedRequest.options.params.zoom, 10);
        assert.match(capturedRequest.options.headers['User-Agent'], /NiMet-ADL/);
        assert.equal(result.state, 'Plateau');
        assert.equal(result.lga, 'Wase');
        assert.equal(result.country, 'Nigeria');
    } finally {
        axios.get = originalGet;
    }
});

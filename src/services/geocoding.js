const axios = require('axios');

const DEFAULT_BASE_URL = 'https://nominatim.openstreetmap.org';
const MIN_REQUEST_INTERVAL_MS = 1100;
let lastRequestAt = 0;

function getConfiguration() {
    return {
        baseUrl: String(process.env.GEOCODING_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ''),
        userAgent: process.env.GEOCODING_USER_AGENT || 'NiMet-ADL/1.0 (station administration)'
    };
}

async function respectRateLimit() {
    const waitMs = MIN_REQUEST_INTERVAL_MS - (Date.now() - lastRequestAt);
    if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
    lastRequestAt = Date.now();
}

async function reverseGeocode(latitude, longitude) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
        !Number.isFinite(lon) || lon < -180 || lon > 180) {
        throw new Error('Valid latitude and longitude are required for reverse geocoding.');
    }

    const { baseUrl, userAgent } = getConfiguration();
    await respectRateLimit();

    const response = await axios.get(`${baseUrl}/reverse`, {
        params: {
            format: 'jsonv2',
            lat,
            lon,
            zoom: 10,
            addressdetails: 1,
            layer: 'address'
        },
        headers: {
            'User-Agent': userAgent,
            'Accept-Language': 'en'
        },
        timeout: 15000
    });

    const address = response.data?.address || {};
    const state = address.state || address.region || null;
    const lga = address.county || address.state_district || address.municipality || address.city_district || null;

    if (!state && !lga) {
        throw new Error('No State or LGA could be identified for these coordinates.');
    }

    return {
        state,
        lga,
        country: address.country || null,
        attribution: 'Data © OpenStreetMap contributors, ODbL 1.0'
    };
}

module.exports = { reverseGeocode };

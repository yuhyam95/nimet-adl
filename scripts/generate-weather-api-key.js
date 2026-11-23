const crypto = require('crypto');
const { CLIENT_ID_PATTERN, hashApiKey } = require('../src/api/weather/auth.js');

const clientId = String(process.argv[2] || '').trim();
if (!CLIENT_ID_PATTERN.test(clientId)) {
    console.error('Usage: npm run generate-weather-api-key -- <client-id>');
    console.error('Client IDs must be 2-64 letters, numbers, underscores, or hyphens.');
    process.exit(1);
}

const apiKey = `${clientId}.${crypto.randomBytes(32).toString('base64url')}`;
const digest = hashApiKey(apiKey);

console.log('Store this API key securely; it will not be shown again:');
console.log(apiKey);
console.log('\nAdd this entry to WEATHER_API_KEY_HASHES:');
console.log(`${clientId}:${digest}`);

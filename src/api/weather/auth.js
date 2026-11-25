const crypto = require('crypto');

const READ_ROLES = ['Admin', 'Data Manager', 'Data Viewer'];
const CLIENT_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/i;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/i;

function hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey, 'utf8').digest('hex');
}

function parseApiKeyHashes(value = '') {
    const clients = new Map();
    for (const entry of String(value).split(',')) {
        const trimmed = entry.trim();
        if (!trimmed) continue;
        const separator = trimmed.indexOf(':');
        if (separator < 1) continue;

        const clientId = trimmed.slice(0, separator).trim();
        const digest = trimmed.slice(separator + 1).trim().toLowerCase();
        if (!CLIENT_ID_PATTERN.test(clientId) || !SHA256_HEX_PATTERN.test(digest)) continue;
        clients.set(clientId, digest);
    }
    return clients;
}

function secureDigestEqual(actual, expected) {
    const actualBuffer = Buffer.from(actual, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    return actualBuffer.length === expectedBuffer.length
        && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function sendAuthError(res, status, code, message) {
    return res.status(status).json({
        success: false,
        error: { code, message }
    });
}

function defaultTokenVerifier(token) {
    return require('../../utils/auth.js').verifyToken(token);
}

function createWeatherAccessMiddleware({
    apiKeyHashes = process.env.WEATHER_API_KEY_HASHES,
    tokenVerifier = defaultTokenVerifier,
    readRoles = READ_ROLES
} = {}) {
    const configuredClients = parseApiKeyHashes(apiKeyHashes);

    return (req, res, next) => {
        const authorization = req.headers.authorization;
        if (authorization?.startsWith('Bearer ')) {
            const token = authorization.slice('Bearer '.length).trim();
            const decoded = token ? tokenVerifier(token) : null;
            if (!decoded) {
                return sendAuthError(res, 401, 'INVALID_TOKEN', 'The bearer token is invalid or expired.');
            }
            if (!readRoles.includes(decoded.role)) {
                return sendAuthError(res, 403, 'INSUFFICIENT_ROLE', 'This user cannot access weather data.');
            }
            req.user = decoded;
            req.apiClient = {
                type: 'user',
                id: String(decoded.id || decoded.username || 'unknown')
            };
            return next();
        }

        const providedKey = req.headers['x-api-key'];
        if (typeof providedKey === 'string' && providedKey) {
            const separator = providedKey.indexOf('.');
            const clientId = separator > 0 ? providedKey.slice(0, separator) : '';
            const expectedDigest = configuredClients.get(clientId);
            const actualDigest = hashApiKey(providedKey);

            if (!expectedDigest || !secureDigestEqual(actualDigest, expectedDigest)) {
                return sendAuthError(res, 401, 'INVALID_API_KEY', 'The API key is invalid.');
            }
            req.apiClient = { type: 'service', id: clientId };
            return next();
        }

        return sendAuthError(
            res,
            401,
            'AUTHENTICATION_REQUIRED',
            'Provide a bearer token or an X-API-Key header.'
        );
    };
}

module.exports = {
    CLIENT_ID_PATTERN,
    READ_ROLES,
    createWeatherAccessMiddleware,
    hashApiKey,
    parseApiKeyHashes
};

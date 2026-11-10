const STATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const PATH_TRAVERSAL = /(^|[\\/])\.\.([\\/]|$)/;

function validateStationId(value) {
    const stationId = String(value ?? '').trim();
    if (!stationId) throw new Error('station_id is required.');
    if (!STATION_ID_PATTERN.test(stationId) || stationId.includes('..')) {
        throw new Error('station_id may only contain letters, numbers, dots, underscores, colons, and hyphens, and cannot contain path traversal sequences.');
    }
    return stationId;
}

function validateStationName(value, fallbackStationId = null) {
    const stationName = String(value ?? '').trim() || (fallbackStationId ? String(fallbackStationId) : '');
    if (!stationName) throw new Error('station_name is required.');
    if (stationName.length > 255) throw new Error('station_name cannot exceed 255 characters.');
    if (CONTROL_CHARACTERS.test(stationName) || PATH_TRAVERSAL.test(stationName) || /^[\\/]/.test(stationName)) {
        throw new Error('station_name contains unsafe path or control characters.');
    }
    return stationName;
}

function validateStationInput(station, options = {}) {
    const stationId = validateStationId(station?.station_id ?? station?._id);
    const stationName = validateStationName(
        station?.station_name ?? station?.stationName,
        options.allowNameFallback ? stationId : null
    );
    return { stationId, stationName };
}

function validateCoordinates(latitude, longitude) {
    const hasLatitude = latitude !== null && latitude !== undefined && String(latitude).trim() !== '';
    const hasLongitude = longitude !== null && longitude !== undefined && String(longitude).trim() !== '';
    if (!hasLatitude && !hasLongitude) return { latitude: null, longitude: null };
    if (!hasLatitude || !hasLongitude) throw new Error('latitude and longitude must be provided together.');

    const safeLatitude = Number(latitude);
    const safeLongitude = Number(longitude);
    if (!Number.isFinite(safeLatitude) || safeLatitude < -90 || safeLatitude > 90) {
        throw new Error('latitude must be a number between -90 and 90.');
    }
    if (!Number.isFinite(safeLongitude) || safeLongitude < -180 || safeLongitude > 180) {
        throw new Error('longitude must be a number between -180 and 180.');
    }
    return { latitude: safeLatitude, longitude: safeLongitude };
}

function validateFtpFilename(value) {
    const filename = String(value ?? '').trim();
    if (!filename || filename.length > 255 || CONTROL_CHARACTERS.test(filename)) {
        throw new Error('FTP filename is missing or invalid.');
    }
    if (filename !== require('path').basename(filename) || PATH_TRAVERSAL.test(filename)) {
        throw new Error('FTP filename contains a path traversal sequence.');
    }
    if (!filename.toLowerCase().endsWith('.csv')) throw new Error('FTP file must use the .csv extension.');
    return filename;
}

module.exports = {
    validateStationId,
    validateStationName,
    validateStationInput,
    validateCoordinates,
    validateFtpFilename
};

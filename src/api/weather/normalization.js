function finiteNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function within(value, minimum, maximum) {
    return value >= minimum && value <= maximum ? value : null;
}

function normalizeMeasurement(name, rawValue) {
    const value = finiteNumber(rawValue);
    if (value === null || value === -9999) return null;

    switch (name) {
        case 'airTemperature':
            return within(value, -90, 60);
        case 'relativeHumidity': {
            if (value < 0) return null;
            const percent = value <= 1.2 ? value * 100 : value;
            return within(percent, 0, 100);
        }
        case 'windSpeed':
        case 'windGust':
            return within(value, 0, 100);
        case 'northWindSpeed':
        case 'eastWindSpeed':
            return within(value, -100, 100);
        case 'windDirection':
            return within(value, 0, 360);
        case 'precipitation':
            return within(value, 0, 2000);
        case 'solarRadiation':
            return within(value, 0, 2000);
        case 'atmosphericPressure':
            if (value >= 50 && value <= 120) return value * 10;
            return within(value, 500, 1200);
        case 'soilTemperature':
        case 'humiditySensorTemperature':
            return within(value, -50, 80);
        case 'panelTemperature':
            return within(value, -50, 100);
        case 'batteryVoltage':
            return within(value, 0, 30);
        case 'lightningStrikeCount':
            return within(value, 0, 65535);
        case 'lightningStrikeDistance':
            return within(value, 0, 100);
        case 'vaporPressure':
            return within(value, 0, 50);
        case 'xOrientation':
        case 'yOrientation':
            return within(value, -180, 180);
        default:
            return null;
    }
}

function normalizedSqlExpression(name, column) {
    switch (name) {
        case 'airTemperature':
            return `CASE WHEN ${column} BETWEEN -90 AND 60 THEN ${column} END`;
        case 'relativeHumidity':
            return `CASE
                WHEN ${column} BETWEEN 0 AND 1.2 AND ${column} * 100 <= 100 THEN ${column} * 100
                WHEN ${column} > 1.2 AND ${column} <= 100 THEN ${column}
            END`;
        case 'windSpeed':
        case 'windGust':
            return `CASE WHEN ${column} BETWEEN 0 AND 100 THEN ${column} END`;
        case 'northWindSpeed':
        case 'eastWindSpeed':
            return `CASE WHEN ${column} BETWEEN -100 AND 100 THEN ${column} END`;
        case 'windDirection':
            return `CASE WHEN ${column} BETWEEN 0 AND 360 THEN ${column} END`;
        case 'precipitation':
            return `CASE WHEN ${column} BETWEEN 0 AND 2000 THEN ${column} END`;
        case 'solarRadiation':
            return `CASE WHEN ${column} BETWEEN 0 AND 2000 THEN ${column} END`;
        case 'atmosphericPressure':
            return `CASE
                WHEN ${column} BETWEEN 50 AND 120 THEN ${column} * 10
                WHEN ${column} BETWEEN 500 AND 1200 THEN ${column}
            END`;
        case 'soilTemperature':
        case 'humiditySensorTemperature':
            return `CASE WHEN ${column} BETWEEN -50 AND 80 THEN ${column} END`;
        case 'panelTemperature':
            return `CASE WHEN ${column} BETWEEN -50 AND 100 THEN ${column} END`;
        case 'batteryVoltage':
            return `CASE WHEN ${column} BETWEEN 0 AND 30 THEN ${column} END`;
        case 'lightningStrikeCount':
            return `CASE WHEN ${column} BETWEEN 0 AND 65535 THEN ${column} END`;
        case 'lightningStrikeDistance':
            return `CASE WHEN ${column} BETWEEN 0 AND 100 THEN ${column} END`;
        case 'vaporPressure':
            return `CASE WHEN ${column} BETWEEN 0 AND 50 THEN ${column} END`;
        case 'xOrientation':
        case 'yOrientation':
            return `CASE WHEN ${column} BETWEEN -180 AND 180 THEN ${column} END`;
        default:
            throw new Error(`No public normalization rule for ${name}.`);
    }
}

module.exports = { finiteNumber, normalizeMeasurement, normalizedSqlExpression };

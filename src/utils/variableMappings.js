const INTERNAL_FIELD_ALIASES = {
    air_temperature: 'airTemperature',
    relative_humidity: 'relativeHumidity',
    wind_speed: 'windSpeed',
    wind_direction: 'windDirection',
    precipitation: 'precipitation',
    solar_radiation: 'solarRadiation',
    atmospheric_pressure: 'atmosphericPressure',
    soil_temperature: 'soilTemperature',
    battery_voltage: 'batteryVoltage',
    wind_gust: 'windGust',
    lightning_strike_count: 'lightningStrikeCount',
    lightning_strike_distance: 'lightningStrikeDistance',
    x_orientation: 'xOrientation',
    y_orientation: 'yOrientation',
    humidity_sensor_temperature: 'humiditySensorTemperature',
    volumetric_water_content: 'volumetricWaterContent'
};

function normalizeInternalField(field) {
    return INTERNAL_FIELD_ALIASES[field] || field;
}

/**
 * Applies deliberately small, auditable conversion expressions such as
 * `x / 1000`, `x * 9 / 5 + 32`, or `x - 273.15` without evaluating code.
 */
function applyConversionFormula(value, formula) {
    if (!formula || value === null || value === undefined) return value;

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return value;

    const expression = formula.trim();
    if (expression === 'x') return numericValue;

    const match = expression.match(/^x((?:\s*[+\-*/]\s*-?(?:\d+(?:\.\d+)?|\.\d+))+)?$/);
    if (!match) {
        throw new Error(`Unsupported conversion formula: ${formula}`);
    }

    const operations = match[1] || '';
    const tokenPattern = /([+\-*/])\s*(-?(?:\d+(?:\.\d+)?|\.\d+))/g;
    let sum = 0;
    let term = numericValue;
    let token;

    while ((token = tokenPattern.exec(operations)) !== null) {
        const operator = token[1];
        const operand = Number(token[2]);

        if (operator === '+') {
            sum += term;
            term = operand;
        } else if (operator === '-') {
            sum += term;
            term = -operand;
        } else if (operator === '*') term *= operand;
        else if (operator === '/') {
            if (operand === 0) throw new Error('Conversion formula cannot divide by zero.');
            term /= operand;
        }
    }

    return sum + term;
}

module.exports = { applyConversionFormula, normalizeInternalField };

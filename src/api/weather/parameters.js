const PARAMETER_DEFINITIONS = Object.freeze([
    { name: 'airTemperature', column: 'air_temperature', label: 'Air temperature', unit: 'degC', exposed: true, aliases: ['temperature', 'temp'] },
    { name: 'relativeHumidity', column: 'relative_humidity', label: 'Relative humidity', unit: 'percent', exposed: true, aliases: ['humidity'] },
    { name: 'windSpeed', column: 'wind_speed', label: 'Wind speed', unit: 'm/s', exposed: true, aliases: ['windspeed'] },
    { name: 'windDirection', column: 'wind_direction', label: 'Wind direction', unit: 'degree', exposed: true, aliases: ['winddirection'] },
    { name: 'precipitation', column: 'precipitation', label: 'Precipitation', unit: 'mm', exposed: true, aliases: ['rain', 'rainfall'] },
    { name: 'solarRadiation', column: 'solar_radiation', label: 'Solar radiation', unit: 'W/m2', exposed: true, aliases: ['radiation'] },
    { name: 'atmosphericPressure', column: 'atmospheric_pressure', label: 'Atmospheric pressure', unit: 'hPa', exposed: true, aliases: ['pressure'] },
    { name: 'soilTemperature', column: 'soil_temperature', label: 'Soil temperature', unit: 'degC', exposed: true, aliases: ['soiltemp'] },
    { name: 'batteryVoltage', column: 'battery_voltage', label: 'Battery voltage', unit: 'V', exposed: true, aliases: ['battery'] },
    { name: 'windGust', column: 'wind_gust', label: 'Wind gust', unit: 'm/s', exposed: true, aliases: ['gust'] },
    { name: 'lightningStrikeCount', column: 'lightning_strike_count', label: 'Lightning strike count', unit: 'count', exposed: true, aliases: ['lightningcount'] },
    { name: 'lightningStrikeDistance', column: 'lightning_strike_distance', label: 'Lightning strike distance', unit: 'km', exposed: true, aliases: ['lightningdistance'] },
    { name: 'vaporPressure', column: 'vapor_pressure', label: 'Vapor pressure', unit: 'kPa', exposed: true, aliases: ['vapourpressure'] },
    { name: 'humiditySensorTemperature', column: 'humidity_sensor_temperature', label: 'Humidity sensor temperature', unit: 'degC', exposed: true, aliases: ['humiditysensortemp'] },
    { name: 'xOrientation', column: 'x_orientation', label: 'X orientation', unit: 'degree', exposed: true, aliases: [] },
    { name: 'yOrientation', column: 'y_orientation', label: 'Y orientation', unit: 'degree', exposed: true, aliases: [] },
    { name: 'atomsGen2', column: 'atoms_gen2', label: 'ATMOS Gen 2 value', unit: null, exposed: false, aliases: ['atmosgen2'] },
    { name: 'northWindSpeed', column: 'north_wind_speed', label: 'Northward wind speed', unit: 'm/s', exposed: true, aliases: [] },
    { name: 'eastWindSpeed', column: 'east_wind_speed', label: 'Eastward wind speed', unit: 'm/s', exposed: true, aliases: [] },
    { name: 'soilElectricalConductivity', column: 'soil_electrical_conductivity', label: 'Soil electrical conductivity', unit: null, exposed: false, aliases: ['soilec'] },
    { name: 'soilPh', column: 'soil_ph', label: 'Soil pH', unit: null, exposed: false, aliases: ['ph'] },
    { name: 'panelTemperature', column: 'panel_temperature', label: 'Panel temperature', unit: 'degC', exposed: true, aliases: ['paneltemp'] },
    { name: 'volumetricWaterContent', column: 'volumetric_water_content', label: 'Volumetric water content', unit: null, exposed: false, aliases: ['soilmoisture', 'vwc'] }
]);

function normalizeParameterName(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

const PARAMETER_LOOKUP = new Map();
for (const definition of PARAMETER_DEFINITIONS) {
    PARAMETER_LOOKUP.set(normalizeParameterName(definition.name), definition);
    for (const alias of definition.aliases) {
        PARAMETER_LOOKUP.set(normalizeParameterName(alias), definition);
    }
}

function getParameterDefinition(value) {
    return PARAMETER_LOOKUP.get(normalizeParameterName(value)) || null;
}

function publicParameterDefinition(definition) {
    return {
        name: definition.name,
        label: definition.label,
        unit: definition.unit,
        aliases: [...definition.aliases]
    };
}

function listParameters() {
    return PARAMETER_DEFINITIONS.filter(definition => definition.exposed).map(publicParameterDefinition);
}

module.exports = {
    getParameterDefinition,
    listParameters,
    normalizeParameterName,
    publicParameterDefinition
};

const PARAMETER_DEFINITIONS = Object.freeze([
    { name: 'airTemperature', column: 'air_temperature', label: 'Air temperature', unit: 'degC', unitStatus: 'validated', aliases: ['temperature', 'temp'] },
    { name: 'relativeHumidity', column: 'relative_humidity', label: 'Relative humidity', unit: null, unitStatus: 'mixed', unitNote: 'Historical records mix fractional and percentage scales; provider-aware normalization is required.', aliases: ['humidity'] },
    { name: 'windSpeed', column: 'wind_speed', label: 'Wind speed', unit: 'm/s', unitStatus: 'validated', aliases: ['windspeed'] },
    { name: 'windDirection', column: 'wind_direction', label: 'Wind direction', unit: 'degree', unitStatus: 'validated', aliases: ['winddirection'] },
    { name: 'precipitation', column: 'precipitation', label: 'Precipitation', unit: 'mm', unitStatus: 'validated', aliases: ['rain', 'rainfall'] },
    { name: 'solarRadiation', column: 'solar_radiation', label: 'Solar radiation', unit: 'W/m2', unitStatus: 'validated', unitNote: 'PulsoWeb hourly J/m2 values are converted by dividing by 3600.', aliases: ['radiation'] },
    { name: 'atmosphericPressure', column: 'atmospheric_pressure', label: 'Atmospheric pressure', unit: null, unitStatus: 'mixed', unitNote: 'TAHMO and some CLIMDES records are kPa while BARANI and WAGTECH records use an hPa-like scale.', aliases: ['pressure'] },
    { name: 'soilTemperature', column: 'soil_temperature', label: 'Soil temperature', unit: 'degC', unitStatus: 'validated', aliases: ['soiltemp'] },
    { name: 'batteryVoltage', column: 'battery_voltage', label: 'Battery voltage', unit: 'V', unitStatus: 'validated', aliases: ['battery'] },
    { name: 'windGust', column: 'wind_gust', label: 'Wind gust', unit: 'm/s', unitStatus: 'validated', aliases: ['gust'] },
    { name: 'lightningStrikeCount', column: 'lightning_strike_count', label: 'Lightning strike count', unit: 'count', unitStatus: 'validated', aliases: ['lightningcount'] },
    { name: 'lightningStrikeDistance', column: 'lightning_strike_distance', label: 'Lightning strike distance', unit: 'km', unitStatus: 'validated', aliases: ['lightningdistance'] },
    { name: 'vaporPressure', column: 'vapor_pressure', label: 'Vapor pressure', unit: 'kPa', unitStatus: 'validated', aliases: ['vapourpressure'] },
    { name: 'humiditySensorTemperature', column: 'humidity_sensor_temperature', label: 'Humidity sensor temperature', unit: 'degC', unitStatus: 'validated', aliases: ['humiditysensortemp'] },
    { name: 'xOrientation', column: 'x_orientation', label: 'X orientation', unit: 'degree', unitStatus: 'validated', aliases: [] },
    { name: 'yOrientation', column: 'y_orientation', label: 'Y orientation', unit: 'degree', unitStatus: 'validated', aliases: [] },
    { name: 'atomsGen2', column: 'atoms_gen2', label: 'ATMOS Gen 2 value', unit: null, unitStatus: 'unverified', aliases: ['atmosgen2'] },
    { name: 'northWindSpeed', column: 'north_wind_speed', label: 'Northward wind speed', unit: 'm/s', unitStatus: 'validated', aliases: [] },
    { name: 'eastWindSpeed', column: 'east_wind_speed', label: 'Eastward wind speed', unit: 'm/s', unitStatus: 'validated', aliases: [] },
    { name: 'soilElectricalConductivity', column: 'soil_electrical_conductivity', label: 'Soil electrical conductivity', unit: null, unitStatus: 'unverified', unitNote: 'The CLIMDES feed does not expose a unit contract for this field.', aliases: ['soilec'] },
    { name: 'soilPh', column: 'soil_ph', label: 'Soil pH', unit: null, unitStatus: 'unverified', unitNote: 'Current stored values are placeholders and do not establish a usable unit contract.', aliases: ['ph'] },
    { name: 'panelTemperature', column: 'panel_temperature', label: 'Panel temperature', unit: 'degC', unitStatus: 'validated', aliases: ['paneltemp'] },
    { name: 'volumetricWaterContent', column: 'volumetric_water_content', label: 'Volumetric water content', unit: null, unitStatus: 'unverified', unitNote: 'Stored values contain incompatible and invalid ranges; do not treat them as percent until normalized.', aliases: ['soilmoisture', 'vwc'] }
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
        unitStatus: definition.unitStatus,
        unitNote: definition.unitNote || null,
        aliases: [...definition.aliases]
    };
}

function listParameters() {
    return PARAMETER_DEFINITIONS.map(publicParameterDefinition);
}

module.exports = {
    getParameterDefinition,
    listParameters,
    normalizeParameterName,
    publicParameterDefinition
};

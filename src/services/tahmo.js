const axios = require('axios');
const config = require('../config/index.js');

module.exports = {
    fetchDataLoggers: async () => {
        try {
            const auth = Buffer.from(`${config.tahmo.apiKey}:${config.tahmo.apiSecret}`).toString('base64');
            const response = await axios.get(`${config.tahmo.baseUrl}/assets/v2/stations`, {
                headers: { 'Authorization': `Basic ${auth}` }
            });

            // Standardize the response to match CLIMDES format where possible
            // TAHMO might return stations differently
            return {
                success: true,
                data: response.data.data.map(station => ({
                    _id: station.code,
                    stationName: station.location.name,
                    location: {
                        type: 'Point',
                        coordinates: [station.location.longitude, station.location.latitude],
                        country: station.location.countrycode || 'NG',
                        city: station.location.city,
                        state: station.location.state
                    },
                    dataLoggerModel: 'TAHMO',
                    organization: { name: station.location.type || 'TAHMO' },
                    lastReading: null, // Basic station metadata doesn't include last reading
                    isActive: station.status === 1,
                    provider: 'TAHMO'
                }))
            };
        } catch (error) {
            console.error('Error fetching TAHMO data loggers:', error.message);
            throw error;
        }
    },

    fetchWeatherData: async (startDate, endDate, stationId, collection = 'raw') => {
        try {
            const auth = Buffer.from(`${config.tahmo.apiKey}:${config.tahmo.apiSecret}`).toString('base64');
            
            // TAHMO v2 expects ISO8601 timestamps. If only dates are provided, append time.
            let start = startDate;
            let end = endDate;
            if (startDate.length === 10) start = `${startDate}T00:00:00Z`;
            if (endDate.length === 10) end = `${endDate}T23:59:59Z`;

            // TAHMO v2 measurements endpoint:
            // {{baseURL}}/measurements/v2/stations/[stationCode]/measurements/[collection]
            const url = `${config.tahmo.baseUrl}/measurements/v2/stations/${stationId}/measurements/${collection}`;
            
            console.log(`Fetching TAHMO data from: ${url}?start=${start}&end=${end}`);

            const response = await axios.get(url, {
                params: {
                    start: start,
                    end: end
                },
                headers: { 'Authorization': `Basic ${auth}` }
            });

            // Search for the data block (columns and values) anywhere in the response
            let dataSeries = null;
            const search = (obj) => {
                if (!obj || dataSeries) return;
                if (obj.columns && obj.values && Array.isArray(obj.values) && obj.values.length > 0) {
                    dataSeries = obj;
                    return;
                }
                if (Array.isArray(obj)) {
                    obj.forEach(search);
                } else if (typeof obj === 'object') {
                    Object.values(obj).forEach(search);
                }
            };
            search(response.data);
            
            if (!dataSeries) {
                console.log(`No valid measurement series found for station ${stationId}`);
                return { success: true, data: { stationName: stationId, readings: [] } };
            }

            const { columns, values } = dataSeries;
            const timeIdx = columns.indexOf('time');
            const variableIdx = columns.indexOf('variable');
            const valueIdx = columns.indexOf('value');

            if (timeIdx === -1 || variableIdx === -1 || valueIdx === -1) {
                console.error(`Incomplete columns in TAHMO response: ${columns}`);
                return { success: true, data: { stationName: stationId, readings: [] } };
            }

            // Pivot the data: group multiple rows (one per variable) into a single object per timestamp
            const groupedByTime = {};

            // Dynamic Mapping from the database
            const db = require('../db/index.js');
            const mappingResult = await db.query(
                "SELECT external_key, internal_field, conversion_formula FROM provider_mappings WHERE provider = 'TAHMO' AND is_active = true"
            );
            
            const mappings = {};
            mappingResult.rows.forEach(row => {
                mappings[row.external_key] = {
                    field: row.internal_field,
                    formula: row.conversion_formula
                };
            });

            values.forEach(row => {
                const timestamp = row[timeIdx];
                const variable = row[variableIdx];
                const value = row[valueIdx];

                if (!groupedByTime[timestamp]) {
                    groupedByTime[timestamp] = { timestamp };
                }

                const mapping = mappings[variable];
                const internalField = mapping ? mapping.field : variable;
                
                let finalValue = value;
                if (mapping && mapping.formula) {
                    try {
                        // Simple and safe evaluation for "x / 1000" style formulas
                        if (mapping.formula === 'x / 1000') {
                            finalValue = value / 1000;
                        } else if (mapping.formula.includes('x')) {
                            // Basic support for other simple formulas if needed
                            // Note: In a production environment, use a proper math parser
                            const formula = mapping.formula.replace(/x/g, value);
                            finalValue = eval(formula); 
                        }
                    } catch (e) {
                        console.error(`Error applying formula ${mapping.formula} to value ${value}:`, e.message);
                    }
                }
                
                groupedByTime[timestamp][internalField] = finalValue;
            });

            const readings = Object.values(groupedByTime);
            console.log(`Success! Fixed and parsed ${readings.length} weather readings for ${stationId}`);

            return {
                success: true,
                data: {
                    stationName: stationId,
                    dataLoggerId: stationId,
                    readings: readings
                }
            };
        } catch (error) {
            const status = error.response ? error.response.status : 'unknown';
            const data = error.response ? JSON.stringify(error.response.data) : '';
            console.error(`Error fetching TAHMO weather data for ${stationId} (${status}): ${error.message} - ${data}`);
            throw error;
        }
    }
};

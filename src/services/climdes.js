const axios = require('axios');
const config = require('../config/index.js');

module.exports = {
    fetchDataLoggers: async () => {
        try {
            const loginUrl = `${config.api.baseUrl}${config.api.loginEndpoint}`;
            const authResponse = await axios.post(loginUrl, {
                email: config.api.email,
                password: config.api.password
            });
            const token = authResponse.data.data?.token;

            if (!token) throw new Error('Failed to retrieve token for logger fetch');

            const loggersUrl = `${config.api.baseUrl}${config.api.loggersEndpoint}`;
            const response = await axios.get(loggersUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            // Add provider to each logger
            const loggers = response.data.data.map(logger => ({
                ...logger,
                provider: 'CLIMDES'
            }));

            return { success: true, data: loggers };
        } catch (error) {
            console.error('Error fetching CLIMDES data loggers:', error.message);
            throw error;
        }
    },

    fetchWeatherData: async (startDate, endDate, dataLoggerId = null) => {
        try {
            const loginUrl = `${config.api.baseUrl}${config.api.loginEndpoint}`;
            const authResponse = await axios.post(loginUrl, {
                email: config.api.email,
                password: config.api.password
            });

            const token = authResponse.data.data?.token;

            if (!token) {
                throw new Error('Failed to retrieve authentication token');
            }

            const loggerId = dataLoggerId || config.api.dataLoggerId;
            if (!loggerId) {
                throw new Error('DataLogger ID is required');
            }

            const weatherUrl = `${config.api.baseUrl}/api/v1/datalogger/${loggerId}/json`;
            const weatherResponse = await axios.get(weatherUrl, {
                params: { startDate, endDate },
                headers: { 'Authorization': `Bearer ${token}` }
            });

            // Standardize output and apply dynamic mappings
            const db = require('../db/index.js');
            const mappingResult = await db.query(
                "SELECT external_key, internal_field, conversion_formula FROM provider_mappings WHERE provider = 'CLIMDES' AND is_active = true"
            );
            
            const mappings = {};
            mappingResult.rows.forEach(row => {
                mappings[row.external_key] = {
                    field: row.internal_field,
                    formula: row.conversion_formula
                };
            });

            const rawReadings = weatherResponse.data.data?.readings || [];
            const mappedReadings = rawReadings.map(reading => {
                const mapped = { timestamp: reading.timestamp };
                
                Object.entries(reading).forEach(([key, value]) => {
                    if (key === 'timestamp') return;

                    const mapping = mappings[key];
                    const internalField = mapping ? mapping.field : key;
                    
                    let finalValue = value;
                    if (mapping && mapping.formula) {
                        try {
                            if (mapping.formula.includes('x')) {
                                const formula = mapping.formula.replace(/x/g, value);
                                finalValue = eval(formula);
                            }
                        } catch (e) {
                            console.error(`Error applying formula ${mapping.formula} to ${key}:`, e.message);
                        }
                    }
                    mapped[internalField] = finalValue;
                });
                return mapped;
            });

            return {
                success: true,
                data: {
                    stationName: loggerId,
                    readings: mappedReadings
                }
            };

        } catch (error) {
            console.error('CLIMDES API Error:', error.message);
            throw error;
        }
    }
};

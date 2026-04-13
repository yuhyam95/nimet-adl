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

            return weatherResponse.data;

        } catch (error) {
            console.error('CLIMDES API Error:', error.message);
            throw error;
        }
    }
};

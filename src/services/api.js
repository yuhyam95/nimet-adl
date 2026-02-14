const axios = require('axios');
const config = require('../config/index.js');

module.exports = {
    fetchDataLoggers: async () => {
        try {
            // Authenticatication reuse could be improved by caching the token, 
            // but for now we'll just login again to be safe/simple
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

            return response.data;
        } catch (error) {
            console.error('Error fetching data loggers:', error.message);
            throw error;
        }
    },

    fetchWeatherData: async (startDate, endDate, dataLoggerId = null) => {
        try {
            // 1. Authenticate to get the token
            const loginUrl = `${config.api.baseUrl}${config.api.loginEndpoint}`;
            const authResponse = await axios.post(loginUrl, {
                email: config.api.email,
                password: config.api.password
            });

            // Extract token from the nested structure: response.data.data.token
            const token = authResponse.data.data?.token;

            if (!token) {
                console.error('Full Auth Response:', JSON.stringify(authResponse.data, null, 2));
                throw new Error('Failed to retrieve authentication token');
            }

            // 2. Use the token to fetch weather data
            // Default to the config dataLoggerId if not provided
            const loggerId = dataLoggerId || config.api.dataLoggerId;
            if (!loggerId) {
                throw new Error('DataLogger ID is required');
            }

            const weatherUrl = `${config.api.baseUrl}/api/v1/datalogger/${loggerId}/json`;
            console.log(`Fetching weather data from: ${weatherUrl} (Start: ${startDate}, End: ${endDate})`);

            const weatherResponse = await axios.get(weatherUrl, {
                params: {
                    startDate,
                    endDate
                },
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            return weatherResponse.data;

        } catch (error) {
            console.error('API Error:', error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
                console.error('Response status:', error.response.status);
            }
            throw error;
        }
    }
};

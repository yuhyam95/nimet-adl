const axios = require('axios');
const config = require('../config/index.js');

module.exports = {
    fetchDataLoggers: async () => {
        try {
            const auth = Buffer.from(`${config.tahmo.apiKey}:${config.tahmo.apiSecret}`).toString('base64');
            const response = await axios.get(`${config.tahmo.baseUrl}/stations`, {
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

    fetchWeatherData: async (startDate, endDate, stationId) => {
        try {
            const auth = Buffer.from(`${config.tahmo.apiKey}:${config.tahmo.apiSecret}`).toString('base64');
            // TAHMO timeseries endpoint
            const url = `${config.tahmo.baseUrl}/timeseries/${stationId}/hourly`;
            const response = await axios.get(url, {
                params: {
                    start: startDate,
                    end: endDate
                },
                headers: { 'Authorization': `Basic ${auth}` }
            });

            // Map TAHMO data to standardized weather readings
            // Note: TAHMO response structure needs to be checked, usually it's an array of measurements
            return {
                success: true,
                data: {
                    stationName: stationId,
                    dataLoggerId: stationId,
                    location: {
                        latitude: null, // Should be fetched from station metadata if not here
                        longitude: null
                    },
                    readings: response.data.map(record => ({
                        timestamp: record.timestamp,
                        airTemperature: record.temp,
                        relativeHumidity: record.rh,
                        windSpeed: record.ws,
                        windDirection: record.wd,
                        precipitation: record.pr,
                        solar_radiation: record.sr,
                        atmosphericPressure: record.pres,
                        // Add other mappings as needed
                    }))
                }
            };
        } catch (error) {
            console.error(`Error fetching TAHMO weather data for ${stationId}:`, error.message);
            throw error;
        }
    }
};

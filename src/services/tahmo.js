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

            values.forEach(row => {
                const timestamp = row[timeIdx];
                const variable = row[variableIdx];
                const value = row[valueIdx];

                if (!groupedByTime[timestamp]) {
                    groupedByTime[timestamp] = { timestamp };
                }

                // Map ALL TAHMO variable codes to internal names
                switch (variable) {
                    case 'te': groupedByTime[timestamp].airTemperature = value; break;
                    case 'rh': groupedByTime[timestamp].relativeHumidity = value; break;
                    case 'ws': groupedByTime[timestamp].windSpeed = value; break;
                    case 'wd': groupedByTime[timestamp].windDirection = value; break;
                    case 'pr': groupedByTime[timestamp].precipitation = value; break;
                    case 'ra': groupedByTime[timestamp].solarRadiation = value; break;
                    case 'ap': groupedByTime[timestamp].atmosphericPressure = value; break;
                    case 'lv': groupedByTime[timestamp].batteryVoltage = value / 1000; break;
                    case 'wg': groupedByTime[timestamp].windGust = value; break;
                    case 'ld': groupedByTime[timestamp].lightningStrikeDistance = value; break;
                    case 'le': groupedByTime[timestamp].lightningStrikeCount = value; break;
                    case 'ht': groupedByTime[timestamp].humiditySensorTemperature = value; break;
                    case 'lt': groupedByTime[timestamp].loggerTemp = value; break;
                    case 'lp': groupedByTime[timestamp].loggerPressure = value; break;
                    case 'tx': groupedByTime[timestamp].xOrientation = value; break;
                    case 'ty': groupedByTime[timestamp].yOrientation = value; break;
                    case 'lb': groupedByTime[timestamp].loggerBatteryPercent = value; break;
                }
            });

            const readings = Object.values(groupedByTime);
            console.log(`Success! Fixed and parsed ${readings.length} weather readings (including all sensors) for ${stationId}`);

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

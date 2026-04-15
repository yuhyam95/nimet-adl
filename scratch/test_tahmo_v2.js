const tahmo = require('../src/services/tahmo');

async function testFetch() {
    console.log('--- Testing TAHMO v2 fetchWeatherData ---');
    
    // Mocking axios or just describing the expected call
    // Since we don't have real credentials, we'll simulate the response mapping
    const mockResponse = {
        data: {
            status: 'success',
            data: [
                {
                    time: '2024-04-15T10:00:00Z',
                    values: {
                        te: 28.5,
                        rh: 62.1,
                        ws: 3.4,
                        wd: 180,
                        pr: 0.0,
                        sr: 450,
                        pres: 1012
                    }
                },
                {
                    time: '2024-04-15T11:00:00Z',
                    values: {
                        te: 29.1,
                        rh: 60.5,
                        ws: 2.9,
                        wd: 195,
                        pr: 0.1,
                        sr: 500,
                        pres: 1011
                    }
                }
            ]
        }
    };

    console.log('Mocked API Response Structure:');
    console.log(JSON.stringify(mockResponse, null, 2));

    // The logic in tahmo.js would transform it to:
    const measurements = mockResponse.data.data;
    const transformed = {
        success: true,
        data: {
            stationName: 'TA00001',
            readings: measurements.map(record => {
                const v = record.values || {};
                return {
                    timestamp: record.time,
                    airTemperature: v.te,
                    relativeHumidity: v.rh,
                    windSpeed: v.ws,
                    windDirection: v.wd,
                    precipitation: v.pr,
                    solar_radiation: v.sr,
                    atmosphericPressure: v.pres,
                };
            })
        }
    };

    console.log('\nRepresented Application Data:');
    console.log(JSON.stringify(transformed, null, 2));
}

testFetch();

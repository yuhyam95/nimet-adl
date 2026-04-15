const tahmoService = require('./src/services/tahmo');
const config = require('./src/config/index');

async function checkTahmo() {
    const stationId = 'TA00692'; // Using one of your active stations
    const today = new Date().toISOString().split('T')[0];
    
    console.log(`--- TAHMO Diagnostics for ${stationId} ---`);
    console.log(`Target: ${today}`);
    
    try {
        const response = await tahmoService.fetchWeatherData(today, today, stationId);
        console.log('\n--- Final Transformed Data ---');
        console.log(JSON.stringify(response.data, null, 2));
    } catch (err) {
        console.error('\n--- Request Failed ---');
        if (err.response) {
            console.error(`Status: ${err.response.status}`);
            console.error('Body:', JSON.stringify(err.response.data, null, 2));
        } else {
            console.error(err.message);
        }
    }
}

checkTahmo();

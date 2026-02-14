const db = require('./db/index.js');

async function getRecentReadings() {
    try {
        // Example query: Get the latest 10 readings
        const query = `
      SELECT station_name, air_temperature, relative_humidity, timestamp 
      FROM weather_readings 
      ORDER BY timestamp DESC 
      LIMIT 10;
    `;

        console.log('Fetching recent weather data...');
        const result = await db.query(query);

        console.log(`Found ${result.rows.length} records:\n`);
        console.table(result.rows);

    } catch (err) {
        console.error('Error executing query', err.stack);
    } finally {
        // Close the connection
        await db.pool.end();
    }
}

getRecentReadings();

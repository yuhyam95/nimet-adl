const db = require('../src/db/index.js');

async function clean() {
    try {
        console.log("Identifying invalid CLIMDES stations (outside Latitude 4.0-14.0, Longitude 2.5-15.0)...");
        
        // Find stations to delete
        const findQuery = `
            SELECT station_id, station_name, latitude, longitude 
            FROM stations 
            WHERE provider = 'CLIMDES' 
              AND (
                latitude < 4.0 OR latitude > 14.0 OR 
                longitude < 2.5 OR longitude > 15.0 OR 
                latitude IS NULL OR longitude IS NULL
              )
        `;
        const toDeleteRes = await db.query(findQuery);
        const toDelete = toDeleteRes.rows;
        
        console.log(`Found ${toDelete.length} invalid CLIMDES stations:`);
        toDelete.forEach(s => {
            console.log(`- ${s.station_name} (${s.station_id}): Lat ${s.latitude}, Lon ${s.longitude}`);
        });

        if (toDelete.length === 0) {
            console.log("No invalid CLIMDES stations found to delete.");
            return;
        }

        const ids = toDelete.map(s => s.station_id);

        // Delete weather readings
        console.log("Deleting associated weather readings...");
        const deleteReadingsRes = await db.query(
            "DELETE FROM weather_readings WHERE station_id = ANY($1)",
            [ids]
        );
        console.log(`Deleted ${deleteReadingsRes.rowCount} weather readings.`);

        // Delete stations
        console.log("Deleting stations from stations table...");
        const deleteStationsRes = await db.query(
            "DELETE FROM stations WHERE station_id = ANY($1)",
            [ids]
        );
        console.log(`Deleted ${deleteStationsRes.rowCount} stations.`);
        
        console.log("Clean-up complete!");
    } catch (error) {
        console.error("Error cleaning invalid stations:", error);
    } finally {
        await db.pool.end();
    }
}

clean();

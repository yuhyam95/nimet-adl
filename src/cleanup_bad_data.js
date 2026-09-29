const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const db = require('./db/index.js');

const cleanupBadData = async () => {
    console.log('Starting cleanup of bad datalogger data...');

    try {
        // 1. Delete all records with future timestamps
        const deleteFutureQuery = `
            DELETE FROM weather_readings 
            WHERE timestamp > NOW()
        `;
        const futureResult = await db.query(deleteFutureQuery);
        console.log(`Deleted ${futureResult.rowCount} future readings.`);

        // Delete all WAGTECH weather readings (because of bad IDs)
        const deleteWagtechReadings = `
            DELETE FROM weather_readings 
            WHERE station_id IN (SELECT station_id FROM stations WHERE provider = 'WAGTECH')
        `;
        const wrResult = await db.query(deleteWagtechReadings);
        console.log(`Deleted ${wrResult.rowCount} WAGTECH readings.`);

        // Delete all WAGTECH stations
        const deleteWagtechStations = `
            DELETE FROM stations 
            WHERE provider = 'WAGTECH'
        `;
        const wsResult = await db.query(deleteWagtechStations);
        console.log(`Deleted ${wsResult.rowCount} WAGTECH stations.`);

        // Clear processed FTP files table so they can be re-imported properly
        const clearProcessed = `
            DELETE FROM processed_ftp_files
        `;
        await db.query(clearProcessed);
        console.log('Cleared processed FTP files log.');

        console.log('🎉 Cleanup completed successfully.');
    } catch (error) {
        console.error('❌ Error during cleanup:', error.message);
    } finally {
        await db.pool.end();
        process.exit(0);
    }
};

cleanupBadData();

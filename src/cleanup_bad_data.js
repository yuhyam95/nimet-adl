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
        console.log('🎉 Cleanup completed successfully.');
    } catch (error) {
        console.error('❌ Error during cleanup:', error.message);
    } finally {
        await db.pool.end();
        process.exit(0);
    }
};

cleanupBadData();

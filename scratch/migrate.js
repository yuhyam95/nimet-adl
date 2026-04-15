let db;
try {
    db = require('../src/db/index');
} catch (e) {
    db = require('../src/services/db');
}

async function migrate() {
    try {
        console.log('Adding metadata column to weather_readings...');
        await db.query(`
            ALTER TABLE weather_readings 
            ADD COLUMN IF NOT EXISTS metadata JSONB;
        `);
        console.log('Success! Metadata column is ready.');
    } catch (err) {
        console.error('Migration failed:', err.message);
    } finally {
        if (db.pool) await db.pool.end();
    }
}

migrate();

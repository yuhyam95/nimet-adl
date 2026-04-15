const db = require('./src/db/index');

async function checkSchema() {
    try {
        const res = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'weather_readings'
        `);
        console.log('--- Current Columns in weather_readings ---');
        console.table(res.rows);
    } catch (err) {
        console.error('Error checking schema:', err.message);
    } finally {
        await db.pool.end();
    }
}

checkSchema();

const db = require('../src/db/index.js');

async function check() {
    try {
        const res = await db.query("SELECT station_id, station_name, latitude, longitude, country, provider FROM stations WHERE provider = 'CLIMDES'");
        console.log("CLIMDES Stations count in DB:", res.rows.length);
        console.log(JSON.stringify(res.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await db.pool.end();
    }
}

check();

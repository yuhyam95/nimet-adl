const fs = require('fs');
const path = require('path');
const db = require('./index.js');
require('dotenv').config();

const applyInitSql = async () => {
    try {
        const sqlPath = path.join(__dirname, 'init.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');
        
        console.log('Applying init.sql...');
        await db.query(sql);
        console.log('Database initialized successfully.');
    } catch (error) {
        console.error('Error applying init.sql:', error);
    } finally {
        await db.pool.end();
    }
};

applyInitSql();

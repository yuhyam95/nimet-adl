const { Pool } = require('pg');
const config = require('../config/index.js');

const pool = new Pool(config.db);

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool // Export the pool for clean shutdown
};

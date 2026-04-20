const db = require('./index.js');
const { hashPassword } = require('../utils/auth.js');
require('dotenv').config();

const seedAdmin = async () => {
    const username = 'admin';
    const password = 'Password@123'; // The user can change this later
    
    try {
        console.log('Ensuring users table exists...');
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                name VARCHAR(255),
                role VARCHAR(50) DEFAULT 'Data Viewer' CHECK (role IN ('Admin', 'Data Manager', 'Data Viewer')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
        `);

        console.log('Seeding initial admin user...');
        const hashedPassword = await hashPassword(password);
        
        const result = await db.query(`
            INSERT INTO users (username, password, name, role)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (username) DO UPDATE SET
                password = EXCLUDED.password,
                role = EXCLUDED.role
            RETURNING id, username, role
        `, [username, hashedPassword, 'Administrator', 'Admin']);
        
        console.log('Admin user seeded successfully:', result.rows[0]);
    } catch (error) {
        console.error('Error seeding admin user:', error);
    } finally {
        await db.pool.end();
    }
};

seedAdmin();

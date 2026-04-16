const db = require('./index.js');
const mappings = require('../config/variable_mappings.json');

const migrate = async () => {
    console.log('Migrating mappings from JSON to Database...');

    try {
        // Ensure table exists (optional if you've run init.sql)
        await db.query(`
            CREATE TABLE IF NOT EXISTS provider_mappings (
                id SERIAL PRIMARY KEY,
                provider VARCHAR(50) NOT NULL,
                external_key VARCHAR(100) NOT NULL,
                internal_field VARCHAR(100) NOT NULL,
                conversion_formula VARCHAR(255) DEFAULT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(provider, external_key)
            )
        `);

        for (const [provider, vars] of Object.entries(mappings)) {
            if (provider === 'CLIMDES' && vars.__comment) continue;

            for (const [externalKey, internalField] of Object.entries(vars)) {
                if (externalKey === '__comment') continue;

                let conversion = null;
                // Special case for TAHMO battery voltage based on current hardcoded logic
                if (provider === 'TAHMO' && externalKey === 'lv') {
                    conversion = 'x / 1000';
                }

                await db.query(`
                    INSERT INTO provider_mappings (provider, external_key, internal_field, conversion_formula)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (provider, external_key) DO UPDATE SET
                        internal_field = EXCLUDED.internal_field,
                        conversion_formula = EXCLUDED.conversion_formula
                `, [provider, externalKey, internalField, conversion]);
                
                console.log(`  Synced: ${provider} [${externalKey} -> ${internalField}]`);
            }
        }
        console.log('Migration completed successfully.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await db.pool.end();
    }
};

migrate();

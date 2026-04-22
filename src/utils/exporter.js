const fs = require('fs');
const path = require('path');
const db = require('../db/index.js');
const config = require('../config/index.js');

/**
 * Generates a CSV file for each station and dumps the readings into the exports folder.
 * @returns {Promise<{success: boolean, count: number, directory: string}>}
 */
async function exportAllStationsToCSV() {
    const exportsDir = config.exportPath;
    
    // Create exports directory if it doesn't exist
    if (!fs.existsSync(exportsDir)) {
        fs.mkdirSync(exportsDir, { recursive: true });
    }

    try {
        // 1. Get all stations from the readings table
        const stationsResult = await db.query('SELECT DISTINCT station_id, station_name FROM weather_readings');
        const stations = stationsResult.rows;

        if (stations.length === 0) {
            console.log('No stations found in weather_readings table.');
            return { success: true, count: 0, directory: exportsDir };
        }

        console.log(`Found ${stations.length} stations to export.`);

        for (const station of stations) {
            const { station_id, station_name } = station;
            // Use station_name for filename if station_id is not very descriptive, 
            // but station_id is safer for uniqueness.
            const safeName = (station_name || station_id).replace(/[^a-z0-9]/gi, '_');
            const stationDir = path.join(exportsDir, safeName);
            
            // Create station directory if it doesn't exist
            if (!fs.existsSync(stationDir)) {
                fs.mkdirSync(stationDir, { recursive: true });
            }

            const fileName = `${safeName}.csv`;
            const filePath = path.join(stationDir, fileName);

            console.log(`Exporting readings for station: ${station_id} (${station_name}) -> ${safeName}/${fileName}`);

            // 2. Fetch all readings for this station
            const readingsResult = await db.query(
                'SELECT * FROM weather_readings WHERE station_id = $1 ORDER BY timestamp DESC',
                [station_id]
            );
            const readings = readingsResult.rows;

            if (readings.length === 0) {
                console.log(`No readings found for station ${station_id}. Skipping.`);
                continue;
            }

            // 3. Generate CSV content
            const headers = Object.keys(readings[0]);
            const csvRows = [];
            
            // Add header row
            csvRows.push(headers.join(','));

            // Add data rows
            for (const row of readings) {
                const values = headers.map(header => {
                    let val = row[header];
                    
                    // Handle nulls
                    if (val === null || val === undefined) return '';
                    
                    // Handle dates
                    if (val instanceof Date) return val.toISOString();
                    
                    // Handle objects (like metadata)
                    if (typeof val === 'object') {
                        val = JSON.stringify(val);
                    }
                    
                    // Handle strings with commas, quotes, or newlines
                    let valStr = String(val);
                    if (valStr.includes(',') || valStr.includes('"') || valStr.includes('\n')) {
                        valStr = `"${valStr.replace(/"/g, '""')}"`;
                    }
                    return valStr;
                });
                csvRows.push(values.join(','));
            }

            const csvContent = csvRows.join('\n');
            fs.writeFileSync(filePath, csvContent);
            console.log(`Exported ${readings.length} readings for ${station_id} to ${fileName}`);
        }

        return { 
            success: true, 
            count: stations.length, 
            directory: exportsDir 
        };
    } catch (error) {
        console.error('Error during CSV export:', error);
        throw error;
    }
}

module.exports = { exportAllStationsToCSV };

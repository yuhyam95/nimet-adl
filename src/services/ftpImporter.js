const ftp = require("basic-ftp");
const fs = require('fs');
const path = require('path');
const db = require('../db/index.js');
const config = require('../config/index.js');

const processFtpData = async () => {
    const wagtechConfig = config.wagtech;
    if (!wagtechConfig.ftpHost || !wagtechConfig.ftpUser || !wagtechConfig.ftpPassword) {
        console.log('WAGTECH FTP credentials not configured. Skipping FTP sync.');
        return;
    }

    const client = new ftp.Client();
    client.ftp.verbose = false;

    try {
        console.log(`Connecting to FTP server ${wagtechConfig.ftpHost}...`);
        await client.access({
            host: wagtechConfig.ftpHost,
            port: wagtechConfig.ftpPort || 21,
            user: wagtechConfig.ftpUser,
            password: wagtechConfig.ftpPassword,
            secure: false
        });

        console.log('Connected to FTP server. Listing root directory...');
        const list = await client.list();
        
        // Filter CSV files
        let csvFiles = list.filter(item => item.type === 1 && item.name.toLowerCase().endsWith('.csv'));
        
        // Fetch already processed files to avoid re-downloading
        const processedFilesResult = await db.query('SELECT filename FROM processed_ftp_files');
        const processedFilesSet = new Set(processedFilesResult.rows.map(r => r.filename));
        
        csvFiles = csvFiles.filter(f => !processedFilesSet.has(f.name));

        console.log(`Found ${csvFiles.length} new CSV files to process.`);

        if (csvFiles.length === 0) {
            console.log('No new CSV files found on FTP server.');
            return;
        }

        const tempDir = path.join(process.cwd(), 'temp_ftp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir);
        }

        for (const file of csvFiles) {
            const tempFilePath = path.join(tempDir, file.name);

            // Download file
            await client.downloadTo(tempFilePath, file.name);

            // Read raw text
            const fileContent = fs.readFileSync(tempFilePath, 'utf8');
            
            // Extract default station ID and timestamp from filename
            let base = file.name.replace(/\.csv\s*$/i, '').trim();
            const match = base.match(/(.+?)[-_](\d{8})[-_](\d{4,6})$/);
            
            let defaultStationId = base;
            let defaultTimestamp = new Date().toISOString();

            if (match) {
                defaultStationId = match[1].trim(); 
                const dateStr = match[2]; 
                let timeStr = match[3]; 
                if (timeStr.length === 4) timeStr += '00';
                
                defaultTimestamp = `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}T${timeStr.substring(0,2)}:${timeStr.substring(2,4)}:${timeStr.substring(4,6)}Z`;
            } else {
                const fallbackMatch = base.match(/(.+?)[-_]202\d{5}/);
                if (fallbackMatch) {
                    defaultStationId = fallbackMatch[1].trim();
                }
            }

            // Detect format
            if (fileContent.includes('#Name') || fileContent.includes('Date,Time,TA1_Avg')) {
                // BARANI Multi-line format
                const { stationId: parsedId, records } = parseBaraniCsvString(fileContent);
                const finalStationId = parsedId || defaultStationId;
                
                for (let rec of records) {
                    await insertReading(db, finalStationId, rec.timestamp, rec, 'BARANI');
                }
            } else {
                // WAGTECH Single-line format
                const mappedData = parseWagtechCsvString(fileContent);
                if (Object.keys(mappedData).length > 0) {
                    await insertReading(db, defaultStationId, defaultTimestamp, mappedData, 'WAGTECH');
                }
            }

            // Cleanup local temp file
            fs.unlinkSync(tempFilePath);

            // Record file as processed
            await db.query(`
                INSERT INTO processed_ftp_files (filename) 
                VALUES ($1) ON CONFLICT (filename) DO NOTHING
            `, [file.name]);
        }

        console.log('FTP sync completed successfully.');

    } catch (err) {
        console.error('FTP processing error:', err);
    } finally {
        client.close();
    }
};

async function insertReading(db, stationId, timestamp, mappedData, providerName = 'WAGTECH') {
    if (!stationId || !timestamp) return;

    // Upsert station basic info
    await db.query(`
        INSERT INTO stations (station_id, station_name, provider, is_active, updated_at, latitude, longitude) 
        VALUES ($1, $2, $3, true, NOW(), 8.6753, 9.0820)
        ON CONFLICT (station_id) DO NOTHING;
    `, [stationId, stationId, providerName]);

    // Insert weather reading
    const insertQuery = `
        INSERT INTO weather_readings (
            station_id, timestamp, air_temperature, relative_humidity, 
            wind_speed, wind_direction, precipitation, solar_radiation, 
            atmospheric_pressure, battery_voltage, wind_gust
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (station_id, timestamp) DO UPDATE SET
            air_temperature = EXCLUDED.air_temperature,
            relative_humidity = EXCLUDED.relative_humidity,
            wind_speed = EXCLUDED.wind_speed,
            wind_direction = EXCLUDED.wind_direction,
            precipitation = EXCLUDED.precipitation,
            solar_radiation = EXCLUDED.solar_radiation,
            atmospheric_pressure = EXCLUDED.atmospheric_pressure,
            battery_voltage = EXCLUDED.battery_voltage,
            wind_gust = EXCLUDED.wind_gust;
    `;

    await db.query(insertQuery, [
        stationId, 
        timestamp,
        mappedData.air_temperature !== undefined ? mappedData.air_temperature : null,
        mappedData.relative_humidity !== undefined ? mappedData.relative_humidity : null,
        mappedData.wind_speed !== undefined ? mappedData.wind_speed : null,
        mappedData.wind_direction !== undefined ? mappedData.wind_direction : null,
        mappedData.precipitation !== undefined ? mappedData.precipitation : null,
        mappedData.solar_radiation !== undefined ? mappedData.solar_radiation : null,
        mappedData.atmospheric_pressure !== undefined ? mappedData.atmospheric_pressure : null,
        mappedData.battery_voltage !== undefined ? mappedData.battery_voltage : null,
        mappedData.wind_gust !== undefined ? mappedData.wind_gust : null
    ]).catch(e => {
        console.error(`Insert error for ${stationId} at ${timestamp}: ${e.message}`);
    });
}

/**
 * Parses the weird single-line WAGTECH CSV format by scanning for known parameter names.
 */
function parseWagtechCsvString(content) {
    const mapped = {};
    const parts = content.split(',').map(s => s.trim());

    for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        const val = parseFloat(parts[i + 1]);
        
        if (isNaN(val)) continue;

        if (p === 'AirTemp') mapped.air_temperature = val;
        else if (p === 'BaroPr') mapped.atmospheric_pressure = val;
        else if (p === 'SolarRad') mapped.solar_radiation = val;
        else if (p === 'WindDir') mapped.wind_direction = val;
        else if (p === 'Humidity') mapped.relative_humidity = val;
        else if (p === 'Rainfall') mapped.precipitation = val;
        else if (p === 'WindSpd') mapped.wind_speed = val;
        else if (p === 'Battery') mapped.battery_voltage = val;
    }

    return mapped;
}

function parseBaraniCsvString(content) {
    const lines = content.trim().split('\n');
    let stationId = null;
    let records = [];

    // Extract station ID from the first line
    for (let line of lines) {
        if (line.startsWith('#Name')) {
            stationId = line.replace('#Name', '').trim();
            break;
        }
    }

    // Find headers
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('Date') && lines[i].includes('Time')) {
            headerIndex = i;
            break;
        }
    }

    if (headerIndex !== -1 && headerIndex + 1 < lines.length) {
        const headers = lines[headerIndex].split(',').map(h => h.trim());
        
        for (let i = headerIndex + 1; i < lines.length; i++) {
            const row = lines[i].split(',').map(v => v.trim());
            if (row.length !== headers.length) continue;
            
            let data = {};
            // date format: DD.MM.YYYY, time: HH:MM:SS
            const dateParts = row[0].split('.');
            const timeStr = row[1];
            if (dateParts.length === 3) {
                data.timestamp = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T${timeStr}Z`;
            }

            for(let j = 2; j < headers.length; j++) {
                const h = headers[j];
                const val = parseFloat(row[j]);
                if (isNaN(val)) continue;
                
                if (h === 'TA1_Avg') data.air_temperature = val;
                else if (h === 'RH1_Avg') data.relative_humidity = val;
                else if (h === 'PA1_Avg') data.atmospheric_pressure = val;
                else if (h === 'WS1_Inst_Avg' || h === 'WS1_Avg') data.wind_speed = val;
                else if (h === 'WS1_Max_Avg') data.wind_gust = val;
                else if (h === 'WD1_Avg_Avg') data.wind_direction = val;
                else if (h === 'RAIN_Avg') data.precipitation = val;
                else if (h === 'V_BATT_Avg') data.battery_voltage = val;
                else if (h === 'V_SOLAR_Avg') data.solar_radiation = val; 
            }
            if (data.timestamp && Object.keys(data).length > 1) { 
                records.push(data);
            }
        }
    }
    
    return { stationId, records };
}

module.exports = { processFtpData };

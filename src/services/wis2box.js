const Minio = require('minio');
const config = require('../config/index.js');
const db = require('../db/index.js');

let minioClient = null;

function getMinioClient() {
    if (!minioClient) {
        const wisConfig = config.wis2box;
        if (!wisConfig.endpoint || !wisConfig.accessKey || !wisConfig.secretKey) {
            throw new Error('wis2box MinIO configuration is incomplete.');
        }
        minioClient = new Minio.Client({
            endPoint: wisConfig.endpoint,
            port: wisConfig.port,
            useSSL: wisConfig.useSSL,
            accessKey: wisConfig.accessKey,
            secretKey: wisConfig.secretKey
        });
    }
    return minioClient;
}

/**
 * Uploads a file to the wis2box incoming bucket
 * @param {string} filePath - Local path to the file
 * @param {string} destinationName - The name of the file in the bucket
 * @returns {Promise<boolean>} - True if successful
 */
async function uploadToWis2box(filePath, destinationName) {
    try {
        const client = getMinioClient();
        const bucket = config.wis2box.bucket;

        console.log(`Uploading ${filePath} to wis2box bucket: ${bucket}/${destinationName}`);
        
        // Upload the file
        await client.fPutObject(bucket, destinationName, filePath, {
            'Content-Type': 'text/csv',
        });
        
        console.log(`Successfully uploaded ${destinationName} to wis2box.`);
        return true;
    } catch (error) {
        console.error('Failed to upload file to wis2box:', error);
        throw error;
    }
}

/**
 * Uploads a string/buffer directly to wis2box
 */
async function uploadBufferToWis2box(buffer, destinationName) {
    try {
        const client = getMinioClient();
        const bucket = config.wis2box.bucket;

        console.log(`Uploading buffer to wis2box bucket: ${bucket}/${destinationName}`);
        
        await client.putObject(bucket, destinationName, buffer, buffer.length, {
            'Content-Type': 'text/csv',
        });
        
        console.log(`Successfully uploaded ${destinationName} to wis2box.`);
        return true;
    } catch (error) {
        console.error('Failed to upload buffer to wis2box:', error);
        throw error;
    }
}

const WIS2BOX_CSV_HEADER = [
    "wsi_series",
    "wsi_issuer",
    "wsi_issue_number",
    "wsi_local",
    "wmo_block_number",
    "wmo_station_number",
    "station_type",
    "year",
    "month",
    "day",
    "hour",
    "minute",
    "latitude",
    "longitude",
    "station_height_above_msl",
    "barometer_height_above_msl",
    "station_pressure",
    "msl_pressure",
    "geopotential_height",
    "thermometer_height",
    "air_temperature",
    "dewpoint_temperature",
    "relative_humidity",
    "method_of_ground_state_measurement",
    "ground_state",
    "method_of_snow_depth_measurement",
    "snow_depth",
    "precipitation_intensity",
    "anemometer_height",
    "time_period_of_wind",
    "wind_direction",
    "wind_speed",
    "maximum_wind_gust_direction_10_minutes",
    "maximum_wind_gust_speed_10_minutes",
    "maximum_wind_gust_direction_1_hour",
    "maximum_wind_gust_speed_1_hour",
    "maximum_wind_gust_direction_3_hours",
    "maximum_wind_gust_speed_3_hours",
    "rain_sensor_height",
    "total_precipitation_1_hour",
    "total_precipitation_3_hours",
    "total_precipitation_6_hours",
    "total_precipitation_12_hours",
    "total_precipitation_24_hours",
];

function hourlyAggregateReadings(readings) {
    const hourlyData = {};
    const now = new Date();
    
    for (const record of readings) {
        const ts = new Date(record.timestamp);
        
        // Skip current hour
        if (ts.getFullYear() === now.getFullYear() && 
            ts.getMonth() === now.getMonth() && 
            ts.getDate() === now.getDate() && 
            ts.getHours() === now.getHours()) {
            continue;
        }

        const hourKey = `${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}-${ts.getHours()}`;
        
        if (!hourlyData[hourKey]) {
            hourlyData[hourKey] = [];
        }
        hourlyData[hourKey].push(record);
    }

    const aggregated = [];
    for (const key in hourlyData) {
        // Find latest reading in that hour
        let latest = hourlyData[key][0];
        for (const record of hourlyData[key]) {
            if (new Date(record.timestamp) > new Date(latest.timestamp)) {
                latest = record;
            }
        }
        aggregated.push(latest);
    }
    
    return aggregated;
}

function generateWis2boxCSV(station, record) {
    const ts = new Date(record.timestamp);
    
    const data = {
        wsi_series: station.wsi_series || '',
        wsi_issuer: station.wsi_issuer || '',
        wsi_issue_number: station.wsi_issue_number || '',
        wsi_local: station.wsi_local || '',
        wmo_block_number: station.wmo_block_number || '',
        wmo_station_number: station.wmo_station_number || '',
        station_type: '', // or get from station if available
        year: ts.getUTCFullYear(),
        month: ts.getUTCMonth() + 1,
        day: ts.getUTCDate(),
        hour: ts.getUTCHours(),
        minute: ts.getUTCMinutes(),
        latitude: station.latitude || record.latitude || '',
        longitude: station.longitude || record.longitude || '',
        station_height_above_msl: station.station_height_above_msl || '',
        barometer_height_above_msl: station.barometer_height_above_msl || '',
        station_pressure: record.atmospheric_pressure || '',
        msl_pressure: '',
        geopotential_height: '',
        thermometer_height: '',
        air_temperature: record.air_temperature || '',
        dewpoint_temperature: '',
        relative_humidity: record.relative_humidity || '',
        method_of_ground_state_measurement: station.method_of_ground_state_measurement || '',
        ground_state: '',
        method_of_snow_depth_measurement: station.method_of_snow_depth_measurement || '',
        snow_depth: '',
        precipitation_intensity: '',
        anemometer_height: station.anemometer_height || '',
        time_period_of_wind: station.time_period_of_wind || '',
        wind_direction: record.wind_direction || '',
        wind_speed: record.wind_speed || '',
        maximum_wind_gust_direction_10_minutes: '',
        maximum_wind_gust_speed_10_minutes: '',
        maximum_wind_gust_direction_1_hour: '',
        maximum_wind_gust_speed_1_hour: record.wind_gust || '',
        maximum_wind_gust_direction_3_hours: '',
        maximum_wind_gust_speed_3_hours: '',
        rain_sensor_height: station.rain_sensor_height || '',
        total_precipitation_1_hour: record.precipitation || '',
        total_precipitation_3_hours: '',
        total_precipitation_6_hours: '',
        total_precipitation_12_hours: '',
        total_precipitation_24_hours: '',
    };

    const row = WIS2BOX_CSV_HEADER.map(col => data[col] !== undefined ? data[col] : '');
    
    return [WIS2BOX_CSV_HEADER.join(','), row.join(',')].join('\\n') + '\\n';
}

async function dispatchToWis2box(station, readings) {
    if (!station.wigos_id) {
        console.log(`Station ${station.station_id} missing wigos_id, skipping WIS2BOX dispatch.`);
        return;
    }

    const aggregatedReadings = hourlyAggregateReadings(readings);
    
    if (aggregatedReadings.length === 0) {
        console.log(`No valid hourly data to dispatch for station ${station.station_id}`);
        return;
    }

    let successCount = 0;
    let anyError = null;
    
    for (const record of aggregatedReadings) {
        try {
            const csvContent = generateWis2boxCSV(station, record);
            const ts = new Date(record.timestamp);
            
            // Format timestamp as YYYYMMDDTHHMMSS
            const pad = (n) => n.toString().padStart(2, '0');
            const formattedTs = `${ts.getUTCFullYear()}${pad(ts.getUTCMonth()+1)}${pad(ts.getUTCDate())}T${pad(ts.getUTCHours())}${pad(ts.getUTCMinutes())}${pad(ts.getUTCSeconds())}`;
            
            const filename = `WIGOS_${station.wigos_id}_${formattedTs}.csv`;
            const datasetId = 'wis2box-incoming'; // Using a default prefix or dataset id
            
            const objectName = `${datasetId}/${filename}`;
            const buffer = Buffer.from(csvContent, 'utf-8');
            
            await uploadBufferToWis2box(buffer, objectName);
            successCount++;
        } catch (err) {
            console.error(`Failed to dispatch reading for station ${station.station_id}:`, err);
            anyError = err;
        }
    }
    
    if (successCount > 0 && !anyError) {
        await db.query(`UPDATE stations SET last_wis2box_dispatch_at = NOW(), last_wis2box_dispatch_status = 'Success', last_wis2box_dispatch_error = NULL WHERE station_id = $1`, [station.station_id]);
    } else if (successCount > 0 && anyError) {
        await db.query(`UPDATE stations SET last_wis2box_dispatch_at = NOW(), last_wis2box_dispatch_status = 'Partial Success', last_wis2box_dispatch_error = $1 WHERE station_id = $2`, [anyError.message, station.station_id]);
    } else if (anyError) {
        await db.query(`UPDATE stations SET last_wis2box_dispatch_at = NOW(), last_wis2box_dispatch_status = 'Failed', last_wis2box_dispatch_error = $1 WHERE station_id = $2`, [anyError.message, station.station_id]);
    }
    
    console.log(`Dispatched ${successCount} records to WIS2BOX for station ${station.station_id}`);
}

module.exports = {
    uploadToWis2box,
    uploadBufferToWis2box,
    dispatchToWis2box
};

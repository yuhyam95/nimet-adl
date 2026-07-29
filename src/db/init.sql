CREATE TABLE IF NOT EXISTS weather_readings (
    id SERIAL PRIMARY KEY,
    station_name VARCHAR(255),
    station_id VARCHAR(255),
    latitude NUMERIC,
    longitude NUMERIC,
    timestamp TIMESTAMP,
    air_temperature NUMERIC,
    relative_humidity NUMERIC,
    wind_speed NUMERIC,
    wind_direction NUMERIC,
    precipitation NUMERIC,
    solar_radiation NUMERIC,
    atmospheric_pressure NUMERIC,
    soil_temperature NUMERIC,
    battery_voltage NUMERIC,
    wind_gust NUMERIC,
    lightning_strike_count NUMERIC,
    lightning_strike_distance NUMERIC,
    x_orientation NUMERIC,
    y_orientation NUMERIC,
    humidity_sensor_temperature NUMERIC,
    volumetric_water_content NUMERIC,
    atoms_gen2 NUMERIC,
    north_wind_speed NUMERIC,
    east_wind_speed NUMERIC,
    soil_electrical_conductivity NUMERIC,
    soil_ph NUMERIC,
    panel_temperature NUMERIC,
    vapor_pressure NUMERIC,
    metadata TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_reading UNIQUE (station_id, timestamp)
);

CREATE INDEX idx_weather_timestamp ON weather_readings(timestamp);
CREATE INDEX idx_weather_station ON weather_readings(station_id);

CREATE TABLE IF NOT EXISTS provider_mappings (
    id SERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    external_key VARCHAR(100) NOT NULL,
    internal_field VARCHAR(100) NOT NULL,
    conversion_formula VARCHAR(255) DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, external_key)
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'Data Viewer' CHECK (role IN ('Admin', 'Data Manager', 'Data Viewer')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users(username);

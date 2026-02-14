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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_reading UNIQUE (station_id, timestamp)
);

CREATE INDEX idx_weather_timestamp ON weather_readings(timestamp);
CREATE INDEX idx_weather_station ON weather_readings(station_id);

# NiMet Automated Data Loader Backend

This Node.js application authenticates with an external API, retrieves weather data, and stores it in a PostgreSQL database.

## Setup

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Database Configuration**:
    Create a PostgreSQL database and a table for storing the weather data. Example schema:

    ```sql
    CREATE TABLE weather_data (
        id SERIAL PRIMARY KEY,
        temperature NUMERIC,
        humidity NUMERIC,
        location VARCHAR(255),
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ```

3.  **Environment Variables**:
    Copy the example `.env` file and fill in your details:
    ```bash
    cp .env .env.local
    ```
    Update `.env` with your database credentials and API endpoints.

    ```
    DB_USER=your_db_user
    DB_PASSWORD=your_db_password
    DB_HOST=localhost
    DB_PORT=5432
    DB_DATABASE=your_database

    API_DATALOGGER_ID=your_datalogger_id
API_LOGIN_ENDPOINT=/api/v1/auth/login
API_LOGGERS_ENDPOINT=/api/v1/datalogger/nimet
API_WEATHER_ENDPOINT=/weather/data
    API_USERNAME=your_api_username
    API_PASSWORD=your_api_password
    ```

4.  **Running the Application**:
    To run the data loader:
    ```bash
    npm start
    ```

### Reset a user password

Run the password reset command with the exact username:

```bash
npm run reset-password -- admin
```

The command prompts for the new password twice without placing it in your terminal history.

## Dashboard

A React/Vite dashboard is included in the `frontend` directory to visualize the weather data.

To run the dashboard:
1.  **Ensure the backend is running** (`npm start` in the root directory).
2.  **Open a new terminal** and navigate to the frontend:
    ```bash
    cd frontend
    ```
3.  **Install dependencies** (first time only):
    ```bash
    npm install
    ```
4.  **Start the development server**:
    ```bash
    npm run dev
    ```
5.  Open `http://localhost:5173` in your browser.

## Customization

-   **Database Schema**: Modify `src/index.js` and `src/db/index.js` to match your actual database schema.
-   **API logic**: Adjust `src/services/api.js` if the authentication mechanism differs.

## PulsoWeb / Pulsonic provider

Pulsonic stations can be discovered and synchronized through the PulsoWeb REST API. Configure:

```env
PULSOWEB_API_BASE_URL=https://app.pulsonic.com/rest
PULSOWEB_API_TOKEN=replace-with-your-token
PULSOWEB_DEFAULT_TIMEZONE=Africa/Lagos
```

After restarting the backend:

1. Open **Configuration → Data Providers** and test the PulsoWeb connection.
2. Select **Import Stations & Detect Locations** on the PulsoWeb provider card to add or refresh every station available to the configured token.
3. Use the **PulsoWeb Metadata Explorer** to identify the granularity, observation codes, and units published by the stations.
4. Add mappings under **PulsoWeb Mappings**. Map each numeric observation code to an application field such as `airTemperature`, `relativeHumidity`, `windSpeed`, `windDirection`, `precipitation`, `solarRadiation`, or `atmosphericPressure`.
5. Run a manual PulsoWeb synchronization for the desired initial date range. Subsequent scheduled runs resume from the latest saved reading with a small overlap.

PulsoWeb station IDs are stored internally with a `PULSOWEB:` prefix to prevent collisions with other providers. The original numeric code is retained in `source_station_id`. Because PulsoWeb may not supply coordinates, imported stations can initially appear without a map until their coordinates are added.

## Station location detection

CLIMDES, TAHMO, and PulsoWeb provider cards include **Import Stations & Detect Locations**. Provider imports and data synchronizations automatically detect missing State/LGA values when station coordinates are available. WAGTECH stations are discovered from FTP files; because that feed does not supply trustworthy coordinates, detection occurs after an administrator saves the station's real latitude and longitude. Detection uses the OpenStreetMap Nominatim reverse-geocoding service and stores the result locally. Optional configuration:

```env
GEOCODING_BASE_URL=https://nominatim.openstreetmap.org
GEOCODING_USER_AGENT=NiMet-ADL/1.0 (station administration)
```

Use a self-hosted or approved provider URL for higher-volume deployments. The public OpenStreetMap service is limited to one request per second and requires attribution.


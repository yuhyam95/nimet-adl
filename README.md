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


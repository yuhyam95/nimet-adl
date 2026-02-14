require('dotenv').config();

module.exports = {
  db: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT
  },
  api: {
    baseUrl: process.env.API_BASE_URL,
    email: process.env.API_EMAIL,
    password: process.env.API_PASSWORD,
    dataLoggerId: process.env.API_DATALOGGER_ID,
    loginEndpoint: process.env.API_LOGIN_ENDPOINT,
    loggersEndpoint: process.env.API_LOGGERS_ENDPOINT,
    weatherEndpoint: process.env.API_WEATHER_ENDPOINT
  }
};

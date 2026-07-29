require('dotenv').config();
const path = require('path');

module.exports = {
  get db() {
    return {
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      port: process.env.DB_PORT
    };
  },
  get api() {
    return {
      baseUrl: process.env.API_BASE_URL,
      email: process.env.API_EMAIL,
      password: process.env.API_PASSWORD,
      dataLoggerId: process.env.API_DATALOGGER_ID,
      loginEndpoint: process.env.API_LOGIN_ENDPOINT,
      loggersEndpoint: process.env.API_LOGGERS_ENDPOINT,
      weatherEndpoint: process.env.API_WEATHER_ENDPOINT
    };
  },
  get tahmo() {
    return {
      baseUrl: process.env.TAHMO_API_BASE_URL || 'https://tahmoapi.mybluemix.net/v1',
      apiKey: process.env.TAHMO_API_KEY,
      apiSecret: process.env.TAHMO_API_SECRET
    };
  },
  get wagtech() {
    return {
      ftpHost: process.env.WAGTECH_FTP_HOST,
      ftpPort: process.env.WAGTECH_FTP_PORT || '21',
      ftpUser: process.env.WAGTECH_FTP_USER,
      ftpPassword: process.env.WAGTECH_FTP_PASSWORD
    };
  },
  get exportPath() {
    return process.env.EXPORT_PATH || path.join(process.cwd(), 'exports');
  },
  get wis2box() {
    return {
      endpoint: process.env.WIS2BOX_MINIO_ENDPOINT,
      port: process.env.WIS2BOX_MINIO_PORT ? parseInt(process.env.WIS2BOX_MINIO_PORT, 10) : undefined,
      useSSL: process.env.WIS2BOX_MINIO_USE_SSL === 'true',
      accessKey: process.env.WIS2BOX_MINIO_ACCESS_KEY,
      secretKey: process.env.WIS2BOX_MINIO_SECRET_KEY,
      bucket: process.env.WIS2BOX_MINIO_BUCKET || 'wis2box-incoming'
    };
  }
};

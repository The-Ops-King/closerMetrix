/**
 * SERVER CONFIGURATION
 * Loads environment variables with sensible defaults.
 * All config values used anywhere in the server come from this file.
 */

require('dotenv').config();

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 8080,
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: (process.env.NODE_ENV || 'development') === 'development',

  // BigQuery
  gcpProjectId: process.env.GCP_PROJECT_ID || 'closer-automation',
  bqDataset: process.env.BQ_DATASET || 'CloserAutomation',
  // Path to service account key JSON file
  googleCredentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
  // Base64-encoded key (used in Cloud Run where file mount isn't ideal)
  gcpServiceAccountKey: process.env.GCP_SERVICE_ACCOUNT_KEY || '',

  // Authentication
  // Default 'dev-admin-key' in development so admin login works without .env
  adminApiKey: process.env.ADMIN_API_KEY || 'dev-admin-key',

  // Backend API (the separate CloserMetrix Backend service)
  backendApiUrl: process.env.BACKEND_API_URL || 'http://localhost:8080',

  // CORS — in dev, allow Vite dev server
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = config;

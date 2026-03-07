/**
 * MAIN CONFIG LOADER
 *
 * Reads environment variables from .env and provides typed, validated
 * configuration for every module in the system.
 *
 * Usage:
 *   const config = require('./config');
 *   config.bigquery.projectId  // 'closer-automation'
 *   config.ai.model            // 'claude-sonnet-4-5-20250929'
 *
 * Every value has a sensible default so the app can start in development
 * without a .env file (BigQuery and Anthropic calls will fail, but the
 * server boots and health-check works).
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });

const config = {
  /** Express / HTTP server */
  server: {
    port: parseInt(process.env.BACKEND_PORT || process.env.PORT, 10) || 8080,
    nodeEnv: process.env.NODE_ENV || 'development',
    baseUrl: process.env.BASE_URL || 'http://localhost:8080',
  },

  /** Admin authentication — single static key for Tyler */
  admin: {
    apiKey: process.env.ADMIN_API_KEY || '',
  },

  /** Google Cloud Platform */
  gcp: {
    projectId: process.env.GCP_PROJECT_ID || 'closer-automation',
    location: process.env.GCP_LOCATION || 'us-central1',
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS || './service-account.json',
  },

  /** BigQuery */
  bigquery: {
    projectId: process.env.GCP_PROJECT_ID || 'closer-automation',
    dataset: process.env.BQ_DATASET || 'CloserAutomation',
  },

  /** AI processing — multi-provider */
  ai: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    googleAiApiKey: process.env.GOOGLE_AI_API_KEY || '',
    model: process.env.AI_MODEL || 'claude-sonnet-4-5-20250929',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4o',
    geminiModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS, 10) || 8000,
    inputCostPerMillion: parseFloat(process.env.AI_INPUT_COST_PER_MILLION) || 3.0,
    outputCostPerMillion: parseFloat(process.env.AI_OUTPUT_COST_PER_MILLION) || 15.0,
  },

  /** Google Calendar push notifications & OAuth credentials */
  calendar: {
    webhookUrl: process.env.GOOGLE_CALENDAR_WEBHOOK_URL || '',
    /**
     * OAuth2 credentials for Google Calendar API access.
     * Stored in Secret Manager as GOOGLE_CALENDAR_CREDENTIALS (JSON string).
     * Contains: { client_id, client_secret, refresh_token, type: "authorized_user" }
     * Tyler's account has read access to all closer calendars (they share with him).
     */
    credentials: (() => {
      const raw = process.env.GOOGLE_CALENDAR_CREDENTIALS;
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    })(),
  },

  /** Google Cloud Tasks (async job queue) */
  cloudTasks: {
    queue: process.env.CLOUD_TASKS_QUEUE || 'closermetrix-processing',
    serviceUrl: process.env.CLOUD_TASKS_SERVICE_URL || 'http://localhost:8080',
  },

  /** Email notifications (weekly/monthly reports) */
  email: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || 'CloserMetrix <reports@closermetrix.com>',
    testRecipient: process.env.EMAIL_TEST_RECIPIENT || 'jt@jtylerray.com',
  },

  /** Alerting channels */
  alerts: {
    slackWebhook: process.env.ALERT_SLACK_WEBHOOK || '',
    email: process.env.ALERT_EMAIL || '',
    sendgridApiKey: process.env.SENDGRID_API_KEY || '',
  },

  /** Timeouts and polling */
  timeouts: {
    transcriptTimeoutMinutes: parseInt(process.env.TRANSCRIPT_TIMEOUT_MINUTES, 10) || 5,
    ghostCheckIntervalMinutes: parseInt(process.env.GHOST_CHECK_INTERVAL_MINUTES, 10) || 5,
  },

  /** Fathom transcript polling — backoff intervals in seconds */
  fathom: {
    pollIntervals: (process.env.FATHOM_POLL_INTERVALS || '30,60,120,300,600,900')
      .split(',')
      .map(s => parseInt(s.trim(), 10)),
  },

  /** Transcript evaluation thresholds */
  transcriptThresholds: {
    minLength: 50,
    minProspectUtterances: 3,
    minProspectWords: 50,
  },

  /** Payment matching thresholds */
  matching: {
    jaroWinklerThreshold: parseFloat(process.env.FUZZY_MATCH_THRESHOLD) || 0.82,
  },
};

module.exports = config;

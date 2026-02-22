/**
 * MIGRATION 003: Create CostTracking Table
 *
 * Tracks AI processing costs per call, per client.
 * One row per Anthropic API call. Enables cost-per-call and cost-per-client reporting.
 *
 * Run once against the closer-automation.CloserAutomation dataset.
 */

const { BigQuery } = require('@google-cloud/bigquery');
const config = require('../../config');

const SQL = `
CREATE TABLE IF NOT EXISTS \`${config.bigquery.projectId}.${config.bigquery.dataset}.CostTracking\` (
  cost_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  client_id STRING NOT NULL,
  call_id STRING NOT NULL,
  model STRING NOT NULL,
  input_tokens INT64 NOT NULL,
  output_tokens INT64 NOT NULL,
  input_cost_usd FLOAT64 NOT NULL,
  output_cost_usd FLOAT64 NOT NULL,
  total_cost_usd FLOAT64 NOT NULL,
  processing_time_ms INT64,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)`;

async function up() {
  const bq = new BigQuery({ projectId: config.bigquery.projectId });
  console.log('Running migration 003: Create CostTracking table...');
  await bq.query({ query: SQL, location: 'US' });
  console.log('Migration 003 complete.');
}

module.exports = { up, SQL };

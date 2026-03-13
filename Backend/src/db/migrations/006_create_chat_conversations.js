/**
 * MIGRATION 006: Create ChatConversations Table
 *
 * Stores all chatbot messages — user messages, assistant responses, tool calls,
 * and tool results. Grouped by conversation_id for thread continuity.
 *
 * Run once against the closer-automation.CloserAutomation dataset.
 */

const { BigQuery } = require('@google-cloud/bigquery');
const config = require('../../config');

const SQL = `
CREATE TABLE IF NOT EXISTS \`${config.bigquery.projectId}.${config.bigquery.dataset}.ChatConversations\` (
  conversation_id STRING NOT NULL,
  client_id STRING NOT NULL,
  message_id STRING NOT NULL,
  role STRING NOT NULL,
  content STRING,
  tool_name STRING,
  tool_input STRING,
  tool_output STRING,
  input_tokens INT64,
  output_tokens INT64,
  model STRING,
  created_at TIMESTAMP NOT NULL,
  status STRING DEFAULT 'Active'
)`;

async function up() {
  const bq = new BigQuery({ projectId: config.bigquery.projectId });
  console.log('Running migration 006: Create ChatConversations table...');
  await bq.query({ query: SQL, location: 'US' });
  console.log('Migration 006 complete.');
}

module.exports = { up, SQL };

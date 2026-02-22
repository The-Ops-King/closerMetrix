/**
 * MIGRATION RUNNER
 *
 * Runs all migrations in order. Safe to run multiple times —
 * all CREATE TABLE statements use IF NOT EXISTS.
 *
 * Usage: node src/db/migrations/run.js
 */

require('dotenv').config();

const migration001 = require('./001_create_prospects');
const migration002 = require('./002_create_audit_log');
const migration003 = require('./003_create_cost_tracking');

async function runAll() {
  console.log('Starting migrations...\n');

  try {
    await migration001.up();
    await migration002.up();
    await migration003.up();
    console.log('\nAll migrations completed successfully.');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exit(1);
  }
}

runAll();

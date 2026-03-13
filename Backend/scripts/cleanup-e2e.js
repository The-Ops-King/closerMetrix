#!/usr/bin/env node

/**
 * CLEANUP E2E TEST DATA
 *
 * Finds all clients with company_name LIKE 'E2E Test%' in BigQuery
 * and hard-deletes their data from all related tables.
 *
 * Usage: cd Backend && node scripts/cleanup-e2e.js
 *
 * Tables cleaned (in order to respect foreign-key-like relationships):
 *   Objections, CostTracking, AuditLog, Prospects, Calls,
 *   AccessTokens, Closers, Clients
 */

// Load env from project root
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const bq = require('../src/db/BigQueryClient');

const TABLES_TO_CLEAN = [
  'Objections',
  'CostTracking',
  'AuditLog',
  'Prospects',
  'Calls',
  'AccessTokens',
  'Closers',
];

async function main() {
  console.log('=== E2E Test Data Cleanup ===\n');

  // 1. Find all E2E test clients
  console.log('Searching for clients with company_name LIKE "E2E Test%"...');
  const clients = await bq.queryAdmin(
    `SELECT client_id, company_name, status
     FROM ${bq.table('Clients')}
     WHERE company_name LIKE 'E2E Test%'`
  );

  if (clients.length === 0) {
    console.log('No E2E test clients found. Nothing to clean up.');
    return;
  }

  console.log(`Found ${clients.length} E2E test client(s):\n`);
  for (const c of clients) {
    console.log(`  - ${c.company_name} (${c.client_id}) [${c.status}]`);
  }
  console.log('');

  // 2. For each client, delete from all related tables
  let totalDeleted = 0;

  for (const client of clients) {
    const clientId = client.client_id;
    console.log(`--- Cleaning client: ${client.company_name} (${clientId}) ---`);

    for (const tableName of TABLES_TO_CLEAN) {
      try {
        // Count rows first
        const countRows = await bq.queryAdmin(
          `SELECT COUNT(*) as cnt FROM ${bq.table(tableName)} WHERE client_id = @clientId`,
          { clientId }
        );
        const count = countRows[0]?.cnt || 0;

        if (count > 0) {
          await bq.queryAdmin(
            `DELETE FROM ${bq.table(tableName)} WHERE client_id = @clientId`,
            { clientId }
          );
          console.log(`  ${tableName}: deleted ${count} row(s)`);
          totalDeleted += count;
        } else {
          console.log(`  ${tableName}: 0 rows (skipped)`);
        }
      } catch (err) {
        // Table might not exist or have different schema — log and continue
        console.warn(`  ${tableName}: ERROR - ${err.message}`);
      }
    }

    // Delete the client record itself last
    try {
      await bq.queryAdmin(
        `DELETE FROM ${bq.table('Clients')} WHERE client_id = @clientId`,
        { clientId }
      );
      console.log(`  Clients: deleted 1 row`);
      totalDeleted += 1;
    } catch (err) {
      console.warn(`  Clients: ERROR - ${err.message}`);
    }

    console.log('');
  }

  console.log(`=== Done. Total rows deleted: ${totalDeleted} ===`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

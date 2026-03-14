#!/usr/bin/env node
/**
 * Fix Duplicate Calls — One-time cleanup script
 *
 * Client: 39c63ff4-3aa0-4a3c-848d-173d0c3ac75c
 * Three call records were created from a single Fathom call.
 * This script keeps the earliest-created record and deletes the other two,
 * along with any linked Objections and AuditLog rows.
 */

const bq = require('../src/db/BigQueryClient');

const CLIENT_ID = '39c63ff4-3aa0-4a3c-848d-173d0c3ac75c';
const DUPLICATE_CALL_IDS = [
  'cc56e077-4482-4d6d-8e95-d34d4d1f0c23',
  '7fa1968c-069d-4072-8414-be3721c74530',
  'a879cf97-874b-470f-99de-328f3dfaa0ed',
];

async function main() {
  console.log('=== Duplicate Call Cleanup ===\n');

  // Step 1: Query all 3 records
  console.log('Step 1: Fetching all 3 call records...\n');
  const rows = await bq.queryAdmin(
    `SELECT call_id, appointment_id, prospect_name, prospect_email,
            attendance, call_outcome, created, last_modified
     FROM \`closer-automation.CloserAutomation.Calls\`
     WHERE client_id = @clientId
       AND call_id IN UNNEST(@callIds)
     ORDER BY created ASC`,
    { clientId: CLIENT_ID, callIds: DUPLICATE_CALL_IDS }
  );

  if (rows.length === 0) {
    console.log('No matching records found. Already cleaned up?');
    return;
  }

  console.log(`Found ${rows.length} records:\n`);
  rows.forEach((r, i) => {
    console.log(`  ${i + 1}. call_id: ${r.call_id}`);
    console.log(`     appointment_id: ${r.appointment_id}`);
    console.log(`     prospect: ${r.prospect_name} (${r.prospect_email})`);
    console.log(`     attendance: ${r.attendance}, outcome: ${r.call_outcome}`);
    console.log(`     created: ${r.created}`);
    console.log('');
  });

  // Step 2: Keep the first (earliest created), delete the rest
  const keeper = rows[0];
  const toDelete = rows.slice(1);
  const deleteIds = toDelete.map(r => r.call_id);

  console.log(`Keeping: ${keeper.call_id} (created: ${keeper.created})`);
  console.log(`Deleting: ${deleteIds.join(', ')}\n`);

  if (deleteIds.length === 0) {
    console.log('Nothing to delete.');
    return;
  }

  // Step 3: Delete linked Objections
  console.log('Step 3: Deleting linked Objections...');
  await bq.queryAdmin(
    `DELETE FROM \`closer-automation.CloserAutomation.Objections\`
     WHERE client_id = @clientId AND call_id IN UNNEST(@deleteIds)`,
    { clientId: CLIENT_ID, deleteIds }
  );
  console.log('  Done.\n');

  // Step 4: Delete linked AuditLog
  console.log('Step 4: Deleting linked AuditLog entries...');
  await bq.queryAdmin(
    `DELETE FROM \`closer-automation.CloserAutomation.AuditLog\`
     WHERE client_id = @clientId AND entity_id IN UNNEST(@deleteIds)`,
    { clientId: CLIENT_ID, deleteIds }
  );
  console.log('  Done.\n');

  // Step 5: Delete the duplicate call records
  console.log('Step 5: Deleting duplicate call records...');
  await bq.queryAdmin(
    `DELETE FROM \`closer-automation.CloserAutomation.Calls\`
     WHERE client_id = @clientId AND call_id IN UNNEST(@deleteIds)`,
    { clientId: CLIENT_ID, deleteIds }
  );
  console.log('  Done.\n');

  // Step 6: Confirm
  console.log('Step 6: Verifying...');
  const remaining = await bq.queryAdmin(
    `SELECT call_id, created FROM \`closer-automation.CloserAutomation.Calls\`
     WHERE client_id = @clientId AND call_id IN UNNEST(@callIds)`,
    { clientId: CLIENT_ID, callIds: DUPLICATE_CALL_IDS }
  );
  console.log(`  Remaining records: ${remaining.length} (expected: 1)`);
  if (remaining.length === 1) {
    console.log(`  Canonical record: ${remaining[0].call_id}`);
  }
  console.log('\nCleanup complete.');
}

main().catch(err => {
  console.error('Cleanup failed:', err.message);
  process.exit(1);
});

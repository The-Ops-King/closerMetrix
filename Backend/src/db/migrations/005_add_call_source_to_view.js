/**
 * Migration 005: Add call_source to v_calls_joined_flat_prefixed view
 *
 * The call_source column was added to the Calls table in the better-triggers branch.
 * The BQ view uses an explicit column list, so call_source won't appear automatically.
 * This migration patches the view DDL to include calls_call_source.
 */

async function up(bq, dataset, projectId) {
  console.log('Migration 005: Adding call_source to v_calls_joined_flat_prefixed view');
  await updateView(bq, dataset, projectId);
  console.log('Migration 005: Complete');
}

/**
 * Patches the v_calls_joined_flat_prefixed view to include calls_call_source.
 * Uses the same DDL-patching approach as migration 004.
 */
async function updateView(bq, dataset, projectId) {
  const viewName = 'v_calls_joined_flat_prefixed';

  // Read existing view DDL
  const [viewRows] = await bq.query({
    query: `
      SELECT view_definition
      FROM \`${projectId}.${dataset}.INFORMATION_SCHEMA.VIEWS\`
      WHERE table_name = @viewName
    `,
    params: { viewName },
    location: 'US',
  });

  if (viewRows.length === 0) {
    console.log(`  WARNING: View ${viewName} does not exist — skipping view update.`);
    return;
  }

  const existingDDL = viewRows[0].view_definition;
  console.log(`  Retrieved existing view DDL (${existingDDL.length} chars)`);

  // Check if the column is already in the view
  if (existingDDL.includes('call_source')) {
    console.log(`  View already includes call_source, skipping update.`);
    return;
  }

  // Inject the new column before the FROM clause
  const fromMatch = existingDDL.match(/(\n\s*FROM\s)/i);
  if (!fromMatch) {
    console.log('  WARNING: Could not locate FROM clause in view DDL — skipping view update.');
    console.log('  Manual intervention required to add call_source to the view.');
    return;
  }

  const insertPos = existingDDL.indexOf(fromMatch[0]);
  const newColumn = ',\n  c.call_source AS calls_call_source';
  const modifiedDDL = existingDDL.slice(0, insertPos) + newColumn + existingDDL.slice(insertPos);

  // Recreate the view
  await bq.query({
    query: `CREATE OR REPLACE VIEW \`${projectId}.${dataset}.${viewName}\` AS\n${modifiedDDL}`,
    location: 'US',
  });
  console.log(`  Updated view ${viewName}: added calls_call_source`);
}

module.exports = { up };

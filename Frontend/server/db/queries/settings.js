/**
 * SETTINGS PAGE QUERIES
 *
 * Returns client config data for the Settings page:
 *   - Client fields (AI prompts, script, offers, etc.)
 *   - Closers list (active + inactive)
 *   - Parsed settings_json (KPIs, notifications, offers list, commission)
 *
 * Unlike other query files, this doesn't compute metrics/charts —
 * it returns raw config data for display and editing.
 */

const bq = require('../BigQueryClient');
const logger = require('../../utils/logger');

/**
 * Fetch settings data for a client.
 *
 * @param {string} clientId - The authenticated client's ID
 * @returns {Promise<object>} { client, closers }
 */
async function getSettingsData(clientId) {
  if (!bq.isAvailable()) {
    logger.debug('BigQuery unavailable — returning empty settings');
    return { client: null, closers: [] };
  }

  // Fetch client record and closers in parallel
  const [clientRows, closerRows] = await Promise.all([
    bq.runQuery(
      `SELECT
        client_id,
        company_name,
        plan_tier,
        offer_name,
        offer_price,
        offer_description,
        ai_prompt_overall,
        ai_prompt_discovery,
        ai_prompt_pitch,
        ai_prompt_close,
        ai_prompt_objections,
        ai_context_notes,
        script_template,
        notification_email,
        settings_json
      FROM ${bq.table('Clients')}
      WHERE client_id = @clientId`,
      { clientId }
    ),
    bq.runQuery(
      `SELECT
        closer_id,
        name,
        work_email,
        status
      FROM ${bq.table('Closers')}
      WHERE client_id = @clientId
      ORDER BY status ASC, name ASC`,
      { clientId }
    ),
  ]);

  const client = clientRows[0] || null;

  // Parse settings_json if present
  let settingsJson = null;
  if (client?.settings_json) {
    try {
      settingsJson = JSON.parse(client.settings_json);
    } catch (err) {
      logger.warn('Failed to parse settings_json', { clientId, error: err.message });
    }
  }

  return {
    client: client ? { ...client, parsed_settings: settingsJson } : null,
    closers: closerRows,
  };
}

module.exports = { getSettingsData };

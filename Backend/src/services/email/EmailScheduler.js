/**
 * EMAIL SCHEDULER
 *
 * Orchestrates the full email send flow:
 *   1. Query all clients with weekly/monthly enabled
 *   2. For each client: fetch data → generate AI insights → render HTML → send
 *
 * Handles errors per-client so one failure doesn't block others.
 * Also provides single-client methods for testing and manual triggers.
 */

const bq = require('../../db/BigQueryClient');
const logger = require('../../utils/logger');
const { fetchEmailData } = require('./EmailDataFetcher');
const { generateInsights } = require('./EmailInsightGenerator');
const { renderWeeklyReport, renderMonthlyReport, getEmailAttachments } = require('./EmailTemplateEngine');
const emailService = require('./EmailService');

/**
 * Sends weekly reports to all eligible clients.
 * Called by cron (Monday 9am EST) or manual trigger.
 *
 * @returns {Object} { sent: number, failed: number, results: [] }
 */
async function sendWeeklyReports() {
  logger.info('EmailScheduler: Starting weekly report send');
  return _sendReports('weekly');
}

/**
 * Sends monthly reports to all eligible clients.
 * Called by cron (1st of month 9am EST) or manual trigger.
 *
 * @returns {Object} { sent: number, failed: number, results: [] }
 */
async function sendMonthlyReports() {
  logger.info('EmailScheduler: Starting monthly report send');
  return _sendReports('monthly');
}

/**
 * Sends a report for a single client. Used for testing and manual triggers.
 *
 * @param {string} clientId - Client to send for
 * @param {'weekly'|'monthly'} reportType - Report type
 * @returns {Object} { success, clientId, recipients, error? }
 */
async function sendReportForClient(clientId, reportType, recipientOverride = null) {
  try {
    // Get client settings
    const clientRows = await bq.query(
      `SELECT client_id, company_name, primary_contact_email, settings_json
       FROM ${bq.table('Clients')}
       WHERE client_id = @clientId AND LOWER(status) = 'active'`,
      { clientId }
    );

    if (clientRows.length === 0) {
      throw new Error(`Client not found or inactive: ${clientId}`);
    }

    const client = clientRows[0];
    const settings = parseSettings(client.settings_json);
    const sections = settings.notifications?.include_sections || [];
    const recipients = recipientOverride ? [recipientOverride] : getRecipients(settings, client.primary_contact_email);

    if (recipients.length === 0) {
      throw new Error('No recipients configured');
    }

    // 1. Fetch real data from BigQuery
    logger.info('EmailScheduler: Fetching data', { clientId, reportType });
    const data = await fetchEmailData(clientId, reportType);

    // 2. Generate AI insights
    logger.info('EmailScheduler: Generating insights', { clientId });
    const insights = await generateInsights(data, sections);
    data.insights = insights;

    // 3. Render HTML + build CID attachments (logo)
    const renderFn = reportType === 'monthly' ? renderMonthlyReport : renderWeeklyReport;
    const html = renderFn(data, sections.length > 0 ? sections : undefined);
    const attachments = getEmailAttachments();

    // 4. Send to each recipient
    const subject = `CloserMetrix ${reportType === 'monthly' ? 'Monthly' : 'Weekly'} Report — ${data.company_name} (${data.report_period.label})`;

    const sendResults = [];
    for (const recipient of recipients) {
      try {
        const result = await emailService.sendEmail(recipient, subject, html, attachments);
        sendResults.push({ recipient, success: true, messageId: result.messageId });
      } catch (sendError) {
        sendResults.push({ recipient, success: false, error: sendError.message });
        logger.error('EmailScheduler: Failed to send to recipient', {
          clientId, recipient, error: sendError.message,
        });
      }
    }

    logger.info('EmailScheduler: Report sent for client', {
      clientId,
      reportType,
      company: data.company_name,
      recipientCount: recipients.length,
      successCount: sendResults.filter(r => r.success).length,
    });

    return {
      success: true,
      clientId,
      company_name: data.company_name,
      reportType,
      recipients: sendResults,
      period: data.report_period.label,
    };
  } catch (error) {
    logger.error('EmailScheduler: Failed for client', {
      clientId, reportType, error: error.message,
    });
    return {
      success: false,
      clientId,
      reportType,
      error: error.message,
    };
  }
}

// ── Internal helpers ──────────────────────────────────────

/**
 * Core send flow: query eligible clients, send reports in sequence.
 * Errors per client are caught and logged, not thrown.
 */
async function _sendReports(reportType) {
  const enabledField = reportType === 'monthly' ? 'monthly_enabled' : 'weekly_enabled';

  // Query all clients that have this report type enabled
  const clients = await bq.query(
    `SELECT client_id, company_name, primary_contact_email, settings_json
     FROM ${bq.table('Clients')}
     WHERE LOWER(status) = 'active'
       AND JSON_VALUE(settings_json, '$.notifications.${enabledField}') = 'true'`,
    {}
  );

  logger.info(`EmailScheduler: Found ${clients.length} clients with ${reportType} enabled`);

  if (clients.length === 0) {
    return { sent: 0, failed: 0, results: [] };
  }

  const results = [];
  let sent = 0;
  let failed = 0;

  // Process clients sequentially to avoid overwhelming AI/SMTP
  for (const client of clients) {
    const result = await sendReportForClient(client.client_id, reportType);
    results.push(result);
    if (result.success) sent++;
    else failed++;
  }

  logger.info(`EmailScheduler: ${reportType} send complete`, { sent, failed, total: clients.length });

  return { sent, failed, results };
}

/**
 * Parses settings_json from BigQuery (could be string or object).
 */
function parseSettings(settingsJson) {
  if (!settingsJson) return {};
  if (typeof settingsJson === 'object') return settingsJson;
  try {
    return JSON.parse(settingsJson);
  } catch {
    return {};
  }
}

/**
 * Gets recipient list from settings, falling back to primary contact email.
 */
function getRecipients(settings, primaryEmail) {
  const recipients = settings.notifications?.recipients;
  if (Array.isArray(recipients) && recipients.length > 0) {
    return recipients.filter(r => r && r.includes('@'));
  }
  if (primaryEmail) return [primaryEmail];
  return [];
}

module.exports = {
  sendWeeklyReports,
  sendMonthlyReports,
  sendReportForClient,
};

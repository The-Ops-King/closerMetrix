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
const { fetchEmailData, fetchDailyOnboardingData } = require('./EmailDataFetcher');
const { generateInsights } = require('./EmailInsightGenerator');
const { renderWeeklyReport, renderMonthlyReport, renderDailyOnboardingReport, getEmailAttachments } = require('./EmailTemplateEngine');
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
    const baseUrl = require('../../config').server.baseUrl || '';
    const html = renderFn(data, sections.length > 0 ? sections : undefined, { baseUrl });
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
  const clients = await bq.queryAdmin(
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

// ── Daily Onboarding Email Logic ──────────────────────────

/**
 * Returns the current hour (0-23) in the given timezone using native Intl.
 */
function getLocalHour(timezone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour: 'numeric', hour12: false,
    });
    return parseInt(formatter.format(new Date()), 10);
  } catch {
    return -1; // Invalid timezone — skip
  }
}

/**
 * Returns today's date string in the given timezone.
 */
function getLocalDate(timezone) {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone });
    return formatter.format(new Date()); // en-CA gives YYYY-MM-DD
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

/**
 * Sends daily onboarding reports for all eligible closers.
 * Called hourly by cron. Checks each watch entry's timezone —
 * only sends when the closer's local time is 6pm (18:00).
 *
 * Auto-disables watches past their onboarding window.
 *
 * @returns {Object} { sent, skipped, disabled, errors }
 */
async function sendDailyOnboardingReports() {
  logger.info('EmailScheduler: Starting daily onboarding check');

  // Query all active clients with close_watches in settings_json
  const clients = await bq.queryAdmin(
    `SELECT client_id, company_name, primary_contact_email, settings_json, timezone
     FROM ${bq.table('Clients')}
     WHERE LOWER(status) = 'active'
       AND settings_json IS NOT NULL
       AND JSON_EXTRACT(settings_json, '$.close_watches') IS NOT NULL`,
    {}
  );

  let sent = 0, skipped = 0, disabled = 0, errors = 0;

  for (const client of clients) {
    const settings = parseSettings(client.settings_json);
    const watches = settings.notifications?.close_watches || [];
    if (watches.length === 0) continue;

    let settingsChanged = false;

    for (const watch of watches) {
      if (!watch.enabled) { skipped++; continue; }

      try {
        // Get closer's timezone
        const closerRows = await bq.query(
          `SELECT timezone, created_at FROM ${bq.table('Closers')}
           WHERE closer_id = @closerId AND client_id = @clientId`,
          { closerId: watch.closer_id, clientId: client.client_id }
        );
        const closer = closerRows[0];
        if (!closer) { skipped++; continue; }

        const tz = closer.timezone || client.timezone || 'America/New_York';

        // Check if close watch has days remaining
        const daysLeft = watch.duration_value || 0;

        if (daysLeft <= 0) {
          // No days left — auto-disable
          watch.enabled = false;
          settingsChanged = true;
          disabled++;
          logger.info('EmailScheduler: Auto-disabled close watch (0 days remaining)', {
            clientId: client.client_id, closerId: watch.closer_id,
          });
          continue;
        }

        // Check if current hour in closer's timezone is 18 (6pm)
        const localHour = getLocalHour(tz);
        if (localHour !== 18) { skipped++; continue; }

        // It's 6pm in the closer's timezone — send the report
        const localDate = getLocalDate(tz);
        const result = await sendOnboardingReportForCloser(client.client_id, watch.closer_id, null, localDate);

        if (result.success) {
          sent++;
          // Decrement days remaining
          watch.duration_value = Math.max(0, daysLeft - 1);
          settingsChanged = true;
        } else {
          errors++;
          logger.error('EmailScheduler: Onboarding report failed', {
            clientId: client.client_id, closerId: watch.closer_id, error: result.error,
          });
        }
      } catch (error) {
        errors++;
        logger.error('EmailScheduler: Close watch error', {
          clientId: client.client_id, closerId: watch.closer_id, error: error.message,
        });
      }
    }

    // Persist settings_json if any watches were disabled
    if (settingsChanged) {
      try {
        if (!settings.notifications) settings.notifications = {};
        settings.notifications.close_watches = watches;
        await bq.query(
          `UPDATE ${bq.table('Clients')}
           SET settings_json = @settingsJson, last_modified = CURRENT_TIMESTAMP()
           WHERE client_id = @clientId`,
          { clientId: client.client_id, settingsJson: JSON.stringify(settings) }
        );
      } catch (error) {
        logger.error('EmailScheduler: Failed to update settings_json', {
          clientId: client.client_id, error: error.message,
        });
      }
    }
  }

  logger.info('EmailScheduler: Daily onboarding check complete', { sent, skipped, disabled, errors });
  return { sent, skipped, disabled, errors };
}

/**
 * Sends a daily onboarding email for a single closer.
 * Used by the hourly cron and the manual trigger endpoint.
 *
 * @param {string} clientId
 * @param {string} closerId
 * @param {string|null} recipientOverride - Override recipient email
 * @param {string|null} dateStr - Date override (YYYY-MM-DD)
 * @returns {Object} { success, clientId, closerId, recipients?, error? }
 */
async function sendOnboardingReportForCloser(clientId, closerId, recipientOverride = null, dateStr = null) {
  try {
    // Get client for recipients
    const clientRows = await bq.query(
      `SELECT client_id, company_name, primary_contact_email, settings_json
       FROM ${bq.table('Clients')}
       WHERE client_id = @clientId AND LOWER(status) = 'active'`,
      { clientId }
    );
    if (clientRows.length === 0) throw new Error(`Client not found or inactive: ${clientId}`);

    const client = clientRows[0];
    const settings = parseSettings(client.settings_json);
    const recipients = recipientOverride
      ? [recipientOverride]
      : getRecipients(settings, client.primary_contact_email);

    if (recipients.length === 0) throw new Error('No recipients configured');

    // Fetch real data
    const data = await fetchDailyOnboardingData(clientId, closerId, dateStr);

    // Render HTML
    const html = renderDailyOnboardingReport(data);
    const attachments = getEmailAttachments();

    // Send
    const subject = `CloserMetrix Closer Watch — ${data.closer.name} (${data.days_remaining} days left)`;

    const sendResults = [];
    for (const recipient of recipients) {
      try {
        const result = await emailService.sendEmail(recipient, subject, html, attachments);
        sendResults.push({ recipient, success: true, messageId: result.messageId });
      } catch (sendError) {
        sendResults.push({ recipient, success: false, error: sendError.message });
        logger.error('EmailScheduler: Failed to send onboarding email', {
          clientId, closerId, recipient, error: sendError.message,
        });
      }
    }

    logger.info('EmailScheduler: Onboarding report sent', {
      clientId, closerId, closerName: data.closer.name,
      daysRemaining: data.days_remaining, recipientCount: recipients.length,
    });

    return { success: true, clientId, closerId, recipients: sendResults };
  } catch (error) {
    logger.error('EmailScheduler: Onboarding report failed', {
      clientId, closerId, error: error.message,
    });
    return { success: false, clientId, closerId, error: error.message };
  }
}

module.exports = {
  sendWeeklyReports,
  sendMonthlyReports,
  sendReportForClient,
  sendDailyOnboardingReports,
  sendOnboardingReportForCloser,
};

/**
 * ALERT SERVICE
 *
 * Sends error notifications through pluggable channels.
 * Currently: structured console logging (always on).
 * Future: Slack webhook, email via SendGrid/SES.
 *
 * SEVERITY LEVELS:
 * - CRITICAL — Data loss or corruption risk. Log immediately with full context.
 * - HIGH     — Feature broken but data safe. Log immediately.
 * - MEDIUM   — Degraded but functional. Log as warning.
 * - LOW      — Informational. Debug-level log.
 *
 * Usage:
 *   const alertService = require('./utils/AlertService');
 *   await alertService.send({
 *     severity: 'critical',
 *     title: 'BigQuery Write Failed',
 *     details: 'INSERT into Calls table failed for call_id abc123',
 *     client: 'Acme Corp',
 *     error: error.message,
 *     suggestedAction: 'Check BigQuery quotas and service account permissions',
 *   });
 */

const config = require('../config');
const logger = require('./logger');

class AlertService {
  /**
   * Sends an alert through all configured channels.
   *
   * @param {Object} alert
   * @param {string} alert.severity — 'critical', 'high', 'medium', 'low'
   * @param {string} alert.title — Short description of what happened
   * @param {string} alert.details — Longer explanation with context
   * @param {string} [alert.client] — Client name if applicable
   * @param {string} [alert.error] — Error message
   * @param {string} [alert.suggestedAction] — What Tyler should do about it
   */
  async send({ severity, title, details, client = null, error = null, suggestedAction = null }) {
    const alert = {
      severity,
      title,
      details,
      client,
      error,
      suggestedAction,
      timestamp: new Date().toISOString(),
    };

    // Channel 1: Structured console logging (always on)
    this._logToConsole(alert);

    // Channel 2: Slack webhook (if configured)
    if (config.alerts.slackWebhook && (severity === 'critical' || severity === 'high')) {
      await this._sendSlack(alert);
    }

    // Channel 3: Email (if configured) — future
    // if (config.alerts.sendgridApiKey && config.alerts.email) {
    //   await this._sendEmail(alert);
    // }
  }

  /**
   * Logs the alert to console using the appropriate log level.
   */
  _logToConsole(alert) {
    const logData = {
      alertTitle: alert.title,
      details: alert.details,
      client: alert.client,
      error: alert.error,
      suggestedAction: alert.suggestedAction,
    };

    switch (alert.severity) {
      case 'critical':
      case 'high':
        logger.error(`[ALERT:${alert.severity.toUpperCase()}] ${alert.title}`, logData);
        break;
      case 'medium':
        logger.warn(`[ALERT:MEDIUM] ${alert.title}`, logData);
        break;
      case 'low':
        logger.debug(`[ALERT:LOW] ${alert.title}`, logData);
        break;
    }
  }

  /**
   * Sends alert to Slack via incoming webhook.
   * Slack webhooks accept a simple JSON payload with a "text" field.
   */
  async _sendSlack(alert) {
    try {
      const payload = {
        text: `*[${alert.severity.toUpperCase()}] ${alert.title}*\n${alert.details}${alert.client ? `\nClient: ${alert.client}` : ''}${alert.error ? `\nError: \`${alert.error}\`` : ''}${alert.suggestedAction ? `\nAction: ${alert.suggestedAction}` : ''}`,
      };

      await fetch(config.alerts.slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      // Alerting should never crash the main flow
      logger.error('Failed to send Slack alert', { error: error.message });
    }
  }
}

module.exports = new AlertService();

/**
 * EMAIL SERVICE
 *
 * Handles all outbound email sending via Resend.
 * This is the only place in the system that sends emails.
 *
 * Usage:
 *   const emailService = require('./EmailService');
 *   await emailService.sendTestWeekly();       // sends to test recipient
 *   await emailService.sendEmail(to, subject, html);  // send arbitrary email
 */

const { Resend } = require('resend');
const config = require('../../config');
const logger = require('../../utils/logger');
const { renderWeeklyReport, renderMonthlyReport, getEmailAttachments } = require('./EmailTemplateEngine');
const { weeklyTestData, monthlyTestData } = require('./testData');

class EmailService {
  constructor() {
    this.client = null;
    this._initialized = false;
  }

  /**
   * Creates the Resend client. Called lazily on first send.
   * Fails gracefully if the API key isn't configured (logs instead of sending).
   */
  _init() {
    if (this._initialized) return;

    const { resendApiKey } = config.email;

    if (!resendApiKey) {
      logger.warn('EmailService: RESEND_API_KEY not configured. Emails will be logged but not sent.');
      this._initialized = true;
      return;
    }

    this.client = new Resend(resendApiKey);
    this._initialized = true;
    logger.info('EmailService: Resend client initialized');
  }

  /**
   * Sends an email via Resend. If no API key is configured, logs the email instead.
   *
   * @param {string|string[]} to - Recipient email address(es)
   * @param {string} subject - Email subject line
   * @param {string} html - HTML body content
   * @param {Object[]} [attachments] - Attachments ({ filename, content }). Images are
   *   served via public URLs, so this is normally empty.
   * @returns {Object} { success: boolean, messageId?: string, logged?: boolean }
   */
  async sendEmail(to, subject, html, attachments = []) {
    this._init();

    if (!this.client) {
      logger.info('EmailService: Email logged (no RESEND_API_KEY configured)', {
        to,
        subject,
        htmlLength: html.length,
      });
      return { success: true, logged: true };
    }

    const payload = {
      from: config.email.from,
      to,
      subject,
      html,
    };
    if (attachments && attachments.length > 0) {
      payload.attachments = attachments.map((a) => ({
        filename: a.filename,
        content: a.content,
      }));
    }

    try {
      const { data, error } = await this.client.emails.send(payload);
      if (error) {
        // Resend returns errors in the response body rather than throwing.
        throw new Error(error.message || JSON.stringify(error));
      }
      logger.info('EmailService: Email sent', {
        to,
        subject,
        messageId: data?.id,
      });
      return { success: true, messageId: data?.id };
    } catch (error) {
      logger.error('EmailService: Failed to send email', {
        to,
        subject,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Sends a test weekly report to the configured test recipient.
   * Uses hardcoded test data — no BigQuery needed.
   *
   * @param {string[]} sections - Which sections to include (optional, defaults to all)
   * @returns {Object} Send result
   */
  async sendTestWeekly(sections) {
    const html = renderWeeklyReport(weeklyTestData, sections);
    const attachments = getEmailAttachments();
    const to = config.email.testRecipient;
    const subject = `[TEST] CloserMetrix Weekly Report — ${weeklyTestData.company_name}`;
    return this.sendEmail(to, subject, html, attachments);
  }

  /**
   * Sends a test monthly report to the configured test recipient.
   *
   * @param {string[]} sections - Which sections to include (optional, defaults to all)
   * @returns {Object} Send result
   */
  async sendTestMonthly(sections) {
    const html = renderMonthlyReport(monthlyTestData, sections);
    const attachments = getEmailAttachments();
    const to = config.email.testRecipient;
    const subject = `[TEST] CloserMetrix Monthly Report — ${monthlyTestData.company_name}`;
    return this.sendEmail(to, subject, html, attachments);
  }
}

// Export singleton
module.exports = new EmailService();

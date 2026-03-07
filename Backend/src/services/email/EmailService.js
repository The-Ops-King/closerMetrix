/**
 * EMAIL SERVICE
 *
 * Handles all outbound email sending via nodemailer.
 * This is the only place in the system that sends emails.
 *
 * Usage:
 *   const emailService = require('./EmailService');
 *   await emailService.sendTestWeekly();       // sends to test recipient
 *   await emailService.sendEmail(to, subject, html);  // send arbitrary email
 */

const nodemailer = require('nodemailer');
const config = require('../../config');
const logger = require('../../utils/logger');
const { renderWeeklyReport, renderMonthlyReport, getEmailAttachments } = require('./EmailTemplateEngine');
const { weeklyTestData, monthlyTestData } = require('./testData');

class EmailService {
  constructor() {
    this.transporter = null;
    this._initialized = false;
  }

  /**
   * Creates the nodemailer transporter. Called lazily on first send.
   * Fails gracefully if SMTP credentials aren't configured.
   */
  _init() {
    if (this._initialized) return;

    const { host, port, secure, user, pass } = config.email;

    if (!user || !pass) {
      logger.warn('EmailService: SMTP credentials not configured. Emails will be logged but not sent.');
      this._initialized = true;
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    this._initialized = true;
    logger.info('EmailService: Transporter initialized', { host, port });
  }

  /**
   * Sends an email. If no transporter is configured, logs the email instead.
   *
   * @param {string} to - Recipient email address
   * @param {string} subject - Email subject line
   * @param {string} html - HTML body content
   * @param {Object[]} [attachments] - Nodemailer attachment objects (for CID inline images)
   * @returns {Object} { success: boolean, messageId?: string, logged?: boolean }
   */
  async sendEmail(to, subject, html, attachments = []) {
    this._init();

    const mailOptions = {
      from: config.email.from,
      to,
      subject,
      html,
      attachments,
    };

    if (!this.transporter) {
      logger.info('EmailService: Email logged (no SMTP configured)', {
        to,
        subject,
        htmlLength: html.length,
      });
      return { success: true, logged: true };
    }

    try {
      const info = await this.transporter.sendMail(mailOptions);
      logger.info('EmailService: Email sent', {
        to,
        subject,
        messageId: info.messageId,
      });
      return { success: true, messageId: info.messageId };
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

/**
 * EMAIL TEMPLATE ENGINE
 *
 * Pure functions that build HTML email content from data objects.
 * Each section is a standalone function returning an HTML string.
 * All CSS is inlined for email client compatibility.
 *
 * Colors match the dashboard exactly (from Frontend/client/src/theme/constants.js).
 * Each section includes an AI Insight narrative block.
 */

// ── Exact colors from Frontend/client/src/theme/constants.js ───
const C = {
  // Backgrounds
  bg:          '#0a0e17',
  cardBg:      '#111827',
  cardBorder:  '#1e293b',
  elevated:    '#1e293b',
  // Neon accents
  cyan:        '#4DD4E8',
  green:       '#6BCF7F',
  red:         '#FF4D6D',
  amber:       '#FFD93D',
  purple:      '#B84DFF',
  blue:        '#4D7CFF',
  teal:        '#06b6d4',
  magenta:     '#ff00e5',
  // Text
  text:        '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted:   '#64748b',
  // Borders
  borderDefault: '#334155',
};

// ── Helpers ─────────────────────────────────────────────────

function pct(val) {
  if (val == null) return '—';
  return `${(val * 100).toFixed(1)}%`;
}

function usd(val) {
  if (val == null) return '—';
  return `$${val.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function num(val) {
  if (val == null) return '—';
  return val.toLocaleString('en-US');
}

/**
 * Builds a compact delta string showing absolute change + percentage change.
 * Example output: "↑ 1 (+20.0%)" or "↓ $4,500 (−5.6%)"
 * invertColor: true means "going up is bad" (e.g., ghosted, lost)
 */
function delta(current, previous, type = 'number', invertColor = false) {
  if (current == null || previous == null) return '';
  const diff = current - previous;
  if (diff === 0) return `<span style="color:${C.textMuted};font-size:12px;">→ no change</span>`;
  const isUp = diff > 0;
  const color = (isUp && !invertColor) || (!isUp && invertColor) ? C.green : C.red;
  const arrow = isUp ? '↑' : '↓';

  // Absolute change
  let absFmt;
  if (type === 'percent') absFmt = `${(Math.abs(diff) * 100).toFixed(1)}pp`;
  else if (type === 'currency') absFmt = usd(Math.abs(diff));
  else absFmt = num(Math.abs(diff));

  // Percentage change (skip for percent-type metrics — already showing pp change)
  let pctChange = '';
  if (type !== 'percent' && previous !== 0) {
    const pctVal = ((current - previous) / Math.abs(previous)) * 100;
    const sign = pctVal > 0 ? '+' : '−';
    pctChange = ` (${sign}${Math.abs(pctVal).toFixed(1)}%)`;
  }

  return `<span style="color:${color};font-size:13px;">${arrow} ${absFmt}${pctChange}</span>`;
}

// ── Layout Components ───────────────────────────────────────

const fs = require('fs');
const path = require('path');

// Section icon mapping — maps section titles to PNG filenames in src/public/icons/
// Icons are pre-generated PNGs from Lucide SVGs, embedded via CID attachments.
const SECTION_ICON_FILES = {
  'Overview':           'overview.png',
  'Financial':          'financial.png',
  'Attendance':         'attendance.png',
  'Call Outcomes':      'call-outcomes.png',
  'Sales Cycle':        'sales-cycle.png',
  'Objections':         'objections.png',
  'Market Insight':     'market-insight.png',
  'Violations & Risk':  'violations.png',
  'Metric Alerts':      'alerts.png',
  'Closer Leaderboard': 'leaderboard.png',
};

/**
 * Returns CID key for a section icon.
 */
function iconCid(title) {
  const file = SECTION_ICON_FILES[title];
  return file ? file.replace('.png', '') : null;
}

/**
 * Returns nodemailer-compatible attachments array for the logo + all section icons.
 * All images are embedded as CID attachments so Gmail renders them inline.
 *
 * @returns {Object[]} Nodemailer attachment objects
 */
function getEmailAttachments() {
  const attachments = [];
  const publicDir = path.join(__dirname, '../../public');

  // Logo
  const logoPath = path.join(publicDir, 'logo-wide.png');
  if (fs.existsSync(logoPath)) {
    attachments.push({
      filename: 'logo.png',
      path: logoPath,
      cid: 'logo',
      contentDisposition: 'inline',
      contentType: 'image/png',
    });
  }

  // Section icons
  const iconsDir = path.join(publicDir, 'icons');
  for (const [title, filename] of Object.entries(SECTION_ICON_FILES)) {
    const iconPath = path.join(iconsDir, filename);
    if (fs.existsSync(iconPath)) {
      attachments.push({
        filename,
        path: iconPath,
        cid: iconCid(title),
        contentDisposition: 'inline',
        contentType: 'image/png',
      });
    }
  }

  return attachments;
}

function card(title, content, accentColor = C.cyan) {
  const cid = iconCid(title);
  const iconHtml = cid
    ? `<img src="cid:${cid}" width="18" height="18" style="vertical-align:middle;margin-right:8px;" alt="" />`
    : '';
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td style="background:${C.cardBg};border:1px solid ${C.cardBorder};border-top:3px solid ${accentColor};border-radius:8px;padding:20px;">
          <h2 style="margin:0 0 16px 0;font-size:18px;font-weight:600;color:${accentColor};text-transform:uppercase;letter-spacing:1px;">
            ${iconHtml}${title}
          </h2>
          ${content}
        </td>
      </tr>
    </table>
  `;
}

function metricRow(label, value, deltaHtml = '') {
  return `
    <tr>
      <td style="padding:8px 0;color:${C.textSecondary};font-size:15px;border-bottom:1px solid ${C.cardBorder};">${label}</td>
      <td style="padding:8px 0;color:${C.text};font-size:15px;font-weight:600;text-align:right;border-bottom:1px solid ${C.cardBorder};">${value}</td>
      <td style="padding:8px 0;text-align:right;border-bottom:1px solid ${C.cardBorder};width:100px;">${deltaHtml}</td>
    </tr>
  `;
}

function metricTable(rows) {
  return `<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

/**
 * AI Insight block — amber-accented narrative card matching the dashboard InsightCard.
 * In production, this text will be AI-generated. For now, uses test data strings.
 */
function insightBlock(text) {
  if (!text) return '';
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
      <tr>
        <td style="background:rgba(255,217,61,0.04);border-left:3px solid ${C.amber};border-radius:0 6px 6px 0;padding:14px 16px;">
          <div style="font-size:11px;font-weight:600;color:${C.amber};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">AI Insight</div>
          <div style="font-size:14px;color:${C.textSecondary};line-height:1.6;">${text}</div>
        </td>
      </tr>
    </table>
  `;
}

// ── Section Renderers ───────────────────────────────────────

function renderOverviewSection(data) {
  const d = data.overview;
  if (!d) return '';
  const rows = [
    metricRow('Total Calls', num(d.total_calls), delta(d.total_calls, d.prev?.total_calls)),
    metricRow('Shows', `${num(d.shows)} (${pct(d.show_rate)})`, delta(d.shows, d.prev?.shows)),
    metricRow('Closes', `${num(d.closes)} (${pct(d.close_rate)})`, delta(d.closes, d.prev?.closes)),
    metricRow('Revenue', usd(d.revenue), delta(d.revenue, d.prev?.revenue, 'currency')),
    metricRow('Cash Collected', usd(d.cash_collected), delta(d.cash_collected, d.prev?.cash_collected, 'currency')),
  ].join('');
  return card('Overview', metricTable(rows) + insightBlock(data.insights?.overview), C.cyan);
}

function renderFinancialSection(data) {
  const d = data.financial;
  if (!d) return '';
  const rows = [
    metricRow('Revenue', usd(d.revenue), delta(d.revenue, d.prev?.revenue, 'currency')),
    metricRow('Cash Collected', usd(d.cash_collected), delta(d.cash_collected, d.prev?.cash_collected, 'currency')),
    metricRow('Avg Deal Size', usd(d.avg_deal_size), delta(d.avg_deal_size, d.prev?.avg_deal_size, 'currency')),
    metricRow('Deals Closed', num(d.deals_closed), delta(d.deals_closed, d.prev?.deals_closed)),
    metricRow('Deposits', `${num(d.deposits)} (${usd(d.deposit_total)})`, delta(d.deposits, d.prev?.deposits)),
  ].join('');
  return card('Financial', metricTable(rows) + insightBlock(data.insights?.financial), C.teal);
}

function renderAttendanceSection(data) {
  const d = data.attendance;
  if (!d) return '';
  const rows = [
    metricRow('Total Booked', num(d.total_booked), delta(d.total_booked, d.prev?.total_booked)),
    metricRow('Shows', `${num(d.shows)} (${pct(d.show_rate)})`, delta(d.shows, d.prev?.shows)),
    metricRow('Ghosted', `${num(d.ghosted)} (${pct(d.ghost_rate)})`, delta(d.ghosted, d.prev?.ghosted, 'number', true)),
    metricRow('Canceled', `${num(d.canceled)} (${pct(d.cancel_rate)})`, delta(d.canceled, d.prev?.canceled, 'number', true)),
    metricRow('Rescheduled', num(d.rescheduled), delta(d.rescheduled, d.prev?.rescheduled)),
  ].join('');
  return card('Attendance', metricTable(rows) + insightBlock(data.insights?.attendance), C.blue);
}

function renderCallOutcomesSection(data) {
  const d = data.callOutcomes;
  if (!d) return '';
  const rows = [
    metricRow('Closed Won', num(d.closed_won), delta(d.closed_won, d.prev?.closed_won)),
    metricRow('Deposit', num(d.deposit), delta(d.deposit, d.prev?.deposit)),
    metricRow('Follow Up', num(d.follow_up), delta(d.follow_up, d.prev?.follow_up)),
    metricRow('Lost', num(d.lost), delta(d.lost, d.prev?.lost, 'number', true)),
    metricRow('Disqualified', num(d.disqualified), delta(d.disqualified, d.prev?.disqualified)),
    metricRow('Not Pitched', num(d.not_pitched), delta(d.not_pitched, d.prev?.not_pitched)),
  ].join('');
  return card('Call Outcomes', metricTable(rows) + insightBlock(data.insights?.callOutcomes), C.green);
}

function renderSalesCycleSection(data) {
  const d = data.salesCycle;
  if (!d) return '';
  const rows = [
    metricRow('Avg Days to Close', d.avg_days_to_close?.toFixed(1), delta(d.avg_days_to_close, d.prev?.avg_days_to_close, 'number', true)),
    metricRow('One-Call Close Rate', pct(d.one_call_close_rate), delta(d.one_call_close_rate, d.prev?.one_call_close_rate, 'percent')),
    metricRow('Avg Follow-Ups', d.avg_follow_ups_before_close?.toFixed(1), delta(d.avg_follow_ups_before_close, d.prev?.avg_follow_ups_before_close, 'number', true)),
    metricRow('Longest Cycle', `${d.longest_cycle_days}d`, ''),
    metricRow('Shortest Cycle', `${d.shortest_cycle_days}d`, ''),
  ].join('');
  return card('Sales Cycle', metricTable(rows) + insightBlock(data.insights?.salesCycle), C.purple);
}

function renderObjectionsSection(data) {
  const d = data.objections;
  if (!d) return '';
  const summaryRows = [
    metricRow('Total Objections', num(d.total), delta(d.total, d.prev?.total)),
    metricRow('Resolved', `${num(d.resolved)} (${pct(d.overall_resolution_rate)})`, delta(d.resolved, d.prev?.resolved)),
  ].join('');

  const objectionRows = (d.top || []).map(obj => `
    <tr>
      <td style="padding:6px 8px;color:${C.text};font-size:14px;border-bottom:1px solid ${C.cardBorder};">${obj.type}</td>
      <td style="padding:6px 8px;color:${C.text};font-size:13px;text-align:center;border-bottom:1px solid ${C.cardBorder};">${obj.count}</td>
      <td style="padding:6px 8px;color:${C.text};font-size:13px;text-align:center;border-bottom:1px solid ${C.cardBorder};">${obj.resolved}</td>
      <td style="padding:6px 8px;color:${obj.res_rate >= 0.6 ? C.green : C.amber};font-size:13px;text-align:right;border-bottom:1px solid ${C.cardBorder};">${pct(obj.res_rate)}</td>
    </tr>
  `).join('');

  const topTable = d.top?.length ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
      <tr>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Type</th>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:center;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Count</th>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:center;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Resolved</th>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:right;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Rate</th>
      </tr>
      ${objectionRows}
    </table>
  ` : '';

  return card('Objections', metricTable(summaryRows) + topTable + insightBlock(data.insights?.objections), C.amber);
}

function renderMarketInsightSection(data) {
  const d = data.marketInsight;
  if (!d) return '';

  // Prospect pains & goals trends
  const painItems = (d.top_pains || []).map(p =>
    `<li style="color:${C.text};font-size:13px;padding:4px 0;">${p}</li>`
  ).join('');
  const goalItems = (d.top_goals || []).map(g =>
    `<li style="color:${C.text};font-size:13px;padding:4px 0;">${g}</li>`
  ).join('');

  const painsList = painItems ? `
    <div style="margin-bottom:14px;">
      <div style="color:${C.red};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Top Prospect Pains</div>
      <ul style="margin:0;padding-left:20px;">${painItems}</ul>
    </div>
  ` : '';

  const goalsList = goalItems ? `
    <div style="margin-bottom:14px;">
      <div style="color:${C.green};font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Top Prospect Goals</div>
      <ul style="margin:0;padding-left:20px;">${goalItems}</ul>
    </div>
  ` : '';

  return card('Market Insight', painsList + goalsList + insightBlock(data.insights?.marketInsight), C.blue);
}

function renderViolationsSection(data) {
  const d = data.violations;
  if (!d) return '';
  const summaryRows = [
    metricRow('Flagged Calls', num(d.flagged_calls), delta(d.flagged_calls, d.prev?.flagged_calls, 'number', true)),
    metricRow('Total Flags', num(d.total_flags), delta(d.total_flags, d.prev?.total_flags, 'number', true)),
  ].join('');

  const itemRows = (d.items || []).map(item => {
    const sevColor = item.severity === 'high' ? C.red : C.amber;
    return `
      <tr>
        <td style="padding:8px;color:${C.text};font-size:14px;border-bottom:1px solid ${C.cardBorder};">
          <strong>${item.closer_name}</strong><br/>
          <span style="color:${C.textMuted};font-size:12px;">${item.call_date}</span>
        </td>
        <td style="padding:8px;border-bottom:1px solid ${C.cardBorder};">
          <span style="color:${sevColor};font-size:13px;font-weight:600;text-transform:uppercase;">${item.severity}</span><br/>
          <span style="color:${C.textMuted};font-size:12px;">${item.risk_category}</span>
        </td>
        <td style="padding:8px;color:${C.text};font-size:13px;font-style:italic;border-bottom:1px solid ${C.cardBorder};">"${item.phrase}"</td>
      </tr>
    `;
  }).join('');

  const itemsTable = d.items?.length ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;">
      <tr>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Closer</th>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Severity</th>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Phrase</th>
      </tr>
      ${itemRows}
    </table>
  ` : '';

  return card('Violations & Risk', metricTable(summaryRows) + itemsTable + insightBlock(data.insights?.violations), C.red);
}

function renderAlertsSection(data) {
  const alerts = data.alerts;
  if (!alerts?.length) return '';
  const alertRows = alerts.map(a => {
    const formatted = a.metric.includes('rate') ? pct(a.current_value) : usd(a.current_value);
    const threshFormatted = a.metric.includes('rate') ? pct(a.threshold) : usd(a.threshold);
    return `
      <tr>
        <td style="padding:8px;color:${C.text};font-size:14px;border-bottom:1px solid ${C.cardBorder};">
          <span style="color:${C.red};font-size:16px;vertical-align:middle;">&#9888;</span>
          <strong>${a.closer_name || 'Team'}</strong>
        </td>
        <td style="padding:8px;color:${C.text};font-size:14px;border-bottom:1px solid ${C.cardBorder};">
          ${a.label} ${a.operator} ${threshFormatted}
        </td>
        <td style="padding:8px;color:${C.red};font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid ${C.cardBorder};">
          ${formatted}
        </td>
        <td style="padding:8px;color:${C.textMuted};font-size:13px;text-align:right;border-bottom:1px solid ${C.cardBorder};">
          ${a.duration_days}d
        </td>
      </tr>
    `;
  }).join('');
  const content = `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Who</th>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Condition</th>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:right;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Current</th>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:right;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Duration</th>
      </tr>
      ${alertRows}
    </table>
  `;
  return card('Metric Alerts', content, C.red);
}

function renderCloserLeaderboard(data) {
  const closers = data.closerLeaderboard;
  if (!closers?.length) return '';

  // Sort by cash_collected descending
  const sorted = [...closers].sort((a, b) => (b.cash_collected || 0) - (a.cash_collected || 0));

  const rows = sorted.map((c, i) => {
    const medal = i === 0 ? '&#129351;' : i === 1 ? '&#129352;' : i === 2 ? '&#129353;' : `${i + 1}.`;
    return `
      <tr>
        <td style="padding:8px;color:${C.text};font-size:14px;border-bottom:1px solid ${C.cardBorder};">
          <span style="font-size:16px;vertical-align:middle;">${medal}</span> ${c.name}
        </td>
        <td style="padding:8px;color:${C.text};font-size:13px;text-align:center;border-bottom:1px solid ${C.cardBorder};">${c.calls}</td>
        <td style="padding:8px;color:${C.text};font-size:13px;text-align:center;border-bottom:1px solid ${C.cardBorder};">${c.shows}</td>
        <td style="padding:8px;color:${C.text};font-size:13px;text-align:center;border-bottom:1px solid ${C.cardBorder};">${c.closes}</td>
        <td style="padding:8px;color:${c.close_rate >= 0.2 ? C.green : C.amber};font-size:13px;text-align:center;border-bottom:1px solid ${C.cardBorder};">${pct(c.close_rate)}</td>
        <td style="padding:8px;color:${C.teal};font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid ${C.cardBorder};">${usd(c.revenue)}</td>
        <td style="padding:8px;color:${C.teal};font-size:13px;font-weight:700;text-align:right;border-bottom:1px solid ${C.cardBorder};">${usd(c.cash_collected)}</td>
      </tr>
    `;
  }).join('');

  const content = `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Closer</th>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:center;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Calls</th>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:center;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Shows</th>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:center;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Closes</th>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:center;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Rate</th>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:right;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Revenue</th>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:right;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Cash</th>
      </tr>
      ${rows}
    </table>
  `;
  return card('Closer Leaderboard', content + insightBlock(data.insights?.leaderboard), C.cyan);
}

// ── Section Registry ────────────────────────────────────────

const SECTION_RENDERERS = {
  overview:      renderOverviewSection,
  financial:     renderFinancialSection,
  attendance:    renderAttendanceSection,
  callOutcomes:  renderCallOutcomesSection,
  salesCycle:    renderSalesCycleSection,
  objections:    renderObjectionsSection,
  marketInsight: renderMarketInsightSection,
  violations:    renderViolationsSection,
};

const ALL_SECTIONS = Object.keys(SECTION_RENDERERS);

// ── Main Renderers ──────────────────────────────────────────

function renderWeeklyReport(data, includeSections = ALL_SECTIONS, opts = {}) {
  return renderReport(data, includeSections, 'Weekly Report', opts);
}

function renderMonthlyReport(data, includeSections = ALL_SECTIONS, opts = {}) {
  return renderReport(data, includeSections, 'Monthly Report', opts);
}

function renderReport(data, includeSections, reportTitle, opts = {}) {
  const sectionsHtml = includeSections
    .filter(s => SECTION_RENDERERS[s])
    .map(s => SECTION_RENDERERS[s](data))
    .join('');

  const alertsHtml = renderAlertsSection(data);
  const leaderboardHtml = renderCloserLeaderboard(data);

  const refreshScript = opts.livePreview ? `
    <script>
      setTimeout(function() { location.reload(); }, 2000);
    </script>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CloserMetrix ${reportTitle}</title>
  ${refreshScript}
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:${C.text};-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
    <tr>
      <td align="center" style="padding:20px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding:24px 0;text-align:center;">
              <img src="cid:logo" alt="CloserMetrix" width="600" style="width:100%;max-width:600px;height:auto;margin-bottom:8px;" />
              <p style="margin:8px 0 0 0;font-size:14px;color:${C.textSecondary};">
                ${reportTitle} &middot; ${data.company_name}
              </p>
              <p style="margin:4px 0 0 0;font-size:13px;color:${C.textMuted};">
                ${data.report_period.label}
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 0 16px 0;">
              <div style="height:1px;background:linear-gradient(90deg, transparent, ${C.cyan}, transparent);"></div>
            </td>
          </tr>

          <!-- Metric Alerts -->
          <tr><td>${alertsHtml}</td></tr>

          <!-- Sections -->
          <tr><td>${sectionsHtml}</td></tr>

          <!-- Closer Leaderboard -->
          <tr><td>${leaderboardHtml}</td></tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0;text-align:center;">
              <div style="height:1px;background:linear-gradient(90deg, transparent, ${C.cardBorder}, transparent);margin-bottom:16px;"></div>
              <p style="margin:0;font-size:12px;color:${C.textMuted};">
                CloserMetrix &middot; Sales Intelligence Platform
              </p>
              <p style="margin:4px 0 0 0;font-size:11px;color:${C.textMuted};">
                Compared to ${data.prev_period.label}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

module.exports = {
  renderWeeklyReport,
  renderMonthlyReport,
  ALL_SECTIONS,
  renderOverviewSection,
  renderFinancialSection,
  renderAttendanceSection,
  renderCallOutcomesSection,
  renderSalesCycleSection,
  renderObjectionsSection,
  renderMarketInsightSection,
  renderViolationsSection,
  renderAlertsSection,
  renderCloserLeaderboard,
  getEmailAttachments,
};

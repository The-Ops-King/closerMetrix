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

// Section icon mapping — served via URL (not CID) to avoid showing as attachments.
const SECTION_ICON_FILES = {
  'Overview':             'overview.png',
  'Financial':            'financial.png',
  'Attendance':           'attendance.png',
  'Call Outcomes':        'call-outcomes.png',
  'Sales Cycle':          'sales-cycle.png',
  'Objections':           'objections.png',
  'Market Insight':       'market-insight.png',
  'Violations & Risk':    'violations.png',
  'Metric Alerts':        'alerts.png',
  'Closer Leaderboard':   'leaderboard.png',
  // Onboarding report sections — Today
  'Closer Watch Progress': 'clock-purple.png',
  'Day at a Glance':      'calendar-teal.png',
  'Revenue':              'financial.png',
  'Script Adherence':     'sales-cycle.png',
  'vs Team Avg':          'trophy-yellow.png',
  'vs KPI Target':        'trophy-yellow.png',
  // Onboarding report sections — 30-Day Cumulative
  'Cumulative Performance': 'clock-purple.png',
  'Cumulative Revenue':     'financial.png',
  'Cumulative Objections':  'objections.png',
};

// Public GCS URL for email icons — works in all email clients, no attachments.
const ICONS_BASE_URL = 'https://storage.googleapis.com/closermetrix-assets/email-icons';
const LOGO_PUBLIC_URL = `${ICONS_BASE_URL}/logo-wide.png`;

// Module-level override: when set, icons + logo use local paths instead of GCS.
// Set by render functions when opts.baseUrl is provided (e.g. localhost preview).
let _iconsBaseUrl = '';
let _logoUrl = LOGO_PUBLIC_URL;

function _setBaseUrl(baseUrl) {
  if (baseUrl) {
    _iconsBaseUrl = `${baseUrl}/public/icons`;
    _logoUrl = `${baseUrl}/public/logo-wide.png`;
  } else {
    _iconsBaseUrl = ICONS_BASE_URL;
    _logoUrl = LOGO_PUBLIC_URL;
  }
}

/**
 * Returns nodemailer-compatible attachments array.
 * All images (logo + icons) are now served via GCS public URLs,
 * so no CID attachments needed. Returns empty array.
 */
function getEmailAttachments() {
  return [];
}

function card(title, content, accentColor = C.cyan) {
  const iconFile = SECTION_ICON_FILES[title];
  const iconHtml = iconFile
    ? `<img src="${_iconsBaseUrl}/${iconFile}" width="18" height="18" style="vertical-align:middle;margin-right:8px;" alt="" />`
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
    metricRow('Longest Cycle', `${d.longest_cycle_days ?? 0}d`, ''),
    metricRow('Shortest Cycle', `${d.shortest_cycle_days ?? 0}d`, ''),
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
      </tr>
    `;
  }).join('');
  const content = `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Who</th>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Condition</th>
        <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:right;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Current</th>
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
  // Set icon/logo base URL — local for preview, GCS for production emails.
  _setBaseUrl(opts.baseUrl);
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

  // Set icon/logo base URL — local for preview, GCS for production emails.
  _setBaseUrl(opts.baseUrl);
  const logoSrc = _logoUrl;

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
              <img src="${logoSrc}" alt="CloserMetrix" width="600" style="width:100%;max-width:600px;height:auto;margin-bottom:8px;" />
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

// ── Daily Onboarding Report ─────────────────────────────────

/**
 * Renders a daily onboarding email for a single closer.
 * Tracks their performance during first 30 days vs KPI targets or team averages.
 *
 * @param {Object} data - Daily onboarding data (see testData.js dailyOnboardingTestData)
 * @param {Object} opts - { livePreview: bool, baseUrl: string }
 * @returns {string} Complete HTML email
 */
function renderDailyOnboardingReport(data, opts = {}) {
  const refreshScript = opts.livePreview ? `
    <script>
      setTimeout(function() { location.reload(); }, 2000);
    </script>
  ` : '';

  _setBaseUrl(opts.baseUrl);
  const logoSrc = _logoUrl;
  const daysLeft = data.days_remaining ?? 0;
  const elapsed = data.days_elapsed ?? 0;
  const totalDuration = elapsed + daysLeft;
  const progressPct = totalDuration > 0 ? Math.min(100, Math.round((elapsed / totalDuration) * 100)) : 0;
  const daysColor = daysLeft <= 3 ? C.red : daysLeft <= 7 ? C.amber : C.purple;
  const watchType = data.watch_type || 'onboarding';

  // ── Closer Watch Progress ──
  const progressContent = `
    <p style="margin:0 0 12px 0;font-size:36px;font-weight:700;color:${daysColor};">
      ${daysLeft} <span style="font-size:14px;font-weight:400;color:${C.textSecondary};text-transform:uppercase;letter-spacing:1px;">days remaining</span>
    </p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="background:${C.elevated};border-radius:4px;height:12px;">
          <div style="width:${progressPct}%;background:linear-gradient(90deg, ${C.purple}, ${C.cyan});height:12px;border-radius:4px;"></div>
        </td>
      </tr>
    </table>
    <p style="margin:8px 0 0 0;font-size:12px;color:${C.textMuted};">
      Day ${elapsed} of ${totalDuration}
    </p>
  `;
  const progressSection = card('Closer Watch Progress', progressContent, C.purple);

  // ══════════════════════════════════════════════════════════════
  //  TODAY SECTION (cyan accent — single day snapshot)
  // ══════════════════════════════════════════════════════════════

  const todaySectionHeader = _sectionDivider('Today', C.cyan);

  // ── Day at a Glance (3 metric cards) ──
  const glanceCards = _onboardingMetricCards([
    { label: 'Calls Booked', value: num(data.calls_booked), sub: '', color: C.cyan },
    { label: 'Held', value: num(data.calls_showed), sub: pct(data.show_rate), color: C.blue },
    { label: 'Closes', value: num(data.calls_closed), sub: pct(data.close_rate), color: C.green },
  ]);
  const glanceSection = card('Day at a Glance', glanceCards, C.cyan);

  // ── Revenue ──
  const revenueRows = [
    metricRow('Cash Collected', usd(data.cash_collected), ''),
    metricRow('Revenue Generated', usd(data.revenue_generated), ''),
  ].join('');
  const revenueSection = card('Revenue', metricTable(revenueRows), C.teal);

  // ── Script Adherence ──
  let scriptSection = '';
  const sa = data.script_adherence;
  if (sa && sa.score != null) {
    const scoreColor = sa.score >= 7 ? C.green : sa.score >= 5 ? C.amber : C.red;
    const teamColor = C.textMuted;
    const firstName = data.closer.name.split(' ')[0];
    const scriptContent = `
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="50%" style="padding:12px;text-align:center;vertical-align:top;">
            <div style="font-size:36px;font-weight:700;color:${scoreColor};line-height:1.1;">${sa.score.toFixed(1)}</div>
            <div style="font-size:12px;color:${C.textMuted};text-transform:uppercase;letter-spacing:1px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${firstName}</div>
          </td>
          <td width="50%" style="padding:12px;text-align:center;vertical-align:top;">
            <div style="font-size:36px;font-weight:700;color:${teamColor};line-height:1.1;">${sa.team_avg != null ? sa.team_avg.toFixed(1) : '—'}</div>
            <div style="font-size:12px;color:${C.textMuted};text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Team Avg</div>
          </td>
        </tr>
      </table>
      <p style="margin:8px 0 0 0;font-size:12px;color:${C.textMuted};text-align:center;">Score out of 10.0</p>
    `;
    scriptSection = card('Script Adherence', scriptContent, C.purple);
  }

  // ── Today's Objections ──
  let objectionsSection = '';
  if (data.objections && data.objections.length > 0) {
    const objRows = data.objections.map(o => `
      <tr>
        <td style="padding:6px 8px;color:${C.text};font-size:14px;border-bottom:1px solid ${C.cardBorder};">${o.objection_type}</td>
        <td style="padding:6px 8px;color:${C.text};font-size:13px;text-align:center;border-bottom:1px solid ${C.cardBorder};">${o.count}</td>
        <td style="padding:6px 8px;color:${C.text};font-size:13px;text-align:center;border-bottom:1px solid ${C.cardBorder};">${o.resolved_count}</td>
        <td style="padding:6px 8px;color:${o.resolution_rate >= 0.6 ? C.green : C.amber};font-size:13px;text-align:right;border-bottom:1px solid ${C.cardBorder};">${pct(o.resolution_rate)}</td>
      </tr>
    `).join('');

    const objectionsContent = `
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Type</th>
          <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:center;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Count</th>
          <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:center;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Resolved</th>
          <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:right;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Rate</th>
        </tr>
        ${objRows}
      </table>
    `;
    objectionsSection = card('Objections', objectionsContent, C.amber);
  }

  // ── Today's Violations (always shown) ──
  let violationsSection = '';
  const todayViolations = data.violations || [];
  if (todayViolations.length > 0) {
    const violationRows = todayViolations.map(v => {
      const sevColor = v.severity === 'high' ? C.red : C.amber;
      return `
        <tr>
          <td style="padding:8px;border-bottom:1px solid ${C.cardBorder};">
            <span style="color:${sevColor};font-size:13px;font-weight:600;text-transform:uppercase;">${v.severity}</span><br/>
            <span style="color:${C.textMuted};font-size:12px;">${v.risk_category}</span>
          </td>
          <td style="padding:8px;color:${C.text};font-size:13px;font-style:italic;border-bottom:1px solid ${C.cardBorder};">"${v.phrase}"</td>
        </tr>
      `;
    }).join('');

    const violationsContent = `
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Risk</th>
          <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Phrase</th>
        </tr>
        ${violationRows}
      </table>
    `;
    violationsSection = card('Violations & Risk', violationsContent, C.red);
  } else {
    const zeroContent = `
      <p style="margin:0;font-size:14px;color:${C.green};text-align:center;padding:12px 0;">
        0 Violations &mdash; No flags today
      </p>
    `;
    violationsSection = card('Violations & Risk', zeroContent, C.green);
  }

  // ══════════════════════════════════════════════════════════════
  //  30-DAY SECTION (purple accent — cumulative since watch start)
  // ══════════════════════════════════════════════════════════════

  const cum = data.cumulative;
  const t = data.targets || {};
  const targetLabel = t.source === 'kpi' ? 'Target' : 'Team Avg';

  // Dynamic title based on watch_type
  const thirtyDayTitle = watchType === 'pip'
    ? `Last 30 Days — PIP Progress`
    : `Since Onboarding — Day ${elapsed} of ${totalDuration}`;

  const thirtyDaySectionHeader = _sectionDivider(thirtyDayTitle, C.purple);

  let cumulativeHtml = '';
  if (cum) {
    // ── Cumulative metric cards (3-up) ──
    const cumGlanceCards = _onboardingMetricCards([
      { label: 'Calls Booked', value: num(cum.calls_booked), sub: '', color: C.purple },
      { label: 'Held', value: num(cum.calls_showed), sub: pct(cum.show_rate), color: C.blue },
      { label: 'Closes', value: num(cum.calls_closed), sub: pct(cum.close_rate), color: C.green },
    ]);
    const cumGlanceSection = card('Cumulative Performance', cumGlanceCards, C.purple);

    // ── Cumulative vs Target comparison ──
    const cumAvgCash = cum.calls_closed > 0 ? cum.cash_collected / cum.calls_closed : 0;
    const cumAvgDeal = cum.calls_closed > 0 ? cum.revenue_generated / cum.calls_closed : 0;
    const periodNote = t.period_label ? ` <span style="font-size:11px;color:${C.textMuted};text-transform:none;letter-spacing:0;">(${t.period_label})</span>` : '';

    const comparisonRows = [
      _comparisonRow('Held Rate', pct(cum.show_rate), pct(t.show_rate), cum.show_rate, t.show_rate, false),
      _comparisonRow('Close Rate', pct(cum.close_rate), pct(t.close_rate), cum.close_rate, t.close_rate, false),
      _comparisonRow('Avg Deal Size', cumAvgDeal > 0 ? usd(cumAvgDeal) : '—', usd(t.avg_deal_size), cumAvgDeal, t.avg_deal_size, false),
      _comparisonRow('Avg Cash / Deal', cumAvgCash > 0 ? usd(cumAvgCash) : '—', usd(t.avg_cash_per_deal), cumAvgCash, t.avg_cash_per_deal, false),
    ].join('');

    const comparisonIconFile = SECTION_ICON_FILES[t.source === 'kpi' ? 'vs KPI Target' : 'vs Team Avg'];
    const comparisonIconHtml = comparisonIconFile
      ? `<img src="${_iconsBaseUrl}/${comparisonIconFile}" width="18" height="18" style="vertical-align:middle;margin-right:8px;" alt="" />`
      : '';

    const comparisonSection = `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          <td style="background:${C.cardBg};border:1px solid ${C.cardBorder};border-top:3px solid ${C.amber};border-radius:8px;padding:20px;">
            <h2 style="margin:0 0 16px 0;font-size:18px;font-weight:600;color:${C.amber};text-transform:uppercase;letter-spacing:1px;">
              ${comparisonIconHtml}vs ${targetLabel}${periodNote}
            </h2>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Metric</th>
                <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:right;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Cumulative</th>
                <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:right;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">${targetLabel}</th>
                <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:right;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Delta</th>
              </tr>
              ${comparisonRows}
            </table>
          </td>
        </tr>
      </table>
    `;

    // ── Cumulative Revenue ──
    const cumRevenueRows = [
      metricRow('Cash Collected', usd(cum.cash_collected), ''),
      metricRow('Revenue Generated', usd(cum.revenue_generated), ''),
    ].join('');
    const cumRevenueSection = card('Cumulative Revenue', metricTable(cumRevenueRows), C.teal);

    // ── Cumulative Script Adherence ──
    let cumScriptSection = '';
    if (cum.script_adherence_avg != null) {
      const cumScoreColor = cum.script_adherence_avg >= 7 ? C.green : cum.script_adherence_avg >= 5 ? C.amber : C.red;
      const teamScriptAvg = sa?.team_avg;
      const cumFirstName = data.closer.name.split(' ')[0];
      const cumScriptContent = `
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="50%" style="padding:12px;text-align:center;vertical-align:top;">
              <div style="font-size:36px;font-weight:700;color:${cumScoreColor};line-height:1.1;">${cum.script_adherence_avg.toFixed(1)}</div>
              <div style="font-size:12px;color:${C.textMuted};text-transform:uppercase;letter-spacing:1px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${cumFirstName} Avg</div>
            </td>
            <td width="50%" style="padding:12px;text-align:center;vertical-align:top;">
              <div style="font-size:36px;font-weight:700;color:${C.textMuted};line-height:1.1;">${teamScriptAvg != null ? teamScriptAvg.toFixed(1) : '—'}</div>
              <div style="font-size:12px;color:${C.textMuted};text-transform:uppercase;letter-spacing:1px;margin-top:4px;">Team Avg</div>
            </td>
          </tr>
        </table>
      `;
      cumScriptSection = card('Script Adherence', cumScriptContent, C.purple);
    }

    // ── Cumulative Objections ──
    let cumObjectionsSection = '';
    if (cum.objections && cum.objections.length > 0) {
      const cumObjRows = cum.objections.map(o => `
        <tr>
          <td style="padding:6px 8px;color:${C.text};font-size:14px;border-bottom:1px solid ${C.cardBorder};">${o.objection_type}</td>
          <td style="padding:6px 8px;color:${C.text};font-size:13px;text-align:center;border-bottom:1px solid ${C.cardBorder};">${o.count}</td>
          <td style="padding:6px 8px;color:${C.text};font-size:13px;text-align:center;border-bottom:1px solid ${C.cardBorder};">${o.resolved_count}</td>
          <td style="padding:6px 8px;color:${o.resolution_rate >= 0.6 ? C.green : C.amber};font-size:13px;text-align:right;border-bottom:1px solid ${C.cardBorder};">${pct(o.resolution_rate)}</td>
        </tr>
      `).join('');

      const cumObjContent = `
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Type</th>
            <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:center;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Count</th>
            <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:center;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Resolved</th>
            <th style="padding:6px 8px;color:${C.textMuted};font-size:13px;text-align:right;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Rate</th>
          </tr>
          ${cumObjRows}
        </table>
      `;
      cumObjectionsSection = card('Cumulative Objections', cumObjContent, C.amber);
    }

    // ── Cumulative Violations (full detail) ──
    let cumViolationsSection = '';
    const cumViolItems = cum.violations_items || [];
    if (cumViolItems.length > 0) {
      const fmtViolDate = (d) => {
        try {
          const dt = new Date(d + 'T00:00:00');
          return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch { return d; }
      };

      const cumViolRows = cumViolItems.map(v => {
        return `
          <tr>
            <td style="padding:6px 4px;color:${C.textMuted};font-size:12px;border-bottom:1px solid ${C.cardBorder};white-space:nowrap;">${fmtViolDate(v.call_date)}</td>
            <td style="padding:6px 4px;color:${C.text};font-size:12px;border-bottom:1px solid ${C.cardBorder};">${v.risk_category}</td>
            <td style="padding:6px 4px;color:${C.text};font-size:12px;font-style:italic;border-bottom:1px solid ${C.cardBorder};">"${v.phrase}"</td>
          </tr>
        `;
      }).join('');

      const cumViolContent = `
        <p style="margin:0 0 8px 0;font-size:13px;color:${C.textMuted};">${cum.violations_count} total violation${cum.violations_count !== 1 ? 's' : ''} flagged</p>
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <th style="padding:6px 4px;color:${C.textMuted};font-size:11px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Date</th>
            <th style="padding:6px 4px;color:${C.textMuted};font-size:11px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Type</th>
            <th style="padding:6px 4px;color:${C.textMuted};font-size:11px;text-align:left;border-bottom:2px solid ${C.borderDefault};text-transform:uppercase;">Phrase</th>
          </tr>
          ${cumViolRows}
        </table>
      `;
      cumViolationsSection = card('Violations & Risk', cumViolContent, C.red);
    } else if (cum.violations_count > 0) {
      const cumViolContent = metricTable(
        metricRow('Total Violations', num(cum.violations_count), '')
      );
      cumViolationsSection = card('Violations & Risk', cumViolContent, C.red);
    }

    cumulativeHtml = `
      ${cumGlanceSection}
      ${comparisonSection}
      ${cumRevenueSection}
      ${cumScriptSection}
      ${cumObjectionsSection}
      ${cumViolationsSection}
    `;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CloserMetrix Closer Watch — ${data.closer.name}</title>
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
              <img src="${logoSrc}" alt="CloserMetrix" width="600" style="width:100%;max-width:600px;height:auto;margin-bottom:8px;" />
              <p style="margin:8px 0 0 0;font-size:14px;color:${C.textSecondary};">
                Closer Watch Report &middot; ${data.company_name}
              </p>
              <p style="margin:4px 0 0 0;font-size:16px;font-weight:600;color:${C.cyan};">
                ${data.closer.name}
              </p>
              <p style="margin:4px 0 0 0;font-size:13px;color:${C.textMuted};">
                ${data.report_date}
              </p>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 0 16px 0;">
              <div style="height:1px;background:linear-gradient(90deg, transparent, ${C.purple}, transparent);"></div>
            </td>
          </tr>

          <!-- Progress Bar -->
          <tr><td>${progressSection}</td></tr>

          <!-- ═══ TODAY ═══ -->
          <tr><td>${todaySectionHeader}</td></tr>
          <tr><td>${glanceSection}</td></tr>
          <tr><td>${revenueSection}</td></tr>
          <tr><td>${scriptSection}</td></tr>
          <tr><td>${objectionsSection}</td></tr>
          <tr><td>${violationsSection}</td></tr>

          <!-- ═══ 30-DAY CUMULATIVE ═══ -->
          <tr><td>${thirtyDaySectionHeader}</td></tr>
          <tr><td>${cumulativeHtml}</td></tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0;text-align:center;">
              <div style="height:1px;background:linear-gradient(90deg, transparent, ${C.cardBorder}, transparent);margin-bottom:16px;"></div>
              <p style="margin:0;font-size:12px;color:${C.textMuted};">
                CloserMetrix &middot; Sales Intelligence Platform
              </p>
              <p style="margin:4px 0 0 0;font-size:11px;color:${C.textMuted};">
                ${data.days_remaining} days remaining &middot; Compared to ${data.targets?.source === 'kpi' ? 'KPI targets' : `team avg (${data.targets?.period_label || 'period'})`}
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

/** Renders a section divider with a gradient line and label (e.g. "Today" or "Since Onboarding"). */
function _sectionDivider(label, color) {
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 16px 0;">
      <tr>
        <td style="padding:0;">
          <div style="height:2px;background:linear-gradient(90deg, ${color}, transparent);margin-bottom:12px;"></div>
          <h2 style="margin:0;font-size:16px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:2px;">
            ${label}
          </h2>
        </td>
      </tr>
    </table>
  `;
}

/** Renders 3 metric cards in a row for the onboarding glance section. */
function _onboardingMetricCards(items) {
  const cells = items.map(item => {
    const subLine = item.sub
      ? `<div style="font-size:12px;font-weight:400;color:${C.textMuted};margin-top:2px;">${item.sub}</div>`
      : `<div style="font-size:12px;margin-top:2px;">&nbsp;</div>`;
    return `
      <td width="33%" style="padding:4px;text-align:center;vertical-align:top;">
        <div style="background:${C.elevated};border-radius:6px;padding:14px 4px;">
          <div style="font-size:22px;font-weight:700;color:${item.color};line-height:1.2;">${item.value}</div>
          ${subLine}
          <div style="font-size:10px;color:${C.textMuted};text-transform:uppercase;letter-spacing:0.5px;margin-top:4px;">${item.label}</div>
        </div>
      </td>
    `;
  }).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;"><tr>${cells}</tr></table>`;
}

/** Renders a comparison row: metric | closer value | target value | color-coded delta. */
function _comparisonRow(label, closerFmt, targetFmt, closerVal, targetVal, invertColor) {
  const diff = (closerVal || 0) - (targetVal || 0);
  let deltaColor = C.textMuted;
  let deltaSymbol = '→';
  if (diff > 0) { deltaColor = invertColor ? C.red : C.green; deltaSymbol = '↑'; }
  else if (diff < 0) { deltaColor = invertColor ? C.green : C.red; deltaSymbol = '↓'; }

  return `
    <tr>
      <td style="padding:8px;color:${C.textSecondary};font-size:14px;border-bottom:1px solid ${C.cardBorder};">${label}</td>
      <td style="padding:8px;color:${C.text};font-size:14px;font-weight:600;text-align:right;border-bottom:1px solid ${C.cardBorder};">${closerFmt}</td>
      <td style="padding:8px;color:${C.textMuted};font-size:14px;text-align:right;border-bottom:1px solid ${C.cardBorder};">${targetFmt}</td>
      <td style="padding:8px;color:${deltaColor};font-size:13px;font-weight:600;text-align:right;border-bottom:1px solid ${C.cardBorder};">${deltaSymbol}</td>
    </tr>
  `;
}

/**
 * Renders an immediate FTC violation alert email.
 * Compact, urgent design with red accent — not a report, an alert.
 *
 * @param {Object} data — { company_name, closer_name, call_date, call_time, prospect_name,
 *                           call_url, call_type, violation: { category, exact_phrase, severity, explanation } }
 * @param {Object} [opts] — { livePreview, baseUrl }
 */
function renderFTCAlertEmail(data, opts = {}) {
  _setBaseUrl(opts.baseUrl);
  const logoSrc = _logoUrl;
  const v = data.violation || {};

  const refreshScript = opts.livePreview ? `<script>setTimeout(function(){location.reload();},2000);</script>` : '';

  const severityColors = { high: C.red, medium: C.amber, low: C.textMuted };
  const sevColor = severityColors[v.severity] || C.red;

  const detailRow = (label, value) => `
    <tr>
      <td style="padding:8px 0;color:${C.textSecondary};font-size:14px;border-bottom:1px solid ${C.cardBorder};width:140px;">${label}</td>
      <td style="padding:8px 0;color:${C.text};font-size:14px;font-weight:500;border-bottom:1px solid ${C.cardBorder};">${value}</td>
    </tr>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FTC ALERT — ${data.closer_name}</title>
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
              <img src="${logoSrc}" alt="CloserMetrix" width="600" style="width:100%;max-width:600px;height:auto;margin-bottom:8px;" />
            </td>
          </tr>

          <!-- Alert Banner -->
          <tr>
            <td style="padding:0 0 16px 0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:${C.red};border-radius:8px;padding:16px 20px;text-align:center;">
                    <div style="font-size:20px;font-weight:700;color:#fff;letter-spacing:1px;">FTC COMPLIANCE ALERT</div>
                    <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:4px;">${data.company_name} &middot; ${data.call_date}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Call Details Card -->
          ${card('Call Details', `
            <table width="100%" cellpadding="0" cellspacing="0">
              ${detailRow('Closer', data.closer_name)}
              ${detailRow('Prospect', data.prospect_name || '—')}
              ${detailRow('Call Type', data.call_type || '—')}
              ${detailRow('Date / Time', `${data.call_date} ${data.call_time ? '&middot; ' + data.call_time : ''}`)}
              ${data.call_url ? detailRow('Recording', `<a href="${data.call_url}" style="color:${C.cyan};text-decoration:none;">View Call &rarr;</a>`) : ''}
            </table>
          `, C.red)}

          <!-- Violation Details Card -->
          ${card('Violation Details', `
            <table width="100%" cellpadding="0" cellspacing="0">
              ${detailRow('Category', `<span style="color:${C.red};font-weight:600;">${v.category || '—'}</span>`)}
              ${detailRow('Severity', `<span style="display:inline-block;padding:2px 10px;border-radius:4px;background:${sevColor}20;color:${sevColor};font-size:12px;font-weight:600;text-transform:uppercase;">${v.severity || '—'}</span>`)}
              ${v.timestamp ? detailRow('Timestamp', `<span style="font-family:monospace;color:${C.cyan};">${v.timestamp}</span>`) : ''}
            </table>
            <div style="margin-top:16px;padding:14px 16px;background:${C.elevated};border-left:3px solid ${C.red};border-radius:0 6px 6px 0;">
              <div style="font-size:11px;font-weight:600;color:${C.red};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Exact Phrase</div>
              <div style="font-size:15px;color:${C.text};line-height:1.5;font-style:italic;">&ldquo;${v.exact_phrase || ''}&rdquo;</div>
            </div>
            <div style="margin-top:12px;padding:14px 16px;background:rgba(255,217,61,0.04);border-left:3px solid ${C.amber};border-radius:0 6px 6px 0;">
              <div style="font-size:11px;font-weight:600;color:${C.amber};text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Why This Is Flagged</div>
              <div style="font-size:14px;color:${C.textSecondary};line-height:1.6;">${v.explanation || ''}</div>
            </div>
          `, C.red)}

          <!-- Footer -->
          <tr>
            <td style="padding:24px 0;text-align:center;">
              <div style="height:1px;background:linear-gradient(90deg, transparent, ${C.cardBorder}, transparent);margin-bottom:16px;"></div>
              <p style="margin:0;font-size:12px;color:${C.textMuted};">
                CloserMetrix &middot; Immediate FTC Violation Alert
              </p>
              <p style="margin:4px 0 0 0;font-size:11px;color:${C.textMuted};">
                This alert was triggered automatically when AI processing detected a high-severity compliance flag.
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
  renderDailyOnboardingReport,
  renderFTCAlertEmail,
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

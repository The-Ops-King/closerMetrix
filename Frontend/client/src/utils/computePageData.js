/**
 * CLIENT-SIDE METRIC COMPUTATION
 *
 * Computes all dashboard page metrics from raw call data + filters.
 * This runs entirely in the browser — no server round-trips needed
 * when filters change.
 *
 * Main entry: computePageData(section, rawData, filters)
 *   section: 'overview' | 'financial' | 'attendance' | 'call-outcomes' |
 *            'sales-cycle' | 'objections' | 'projections' | 'violations' | 'adherence'
 *   rawData: { calls: [...], objections: [...], closeCycles: [...] }
 *   filters: { dateStart, dateEnd, closerId, granularity }
 *
 * Returns: { sections, charts, tables } — same shape each page expects.
 *
 * Domain values (call outcomes, attendance, risk categories, etc.) are
 * imported from shared config files so they stay in sync with the server.
 */

import {
  OUTCOMES, FOLLOW_UP_OUTCOMES, DQ_OUTCOMES, REVENUE_OUTCOMES,
  ATTENDANCE, GHOST_SUBSTRINGS, CANCEL_SUBSTRINGS, RESCHEDULE_SUBSTRINGS,
  CALL_TYPES, FIRST_CALL_TYPES, FOLLOW_UP_TYPES, KEY_MOMENT_RISK_TYPES,
} from '../../../shared/callValues.js';

import {
  RISK_CATEGORIES, RISK_CATEGORY_LABELS, RISK_CATEGORY_COLORS,
  SCRIPT_SECTIONS, CALLS_TO_CLOSE_BUCKETS, DAYS_TO_CLOSE_BUCKETS,
} from '../../../shared/categoryValues.js';

import {
  OUTCOME_CHART_CONFIG, NOT_TAKEN_CHART_CONFIG,
  RISK_TREND_CHART_CONFIG, CALLS_TO_CLOSE_CHART_CONFIG,
  DAYS_TO_CLOSE_CHART_CONFIG,
} from '../../../shared/chartMappings.js';

import { COLORS } from '../theme/constants';

// Reverse map: outcome label → snake_case key (e.g. 'Closed - Won' → 'closed_won')
const OUTCOME_LABEL_TO_KEY = Object.fromEntries(
  Object.entries(OUTCOMES).map(([key, label]) => [label, key.toLowerCase()])
);
/** Convert a BQ outcome label to its snake_case key for filter matching */
function outcomeToKey(label) {
  return OUTCOME_LABEL_TO_KEY[label] || null;
}

// ─────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Visually distinct neon color cycle for dynamic pie charts (closers, reasons, etc.).
 * Used when we don't know segment labels ahead of time and need to assign colors by index.
 * Ordered for maximum visual contrast between adjacent slices.
 */
const PIE_COLORS = ['cyan', 'green', 'amber', 'purple', 'blue', 'red', 'magenta', 'muted'];

/** Safe divide — returns 0 if divisor is 0 */
function sd(a, b) { return b === 0 ? 0 : a / b; }

/** Round to N decimal places */
function round(v, d = 2) { return Math.round(v * Math.pow(10, d)) / Math.pow(10, d); }

/** Compute the previous period matching the current date range duration */
function computePreviousPeriod(dateStart, dateEnd) {
  const start = new Date(dateStart + 'T12:00:00');
  const end = new Date(dateEnd + 'T12:00:00');
  const durationMs = end - start;
  const daysInRange = Math.round(durationMs / 86400000);

  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - daysInRange);

  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  let deltaLabel;
  if (daysInRange <= 8) deltaLabel = 'vs prev week';
  else if (daysInRange <= 32) deltaLabel = 'vs prev period';
  else if (daysInRange <= 95) deltaLabel = 'vs prev quarter';
  else deltaLabel = 'vs prev period';

  return { prevStart: fmt(prevStart), prevEnd: fmt(prevEnd), deltaLabel };
}

/** Percentage change between current and previous values. Returns null if no comparison. */
function calcDelta(current, previous) {
  if (previous == null || previous === 0) return null;
  return round(((current - previous) / Math.abs(previous)) * 100, 1);
}

/** Add delta fields to an existing metric object */
function withDelta(metric, current, previous, deltaLabel, desiredDirection = 'up') {
  const delta = calcDelta(current, previous);
  if (delta == null) return metric;
  return { ...metric, delta, deltaLabel, desiredDirection };
}

/** Parse closerId (comma-separated string or null) into an array for filtering */
function parseCloserIds(closerId) {
  if (!closerId) return null;
  return closerId.split(',').map(id => id.trim());
}

/** Parse callSource (comma-separated string or null) into an array for filtering */
function parseCallSources(callSource) {
  if (!callSource) return null;
  return callSource.split(',').map(s => s.trim());
}

/**
 * Filter calls by date range, optional closer(s), and optional call source(s).
 *
 * A call is included if EITHER:
 *   - Its appointmentDate falls within the date range (for activity metrics: shows, ghosts, etc.)
 *   - Its dateClosed falls within the date range (for revenue/close metrics — even if appointment was outside range)
 *
 * Each call is stamped with:
 *   _inRangeByAppointment: true if appointmentDate is in range
 *   _inRangeByClose: true if dateClosed is in range (and call is Closed-Won or Deposit)
 *   _effectiveDate: dateClosed for closed/deposit deals, appointmentDate otherwise (for time-series bucketing)
 */
function filterCalls(calls, dateStart, dateEnd, closerId, callSource) {
  const ids = parseCloserIds(closerId);
  const sources = parseCallSources(callSource);
  const result = [];
  for (const c of calls) {
    const apptInRange = c.appointmentDate >= dateStart && c.appointmentDate <= dateEnd;
    const hasCloseDate = c.dateClosed && (c.callOutcome === 'Closed - Won' || c.callOutcome === 'Deposit');
    const closeInRange = hasCloseDate && c.dateClosed >= dateStart && c.dateClosed <= dateEnd;

    // Include if either date is in range
    if (!apptInRange && !closeInRange) continue;
    if (ids && !ids.includes(c.closerId)) continue;
    if (sources && !sources.includes(c.callSource)) continue;

    // Shallow-clone so period-specific flags don't leak between current/prev calls
    const clone = { ...c, _inRangeByAppointment: apptInRange, _inRangeByClose: closeInRange, _effectiveDate: hasCloseDate ? c.dateClosed : c.appointmentDate };
    result.push(clone);
  }
  return result;
}

/** Filter objections by date range, optional closer(s), optional objection type(s), and optional call source(s) */
function filterObjections(objections, dateStart, dateEnd, closerId, objectionType, callSource, callSourceCallIds) {
  const ids = parseCloserIds(closerId);
  // Parse objectionType — may be comma-separated string or array
  const typeFilter = objectionType
    ? (Array.isArray(objectionType) ? objectionType : objectionType.split(',').map(t => t.trim()))
    : null;
  return objections.filter(o => {
    if (o.appointmentDate < dateStart || o.appointmentDate > dateEnd) return false;
    if (ids && !ids.includes(o.closerId)) return false;
    if (typeFilter && typeFilter.length > 0 && !typeFilter.includes(o.objectionType)) return false;
    if (callSourceCallIds && !callSourceCallIds.has(o.callId)) return false;
    return true;
  });
}

/** Filter close cycles by date range, optional closer(s), and optional call source call IDs */
function filterCloseCycles(cycles, dateStart, dateEnd, closerId, callSourceCallIds) {
  const ids = parseCloserIds(closerId);
  return cycles.filter(c => {
    if (c.closeDate < dateStart || c.closeDate > dateEnd) return false;
    if (ids && !ids.includes(c.closerId)) return false;
    // Close cycles don't have callSource directly — filter via prospect email match from filtered calls
    // For now, close cycles pass through when callSource filter is active (they don't have call_source field)
    return true;
  });
}

/** Get the Monday of the week for a YYYY-MM-DD date string */
function weekStart(dateStr) {
  const d = new Date(dateStr + 'T12:00:00'); // noon avoids DST/timezone edge cases
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${dd}`;
}

/** Get the next Monday on or after a YYYY-MM-DD date string */
function nextMonday(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  if (day === 1) return dateStr; // already Monday
  const daysUntilMon = day === 0 ? 1 : (8 - day);
  d.setDate(d.getDate() + daysUntilMon);
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yr}-${mo}-${dd}`;
}

/** Get month start for a YYYY-MM-DD */
function monthStart(dateStr) {
  return dateStr.substring(0, 7) + '-01';
}

/**
 * Auto-select chart granularity based on the date range span.
 * Keeps charts readable: daily for short ranges, monthly for long ones.
 *   ≤14 days  → daily
 *   15-90 days → weekly
 *   >90 days  → monthly
 */
function autoGranularity(explicit, dateStart, dateEnd) {
  if (explicit && explicit !== 'auto') return explicit;
  if (!dateStart || !dateEnd) return 'weekly';
  const ms = new Date(dateEnd) - new Date(dateStart);
  const days = Math.round(ms / 86400000);
  if (days <= 14) return 'daily';
  if (days <= 90) return 'weekly';
  return 'monthly';
}

/** Group items into time buckets. Returns Map<bucketDate, items[]> */
function groupByTime(items, dateField, granularity) {
  if (items.length === 0) return new Map();

  const bucketFn = granularity === 'monthly' ? monthStart
    : granularity === 'daily' ? (d) => d
    : weekStart;

  // For weekly bucketing: if the date range starts mid-week, merge
  // the partial first week into the first full Monday bucket.
  // e.g. Feb 1 (Sunday) → weekStart = Jan 26 (Monday) → merge into Feb 2 (next Monday)
  // This prevents a tiny 1-day bucket followed by a full 7-day bucket.
  let mergeTarget = null;
  if (granularity === 'weekly') {
    let earliest = null;
    for (const item of items) {
      const d = item[dateField];
      if (!earliest || d < earliest) earliest = d;
    }
    if (earliest) {
      const ws = weekStart(earliest);
      if (ws < earliest) {
        // Range starts mid-week — merge partial-week items into first full Monday
        mergeTarget = nextMonday(earliest);
      }
    }
  }

  const map = new Map();
  for (const item of items) {
    let bucket = bucketFn(item[dateField]);
    // If this item's week-start falls before our merge target,
    // put it in the first full-week bucket instead
    if (mergeTarget && bucket < mergeTarget) {
      bucket = mergeTarget;
    }
    if (!map.has(bucket)) map.set(bucket, []);
    map.get(bucket).push(item);
  }
  // Sort by date
  return new Map([...map.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

/** Group items by closer. Returns Map<closerName, items[]> */
function groupByCloser(items) {
  const map = new Map();
  for (const item of items) {
    const name = item.closerName || item.closerId || 'Unknown';
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(item);
  }
  return map;
}

/** Count calls matching a predicate */
function count(calls, pred) { return calls.filter(pred).length; }

/** Sum a numeric field from filtered calls */
function sum(calls, field, pred) {
  const filtered = pred ? calls.filter(pred) : calls;
  return filtered.reduce((acc, c) => acc + (c[field] || 0), 0);
}

/** Average a numeric field (only non-zero values) */
function avg(calls, field, pred) {
  const filtered = pred ? calls.filter(pred) : calls;
  const vals = filtered.map(c => c[field]).filter(v => v > 0);
  return vals.length === 0 ? 0 : vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Median of an array of numbers */
function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ── Predicates ─────────────────────────────────────────────
// All domain strings come from shared/callValues.js so a BigQuery
// rename only needs updating in one place.

/** Call was attended (attendance = 'Show') */
const isShow = c => c.attendance === ATTENDANCE.SHOW;

/** First-time call (First Call or Rescheduled - First Call) */
const isFirstCall = c => FIRST_CALL_TYPES.includes(c.callType);

/** Any follow-up call (Follow Up or Rescheduled - Follow Up) */
const isFollowUp = c => FOLLOW_UP_TYPES.includes(c.callType);

/** Outcome: Closed - Won */
const isClosed = c => c.callOutcome === OUTCOMES.CLOSED_WON;

/** Outcome: Deposit */
const isDeposit = c => c.callOutcome === OUTCOMES.DEPOSIT;

/** Outcome: Lost */
const isLost = c => c.callOutcome === OUTCOMES.LOST;

/** Outcome: DQ or Disqualified (both spellings) */
const isDQ = c => DQ_OUTCOMES.includes(c.callOutcome);

/** Outcome: Not Pitched */
const isNotPitched = c => c.callOutcome === OUTCOMES.NOT_PITCHED;

/** Outcome: Refunded — excluded from active financial metrics (revenue, close rate) */
const isRefunded = c => c.callOutcome === OUTCOMES.REFUNDED;

/** Outcome: Follow Up (both spellings) */
const isFollowUpOutcome = c => FOLLOW_UP_OUTCOMES.includes(c.callOutcome);

/** Attendance: ghost/no-show (matches 'Ghosted', 'Ghosted - No Show', etc.) */
const isGhost = c => GHOST_SUBSTRINGS.some(s => c.attendance.includes(s));

/** Attendance: canceled */
const isCanceled = c => CANCEL_SUBSTRINGS.some(s => c.attendance.includes(s));

/** Attendance: rescheduled */
const isRescheduled = c => RESCHEDULE_SUBSTRINGS.some(s => c.attendance.includes(s));

/** Did NOT show up */
const isNoShow = c => !isShow(c);

/** Generated revenue (Closed or Deposit) */
const hasRevenue = c => REVENUE_OUTCOMES.includes(c.callOutcome);

/** Build a metric object for scorecards */
function m(label, value, format, glowColor) {
  // Guard: ensure numeric values are never NaN/Infinity (would show em-dash)
  const safeValue = (typeof value === 'number' && !isFinite(value)) ? 0 : value;
  return { label, value: safeValue, format, glowColor };
}


// ─────────────────────────────────────────────────────────────
// MAIN DISPATCHER
// ─────────────────────────────────────────────────────────────

export function computePageData(section, rawData, filters, kpiTargets) {
  if (!rawData || !rawData.calls) return null;

  const { dateStart, dateEnd, closerId, granularity: rawGranularity, objectionType, riskCategory, callSource } = filters;

  // Auto-select granularity based on date range span if set to 'auto' or default
  const granularity = autoGranularity(rawGranularity, dateStart, dateEnd);

  const calls = filterCalls(rawData.calls, dateStart, dateEnd, closerId, callSource);
  // Build a set of call IDs from source-filtered calls so objections can be filtered by source too
  const sources = parseCallSources(callSource);
  const callSourceCallIds = sources ? new Set(calls.map(c => c.callId)) : null;
  const objections = filterObjections(rawData.objections || [], dateStart, dateEnd, closerId, objectionType, callSource, callSourceCallIds);
  const closeCycles = filterCloseCycles(rawData.closeCycles || [], dateStart, dateEnd, closerId, callSourceCallIds);

  // Compute previous period for delta comparisons
  const { prevStart, prevEnd, deltaLabel } = computePreviousPeriod(dateStart, dateEnd);
  const prevCalls = filterCalls(rawData.calls, prevStart, prevEnd, closerId, callSource);
  const prevCallSourceCallIds = sources ? new Set(prevCalls.map(c => c.callId)) : null;
  const prevObjections = filterObjections(rawData.objections || [], prevStart, prevEnd, closerId, objectionType, callSource, prevCallSourceCallIds);
  const prevCloseCycles = filterCloseCycles(rawData.closeCycles || [], prevStart, prevEnd, closerId, prevCallSourceCallIds);
  const prev = { calls: prevCalls, objections: prevObjections, closeCycles: prevCloseCycles, deltaLabel };

  switch (section) {
    case 'overview': return computeOverview(calls, granularity, rawData, prev);
    case 'financial': return computeFinancial(calls, granularity, prev);
    case 'attendance': return computeAttendance(calls, granularity, prev);
    case 'call-outcomes': return computeCallOutcomes(calls, granularity, prev);
    case 'sales-cycle': return computeSalesCycle(calls, closeCycles, prev);
    case 'objections': {
      // Compute available types from ALL objections (date+closer filtered, but NOT type-filtered)
      const allObjForTypes = filterObjections(rawData.objections || [], dateStart, dateEnd, closerId, null, callSource, callSourceCallIds);
      const typeCounts = {};
      allObjForTypes.forEach(o => {
        const t = o.objectionType || 'Other';
        typeCounts[t] = (typeCounts[t] || 0) + 1;
      });
      const availableObjectionTypes = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([type]) => type);
      const result = computeObjections(calls, objections, granularity, prev);
      result.availableObjectionTypes = availableObjectionTypes;
      return result;
    }
    case 'projections': return computeProjections(calls, closeCycles, rawData, filters);
    case 'violations': return computeViolations(calls, granularity, prev, riskCategory);
    case 'adherence': return computeAdherence(calls, granularity, prev);
    case 'market-insight': return computeMarketInsight(rawData);
    case 'closer-scoreboard': return computeCloserScoreboard(calls, objections, closeCycles, granularity, prev, kpiTargets);
    case 'closer-view': return computeCloserView(rawData, calls, objections, closeCycles, granularity, prev);
    default: return null;
  }
}


// ─────────────────────────────────────────────────────────────
// OVERVIEW PAGE
// ─────────────────────────────────────────────────────────────

function computeOverview(calls, granularity, rawData, prev) {
  // Activity metrics: only calls with appointments in the date range
  const apptCalls = calls.filter(c => c._inRangeByAppointment);
  const held = apptCalls.filter(isShow);
  const lost = apptCalls.filter(c => isShow(c) && isLost(c));
  const firstCalls = apptCalls.filter(isFirstCall);
  const firstHeld = firstCalls.filter(isShow);

  // Close/revenue metrics: calls that closed in the date range (regardless of appointment date)
  const closed = calls.filter(c => c._inRangeByClose && isShow(c) && isClosed(c));
  const deposits = calls.filter(c => c._inRangeByClose && isShow(c) && isDeposit(c));
  const revenueDeals = calls.filter(c => c._inRangeByClose && isShow(c) && hasRevenue(c));
  const revenue = sum(revenueDeals, 'revenueGenerated');
  const cash = sum(revenueDeals, 'cashCollected');

  // 1-call close % from close cycles
  const cycles = rawData?.closeCycles || [];
  const oneCallCloses = cycles.filter(c => c.callsToClose === 1).length;
  const oneCallPct = round(sd(oneCallCloses, cycles.length), 3);

  // Potential violations — count from complianceFlags (preferred) or key moments (fallback)
  // complianceFlags can be an object { flags: [...] } or an array directly
  let violationCount = 0;
  for (const c of held) {
    const cf = c.complianceFlags;
    const cfFlags = cf && Array.isArray(cf.flags) ? cf.flags : (Array.isArray(cf) ? cf : null);
    if (cfFlags && cfFlags.length > 0) {
      violationCount += cfFlags.length;
      continue;
    }
    // Fallback: parse keyMoments
    if (!c.keyMoments) continue;
    try {
      const km = typeof c.keyMoments === 'string' ? JSON.parse(c.keyMoments) : c.keyMoments;
      if (Array.isArray(km)) {
        violationCount += km.filter(m => KEY_MOMENT_RISK_TYPES.includes(m.type)).length;
      }
    } catch (e) { /* ignore parse errors */ }
  }

  const sections = {
    atAGlance: {
      revenue: m('Revenue Generated', revenue, 'currency', 'green'),
      cashCollected: m('Cash Collected', cash, 'currency', 'teal'),
      cashPerCall: m('Cash / Call Held', round(sd(cash, held.length)), 'currency', 'blue'),
      avgDealSize: m('Average Deal Size', round(sd(revenue, revenueDeals.length)), 'currency', 'cyan'),
      closedDeals: m('Closed Deals', closed.length, 'number', 'green'),
      potentialViolations: m('Potential Violations', violationCount, 'number', 'red'),
      oneCallClosePct: m('1 Call Close %', oneCallPct, 'percent', 'purple'),
      callsPerDeal: m('Calls Required per Deal', round(sd(held.length, closed.length), 1), 'decimal', 'amber'),
      prospectsBooked: m('Unique Prospects Scheduled',
        new Set(firstCalls.filter(c => c.prospectEmail).map(c => c.prospectEmail)).size || firstCalls.length,
        'number', 'cyan'),
      prospectsHeld: m('Unique Appointments Held',
        new Set(firstHeld.filter(c => c.prospectEmail).map(c => c.prospectEmail)).size || firstHeld.length,
        'number', 'cyan'),
      showRate: m('Show Rate', round(sd(held.length, apptCalls.length), 3), 'percent', 'green'),
      closeRate: m('Show \u2192 Close Rate', round(sd(closed.length, held.length), 3), 'percent', 'cyan'),
      scheduledCloseRate: m('Scheduled \u2192 Close Rate', round(sd(closed.length, apptCalls.length), 3), 'percent', 'blue'),
      callsLost: m('Calls Lost', lost.length, 'number', 'red'),
      lostPct: m('Lost %', round(sd(lost.length, held.length), 3), 'percent', 'red'),
      avgCallDuration: m('Average Call Duration', round(sd(held.reduce((acc, c) => acc + (c.durationMinutes || 0), 0), held.length), 1), 'duration', 'amber'),
      activeFollowUp: m('Active Follow Up', apptCalls.filter(c => isShow(c) && isFollowUpOutcome(c)).length, 'number', 'purple'),
      disqualified: m('# Disqualified', held.filter(isDQ).length, 'number', 'muted'),
    },
  };

  // Add period-over-period deltas to key scorecards
  if (prev && prev.calls.length > 0) {
    const dl = prev.deltaLabel;
    const pc = prev.calls;
    const pHeld = pc.filter(isShow);
    const pClosed = pHeld.filter(isClosed);
    const pLost = pHeld.filter(isLost);
    const pFirstCalls = pc.filter(isFirstCall);
    const pFirstHeld = pFirstCalls.filter(isShow);
    const pRevDeals = pHeld.filter(hasRevenue);
    const pRevenue = sum(pRevDeals, 'revenueGenerated');
    const pCash = sum(pRevDeals, 'cashCollected');

    // Previous period violation count
    let pViolationCount = 0;
    for (const c of pHeld) {
      const pcf = c.complianceFlags;
      const pcfFlags = pcf && Array.isArray(pcf.flags) ? pcf.flags : (Array.isArray(pcf) ? pcf : null);
      if (pcfFlags && pcfFlags.length > 0) {
        pViolationCount += pcfFlags.length;
        continue;
      }
      if (!c.keyMoments) continue;
      try {
        const km = typeof c.keyMoments === 'string' ? JSON.parse(c.keyMoments) : c.keyMoments;
        if (Array.isArray(km)) {
          pViolationCount += km.filter(m => m.type === 'risk' || m.type === 'violation' || m.type === 'compliance').length;
        }
      } catch (e) { /* ignore */ }
    }

    // Previous period 1-call close %
    const pCycles = prev.closeCycles || [];
    const pOneCallCloses = pCycles.filter(c => c.callsToClose === 1).length;
    const pOneCallPct = sd(pOneCallCloses, pCycles.length);

    const s = sections.atAGlance;
    s.revenue = withDelta(s.revenue, revenue, pRevenue, dl, 'up');
    s.cashCollected = withDelta(s.cashCollected, cash, pCash, dl, 'up');
    s.cashPerCall = withDelta(s.cashPerCall, sd(cash, held.length), sd(pCash, pHeld.length), dl, 'up');
    s.avgDealSize = withDelta(s.avgDealSize, sd(revenue, revenueDeals.length), sd(pRevenue, pRevDeals.length), dl, 'up');
    s.closedDeals = withDelta(s.closedDeals, closed.length, pClosed.length, dl, 'up');
    s.potentialViolations = withDelta(s.potentialViolations, violationCount, pViolationCount, dl, 'down');
    s.oneCallClosePct = withDelta(s.oneCallClosePct, oneCallPct, pOneCallPct, dl, 'up');
    s.callsPerDeal = withDelta(s.callsPerDeal, sd(held.length, closed.length), sd(pHeld.length, pClosed.length), dl, 'down');
    const uniqueBooked = new Set(firstCalls.filter(c => c.prospectEmail).map(c => c.prospectEmail)).size || firstCalls.length;
    const pUniqueBooked = new Set(pFirstCalls.filter(c => c.prospectEmail).map(c => c.prospectEmail)).size || pFirstCalls.length;
    const uniqueHeld = new Set(firstHeld.filter(c => c.prospectEmail).map(c => c.prospectEmail)).size || firstHeld.length;
    const pUniqueHeld = new Set(pFirstHeld.filter(c => c.prospectEmail).map(c => c.prospectEmail)).size || pFirstHeld.length;
    s.prospectsBooked = withDelta(s.prospectsBooked, uniqueBooked, pUniqueBooked, dl, 'up');
    s.prospectsHeld = withDelta(s.prospectsHeld, uniqueHeld, pUniqueHeld, dl, 'up');
    s.showRate = withDelta(s.showRate, sd(held.length, calls.length), sd(pHeld.length, pc.length), dl, 'up');
    s.closeRate = withDelta(s.closeRate, sd(closed.length, held.length), sd(pClosed.length, pHeld.length), dl, 'up');
    s.scheduledCloseRate = withDelta(s.scheduledCloseRate, sd(closed.length, calls.length), sd(pClosed.length, pc.length), dl, 'up');
    s.callsLost = withDelta(s.callsLost, lost.length, pLost.length, dl, 'down');
    s.lostPct = withDelta(s.lostPct, sd(lost.length, held.length), sd(pLost.length, pHeld.length), dl, 'down');
    const avgDur = sd(held.reduce((acc, c) => acc + (c.durationMinutes || 0), 0), held.length);
    const pAvgDur = sd(pHeld.reduce((acc, c) => acc + (c.durationMinutes || 0), 0), pHeld.length);
    s.avgCallDuration = withDelta(s.avgCallDuration, avgDur, pAvgDur, dl, 'up');
    const activefu = calls.filter(c => isShow(c) && isFollowUpOutcome(c)).length;
    const pActivefu = pc.filter(c => isShow(c) && isFollowUpOutcome(c)).length;
    s.activeFollowUp = withDelta(s.activeFollowUp, activefu, pActivefu, dl, 'down');
    const dqCount = held.filter(isDQ).length;
    const pDqCount = pHeld.filter(isDQ).length;
    s.disqualified = withDelta(s.disqualified, dqCount, pDqCount, dl, 'down');
  }

  // Time-series charts — use _effectiveDate so revenue/closes bucket by close date
  const timeBuckets = groupByTime(calls, '_effectiveDate', granularity);
  const revenueOverTime = [];
  const closesOverTime = [];
  const showCloseRateOverTime = [];
  for (const [date, bucket] of timeBuckets) {
    const bHeld = bucket.filter(isShow);
    const bClosed = bucket.filter(c => isShow(c) && isClosed(c));
    revenueOverTime.push({
      date,
      revenue: sum(bHeld, 'revenueGenerated', hasRevenue),
      cash: sum(bHeld, 'cashCollected', hasRevenue),
    });
    closesOverTime.push({
      date,
      closes: bClosed.length,
    });
    showCloseRateOverTime.push({
      date,
      showRate: round(sd(bHeld.length, bucket.length), 3),
      closeRate: round(sd(bClosed.length, bHeld.length), 3),
    });
  }

  // Per-closer bar chart
  const closerBuckets = groupByCloser(calls.filter(isShow));
  const dealsClosedByCloser = [];
  for (const [name, closerCalls] of closerBuckets) {
    dealsClosedByCloser.push({
      date: name,
      closed: closerCalls.filter(isClosed).length,
      deposits: closerCalls.filter(isDeposit).length,
    });
  }
  dealsClosedByCloser.sort((a, b) => (b.closed + b.deposits) - (a.closed + a.deposits));

  // Funnel — explicit colors so Closed is always green
  const funnelData = [
    { stage: 'Booked', count: calls.length, color: COLORS.neon.cyan },
    { stage: 'Held', count: held.length, color: COLORS.neon.blue },
    { stage: 'Qualified', count: held.length - calls.filter(c => isShow(c) && isDQ(c)).length, color: COLORS.neon.purple },
    { stage: 'Closed', count: closed.length, color: COLORS.neon.green },
  ];

  // Outcome breakdown pie — built from OUTCOME_CHART_CONFIG
  const refunded = calls.filter(c => isShow(c) && isRefunded(c));
  const outcomeCounts = {
    closed: closed.length,
    deposit: deposits.length,
    followUp: calls.filter(c => isShow(c) && isFollowUpOutcome(c)).length,
    lost: lost.length,
    disqualified: calls.filter(c => isShow(c) && isDQ(c)).length,
    notPitched: calls.filter(c => isShow(c) && isNotPitched(c)).length,
    refunded: refunded.length,
  };
  const outcomeBreakdown = OUTCOME_CHART_CONFIG
    .map(cfg => ({ label: cfg.label, value: outcomeCounts[cfg.key], color: cfg.color }))
    .filter(d => d.value > 0);

  return {
    sections,
    charts: {
      revenueOverTime: { data: revenueOverTime, series: [
        { key: 'revenue', label: 'Revenue', color: 'green' },
        { key: 'cash', label: 'Cash', color: 'teal' },
      ]},
      closesOverTime: { data: closesOverTime, series: [
        { key: 'closes', label: 'Deals Closed', color: 'green' },
      ]},
      showCloseRateOverTime: { data: showCloseRateOverTime, series: [
        { key: 'showRate', label: 'Show Rate', color: 'green' },
        { key: 'closeRate', label: 'Close Rate', color: 'cyan' },
      ]},
      dealsClosedByCloser: { data: dealsClosedByCloser, series: [
        { key: 'closed', label: 'Closed', color: 'green' },
        { key: 'deposits', label: 'Deposits', color: 'amber' },
      ]},
      callFunnel: funnelData,
      outcomeBreakdown,
    },
  };
}


// ─────────────────────────────────────────────────────────────
// FINANCIAL PAGE
// ─────────────────────────────────────────────────────────────

function computeFinancial(calls, granularity, prev) {
  // Activity metrics: only calls with appointments in range
  const apptCalls = calls.filter(c => c._inRangeByAppointment);
  const held = apptCalls.filter(isShow);

  // Close/revenue metrics: calls that closed in the date range
  const closed = calls.filter(c => c._inRangeByClose && isShow(c) && isClosed(c));
  const deposits = calls.filter(c => c._inRangeByClose && isShow(c) && isDeposit(c));
  const revenueDeals = calls.filter(c => c._inRangeByClose && isShow(c) && hasRevenue(c));

  const totalRevenue = sum(revenueDeals, 'revenueGenerated');
  const totalCash = sum(revenueDeals, 'cashCollected');
  const closedRevenue = sum(closed, 'revenueGenerated');
  const closedCash = sum(closed, 'cashCollected');

  const sections = {
    revenue: {
      revenue: m('Revenue Generated', totalRevenue, 'currency', 'green'),
      cashCollected: m('Cash Collected', totalCash, 'currency', 'teal'),
      revenuePerCall: m('Revenue / Call Held', round(sd(totalRevenue, held.length)), 'currency', 'purple'),
      cashPerCall: m('Cash / Call Held', round(sd(totalCash, held.length)), 'currency', 'blue'),
      collectedPct: m('% Collected', round(sd(totalCash, totalRevenue), 3), 'percent', 'purple'),
      avgDealRevenue: m('Avg Revenue Per Deal', round(sd(closedRevenue, closed.length)), 'currency', 'green'),
      avgCashPerDeal: m('Avg Cash Per Deal', round(sd(closedCash, closed.length)), 'currency', 'teal'),
      pifPct: m('% PIFs', (() => {
        const pifCount = revenueDeals.filter(c => {
          const pp = (c.paymentPlan || '').toLowerCase().replace(/[-_]/g, ' ');
          return pp.includes('paid in full') || pp.includes('pay in full') || pp === 'pif' || pp === 'full';
        }).length;
        return round(sd(pifCount, revenueDeals.length), 3);
      })(), 'percent', 'amber'),
      refundCount: (() => {
        const cnt = held.filter(isRefunded).length;
        const total = closed.length + cnt;
        const metric = m('# of Refunds', cnt, 'number', 'red');
        metric.hoverText = total > 0 ? `${round(sd(cnt, total) * 100, 1)}% of total closes` : null;
        return metric;
      })(),
      refundAmount: (() => {
        const amt = sum(held.filter(isRefunded), 'cashCollected');
        const totalRev = closedRevenue + amt;
        const metric = m('$ of Refunds', amt, 'currency', 'red');
        metric.hoverText = totalRev > 0 ? `${round(sd(amt, totalRev) * 100, 1)}% of total revenue` : null;
        return metric;
      })(),
    },
  };

  // Add period-over-period deltas
  if (prev && prev.calls.length > 0) {
    const dl = prev.deltaLabel;
    const pc = prev.calls;
    const pApptCalls = pc.filter(c => c._inRangeByAppointment);
    const pHeld = pApptCalls.filter(isShow);
    const pClosed = pc.filter(c => c._inRangeByClose && isShow(c) && isClosed(c));
    const pRevDeals = pc.filter(c => c._inRangeByClose && isShow(c) && hasRevenue(c));
    const pRevenue = sum(pRevDeals, 'revenueGenerated');
    const pCash = sum(pRevDeals, 'cashCollected');
    const pClosedRev = sum(pClosed, 'revenueGenerated');
    const pClosedCash = sum(pClosed, 'cashCollected');

    const s = sections.revenue;
    s.revenue = withDelta(s.revenue, totalRevenue, pRevenue, dl, 'up');
    s.cashCollected = withDelta(s.cashCollected, totalCash, pCash, dl, 'up');
    s.cashPerCall = withDelta(s.cashPerCall, sd(totalCash, held.length), sd(pCash, pHeld.length), dl, 'up');
    s.revenuePerCall = withDelta(s.revenuePerCall, sd(totalRevenue, held.length), sd(pRevenue, pHeld.length), dl, 'up');
    s.avgDealRevenue = withDelta(s.avgDealRevenue, sd(closedRevenue, closed.length), sd(pClosedRev, pClosed.length), dl, 'up');
    s.avgCashPerDeal = withDelta(s.avgCashPerDeal, sd(closedCash, closed.length), sd(pClosedCash, pClosed.length), dl, 'up');
    s.collectedPct = withDelta(s.collectedPct, sd(totalCash, totalRevenue), sd(pCash, pRevenue), dl, 'up');
  }

  // Time-series — use _effectiveDate so revenue is bucketed by close date
  const timeBuckets = groupByTime(calls, '_effectiveDate', granularity);
  const revenueOverTime = [];
  const perCallOverTime = [];
  for (const [date, bucket] of timeBuckets) {
    const bHeld = bucket.filter(isShow);
    const bRevDeals = bHeld.filter(hasRevenue);
    const bRev = sum(bRevDeals, 'revenueGenerated');
    const bCash = sum(bRevDeals, 'cashCollected');
    revenueOverTime.push({ date, revenue: bRev, cash: bCash });
    perCallOverTime.push({
      date,
      revPerCall: round(sd(bRev, bHeld.length)),
      cashPerCall: round(sd(bCash, bHeld.length)),
    });
  }

  // Per-closer — revenue charts use close-range deals, per-call uses activity-range held
  const closerRevBuckets = groupByCloser(revenueDeals);
  const closerHeldBuckets = groupByCloser(held);
  const revenueByCloserBar = [];
  const avgPerDealByCloser = [];
  const perCallByCloser = [];
  const revenueByCloserPie = [];

  // Collect all closer names from both buckets
  const allCloserNames = new Set([...closerRevBuckets.keys(), ...closerHeldBuckets.keys()]);
  for (const name of allCloserNames) {
    const cRevDeals = closerRevBuckets.get(name) || [];
    const cClosed = cRevDeals.filter(isClosed);
    const cRev = sum(cRevDeals, 'revenueGenerated');
    const cCash = sum(cRevDeals, 'cashCollected');
    const cClosedRev = sum(cClosed, 'revenueGenerated');
    const cClosedCash = sum(cClosed, 'cashCollected');
    const cHeld = closerHeldBuckets.get(name) || [];

    revenueByCloserBar.push({
      date: name,
      cash: cCash,
      uncollected: cRev - cCash,
    });
    avgPerDealByCloser.push({
      date: name,
      avgCash: round(sd(cClosedCash, cClosed.length)),
      avgUncollected: round(sd(cClosedRev - cClosedCash, cClosed.length)),
    });
    perCallByCloser.push({
      date: name,
      revPerCall: round(sd(cRev, cHeld.length)),
      cashPerCall: round(sd(cCash, cHeld.length)),
    });
    if (cRev > 0) {
      revenueByCloserPie.push({ label: name, value: cRev, color: PIE_COLORS[revenueByCloserPie.length % PIE_COLORS.length] });
    }
  }
  revenueByCloserBar.sort((a, b) => (b.cash + b.uncollected) - (a.cash + a.uncollected));
  avgPerDealByCloser.sort((a, b) => (b.avgCash + b.avgUncollected) - (a.avgCash + a.avgUncollected));

  return {
    sections,
    charts: {
      revenueOverTime: { data: revenueOverTime, series: [
        { key: 'revenue', label: 'Revenue Generated', color: 'green' },
        { key: 'cash', label: 'Cash Collected', color: 'teal' },
      ]},
      perCallOverTime: { data: perCallOverTime, series: [
        { key: 'revPerCall', label: 'Revenue / Call Held', color: 'purple' },
        { key: 'cashPerCall', label: 'Cash / Call Held', color: 'blue' },
      ]},
      revenueByCloserBar: { data: revenueByCloserBar },
      avgPerDealByCloser: { data: avgPerDealByCloser },
      perCallByCloser: { data: perCallByCloser },
      revenueByCloserPie: { data: revenueByCloserPie },
      paymentPlanBreakdown: { data: (() => {
        // Color map covers all known BigQuery payment_plan values (raw + AI-generated)
        const planColors = {
          'PIF': 'green',
          'Deposit': 'cyan',
          'Payment Plan': 'purple',
          'Installments': 'purple',
          'Financed': 'blue',
          'None': 'muted',
          'Unknown': 'muted',
        };
        // Rotating colors for any plan type not in the known map
        const fallbackColors = ['amber', 'red', 'teal', 'blue', 'purple', 'cyan', 'green'];
        let fallbackIdx = 0;
        const counts = {};
        for (const c of revenueDeals) {
          const pp = (c.paymentPlan || '').toLowerCase().replace(/[-_]/g, ' ');
          let label;
          if (pp.includes('paid in full') || pp.includes('pay in full') || pp === 'pif' || pp === 'full') {
            label = 'PIF';
          } else if (pp === 'deposit') {
            label = 'Deposit';
          } else if (pp === 'payment plan' || pp === 'installments') {
            label = 'Payment Plan';
          } else if (pp === 'financed') {
            label = 'Financed';
          } else if (pp === 'none' || pp === '') {
            label = 'Unknown';
          } else if (pp) {
            // Capitalize first letter of each word for display
            label = c.paymentPlan.replace(/[-_]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).trim();
          } else {
            label = 'Unknown';
          }
          counts[label] = (counts[label] || 0) + 1;
        }
        // Assign colors: known types get their mapped color, others cycle through fallback palette
        const assignedFallbacks = {};
        return Object.entries(counts)
          .map(([label, value]) => {
            let color = planColors[label];
            if (!color) {
              if (!assignedFallbacks[label]) {
                assignedFallbacks[label] = fallbackColors[fallbackIdx % fallbackColors.length];
                fallbackIdx++;
              }
              color = assignedFallbacks[label];
            }
            return { label, value, color };
          })
          .sort((a, b) => b.value - a.value);
      })() },
    },
  };
}


// ─────────────────────────────────────────────────────────────
// ATTENDANCE PAGE
// ─────────────────────────────────────────────────────────────

function computeAttendance(calls, granularity, prev) {
  const held = calls.filter(isShow);
  const firstCalls = calls.filter(isFirstCall);
  const followUps = calls.filter(isFollowUp);
  const firstHeld = firstCalls.filter(isShow);
  const followUpHeld = followUps.filter(isShow);
  const noShows = calls.filter(isNoShow);
  const ghosted = calls.filter(isGhost);
  const canceled = calls.filter(isCanceled);
  const rescheduled = calls.filter(isRescheduled);
  const activeFollowUpCount = calls.filter(c => isShow(c) && isFollowUpOutcome(c)).length;

  // Sections structured as column groups (page uses MetricColumn components)
  const sections = {
    // Column 1: Unique Prospects (first calls only, distinct by email)
    uniqueProspects: {
      scheduled: m('Scheduled',
        new Set(firstCalls.filter(c => c.prospectEmail).map(c => c.prospectEmail)).size || firstCalls.length,
        'number'),
      held: m('Held',
        new Set(firstHeld.filter(c => c.prospectEmail).map(c => c.prospectEmail)).size || firstHeld.length,
        'number'),
      showRate: m('Show Rate', round(sd(firstHeld.length, firstCalls.length), 3), 'percent'),
    },
    // Column 2: Total Calls
    totalCalls: {
      scheduled: m('Scheduled', calls.length, 'number'),
      held: m('Held', held.length, 'number'),
      showRate: m('Show Rate', round(sd(held.length, calls.length), 3), 'percent'),
    },
    // Column 3: First Calls
    firstCalls: {
      scheduled: m('Scheduled', firstCalls.length, 'number'),
      held: m('Held', firstHeld.length, 'number'),
      showRate: m('Show Rate', round(sd(firstHeld.length, firstCalls.length), 3), 'percent'),
    },
    // Column 4: Follow Up
    followUpCalls: {
      scheduled: m('Scheduled', followUps.length, 'number'),
      held: m('Held', followUpHeld.length, 'number'),
      showRate: m('Show Rate', round(sd(followUpHeld.length, followUps.length), 3), 'percent'),
    },
    // Standalone cards
    activeFollowUp: m('Active Follow Up', activeFollowUpCount, 'number'),
    notYetHeld: m('Not Yet Held', (() => {
      const today = new Date().toISOString().split('T')[0];
      return calls.filter(c => c.appointmentDate >= today && !isShow(c) && !isGhost(c) && !isCanceled(c) && !isRescheduled(c)).length;
    })(), 'number'),
    // Calls Not Taken section
    callsNotTaken: {
      notTaken: m('Not Taken', noShows.length, 'number'),
      ghosted: m('# Ghosted', ghosted.length, 'number'),
      cancelled: m('# Canceled', canceled.length, 'number'),
      rescheduled: m('# Rescheduled', rescheduled.length, 'number'),
      notTakenPct: m('% Not Taken', round(sd(noShows.length, calls.length), 3), 'percent'),
      ghostedPct: m('% Ghosted', round(sd(ghosted.length, noShows.length), 3), 'percent'),
      cancelledPct: m('% Canceled', round(sd(canceled.length, noShows.length), 3), 'percent'),
      rescheduledPct: m('% Rescheduled', round(sd(rescheduled.length, noShows.length), 3), 'percent'),
    },
    // Lost Revenue calculation row
    lostRevenue: {
      notTaken: m('Not Taken', noShows.length, 'number'),
      showCloseRate: m('Show > Close Rate', round(sd(held.filter(isClosed).length, held.length), 3), 'percent'),
      avgDealSize: m('Average Deal Size', round(sd(sum(held.filter(isClosed), 'revenueGenerated'), held.filter(isClosed).length)), 'currency'),
      lostPotential: m('Lost Potential Revenue', round(noShows.length * sd(held.filter(isClosed).length, held.length) * sd(sum(held.filter(isClosed), 'revenueGenerated'), held.filter(isClosed).length)), 'currency'),
    },
  };

  // Add period-over-period deltas
  if (prev && prev.calls.length > 0) {
    const dl = prev.deltaLabel;
    const pc = prev.calls;
    const pHeld = pc.filter(isShow);
    const pFirst = pc.filter(isFirstCall);
    const pFirstHeld = pFirst.filter(isShow);
    const pFU = pc.filter(isFollowUp);
    const pFUHeld = pFU.filter(isShow);
    const pNoShows = pc.filter(isNoShow);

    // Column scheduled/held counts — up is good
    sections.uniqueProspects.scheduled = withDelta(sections.uniqueProspects.scheduled, firstCalls.length, pFirst.length, dl, 'up');
    sections.uniqueProspects.held = withDelta(sections.uniqueProspects.held, firstHeld.length, pFirstHeld.length, dl, 'up');
    sections.totalCalls.scheduled = withDelta(sections.totalCalls.scheduled, calls.length, pc.length, dl, 'up');
    sections.totalCalls.held = withDelta(sections.totalCalls.held, held.length, pHeld.length, dl, 'up');
    sections.firstCalls.scheduled = withDelta(sections.firstCalls.scheduled, firstCalls.length, pFirst.length, dl, 'up');
    sections.firstCalls.held = withDelta(sections.firstCalls.held, firstHeld.length, pFirstHeld.length, dl, 'up');
    sections.followUpCalls.scheduled = withDelta(sections.followUpCalls.scheduled, followUps.length, pFU.length, dl, 'up');
    sections.followUpCalls.held = withDelta(sections.followUpCalls.held, followUpHeld.length, pFUHeld.length, dl, 'up');

    // Show rates — up is good
    sections.uniqueProspects.showRate = withDelta(sections.uniqueProspects.showRate, sd(firstHeld.length, firstCalls.length), sd(pFirstHeld.length, pFirst.length), dl, 'up');
    sections.totalCalls.showRate = withDelta(sections.totalCalls.showRate, sd(held.length, calls.length), sd(pHeld.length, pc.length), dl, 'up');
    sections.firstCalls.showRate = withDelta(sections.firstCalls.showRate, sd(firstHeld.length, firstCalls.length), sd(pFirstHeld.length, pFirst.length), dl, 'up');
    sections.followUpCalls.showRate = withDelta(sections.followUpCalls.showRate, sd(followUpHeld.length, followUps.length), sd(pFUHeld.length, pFU.length), dl, 'up');

    // Calls not taken — down is good
    const pGhosted = pc.filter(isGhost);
    const pCanceled = pc.filter(isCanceled);
    const pRescheduled = pc.filter(isRescheduled);
    sections.callsNotTaken.notTaken = withDelta(sections.callsNotTaken.notTaken, noShows.length, pNoShows.length, dl, 'down');
    sections.callsNotTaken.ghosted = withDelta(sections.callsNotTaken.ghosted, ghosted.length, pGhosted.length, dl, 'down');
    sections.callsNotTaken.cancelled = withDelta(sections.callsNotTaken.cancelled, canceled.length, pCanceled.length, dl, 'down');
    sections.callsNotTaken.rescheduled = withDelta(sections.callsNotTaken.rescheduled, rescheduled.length, pRescheduled.length, dl, 'down');
    sections.callsNotTaken.notTakenPct = withDelta(sections.callsNotTaken.notTakenPct, sd(noShows.length, calls.length), sd(pNoShows.length, pc.length), dl, 'down');
    sections.callsNotTaken.ghostedPct = withDelta(sections.callsNotTaken.ghostedPct, sd(ghosted.length, noShows.length), sd(pGhosted.length, pNoShows.length), dl, 'down');
    sections.callsNotTaken.cancelledPct = withDelta(sections.callsNotTaken.cancelledPct, sd(canceled.length, noShows.length), sd(pCanceled.length, pNoShows.length), dl, 'down');
    sections.callsNotTaken.rescheduledPct = withDelta(sections.callsNotTaken.rescheduledPct, sd(rescheduled.length, noShows.length), sd(pRescheduled.length, pNoShows.length), dl, 'down');
  }

  // Time-series
  const timeBuckets = groupByTime(calls, 'appointmentDate', granularity);
  const scheduledVsHeld = [];
  const firstFollowUpShowRate = [];
  const firstFollowUpHeldChart = [];
  const notTakenBreakdown = [];

  for (const [date, bucket] of timeBuckets) {
    const bHeld = bucket.filter(isShow);
    const bFirst = bucket.filter(isFirstCall);
    const bFirstHeld = bFirst.filter(isShow);
    const bFU = bucket.filter(isFollowUp);
    const bFUHeld = bFU.filter(isShow);

    scheduledVsHeld.push({ date, scheduled: bucket.length, held: bHeld.length });
    firstFollowUpShowRate.push({
      date,
      firstCallShowRate: round(sd(bFirstHeld.length, bFirst.length), 3),
      followUpShowRate: round(sd(bFUHeld.length, bFU.length), 3),
    });
    firstFollowUpHeldChart.push({
      date,
      firstHeld: bFirstHeld.length,
      followUpHeld: bFUHeld.length,
    });
    notTakenBreakdown.push({
      date,
      ghosted: bucket.filter(isGhost).length,
      canceled: bucket.filter(isCanceled).length,
      rescheduled: bucket.filter(isRescheduled).length,
    });
  }

  // Attendance pie
  const attendanceBreakdown = [
    { label: 'Show', value: held.length, color: 'green' },
    { label: 'Ghosted - No Show', value: ghosted.length, color: 'red' },
    { label: 'Canceled', value: canceled.length, color: 'blue' },
    { label: 'Rescheduled', value: rescheduled.length, color: 'amber' },
  ].filter(d => d.value > 0);

  // Not taken reason pie
  const notTakenReason = [
    { label: 'Ghosted', value: ghosted.length, color: 'amber' },
    { label: 'Canceled', value: canceled.length, color: 'red' },
    { label: 'Rescheduled', value: rescheduled.length, color: 'purple' },
  ].filter(d => d.value > 0);

  // Per-closer
  const closerBuckets = groupByCloser(calls);
  const showRatePerCloser = [];
  const attendancePerCloser = [];
  for (const [name, closerCalls] of closerBuckets) {
    const cHeld = closerCalls.filter(isShow);
    showRatePerCloser.push({
      date: name,
      showRate: round(sd(cHeld.length, closerCalls.length), 3),
    });
    attendancePerCloser.push({
      date: name,
      show: cHeld.length,
      noShow: closerCalls.length - cHeld.length,
    });
  }
  showRatePerCloser.sort((a, b) => b.showRate - a.showRate);
  attendancePerCloser.sort((a, b) => (b.show + b.noShow) - (a.show + a.noShow));

  return {
    sections,
    charts: {
      scheduledVsHeld: { data: scheduledVsHeld, series: [
        { key: 'scheduled', label: 'Scheduled', color: 'cyan' },
        { key: 'held', label: 'Held', color: 'green' },
      ]},
      firstFollowUpShowRate: { data: firstFollowUpShowRate, series: [
        { key: 'firstCallShowRate', label: 'First Call Show Rate', color: 'green' },
        { key: 'followUpShowRate', label: 'Follow-Up Show Rate', color: 'purple' },
      ]},
      attendanceBreakdown: { data: attendanceBreakdown },
      firstFollowUpsHeld: { data: firstFollowUpHeldChart, series: [
        { key: 'firstHeld', label: 'First Call Held', color: 'green' },
        { key: 'followUpHeld', label: 'Follow-Up Held', color: 'purple' },
      ]},
      showRatePerCloser: { data: showRatePerCloser, series: [
        { key: 'showRate', label: 'Show Rate', color: 'cyan' },
      ]},
      attendancePerCloser: { data: attendancePerCloser, series: [
        { key: 'show', label: 'Show', color: 'green' },
        { key: 'noShow', label: 'No Show', color: 'red' },
      ]},
      notTakenBreakdown: { data: notTakenBreakdown, series: [
        { key: 'ghosted', label: 'Ghosted', color: 'amber' },
        { key: 'canceled', label: 'Canceled', color: 'red' },
        { key: 'rescheduled', label: 'Rescheduled', color: 'purple' },
      ]},
      notTakenReason: { data: notTakenReason },
    },
  };
}


// ─────────────────────────────────────────────────────────────
// DEPOSIT LIFECYCLE — prospect-level tracking
// ─────────────────────────────────────────────────────────────

/**
 * Compute deposit lifecycle metrics by grouping calls by prospectEmail.
 * For each prospect with a Deposit call, check if they later had:
 *   - Closed - Won → deposit won
 *   - Lost → deposit lost
 *   - Neither → deposit still open
 *
 * Counts PROSPECTS, not calls: one prospect with 3 deposit calls + 1 close = 1 won.
 *
 * @param {Array} allCalls - All calls in the filtered dataset
 * @param {Array} depositCalls - Calls with callOutcome === 'Deposit' (pre-filtered)
 * @returns {object} Deposit section metrics
 */
function computeDepositLifecycle(allCalls, depositCalls) {
  // Group all calls by prospectEmail (skip empty emails)
  const byProspect = new Map();
  for (const call of allCalls) {
    if (!call.prospectEmail) continue;
    if (!byProspect.has(call.prospectEmail)) byProspect.set(call.prospectEmail, []);
    byProspect.get(call.prospectEmail).push(call);
  }

  // Sort each prospect's calls by date ascending (oldest first)
  for (const [, calls] of byProspect) {
    calls.sort((a, b) => (a.appointmentDate || '').localeCompare(b.appointmentDate || ''));
  }

  // Find prospects who have at least one Deposit call
  const depositProspects = new Set();
  for (const call of depositCalls) {
    if (call.prospectEmail) depositProspects.add(call.prospectEmail);
  }

  // Classify each deposit prospect
  let depositsWon = 0;
  let depositsLost = 0;
  let depositsStillOpen = 0;

  for (const email of depositProspects) {
    const prospectCalls = byProspect.get(email) || [];
    // Find the earliest deposit call date for this prospect
    const depositDate = prospectCalls
      .filter(c => c.callOutcome === OUTCOMES.DEPOSIT)
      .map(c => c.appointmentDate)
      .sort()[0];

    // Look at all calls on or after the deposit date
    const afterDeposit = prospectCalls.filter(c => c.appointmentDate >= depositDate);

    if (afterDeposit.some(c => c.callOutcome === OUTCOMES.CLOSED_WON)) {
      depositsWon++;
    } else if (afterDeposit.some(c => c.callOutcome === OUTCOMES.LOST)) {
      depositsLost++;
    } else {
      depositsStillOpen++;
    }
  }

  const depositProspectCount = depositsWon + depositsLost + depositsStillOpen;

  return {
    depositsTaken: m('Deposits Taken', depositCalls.length, 'number'),
    depositClosedPct: m('Deposit Closed %', round(sd(depositsWon, depositProspectCount), 3), 'percent'),
    depositsLost: m('Deposits Lost', depositsLost, 'number'),
    depositsStillOpen: m('Deposits Still Open', depositsStillOpen, 'number'),
    // Raw counts for pie chart use (not displayed as scorecards)
    _wonCount: depositsWon,
    _lostCount: depositsLost,
    _openCount: depositsStillOpen,
  };
}


// ─────────────────────────────────────────────────────────────
// CALL OUTCOMES PAGE
// ─────────────────────────────────────────────────────────────

function computeCallOutcomes(calls, granularity, prev) {
  // Activity metrics: only calls with appointments in range
  const apptCalls = calls.filter(c => c._inRangeByAppointment);
  const held = apptCalls.filter(isShow);
  const firstCalls = apptCalls.filter(isFirstCall);
  const followUps = apptCalls.filter(isFollowUp);
  const firstHeld = firstCalls.filter(isShow);
  const followUpHeld = followUps.filter(isShow);

  // Close/revenue metrics: calls that closed in the date range
  const closed = calls.filter(c => c._inRangeByClose && isShow(c) && isClosed(c));
  const deposits = calls.filter(c => c._inRangeByClose && isShow(c) && isDeposit(c));

  // Activity-based outcomes (derived from appointment range)
  const lost = held.filter(isLost);
  const dq = held.filter(isDQ);
  const notPitched = held.filter(isNotPitched);
  const followUpOutcome = held.filter(isFollowUpOutcome);

  // Close splits by call type — from close-range data
  const firstClosed = closed.filter(isFirstCall);
  const followUpClosed = closed.filter(isFollowUp);
  // Activity-based loss/DQ splits
  const firstLost = firstHeld.filter(isLost);
  const followUpLost = followUpHeld.filter(isLost);
  const firstDQ = firstHeld.filter(isDQ);

  // Compute deposit lifecycle first so we can use its close rate in the health section
  const depositLifecycle = computeDepositLifecycle(calls, deposits);

  const sections = {
    // Hero scorecard above Health at a Glance
    totalHeld: m('Total Calls Held', held.length, 'number', 'teal'),
    // Section 1: Health at a Glance — 6 HealthColumns
    health: {
      closes: {
        count: m('Total', closed.length, 'number'),
        pctOfTotal: m('% of Total', round(sd(closed.length, held.length), 3), 'percent'),
        // Close Rate removed — identical to % of Total for this column (closes / held)
      },
      deposits: {
        count: m('Total', deposits.length, 'number'),
        pctOfTotal: m('% of Total', round(sd(deposits.length, held.length), 3), 'percent'),
        // Close Rate = what % of deposit-takers eventually closed (from lifecycle tracking)
        closeRate: m('Close Rate', depositLifecycle.depositClosedPct.value, 'percent'),
      },
      followUps: {
        count: m('Total', followUpOutcome.length, 'number'),
        pctOfTotal: m('% of Total', round(sd(followUpOutcome.length, held.length), 3), 'percent'),
        closeRate: m('Close Rate', round(sd(followUpClosed.length, followUpHeld.length), 3), 'percent'),
      },
      lost: {
        count: m('Total', lost.length, 'number'),
        pctOfTotal: m('% of Total', round(sd(lost.length, held.length), 3), 'percent'),
      },
      disqualified: {
        count: m('Total', dq.length, 'number'),
        pctOfTotal: m('% of Total', round(sd(dq.length, held.length), 3), 'percent'),
      },
      notPitched: {
        count: m('Total', notPitched.length, 'number'),
        pctOfTotal: m('% of Total', round(sd(notPitched.length, held.length), 3), 'percent'),
      },
    },
    // Section 2: Closed - Won
    closedWon: {
      firstCallCloses: m('First Call Closes', firstClosed.length, 'number'),
      firstCallCloseRate: m('First Call Close Rate', round(sd(firstClosed.length, firstHeld.length), 3), 'percent'),
      followUpCloses: m('Follow-Up Closes', followUpClosed.length, 'number'),
      followUpCloseRate: m('Follow-Up Close Rate', round(sd(followUpClosed.length, followUpHeld.length), 3), 'percent'),
    },
    // Section 3: Deposits — lifecycle tracking by prospect_email
    deposits: depositLifecycle,
    // Section 4: Follow Up
    followUp: {
      scheduled: m('Follow-Ups Scheduled', followUps.length, 'number'),
      held: m('Follow-Ups Held', followUpHeld.length, 'number'),
      showRate: m('Follow-Up Show Rate', round(sd(followUpHeld.length, followUps.length), 3), 'percent'),
      stillInFollowUp: m('Still in Follow-Up', followUpOutcome.length, 'number'),
    },
    // Section 5: Lost
    lost: {
      firstCallLost: m('First Call Lost', firstLost.length, 'number'),
      firstCallLostRate: m('First Call Lost Rate', round(sd(firstLost.length, firstHeld.length), 3), 'percent'),
      followUpLost: m('Follow-Up Lost', followUpLost.length, 'number'),
      followUpLostRate: m('Follow-Up Lost Rate', round(sd(followUpLost.length, followUpHeld.length), 3), 'percent'),
    },
    // Section 6: Disqualified
    disqualified: {
      firstCallDQ: m('First Call DQ', firstDQ.length, 'number'),
      firstCallDQRate: m('DQ Rate', round(sd(firstDQ.length, firstHeld.length), 3), 'percent'),
    },
    // Section 7: Not Pitched
    notPitched: {
      notPitched: m('Not Pitched', notPitched.length, 'number'),
      notPitchedRate: m('Not Pitched Rate', round(sd(notPitched.length, held.length), 3), 'percent'),
    },
  };

  // Add period-over-period deltas
  if (prev && prev.calls.length > 0) {
    const dl = prev.deltaLabel;
    const pc = prev.calls;
    const pApptCalls = pc.filter(c => c._inRangeByAppointment);
    const pHeld = pApptCalls.filter(isShow);
    const pClosed = pc.filter(c => c._inRangeByClose && isShow(c) && isClosed(c));
    const pDeposits = pc.filter(c => c._inRangeByClose && isShow(c) && isDeposit(c));
    const pLost = pHeld.filter(isLost);

    // Compute previous period sub-groups
    const pFirstCalls = pApptCalls.filter(isFirstCall);
    const pFirstHeld = pFirstCalls.filter(isShow);
    const pFirstClosed = pClosed.filter(isFirstCall);
    const pFUAppt = pApptCalls.filter(isFollowUp);
    const pFUHeld = pFUAppt.filter(isShow);
    const pFUClosed = pClosed.filter(isFollowUp);
    const pFollowUpOutcome = pHeld.filter(isFollowUpOutcome);
    const pDQ = pHeld.filter(isDQ);
    const pNotPitched = pHeld.filter(isNotPitched);
    const pFirstLost = pFirstHeld.filter(isLost);
    const pFULost = pFUHeld.filter(isLost);

    // Hero scorecard
    sections.totalHeld = withDelta(sections.totalHeld, held.length, pHeld.length, dl, 'up');

    // Health section — counts
    sections.health.closes.count = withDelta(sections.health.closes.count, closed.length, pClosed.length, dl, 'up');
    sections.health.deposits.count = withDelta(sections.health.deposits.count, deposits.length, pDeposits.length, dl, 'up');
    sections.health.followUps.count = withDelta(sections.health.followUps.count, followUpOutcome.length, pFollowUpOutcome.length, dl, 'up');
    sections.health.lost.count = withDelta(sections.health.lost.count, lost.length, pLost.length, dl, 'down');
    sections.health.disqualified.count = withDelta(sections.health.disqualified.count, dq.length, pDQ.length, dl, 'down');
    sections.health.notPitched.count = withDelta(sections.health.notPitched.count, notPitched.length, pNotPitched.length, dl, 'down');

    // Health section — % of Total
    sections.health.closes.pctOfTotal = withDelta(sections.health.closes.pctOfTotal, sd(closed.length, held.length), sd(pClosed.length, pHeld.length), dl, 'up');
    sections.health.deposits.pctOfTotal = withDelta(sections.health.deposits.pctOfTotal, sd(deposits.length, held.length), sd(pDeposits.length, pHeld.length), dl, 'up');
    sections.health.followUps.pctOfTotal = withDelta(sections.health.followUps.pctOfTotal, sd(followUpOutcome.length, held.length), sd(pFollowUpOutcome.length, pHeld.length), dl, 'up');
    sections.health.lost.pctOfTotal = withDelta(sections.health.lost.pctOfTotal, sd(lost.length, held.length), sd(pLost.length, pHeld.length), dl, 'down');
    sections.health.disqualified.pctOfTotal = withDelta(sections.health.disqualified.pctOfTotal, sd(dq.length, held.length), sd(pDQ.length, pHeld.length), dl, 'down');
    sections.health.notPitched.pctOfTotal = withDelta(sections.health.notPitched.pctOfTotal, sd(notPitched.length, held.length), sd(pNotPitched.length, pHeld.length), dl, 'down');

    // Health section — close rates (follow-up)
    sections.health.followUps.closeRate = withDelta(sections.health.followUps.closeRate, sd(followUpClosed.length, followUpHeld.length), sd(pFUClosed.length, pFUHeld.length), dl, 'up');

    // Closed-Won section
    sections.closedWon.firstCallCloses = withDelta(sections.closedWon.firstCallCloses, firstClosed.length, pFirstClosed.length, dl, 'up');
    sections.closedWon.firstCallCloseRate = withDelta(sections.closedWon.firstCallCloseRate, sd(firstClosed.length, firstHeld.length), sd(pFirstClosed.length, pFirstHeld.length), dl, 'up');
    sections.closedWon.followUpCloses = withDelta(sections.closedWon.followUpCloses, followUpClosed.length, pFUClosed.length, dl, 'up');
    sections.closedWon.followUpCloseRate = withDelta(sections.closedWon.followUpCloseRate, sd(followUpClosed.length, followUpHeld.length), sd(pFUClosed.length, pFUHeld.length), dl, 'up');

    // Follow-Up section
    const pFU = pApptCalls.filter(isFollowUp);
    sections.followUp.scheduled = withDelta(sections.followUp.scheduled, followUps.length, pFU.length, dl, 'up');
    sections.followUp.held = withDelta(sections.followUp.held, followUpHeld.length, pFUHeld.length, dl, 'up');
    sections.followUp.showRate = withDelta(sections.followUp.showRate, sd(followUpHeld.length, followUps.length), sd(pFUHeld.length, pFU.length), dl, 'up');
    sections.followUp.stillInFollowUp = withDelta(sections.followUp.stillInFollowUp, followUpOutcome.length, pFollowUpOutcome.length, dl, 'down');

    // Lost section
    sections.lost.firstCallLost = withDelta(sections.lost.firstCallLost, firstLost.length, pFirstLost.length, dl, 'down');
    sections.lost.firstCallLostRate = withDelta(sections.lost.firstCallLostRate, sd(firstLost.length, firstHeld.length), sd(pFirstLost.length, pFirstHeld.length), dl, 'down');
    sections.lost.followUpLost = withDelta(sections.lost.followUpLost, followUpLost.length, pFULost.length, dl, 'down');
    sections.lost.followUpLostRate = withDelta(sections.lost.followUpLostRate, sd(followUpLost.length, followUpHeld.length), sd(pFULost.length, pFUHeld.length), dl, 'down');

    // Disqualified section
    const pFirstDQ = pFirstHeld.filter(isDQ);
    sections.disqualified.firstCallDQ = withDelta(sections.disqualified.firstCallDQ, firstDQ.length, pFirstDQ.length, dl, 'down');
    sections.disqualified.firstCallDQRate = withDelta(sections.disqualified.firstCallDQRate, sd(firstDQ.length, firstHeld.length), sd(pFirstDQ.length, pFirstHeld.length), dl, 'down');

    // Not Pitched section
    sections.notPitched.notPitched = withDelta(sections.notPitched.notPitched, notPitched.length, pNotPitched.length, dl, 'down');
    sections.notPitched.notPitchedRate = withDelta(sections.notPitched.notPitchedRate, sd(notPitched.length, held.length), sd(pNotPitched.length, pHeld.length), dl, 'down');

    // Deposit lifecycle deltas — compute previous period lifecycle for comparison
    const prevDepositLifecycle = computeDepositLifecycle(pc, pDeposits);
    sections.deposits.depositsTaken = withDelta(sections.deposits.depositsTaken, deposits.length, pDeposits.length, dl, 'up');
    sections.deposits.depositClosedPct = withDelta(sections.deposits.depositClosedPct, sections.deposits.depositClosedPct.value, prevDepositLifecycle.depositClosedPct.value, dl, 'up');
    sections.deposits.depositsLost = withDelta(sections.deposits.depositsLost, sections.deposits.depositsLost.value, prevDepositLifecycle.depositsLost.value, dl, 'down');
    sections.deposits.depositsStillOpen = withDelta(sections.deposits.depositsStillOpen, sections.deposits.depositsStillOpen.value, prevDepositLifecycle.depositsStillOpen.value, dl, 'down');

    // Health deposit close rate delta (same value as depositClosedPct)
    sections.health.deposits.closeRate = withDelta(sections.health.deposits.closeRate, depositLifecycle.depositClosedPct.value, prevDepositLifecycle.depositClosedPct.value, dl, 'up');
  }

  // Time-series — use _effectiveDate so closes/revenue bucket by close date
  const timeBuckets = groupByTime(calls, '_effectiveDate', granularity);
  const closesOverTime = [];
  const closeRateOverTime = [];
  const outcomesOverTime = [];
  const lostOverTime = [];
  const dqOverTime = [];
  const notPitchedOverTime = [];
  const followUpVolume = [];

  for (const [date, bucket] of timeBuckets) {
    const bHeld = bucket.filter(isShow);
    const bClosed = bHeld.filter(isClosed);
    const bFirstHeld = bucket.filter(c => isFirstCall(c) && isShow(c));
    const bFirstClosed = bFirstHeld.filter(isClosed);
    const bFUHeld = bucket.filter(c => isFollowUp(c) && isShow(c));

    closesOverTime.push({
      date,
      firstCall: bFirstClosed.length,
      followUp: bFUHeld.filter(isClosed).length,
    });
    closeRateOverTime.push({
      date,
      totalCloseRate: round(sd(bClosed.length, bHeld.length), 3),
      firstCloseRate: round(sd(bFirstClosed.length, bFirstHeld.length), 3),
    });
    outcomesOverTime.push({
      date,
      closed: bClosed.length,
      deposit: bHeld.filter(isDeposit).length,
      followUp: bHeld.filter(isFollowUpOutcome).length,
      lost: bHeld.filter(isLost).length,
    });
    lostOverTime.push({
      date,
      firstCall: bFirstHeld.filter(isLost).length,
      followUp: bFUHeld.filter(isLost).length,
    });
    dqOverTime.push({ date, dq: bHeld.filter(isDQ).length });
    notPitchedOverTime.push({ date, notPitched: bHeld.filter(isNotPitched).length });
    followUpVolume.push({
      date,
      scheduled: bucket.filter(isFollowUp).length,
      held: bFUHeld.length,
    });
  }

  // Per-closer charts — activity metrics from held (appointment range), closes from close range
  const closerHeldBuckets = groupByCloser(held);
  const closerClosedBuckets = groupByCloser([...closed, ...deposits]);
  const outcomeByCloser = [];
  const closesByCloser = [];
  const lostRateByCloser = [];
  const dqByCloser = [];
  const notPitchedByCloser = [];

  const allCloserNamesForOutcomes = new Set([...closerHeldBuckets.keys(), ...closerClosedBuckets.keys()]);
  for (const name of allCloserNamesForOutcomes) {
    const heldCalls = closerHeldBuckets.get(name) || [];
    const closedCalls = closerClosedBuckets.get(name) || [];
    const closerClosed = closedCalls.filter(isClosed);
    const closerDeposits = closedCalls.filter(isDeposit);
    outcomeByCloser.push({
      date: name,
      closed: closerClosed.length,
      deposit: closerDeposits.length,
      followUp: heldCalls.filter(isFollowUpOutcome).length,
      lost: heldCalls.filter(isLost).length,
      disqualified: heldCalls.filter(isDQ).length,
      notPitched: heldCalls.filter(isNotPitched).length,
    });
    closesByCloser.push({
      date: name,
      firstCall: closerClosed.filter(isFirstCall).length,
      followUp: closerClosed.filter(isFollowUp).length,
    });
    lostRateByCloser.push({
      date: name, lostRate: round(sd(heldCalls.filter(isLost).length, heldCalls.length), 3),
    });
    dqByCloser.push({
      date: name, dqRate: round(sd(heldCalls.filter(isDQ).length, heldCalls.length), 3),
    });
    notPitchedByCloser.push({
      date: name, notPitchedRate: round(sd(heldCalls.filter(isNotPitched).length, heldCalls.length), 3),
    });
  }

  // Closes by product (stacked bar: per closer, broken down by product)
  const productNames = new Set();
  const closedWithProduct = [...closed, ...deposits].filter(c => c.productPurchased);
  for (const c of closedWithProduct) productNames.add(c.productPurchased);
  const productList = [...productNames].sort();

  const closesByProductData = [];
  if (productList.length > 0) {
    for (const name of allCloserNamesForOutcomes) {
      const closedCalls = closerClosedBuckets.get(name) || [];
      const row = { date: name };
      for (const p of productList) {
        row[p] = closedCalls.filter(c => c.productPurchased === p).length;
      }
      closesByProductData.push(row);
    }
  }

  const colors = ['green', 'cyan', 'amber', 'purple', 'red', 'blue', 'teal', 'muted'];
  const closesByProductSeries = productList.map((p, i) => ({
    key: p,
    label: p,
    color: colors[i % colors.length],
  }));

  // Lost reasons pie — assign visually distinct colors from the neon palette
  const lostReasons = {};
  for (const c of lost) {
    const reason = c.lostReason || 'Unknown';
    lostReasons[reason] = (lostReasons[reason] || 0) + 1;
  }
  const lostReasonsPie = Object.entries(lostReasons)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: PIE_COLORS[i % PIE_COLORS.length] }));

  // Outcome breakdown pie — driven by OUTCOME_CHART_CONFIG
  const coOutcomeCounts = {
    closed: closed.length,
    deposit: deposits.length,
    followUp: followUpOutcome.length,
    lost: lost.length,
    disqualified: dq.length,
    notPitched: notPitched.length,
    refunded: held.filter(isRefunded).length,
  };
  const outcomeBreakdown = OUTCOME_CHART_CONFIG
    .map(cfg => ({ label: cfg.label, value: coOutcomeCounts[cfg.key], color: cfg.color }))
    .filter(d => d.value > 0);

  // Follow-up outcomes pie
  const followUpOutcomes = [
    { label: 'Closed', value: followUpClosed.length, color: 'green' },
    { label: 'Still Open', value: followUpOutcome.length, color: 'purple' },
    { label: 'Lost', value: followUpLost.length, color: 'red' },
  ].filter(d => d.value > 0);

  // Deposit outcomes pie — lifecycle: Won / Lost / Still Open
  // Reuse the already-computed deposit lifecycle from sections.deposits
  const depositOutcomesData = [
    { label: 'Won', value: sections.deposits._wonCount, color: 'green' },
    { label: 'Lost', value: sections.deposits._lostCount, color: 'red' },
    { label: 'Still Open', value: sections.deposits._openCount, color: 'amber' },
  ].filter(d => d.value > 0);

  // Deposit rate by closer (bar chart) — deposits from close range, denominator from held
  const depositByCloserData = [];
  for (const name of allCloserNamesForOutcomes) {
    const closedCalls = closerClosedBuckets.get(name) || [];
    const heldCalls = closerHeldBuckets.get(name) || [];
    const depCount = closedCalls.filter(isDeposit).length;
    if (depCount > 0 || heldCalls.length > 0) {
      depositByCloserData.push({
        date: name,
        deposits: depCount,
        depositRate: round(sd(depCount, heldCalls.length), 3),
      });
    }
  }

  // Follow-up outcome by closer (stacked bar) — closes from close range, activity from held
  const followUpOutcomeByCloserData = [];
  for (const name of allCloserNamesForOutcomes) {
    const closedCalls = closerClosedBuckets.get(name) || [];
    const heldCalls = closerHeldBuckets.get(name) || [];
    followUpOutcomeByCloserData.push({
      date: name,
      closed: closedCalls.filter(c => isFollowUp(c) && isClosed(c)).length,
      followUp: heldCalls.filter(isFollowUpOutcome).length,
      lost: heldCalls.filter(c => isFollowUp(c) && isLost(c)).length,
    });
  }

  // Lost reasons by closer (stacked bar) — activity-based (lost is from appointment range)
  const allLostReasonKeys = [...new Set(lost.map(c => c.lostReason || 'Unknown'))].sort();
  const lostReasonsByCloserData = [];
  for (const name of allCloserNamesForOutcomes) {
    const heldCalls = closerHeldBuckets.get(name) || [];
    const row = { date: name };
    const closerLost = heldCalls.filter(isLost);
    for (const reason of allLostReasonKeys) {
      row[reason] = closerLost.filter(c => (c.lostReason || 'Unknown') === reason).length;
    }
    lostReasonsByCloserData.push(row);
  }
  const lostReasonColors = ['red', 'amber', 'purple', 'blue', 'muted', 'cyan', 'green', 'teal'];
  const lostReasonsByCloserSeries = allLostReasonKeys.map((r, i) => ({
    key: r, label: r, color: lostReasonColors[i % lostReasonColors.length],
  }));

  // Sort horizontal bar chart data: highest value at top (descending)
  // For stacked bars, sort by sum of all numeric keys (excluding 'date'/'label')
  const sortDesc = (arr, keys) => [...arr].sort((a, b) => {
    const totalA = keys.reduce((s, k) => s + (a[k] || 0), 0);
    const totalB = keys.reduce((s, k) => s + (b[k] || 0), 0);
    return totalB - totalA;
  });
  // Lost Rate: highest % at BOTTOM (ascending = worst performer last)
  const sortAsc = (arr, key) => [...arr].sort((a, b) => (a[key] || 0) - (b[key] || 0));

  return {
    sections,
    charts: {
      outcomeBreakdown: { data: outcomeBreakdown },
      outcomeByCloser: { data: sortDesc(outcomeByCloser, OUTCOME_CHART_CONFIG.map(c => c.key)), series:
        OUTCOME_CHART_CONFIG.map(c => ({ key: c.key, label: c.label, color: c.color })),
      },
      outcomesOverTime: { data: outcomesOverTime, series:
        OUTCOME_CHART_CONFIG.filter(c => c.key !== 'disqualified' && c.key !== 'notPitched')
          .map(c => ({ key: c.key, label: c.label, color: c.color })),
      },
      closesByProduct: { data: sortDesc(closesByProductData, productList), series: closesByProductSeries },
      closesOverTime: { data: closesOverTime, series: [
        { key: 'firstCall', label: 'First Call', color: 'green' },
        { key: 'followUp', label: 'Follow-Up', color: 'purple' },
      ]},
      closeRateOverTime: { data: closeRateOverTime, series: [
        { key: 'totalCloseRate', label: 'Total Close Rate', color: 'green' },
        { key: 'firstCloseRate', label: 'First Call Close Rate', color: 'cyan' },
      ]},
      closesByCloser: { data: sortDesc(closesByCloser, ['firstCall', 'followUp']), series: [
        { key: 'firstCall', label: 'First Call', color: 'green' },
        { key: 'followUp', label: 'Follow-Up', color: 'purple' },
      ]},
      depositOutcomes: { data: depositOutcomesData },
      depositCloseByCloser: { data: sortDesc(depositByCloserData, ['depositRate']), series: [
        { key: 'depositRate', label: 'Deposit Rate', color: 'amber' },
      ]},
      followUpVolume: { data: followUpVolume, series: [
        { key: 'scheduled', label: 'Scheduled', color: 'cyan' },
        { key: 'held', label: 'Held', color: 'purple' },
      ]},
      followUpOutcomes: { data: followUpOutcomes },
      followUpOutcomeByCloser: { data: sortDesc(followUpOutcomeByCloserData, ['closed', 'followUp', 'lost']), series: [
        { key: 'closed', label: 'Closed', color: 'green' },
        { key: 'followUp', label: 'Follow-Up', color: 'purple' },
        { key: 'lost', label: 'Lost', color: 'red' },
      ]},
      lostOverTime: { data: lostOverTime, series: [
        { key: 'firstCall', label: 'First Call', color: 'red' },
        { key: 'followUp', label: 'Follow-Up', color: 'amber' },
      ]},
      lostReasons: { data: lostReasonsPie },
      lostRateByCloser: { data: sortAsc(lostRateByCloser, 'lostRate'), series: [
        { key: 'lostRate', label: 'Lost Rate', color: 'red' },
      ]},
      lostReasonsByCloser: { data: sortDesc(lostReasonsByCloserData, allLostReasonKeys), series: lostReasonsByCloserSeries },
      dqOverTime: { data: dqOverTime, series: [
        { key: 'dq', label: 'Disqualified', color: 'muted' },
      ]},
      dqByCloser: { data: sortDesc(dqByCloser, ['dqRate']), series: [
        { key: 'dqRate', label: 'DQ Rate', color: 'muted' },
      ]},
      notPitchedOverTime: { data: notPitchedOverTime, series: [
        { key: 'notPitched', label: 'Not Pitched', color: 'blue' },
      ]},
      notPitchedByCloser: { data: sortDesc(notPitchedByCloser, ['notPitchedRate']), series: [
        { key: 'notPitchedRate', label: 'Not Pitched Rate', color: 'blue' },
      ]},
    },
  };
}


// ─────────────────────────────────────────────────────────────
// SALES CYCLE PAGE
// ─────────────────────────────────────────────────────────────

function computeSalesCycle(calls, closeCycles, prev) {
  const callsToClose = closeCycles.map(c => c.callsToClose).filter(v => v > 0);
  const daysToClose = closeCycles.map(c => c.daysToClose).filter(v => v >= 0);

  const oneCall = callsToClose.filter(v => v === 1).length;
  const twoCall = callsToClose.filter(v => v === 2).length;
  const threePlus = callsToClose.filter(v => v >= 3).length;
  const total = callsToClose.length;

  // Calls needed per deal: total held calls / closed deals
  const held = calls.filter(isShow);
  const closed = held.filter(isClosed);

  const sections = {
    // Section 1 (Overview) + Section 2 (Key Metrics): callsToClose
    callsToClose: {
      oneCallCloses: m('1-Call Closes', oneCall, 'number', 'green'),
      twoCallCloses: m('2-Call Closes', twoCall, 'number', 'blue'),
      threeCallCloses: m('3+ Call Closes', threePlus, 'number', 'amber'),
      oneCallClosePct: m('1-Call Close %', round(sd(oneCall, total), 3), 'percent', 'green'),
      twoCallClosePct: m('2-Call Close %', round(sd(twoCall, total), 3), 'percent', 'blue'),
      threeCallClosePct: m('3+ Call Close %', round(sd(threePlus, total), 3), 'percent', 'amber'),
      avgCallsToClose: m('Avg Calls to Close', round(avg(closeCycles, 'callsToClose'), 1), 'decimal', 'cyan'),
      medianCallsToClose: m('Median Calls to Close', median(callsToClose), 'decimal', 'cyan'),
      callsNeededPerDeal: m('Calls Scheduled per Close', round(sd(calls.length, closed.length), 1), 'decimal', 'green'),
    },
    // Section 2 (Key Metrics): daysToClose
    daysToClose: {
      avgDaysToClose: m('Avg Days to Close', round(avg(closeCycles, 'daysToClose'), 1), 'decimal', 'purple'),
      medianDaysToClose: m('Median Days to Close', median(daysToClose), 'decimal', 'purple'),
    },
  };

  // Add period-over-period deltas
  if (prev && prev.closeCycles.length > 0) {
    const dl = prev.deltaLabel;
    const pCycles = prev.closeCycles;
    const pCallsToClose = pCycles.map(c => c.callsToClose).filter(v => v > 0);
    const pDaysToClose = pCycles.map(c => c.daysToClose).filter(v => v >= 0);
    const pOneCall = pCallsToClose.filter(v => v === 1).length;
    const pTwoCall = pCallsToClose.filter(v => v === 2).length;
    const pThreePlus = pCallsToClose.filter(v => v >= 3).length;
    const pTotal = pCallsToClose.length;

    // Calls to close counts
    sections.callsToClose.oneCallCloses = withDelta(sections.callsToClose.oneCallCloses, oneCall, pOneCall, dl, 'up');
    sections.callsToClose.twoCallCloses = withDelta(sections.callsToClose.twoCallCloses, twoCall, pTwoCall, dl, 'up');
    sections.callsToClose.threeCallCloses = withDelta(sections.callsToClose.threeCallCloses, threePlus, pThreePlus, dl, 'up');
    sections.callsToClose.oneCallClosePct = withDelta(sections.callsToClose.oneCallClosePct, sd(oneCall, total), sd(pOneCall, pTotal), dl, 'up');
    sections.callsToClose.twoCallClosePct = withDelta(sections.callsToClose.twoCallClosePct, sd(twoCall, total), sd(pTwoCall, pTotal), dl, 'up');
    sections.callsToClose.threeCallClosePct = withDelta(sections.callsToClose.threeCallClosePct, sd(threePlus, total), sd(pThreePlus, pTotal), dl, 'down');

    // Averages and medians — lower is better
    sections.callsToClose.avgCallsToClose = withDelta(sections.callsToClose.avgCallsToClose, avg(closeCycles, 'callsToClose'), avg(pCycles, 'callsToClose'), dl, 'down');
    sections.callsToClose.medianCallsToClose = withDelta(sections.callsToClose.medianCallsToClose, median(callsToClose), median(pCallsToClose), dl, 'down');
    sections.callsToClose.callsNeededPerDeal = withDelta(sections.callsToClose.callsNeededPerDeal, sd(calls.length, closed.length), sd(prev.calls.length, prev.calls.filter(isShow).filter(isClosed).length), dl, 'down');
    sections.daysToClose.avgDaysToClose = withDelta(sections.daysToClose.avgDaysToClose, avg(closeCycles, 'daysToClose'), avg(pCycles, 'daysToClose'), dl, 'down');
    sections.daysToClose.medianDaysToClose = withDelta(sections.daysToClose.medianDaysToClose, median(daysToClose), median(pDaysToClose), dl, 'down');
  }

  // Calls-to-close distribution — driven by CALLS_TO_CLOSE_BUCKETS
  const callsBucketCounts = { oneCall, twoCall, threePlus };
  const callsBucketKeys = ['oneCall', 'twoCalls', 'threePlus']; // match data keys
  const callsDistribution = CALLS_TO_CLOSE_CHART_CONFIG
    .map((cfg, i) => ({ label: cfg.label, value: [oneCall, twoCall, threePlus][i], color: cfg.color }))
    .filter(d => d.value > 0);

  // Days-to-close distribution — driven by DAYS_TO_CLOSE_BUCKETS
  const daysDistribution = DAYS_TO_CLOSE_BUCKETS.map(bucket => ({
    label: bucket.label,
    value: daysToClose.filter(d => d >= bucket.min && (bucket.max === Infinity ? true : d <= bucket.max)).length,
    color: bucket.color,
  })).filter(d => d.value > 0);

  // Per-closer
  const closerMap = new Map();
  for (const c of closeCycles) {
    const name = c.closerName || c.closerId || 'Unknown';
    if (!closerMap.has(name)) closerMap.set(name, []);
    closerMap.get(name).push(c);
  }

  const callsToCloseByCloser = [];
  const daysToCloseByCloser = [];
  for (const [name, cycles] of closerMap) {
    const ctc = cycles.map(c => c.callsToClose);
    const dtc = cycles.map(c => c.daysToClose);
    callsToCloseByCloser.push({
      date: name,
      oneCall: ctc.filter(v => v === 1).length,
      twoCalls: ctc.filter(v => v === 2).length,
      threePlus: ctc.filter(v => v >= 3).length,
    });
    daysToCloseByCloser.push({
      date: name,
      sameDay: dtc.filter(d => d === 0).length,
      oneToThree: dtc.filter(d => d >= 1 && d <= 3).length,
      fourToSeven: dtc.filter(d => d >= 4 && d <= 7).length,
      eightPlus: dtc.filter(d => d >= 8).length,
    });
  }

  // Sort per-closer charts by total count descending (most at top)
  callsToCloseByCloser.sort((a, b) => (b.oneCall + b.twoCalls + b.threePlus) - (a.oneCall + a.twoCalls + a.threePlus));
  daysToCloseByCloser.sort((a, b) => (b.sameDay + b.oneToThree + b.fourToSeven + b.eightPlus) - (a.sameDay + a.oneToThree + a.fourToSeven + a.eightPlus));

  return {
    sections,
    charts: {
      salesCyclePie: { data: callsDistribution },
      callsToCloseBar: { data: callsDistribution.map(d => ({ date: d.label, count: d.value })), series: [
        { key: 'count', label: 'Closes', color: 'cyan' },
      ]},
      daysToClosePie: { data: daysDistribution },
      daysToCloseBar: { data: daysDistribution.map(d => ({ date: d.label, count: d.value })), series: [
        { key: 'count', label: 'Closes', color: 'amber' },
      ]},
      callsToCloseByCloser: { data: callsToCloseByCloser, series: [
        { key: 'oneCall', label: '1 Call', color: 'green' },
        { key: 'twoCalls', label: '2 Calls', color: 'cyan' },
        { key: 'threePlus', label: '3+', color: 'amber' },
      ]},
      daysToCloseByCloser: { data: daysToCloseByCloser, series: [
        { key: 'sameDay', label: 'Same Day', color: 'green' },
        { key: 'oneToThree', label: '1-3', color: 'cyan' },
        { key: 'fourToSeven', label: '4-7', color: 'amber' },
        { key: 'eightPlus', label: '8+', color: 'red' },
      ]},
    },
  };
}


// ─────────────────────────────────────────────────────────────
// OBJECTIONS PAGE
// ─────────────────────────────────────────────────────────────

function computeObjections(calls, objections, granularity, prev) {
  const held = calls.filter(isShow);
  const callsWithObj = new Set(objections.map(o => o.callId));
  const resolvedObj = objections.filter(o => o.resolved);

  // Calls that had objections and closed
  const closedWithObj = held.filter(c => isClosed(c) && callsWithObj.has(c.callId));
  const lostWithObj = held.filter(c => isLost(c) && callsWithObj.has(c.callId));
  const closedNoObj = held.filter(c => isClosed(c) && !callsWithObj.has(c.callId));

  const sections = {
    summary: {
      callsHeld: m('Calls Held', held.length, 'number', 'cyan'),
      objectionsFaced: m('Objections Faced', objections.length, 'number', 'amber'),
      pctCallsWithObj: m('% Calls w/ Objections', round(sd(callsWithObj.size, held.length), 3), 'percent', 'amber'),
      avgObjPerCall: m('Avg Obj / Flagged Call', callsWithObj.size > 0 ? round(sd(objections.length, callsWithObj.size), 1) : 0, 'decimal', 'amber'),
      resolvedCount: m('Resolved', resolvedObj.length, 'number', 'green'),
      resolutionRate: m('Resolution Rate', round(sd(resolvedObj.length, objections.length), 3), 'percent', 'green'),
      objectionlessCloses: m('Objectionless Closes', closedNoObj.length, 'number', 'green'),
      closedWithObj: m('Closed w/ Objections', closedWithObj.length, 'number', 'cyan'),
      lostToObj: m('Lost to Objections', lostWithObj.length, 'number', 'red'),
    },
  };

  // Add period-over-period deltas
  if (prev && prev.calls.length > 0 && prev.objections.length > 0) {
    const dl = prev.deltaLabel;
    const pObj = prev.objections;
    const pHeld = prev.calls.filter(isShow);
    const pCallsWithObj = new Set(pObj.map(o => o.callId));
    const pResolved = pObj.filter(o => o.resolved);
    const pLostWithObj = pHeld.filter(c => isLost(c) && pCallsWithObj.has(c.callId));

    const s = sections.summary;
    s.objectionsFaced = withDelta(s.objectionsFaced, objections.length, pObj.length, dl, 'down');
    s.resolutionRate = withDelta(s.resolutionRate, sd(resolvedObj.length, objections.length), sd(pResolved.length, pObj.length), dl, 'up');
    s.pctCallsWithObj = withDelta(s.pctCallsWithObj, sd(callsWithObj.size, held.length), sd(pCallsWithObj.size, pHeld.length), dl, 'down');
    s.lostToObj = withDelta(s.lostToObj, lostWithObj.length, pLostWithObj.length, dl, 'down');
  }

  // By type
  const byType = {};
  for (const o of objections) {
    const type = o.objectionType || 'Other';
    if (!byType[type]) byType[type] = { total: 0, resolved: 0 };
    byType[type].total++;
    if (o.resolved) byType[type].resolved++;
  }

  const objectionsByType = Object.entries(byType).map(([type, d]) => ({
    date: type,
    resolved: d.resolved,
    unresolved: d.total - d.resolved,
  })).sort((a, b) => (b.resolved + b.unresolved) - (a.resolved + a.unresolved));

  const unresolvedRaw = Object.entries(byType)
    .map(([label, d]) => ({ label, value: d.total - d.resolved }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value);
  const unresolvedTotal = unresolvedRaw.reduce((s, d) => s + d.value, 0);
  const unresolvedByType = [];
  let otherBucket = 0;
  for (const d of unresolvedRaw) {
    if (d.value / unresolvedTotal < 0.05) {
      otherBucket += d.value;
    } else {
      unresolvedByType.push(d);
    }
  }
  if (otherBucket > 0) unresolvedByType.push({ label: 'Other', value: otherBucket });
  // Assign explicit colors so we use neon palette, not the chart[] fallback
  unresolvedByType.forEach((d, i) => { d.color = PIE_COLORS[i % PIE_COLORS.length]; });

  // By type table
  const byTypeTable = Object.entries(byType).map(([type, d]) => ({
    type,
    total: d.total,
    resolved: d.resolved,
    resRate: round(sd(d.resolved, d.total), 3),
  })).sort((a, b) => b.total - a.total);

  // Time-series — top objection types over time (ranked by total count)
  const objTimeBuckets = groupByTime(objections, 'appointmentDate', granularity);
  const topTypes = Object.entries(byType)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 3)
    .map(([type]) => type);
  const objectionTrends = [];
  for (const [date, bucket] of objTimeBuckets) {
    const point = { date };
    for (const type of topTypes) {
      const key = type.replace(/[^a-zA-Z]/g, '').toLowerCase();
      point[key] = bucket.filter(o => o.objectionType === type).length;
    }
    objectionTrends.push(point);
  }
  const trendSeries = topTypes.map((type, i) => ({
    key: type.replace(/[^a-zA-Z]/g, '').toLowerCase(),
    label: type,
    color: ['cyan', 'purple', 'amber'][i],
  }));

  // Per-closer resolution rate
  const closerObjMap = new Map();
  for (const o of objections) {
    const name = o.closerName || o.closerId || 'Unknown';
    if (!closerObjMap.has(name)) closerObjMap.set(name, { total: 0, resolved: 0 });
    const cd = closerObjMap.get(name);
    cd.total++;
    if (o.resolved) cd.resolved++;
  }
  const resolutionByCloser = [...closerObjMap.entries()].map(([name, d]) => ({
    date: name,
    rate: round(sd(d.resolved, d.total), 3),
  })).sort((a, b) => b.rate - a.rate);

  // By closer table
  const byCloserTable = [...closerObjMap.entries()].map(([name, d]) => ({
    closer: name,
    total: d.total,
    resolved: d.resolved,
    resRate: round(sd(d.resolved, d.total), 3),
  })).sort((a, b) => b.total - a.total);

  // Detail table — individual objections for drill-down
  // Build callId → recordingUrl lookup from calls data
  const callRecordingMap = {};
  for (const c of calls) {
    if (c.callId && c.recordingUrl) callRecordingMap[c.callId] = c.recordingUrl;
  }

  const detailRows = objections.map(o => ({
    objectionType: o.objectionType || 'Other',
    resolved: !!o.resolved,
    closer: o.closerName || o.closerId || 'Unknown',
    closerId: o.closerId || '',
    callOutcome: o.callOutcome || '',
    appointmentDate: o.appointmentDate || '',
    recordingUrl: callRecordingMap[o.callId] || '',
  }));

  return {
    sections,
    charts: {
      objectionsByType: { data: objectionsByType, series: [
        { key: 'resolved', label: 'Resolved', color: 'green' },
        { key: 'unresolved', label: 'Unresolved', color: 'red' },
      ]},
      objectionTrends: { data: objectionTrends, series: trendSeries },
      unresolvedByType: { data: unresolvedByType },
      resolutionByCloser: { data: resolutionByCloser, series: [
        { key: 'rate', label: 'Resolution Rate', color: 'green' },
      ]},
    },
    tables: {
      byType: { rows: byTypeTable },
      byCloser: { rows: byCloserTable },
      detail: { rows: detailRows },
    },
  };
}


// ─────────────────────────────────────────────────────────────
// PROJECTIONS PAGE
// ─────────────────────────────────────────────────────────────

function computeProjections(calls, closeCycles, rawData, filters) {
  const { dateStart, dateEnd } = filters;
  const held = calls.filter(isShow);
  const closed = held.filter(isClosed);
  const revenueDeals = held.filter(hasRevenue);

  const totalRevenue = sum(revenueDeals, 'revenueGenerated');
  const totalCash = sum(revenueDeals, 'cashCollected');

  // Calculate days in period
  const start = new Date(dateStart);
  const end = new Date(dateEnd);
  const daysInPeriod = Math.max(1, Math.round((end - start) / 86400000) + 1);

  // Rates
  const showRate = round(sd(held.length, calls.length), 4);
  const closeRate = round(sd(closed.length, held.length), 4);
  const avgDealSize = round(sd(totalRevenue, closed.length));
  const avgCashCollected = round(sd(totalCash, closed.length));
  const prospectsBookedPerMonth = round(calls.filter(isFirstCall).length / (daysInPeriod / 30), 1);

  // Avg calls to close from close cycles
  const avgCallsToClose = closeCycles.length > 0
    ? round(avg(closeCycles, 'callsToClose'), 1)
    : 0;

  // Calendar context
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((now - startOfYear) / 86400000) + 1;
  const daysInYear = (now.getFullYear() % 4 === 0) ? 366 : 365;

  // Quarter context — Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec
  const currentMonth = now.getMonth(); // 0-11
  const quarterStartMonth = Math.floor(currentMonth / 3) * 3; // 0, 3, 6, or 9
  const quarterStart = new Date(now.getFullYear(), quarterStartMonth, 1);
  const quarterEnd = new Date(now.getFullYear(), quarterStartMonth + 3, 0); // last day of quarter
  const dayOfQuarter = Math.floor((now - quarterStart) / 86400000) + 1;
  const daysInQuarter = Math.floor((quarterEnd - quarterStart) / 86400000) + 1;

  // MTD — filter all raw calls for current month
  const mtdStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const mtdEnd = now.toISOString().split('T')[0];
  const mtdCalls = filterCalls(rawData.calls, mtdStart, mtdEnd, null);
  const mtdHeld = mtdCalls.filter(isShow);
  const mtdClosed = mtdHeld.filter(isClosed);
  const mtdRevDeals = mtdHeld.filter(hasRevenue);

  // YTD
  const ytdStart = `${now.getFullYear()}-01-01`;
  const ytdCalls = filterCalls(rawData.calls, ytdStart, mtdEnd, null);
  const ytdHeld = ytdCalls.filter(isShow);
  const ytdClosed = ytdHeld.filter(isClosed);
  const ytdRevDeals = ytdHeld.filter(hasRevenue);

  // WTD — week-to-date (Monday to today)
  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ...
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const wtdStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  const wtdCalls = filterCalls(rawData.calls, wtdStart, mtdEnd, null);
  const wtdHeld = wtdCalls.filter(isShow);
  const wtdRevDeals = wtdHeld.filter(hasRevenue);

  // QTD — quarter-to-date
  const qtdStart = `${now.getFullYear()}-${String(quarterStartMonth + 1).padStart(2, '0')}-01`;
  const qtdCalls = filterCalls(rawData.calls, qtdStart, mtdEnd, null);
  const qtdHeld = qtdCalls.filter(isShow);
  const qtdRevDeals = qtdHeld.filter(hasRevenue);

  // Goals from Clients table
  const clientData = rawData.client || {};
  const monthlyGoal = clientData.monthlyGoal || 0;
  const quarterlyGoal = clientData.quarterlyGoal || 0;
  const yearlyGoal = clientData.yearlyGoal || 0;

  const projectionBaseline = {
    showRate,
    closeRate,
    avgDealSize,
    avgCashCollected,
    prospectsBookedPerMonth,
    avgCallsToClose,
    callsScheduled: calls.length,
    currentCallsHeld: held.length,
    currentCloses: closed.length,
    currentRevenue: totalRevenue,
    currentCash: totalCash,
    daysInPeriod,
    daysInCurrentMonth,
    dayOfMonth,
    daysInYear,
    dayOfYear,
    mtdCallsScheduled: mtdCalls.length,
    mtdCallsHeld: mtdHeld.length,
    mtdCloses: mtdClosed.length,
    mtdRevenue: sum(mtdRevDeals, 'revenueGenerated'),
    mtdCash: sum(mtdRevDeals, 'cashCollected'),
    ytdCallsScheduled: ytdCalls.length,
    ytdCallsHeld: ytdHeld.length,
    ytdCloses: ytdClosed.length,
    ytdRevenue: sum(ytdRevDeals, 'revenueGenerated'),
    ytdCash: sum(ytdRevDeals, 'cashCollected'),
    wtdRevenue: sum(wtdRevDeals, 'revenueGenerated'),
    wtdCash: sum(wtdRevDeals, 'cashCollected'),
    qtdRevenue: sum(qtdRevDeals, 'revenueGenerated'),
    qtdCash: sum(qtdRevDeals, 'cashCollected'),
    dayOfQuarter,
    daysInQuarter,
    monthlyGoal,
    quarterlyGoal,
    yearlyGoal,
    dateRange: `${dateStart} – ${dateEnd}`,
  };

  return {
    sections: {
      baseline: {
        showRate: m('Show Rate', showRate, 'percent', 'green'),
        closeRate: m('Close Rate', closeRate, 'percent', 'cyan'),
        avgDealSize: m('Avg Deal Size', avgDealSize, 'currency', 'amber'),
        avgCashCollected: m('Avg Cash Collected', avgCashCollected, 'currency', 'teal'),
        prospectsPerMonth: m('Prospects / Month', Math.round(prospectsBookedPerMonth), 'number', 'purple'),
        avgCallsToClose: m('Avg Calls to Close', avgCallsToClose, 'decimal', 'cyan'),
      },
    },
    charts: {},
    projectionBaseline,
  };
}


// ─────────────────────────────────────────────────────────────
// VIOLATIONS PAGE
// ─────────────────────────────────────────────────────────────

function computeViolations(calls, granularity, prev, riskCategoryFilter) {
  const held = calls.filter(isShow);

  // Parse riskCategory filter into an array for matching
  const rcFilterList = riskCategoryFilter
    ? (typeof riskCategoryFilter === 'string' ? riskCategoryFilter.split(',').map(s => s.trim().toLowerCase()) : riskCategoryFilter.map(s => s.toLowerCase()))
    : [];

  // Parse key_moments for risk flags
  // key_moments is a JSON string or plain text from AI
  const allRiskFlags = [];
  // Risk categories from shared config (single source of truth)
  const riskCategories = RISK_CATEGORIES;

  for (const c of held) {
    // Prefer structured complianceFlags from AI pipeline; fall back to keyMoments parsing
    // complianceFlags is an object: { flags: [...], categories_found, has_ftc_warning, total_flags }
    const cf = c.complianceFlags;
    const cfFlags = cf && Array.isArray(cf.flags) ? cf.flags : (Array.isArray(cf) ? cf : null);
    if (cfFlags && cfFlags.length > 0) {
      for (const flag of cfFlags) {
        const category = flag.category;
        if (category && riskCategories.some(rc => category.toLowerCase().includes(rc.toLowerCase()))) {
          allRiskFlags.push({
            date: c.appointmentDate,
            closer: c.closerName,
            closerId: c.closerId,
            callType: c.callType,
            riskCategory: category,
            timestamp: flag.timestamp_seconds ? `${Math.floor(flag.timestamp_seconds / 60)}:${String(flag.timestamp_seconds % 60).padStart(2, '0')}` : (flag.timestamp || ''),
            exactPhrase: flag.phrase || flag.exact_phrase || '',
            whyFlagged: flag.why_flagged || flag.explanation || '',
            recordingUrl: c.recordingUrl,
            transcriptUrl: c.transcriptLink,
          });
        }
      }
      continue; // Already processed via complianceFlags, skip keyMoments
    }

    // Legacy fallback: parse keyMoments for risk flags
    if (!c.keyMoments) continue;
    let moments;
    try {
      moments = typeof c.keyMoments === 'string' ? JSON.parse(c.keyMoments) : c.keyMoments;
    } catch {
      continue; // Not valid JSON, skip
    }

    if (!Array.isArray(moments)) continue;
    for (const moment of moments) {
      const category = moment.risk_category || moment.category;
      if (category && riskCategories.some(rc => category.toLowerCase().includes(rc.toLowerCase()))) {
        allRiskFlags.push({
          date: c.appointmentDate,
          closer: c.closerName,
          closerId: c.closerId,
          callType: c.callType,
          riskCategory: category,
          timestamp: moment.timestamp || '',
          exactPhrase: moment.phrase || moment.text || '',
          whyFlagged: moment.reason || moment.explanation || '',
          recordingUrl: c.recordingUrl,
          transcriptUrl: c.transcriptLink,
        });
      }
    }
  }

  // Apply risk category filter — filters ALL page data (scorecards, charts, table)
  const riskFlags = rcFilterList.length > 0
    ? allRiskFlags.filter(f => rcFilterList.some(rc => f.riskCategory.toLowerCase().includes(rc)))
    : allRiskFlags;

  const uniqueCallsWithRisk = new Set(riskFlags.map(f => f.date + f.closerId)).size;
  const catCounts = {};
  for (const rc of riskCategories) catCounts[rc] = 0;
  for (const f of riskFlags) {
    for (const rc of riskCategories) {
      if (f.riskCategory.toLowerCase().includes(rc.toLowerCase())) {
        catCounts[rc]++;
        break;
      }
    }
  }

  // Risk by call type
  const firstCallFlags = riskFlags.filter(f => FIRST_CALL_TYPES.includes(f.callType)).length;
  const followUpFlags = riskFlags.filter(f => FOLLOW_UP_TYPES.includes(f.callType)).length;
  const firstCallTotal = held.filter(isFirstCall).length;
  const followUpTotal = held.filter(isFollowUp).length;

  const sections = {
    overview: {
      flagCount: m('FTC / SEC Red Flags', riskFlags.length, 'number', 'red'),
      uniqueCalls: m('Unique Calls w/ Red Flags', uniqueCallsWithRisk, 'number', 'red'),
      pctCalls: m('% Calls w/ Red Flags', round(sd(uniqueCallsWithRisk, held.length), 3), 'percent', 'amber'),
    },
    riskCategories: Object.fromEntries(
      RISK_CATEGORIES.map(rc => [
        rc.toLowerCase(),
        m(RISK_CATEGORY_LABELS[rc], catCounts[rc], 'number', RISK_CATEGORY_COLORS[rc]),
      ])
    ),
    riskByCallType: {
      firstCallPct: m('First Call Infractions', round(sd(firstCallFlags, firstCallTotal), 3), 'percent', 'red'),
      followUpPct: m('Follow-Up Infractions', round(sd(followUpFlags, followUpTotal), 3), 'percent', 'amber'),
    },
  };

  // Add period-over-period deltas (fewer flags is better)
  if (prev && prev.calls.length > 0) {
    const dl = prev.deltaLabel;
    const pHeld = prev.calls.filter(isShow);
    // Parse risk flags from prev calls
    let pFlagCount = 0;
    const pCallsWithRisk = new Set();
    for (const c of pHeld) {
      if (!c.keyMoments) continue;
      let moments;
      try { moments = typeof c.keyMoments === 'string' ? JSON.parse(c.keyMoments) : c.keyMoments; } catch { continue; }
      if (!Array.isArray(moments)) continue;
      for (const moment of moments) {
        const cat = moment.risk_category || moment.category;
        if (cat && riskCategories.some(rc => cat.toLowerCase().includes(rc.toLowerCase()))) {
          pFlagCount++;
          pCallsWithRisk.add(c.appointmentDate + c.closerId);
        }
      }
    }

    const s = sections.overview;
    s.flagCount = withDelta(s.flagCount, riskFlags.length, pFlagCount, dl, 'down');
    s.uniqueCalls = withDelta(s.uniqueCalls, uniqueCallsWithRisk, pCallsWithRisk.size, dl, 'down');
    s.pctCalls = withDelta(s.pctCalls, sd(uniqueCallsWithRisk, held.length), sd(pCallsWithRisk.size, pHeld.length), dl, 'down');
  }

  // Time-series — use ALL held calls as the date backbone so every time
  // bucket gets a data point (zero when no flags exist). This prevents
  // sparse charts when compliance flags only exist on a few dates.
  const allCallBuckets = groupByTime(held, 'appointmentDate', granularity);
  const flagBuckets = riskFlags.length > 0
    ? groupByTime(riskFlags, 'date', granularity)
    : new Map();

  const complianceOverTime = [];
  for (const [date] of allCallBuckets) {
    const bucket = flagBuckets.get(date);
    complianceOverTime.push({ date, flags: bucket ? bucket.length : 0 });
  }

  // Per-closer
  const closerFlags = new Map();
  for (const f of riskFlags) {
    const name = f.closer || 'Unknown';
    closerFlags.set(name, (closerFlags.get(name) || 0) + 1);
  }
  const flagsByCloser = [...closerFlags.entries()]
    .map(([name, flags]) => ({ date: name, flags }))
    .sort((a, b) => b.flags - a.flags);

  // Risk category trends over time — same backbone approach
  const riskTrendsData = [];
  const riskFlagBuckets = riskFlags.length > 0
    ? groupByTime(riskFlags, 'date', granularity)
    : new Map();
  for (const [date] of allCallBuckets) {
    const point = { date };
    const bucket = riskFlagBuckets.get(date) || [];
    for (const rc of riskCategories) {
      point[rc.toLowerCase()] = bucket.filter(f =>
        f.riskCategory.toLowerCase().includes(rc.toLowerCase())
      ).length;
    }
    riskTrendsData.push(point);
  }

  return {
    sections,
    charts: {
      complianceOverTime: { data: complianceOverTime, series: [
        { key: 'flags', label: 'Compliance Flags', color: 'red' },
      ]},
      flagsByCloser: { data: flagsByCloser, series: [
        { key: 'flags', label: 'Risk Flags', color: 'amber' },
      ]},
      riskTrends: { data: riskTrendsData, series:
        // Only include series that have actual data — zero-total categories
        // would draw stacked lines on top of real data, visually hiding it.
        RISK_TREND_CHART_CONFIG
          .filter(c => riskTrendsData.some(d => (d[c.key] || 0) > 0))
          .map(c => ({ key: c.key, label: c.label, color: c.color })),
      },
    },
    tables: {
      riskReview: { rows: riskFlags.slice(0, 50) }, // Limit to 50 for performance
    },
  };
}


// ─────────────────────────────────────────────────────────────
// ADHERENCE PAGE
// ─────────────────────────────────────────────────────────────

function computeAdherence(calls, granularity, prev) {
  const held = calls.filter(c => isShow(c) && c.scriptAdherenceScore > 0);

  // Score fields mapped to radar axes — driven by SCRIPT_SECTIONS config
  const scoreMap = Object.fromEntries(SCRIPT_SECTIONS.map(s => [s.key, s.scoreField]));
  const axes = SCRIPT_SECTIONS.map(s => s.label);
  const axisKeys = SCRIPT_SECTIONS.map(s => s.key);

  // Overall scores
  const overallAdherence = round(avg(held, 'scriptAdherenceScore'), 1);
  const objHandling = round(avg(held, 'objectionHandlingScore'), 1);

  const sections = {
    overall: {
      adherenceScore: m('Script Adherence Score', overallAdherence || 0, 'score', 'cyan'),
      objHandlingScore: m('Objection Handling Quality', objHandling || 0, 'score', 'amber'),
    },
    bySection: {},
  };

  for (let i = 0; i < axes.length; i++) {
    const key = axisKeys[i];
    const field = scoreMap[key];
    sections.bySection[key] = m(axes[i], round(avg(held, field), 1) || 0, 'score', 'cyan');
  }

  // Add period-over-period deltas (higher scores are better)
  if (prev && prev.calls.length > 0) {
    const dl = prev.deltaLabel;
    const pHeld = prev.calls.filter(c => isShow(c) && c.scriptAdherenceScore > 0);
    if (pHeld.length > 0) {
      const pAdherence = round(avg(pHeld, 'scriptAdherenceScore'), 1);
      const pObjHandling = round(avg(pHeld, 'objectionHandlingScore'), 1);
      sections.overall.adherenceScore = withDelta(sections.overall.adherenceScore, overallAdherence || 0, pAdherence || 0, dl, 'up');
      sections.overall.objHandlingScore = withDelta(sections.overall.objHandlingScore, objHandling || 0, pObjHandling || 0, dl, 'up');
    }
  }

  // Radar data per closer
  const closerBuckets = groupByCloser(held);
  const byCloser = [];
  const adherenceByCloser = [];
  const objHandlingByCloser = [];

  for (const [name, closerCalls] of closerBuckets) {
    const closerValues = axisKeys.map(key => {
      const field = scoreMap[key];
      return round(avg(closerCalls, field), 1) || 0;
    });
    byCloser.push({ label: name, closerId: closerCalls[0]?.closerId, values: closerValues });
    adherenceByCloser.push({
      date: name,
      score: round(avg(closerCalls, 'scriptAdherenceScore'), 1) || 0,
    });
    objHandlingByCloser.push({
      date: name,
      score: round(avg(closerCalls, 'objectionHandlingScore'), 1) || 0,
    });
  }
  adherenceByCloser.sort((a, b) => b.score - a.score);
  objHandlingByCloser.sort((a, b) => b.score - a.score);

  // Time-series
  const timeBuckets = groupByTime(held.length > 0 ? held : calls, 'appointmentDate', granularity);
  const adherenceOverTime = [];
  for (const [date, bucket] of timeBuckets) {
    const scored = bucket.filter(c => c.scriptAdherenceScore > 0);
    adherenceOverTime.push({
      date,
      score: scored.length > 0 ? round(avg(scored, 'scriptAdherenceScore'), 1) : 0,
    });
  }

  return {
    sections,
    charts: {
      radarData: { axes, byCloser },
      adherenceByCloser: { data: adherenceByCloser, series: [
        { key: 'score', label: 'Adherence Score', color: 'cyan' },
      ]},
      objHandlingByCloser: { data: objHandlingByCloser, series: [
        { key: 'score', label: 'Obj Handling Score', color: 'amber' },
      ]},
      adherenceOverTime: { data: adherenceOverTime, series: [
        { key: 'score', label: 'Adherence Score', color: 'green' },
      ]},
    },
  };
}


// ─────────────────────────────────────────────────────────────
// CLOSER SCOREBOARD PAGE (Insight+)
// ─────────────────────────────────────────────────────────────

/**
 * Compute Closer Scoreboard data — ranks closers across every category.
 * Power Score = weighted composite: Revenue 30%, Close Rate 25%, Cash 15%,
 * Show Rate 10%, Call Quality 10%, Obj Handling 10%.
 *
 * Returns champion data, comparison table, bar charts, radar, and trends.
 */
function computeCloserScoreboard(calls, objections, closeCycles, granularity, prev, kpiTargets) {
  // Activity metrics: only calls with appointments in range
  const apptCalls = calls.filter(c => c._inRangeByAppointment);
  const held = apptCalls.filter(isShow);

  // Close/revenue metrics: calls that closed in the date range
  const closedAll = calls.filter(c => c._inRangeByClose && isShow(c) && isClosed(c));
  const revenueDealsAll = calls.filter(c => c._inRangeByClose && isShow(c) && hasRevenue(c));

  // Group by closer — exclude closers with < 3 held calls
  const closerBuckets = groupByCloser(held);
  const closerNames = [];
  const closerStats = [];

  // Group close-range deals by closer for revenue/close metrics
  const closerRevDealBuckets = groupByCloser(revenueDealsAll);

  for (const [name, closerCalls] of closerBuckets) {
    if (closerCalls.length < 3) continue;

    const closerApptCalls = apptCalls.filter(c => (c.closerName || c.closerId || 'Unknown') === name);
    const closerHeld = closerCalls;
    const closerRevDeals = closerRevDealBuckets.get(name) || [];
    const closerClosed = closerRevDeals.filter(isClosed);
    const closerRevenue = closerRevDeals.reduce((s, c) => s + (c.revenueGenerated || 0), 0);
    const closerCash = closerRevDeals.reduce((s, c) => s + (c.cashCollected || 0), 0);
    const closerScheduled = closerApptCalls.length;
    const showRate = sd(closerHeld.length, closerScheduled);
    const closeRate = sd(closerClosed.length, closerHeld.length);
    const avgDealSize = closerClosed.length > 0 ? closerRevenue / closerClosed.length : 0;
    const callQuality = avg(closerHeld, 'overallCallScore') || 0;
    const objHandling = avg(closerHeld, 'objectionHandlingScore') || 0;

    // Script adherence + sub-scores per closer
    const scoredCalls = closerHeld.filter(c => c.scriptAdherenceScore > 0);
    const scriptAdherence = scoredCalls.length > 0 ? avg(scoredCalls, 'scriptAdherenceScore') : 0;
    const discoveryScore = avg(closerHeld, 'discoveryScore') || 0;
    const pitchScore = avg(closerHeld, 'pitchScore') || 0;
    const closeAttemptScore = avg(closerHeld, 'closeAttemptScore') || 0;

    // Objection resolution rate for this closer
    const closerObjs = objections.filter(o => (o.closerName || o.closerId || 'Unknown') === name);
    const objResolved = closerObjs.filter(o => o.resolved).length;
    const objResRate = sd(objResolved, closerObjs.length);

    // Days to close & calls to close from closeCycles
    const closerCycles = closeCycles.filter(c => (c.closerName || c.closerId || 'Unknown') === name);
    const avgDaysToClose = closerCycles.length > 0
      ? closerCycles.reduce((s, c) => s + (c.daysToClose || 0), 0) / closerCycles.length : 0;
    const avgCallsToClose = closerCycles.length > 0
      ? closerCycles.reduce((s, c) => s + (c.callsToClose || 0), 0) / closerCycles.length : 0;

    // Avg call duration (minutes)
    const avgDuration = avg(closerHeld, 'durationMinutes') || 0;

    closerNames.push(name);
    closerStats.push({
      name,
      closerId: closerCalls[0]?.closerId,
      revenue: closerRevenue,
      cash: closerCash,
      closeRate,
      showRate,
      dealsClosed: closerClosed.length,
      avgDealSize: round(avgDealSize, 0),
      daysToClose: round(avgDaysToClose, 1),
      callsToClose: round(avgCallsToClose, 1),
      callQuality: round(callQuality, 1),
      objHandling: round(objHandling, 1),
      objResRate: round(objResRate, 3),
      avgDuration: round(avgDuration, 1),
      scriptAdherence: round(scriptAdherence, 1),
      discoveryScore: round(discoveryScore, 1),
      pitchScore: round(pitchScore, 1),
      closeAttemptScore: round(closeAttemptScore, 1),
      heldCount: closerHeld.length,
    });
  }

  // Edge case: fewer than 2 closers
  if (closerStats.length < 2) {
    return { isEmpty: true, message: 'Need at least 2 closers with 3+ held calls for the scoreboard.' };
  }

  // ── Power Score via min-max normalization ──
  // Higher is better for all except daysToClose and callsToClose (lower is better)
  const metrics = ['revenue', 'closeRate', 'cash', 'showRate', 'callQuality', 'objHandling'];
  const weights = { revenue: 0.30, closeRate: 0.25, cash: 0.15, showRate: 0.10, callQuality: 0.10, objHandling: 0.10 };

  // Min-max for each metric
  const mins = {};
  const maxs = {};
  for (const key of metrics) {
    const vals = closerStats.map(c => c[key]);
    mins[key] = Math.min(...vals);
    maxs[key] = Math.max(...vals);
  }

  // Normalize and compute power score
  for (const closer of closerStats) {
    let score = 0;
    for (const key of metrics) {
      const range = maxs[key] - mins[key];
      const norm = range === 0 ? 0.5 : (closer[key] - mins[key]) / range;
      score += norm * weights[key] * 100;
    }
    closer.powerScore = round(score, 1);
  }

  // Sort by power score descending
  closerStats.sort((a, b) => b.powerScore - a.powerScore);
  const sortedNames = closerStats.map(c => c.name);

  // ── Champion data ──
  const champ = closerStats[0];
  const champion = {
    name: champ.name,
    powerScore: champ.powerScore,
    stats: [
      { label: 'Revenue', value: '$' + champ.revenue.toLocaleString() },
      { label: 'Close Rate', value: round(champ.closeRate * 100, 1) + '%' },
      { label: 'Cash', value: '$' + champ.cash.toLocaleString() },
      { label: 'Deals', value: String(champ.dealsClosed) },
      { label: 'Call Quality', value: String(champ.callQuality) },
      { label: 'Show Rate', value: round(champ.showRate * 100, 1) + '%' },
    ],
  };

  // ── Top Performers list (for TopPerformers component) ──
  const topPerformers = closerStats.map(c => ({
    name: c.name,
    dealsClosed: c.dealsClosed,
    revenue: c.revenue,
    powerScore: c.powerScore,
  }));

  // ── Comparison table (grouped) ──
  const comparisonMetrics = [
    { type: 'group', key: 'grp-financial', label: 'Financial', color: '#6BCF7F' },
    { label: 'Revenue', key: 'revenue', format: 'currency', desiredDirection: 'up' },
    { label: 'Cash Collected', key: 'cash', format: 'currency', desiredDirection: 'up' },
    { label: 'Avg Deal Size', key: 'avgDealSize', format: 'currency', desiredDirection: 'up' },
    { type: 'group', key: 'grp-conversion', label: 'Conversion', color: '#4DD4E8' },
    { label: 'Close Rate', key: 'closeRate', format: 'percent', desiredDirection: 'up' },
    { label: 'Show Rate', key: 'showRate', format: 'percent', desiredDirection: 'up' },
    { type: 'group', key: 'grp-volume', label: 'Volume', color: '#4D7CFF' },
    { label: 'Deals Closed', key: 'dealsClosed', format: 'number', desiredDirection: 'up' },
    { label: 'Calls Taken', key: 'heldCount', format: 'number', desiredDirection: 'up' },
    { type: 'group', key: 'grp-efficiency', label: 'Efficiency', color: '#FFD93D' },
    { label: 'Days to Close', key: 'daysToClose', format: 'decimal', desiredDirection: 'down' },
    { label: 'Calls to Close', key: 'callsToClose', format: 'decimal', desiredDirection: 'down' },
    { label: 'Avg Duration (min)', key: 'avgDuration', format: 'decimal', desiredDirection: 'up' },
    { type: 'group', key: 'grp-quality', label: 'Quality', color: '#B84DFF' },
    { label: 'Call Quality', key: 'callQuality', format: 'score', desiredDirection: 'up' },
    { label: 'Obj Resolution Rate', key: 'objResRate', format: 'percent', desiredDirection: 'up' },
  ].map(metric => {
    if (metric.type === 'group') return metric;
    return { ...metric, values: closerStats.map(c => c[metric.key]) };
  });

  const comparisonTable = {
    closers: sortedNames,
    metrics: comparisonMetrics,
  };

  // ── Bar charts (Section 3: Revenue & Close Rankings) ──
  const revenueByCloser = {
    data: closerStats.map(c => ({ date: c.name, value: c.revenue })).sort((a, b) => b.value - a.value),
    series: [{ key: 'value', label: 'Revenue', color: 'green' }],
  };
  const closeRateByCloser = {
    data: closerStats.map(c => ({ date: c.name, value: c.closeRate })).sort((a, b) => b.value - a.value),
    series: [{ key: 'value', label: 'Close Rate', color: 'cyan' }],
  };
  const showRateByCloser = {
    data: closerStats.map(c => ({ date: c.name, value: c.showRate })).sort((a, b) => b.value - a.value),
    series: [{ key: 'value', label: 'Show Rate', color: 'blue' }],
  };
  const cashByCloser = {
    data: closerStats.map(c => ({ date: c.name, value: c.cash })).sort((a, b) => b.value - a.value),
    series: [{ key: 'value', label: 'Cash Collected', color: 'teal' }],
  };

  // ── Radar chart (Section 4: Skills Radar) ──
  // 6 clean axes — all real data fields, no derived metrics
  const radarAxes = ['Close Rate', 'Show Rate', 'Rev/Call', 'Call Quality', 'Obj Handling', 'Adherence'];
  const maxRevPerCall = Math.max(...closerStats.map(s => s.heldCount > 0 ? s.revenue / s.heldCount : 0), 1);
  // Normalize Close Rate & Show Rate: 10 = KPI target or best closer (whichever is higher)
  const crKpi = kpiTargets?.close_rate || 0;
  const srKpi = kpiTargets?.show_rate || 0;
  const maxCR = Math.max(...closerStats.map(c => c.closeRate), crKpi);
  const maxSR = Math.max(...closerStats.map(c => c.showRate), srKpi);
  const normKpi = (val, ceiling) => ceiling > 0 ? Math.min(10, round((val / ceiling) * 10, 1)) : 5;

  const radarByCloser = closerStats.map(c => {
    const revPerCall = c.heldCount > 0 ? c.revenue / c.heldCount : 0;
    const adherence = avg(held.filter(h => (h.closerName || h.closerId || 'Unknown') === c.name), 'scriptAdherenceScore') || 0;
    return {
      label: c.name,
      closerId: c.closerId,
      values: [
        normKpi(c.closeRate, maxCR),              // Close Rate (0-10, KPI or best = 10)
        normKpi(c.showRate, maxSR),               // Show Rate (0-10, KPI or best = 10)
        round((revPerCall / maxRevPerCall) * 10, 1), // Rev/Call (normalized to 0-10)
        round(c.callQuality, 1),                  // Call Quality (already 0-10)
        round(c.objHandling, 1),                  // Obj Handling (already 0-10)
        round(adherence, 1),                      // Adherence (already 0-10)
      ],
    };
  });

  const radarData = { axes: radarAxes, byCloser: radarByCloser };

  // ── Call Quality by Closer (Section 4 right side) ──
  const callQualityByCloser = {
    data: closerStats.map(c => ({ date: c.name, value: c.callQuality })).sort((a, b) => b.value - a.value),
    series: [{ key: 'value', label: 'Call Quality', color: 'purple' }],
  };

  // ── Section 5: Efficiency & Speed ──
  const daysToCloseByCloser = {
    data: closerStats.filter(c => c.daysToClose > 0).map(c => ({ date: c.name, value: c.daysToClose })).sort((a, b) => a.value - b.value),
    series: [{ key: 'value', label: 'Avg Days to Close', color: 'amber' }],
  };
  const callsToCloseByCloser = {
    data: closerStats.filter(c => c.callsToClose > 0).map(c => ({ date: c.name, value: c.callsToClose })).sort((a, b) => a.value - b.value),
    series: [{ key: 'value', label: 'Avg Calls to Close', color: 'purple' }],
  };
  const objResRateByCloser = {
    data: closerStats.map(c => ({ date: c.name, value: c.objResRate })).sort((a, b) => b.value - a.value),
    series: [{ key: 'value', label: 'Obj Resolution Rate', color: 'cyan' }],
  };
  const avgDurationByCloser = {
    data: closerStats.filter(c => c.avgDuration > 0).map(c => ({ date: c.name, value: c.avgDuration })).sort((a, b) => b.value - a.value),
    series: [{ key: 'value', label: 'Avg Duration (min)', color: 'blue' }],
  };

  // ── Leaderboards — ranked lists for multiple categories ──
  const leaderboards = {
    revenue: closerStats.map(c => ({ name: c.name, dealsClosed: c.dealsClosed, revenue: c.revenue })),
    cash: [...closerStats].sort((a, b) => b.cash - a.cash).map(c => ({ name: c.name, dealsClosed: c.dealsClosed, revenue: c.cash })),
    dealsClosed: [...closerStats].sort((a, b) => b.dealsClosed - a.dealsClosed).map(c => ({ name: c.name, dealsClosed: '$' + c.revenue.toLocaleString(), revenue: c.dealsClosed + ' deals' })),
    closeRate: [...closerStats].sort((a, b) => b.closeRate - a.closeRate).map(c => ({ name: c.name, dealsClosed: c.heldCount + ' calls', revenue: round(c.closeRate * 100, 1) + '%' })),
    showRate: [...closerStats].sort((a, b) => b.showRate - a.showRate).map(c => ({ name: c.name, dealsClosed: c.heldCount + ' held', revenue: round(c.showRate * 100, 1) + '%' })),
    callQuality: [...closerStats].sort((a, b) => b.callQuality - a.callQuality).map(c => ({ name: c.name, dealsClosed: c.heldCount + ' calls', revenue: c.callQuality + '/10' })),
    objResolved: [...closerStats].sort((a, b) => b.objResRate - a.objResRate).map(c => ({ name: c.name, dealsClosed: Math.round(c.objResRate * 100) + '% resolved', revenue: c.name })),
    callsTaken: [...closerStats].sort((a, b) => b.heldCount - a.heldCount).map(c => ({ name: c.name, dealsClosed: c.dealsClosed + ' closed', revenue: c.heldCount + ' calls' })),
    avgDealSize: [...closerStats].sort((a, b) => b.avgDealSize - a.avgDealSize).map(c => ({ name: c.name, dealsClosed: c.dealsClosed + ' deals', revenue: c.avgDealSize })),
    speed: [...closerStats].filter(c => c.daysToClose > 0).sort((a, b) => a.daysToClose - b.daysToClose).map(c => ({ name: c.name, dealsClosed: c.dealsClosed + ' deals', revenue: c.daysToClose + ' days' })),
    avgDuration: [...closerStats].filter(c => c.avgDuration > 0).sort((a, b) => b.avgDuration - a.avgDuration).map(c => ({ name: c.name, dealsClosed: c.heldCount + ' calls', revenue: round(c.avgDuration, 1) + ' min' })),
  };

  // ── Section 6: Trends Over Time (up to 10 closers by power score) ──
  // Force weekly granularity for trends — daily is too noisy per-closer
  const trendGranularity = 'weekly';
  const top5 = closerStats.slice(0, 10);
  const rankColors = ['green', 'cyan', 'blue', 'purple', 'amber', 'red', 'teal', 'muted', 'green', 'cyan'];

  // Pre-group ALL calls (not just held) by time bucket for close rate denominator
  // Use _effectiveDate so closes/revenue bucket by close date
  const allCallBuckets = groupByTime(calls, '_effectiveDate', trendGranularity);
  const heldBuckets = groupByTime(held, '_effectiveDate', trendGranularity);

  // Close Rate over time per closer (held / all scheduled per week)
  const closeRateTrendData = [];
  for (const [date] of heldBuckets) {
    const row = { date };
    const allBucket = allCallBuckets.get(date) || [];
    const heldBucket = heldBuckets.get(date) || [];
    for (let i = 0; i < top5.length; i++) {
      const name = top5[i].name;
      const closerHeldInBucket = heldBucket.filter(c => (c.closerName || c.closerId || 'Unknown') === name);
      const closerAllInBucket = allBucket.filter(c => (c.closerName || c.closerId || 'Unknown') === name);
      const closerClosedInBucket = closerHeldInBucket.filter(isClosed);
      // Close rate = closed / held (not closed / scheduled)
      row[`closer${i}`] = closerHeldInBucket.length >= 2 ? round(sd(closerClosedInBucket.length, closerHeldInBucket.length), 3) : null;
    }
    closeRateTrendData.push(row);
  }
  const closeRateTrend = {
    data: closeRateTrendData,
    series: top5.map((c, i) => ({ key: `closer${i}`, label: c.name, color: rankColors[i] })),
  };

  // Revenue over time per closer (weekly buckets)
  const revenueTrendData = [];
  for (const [date, bucket] of heldBuckets) {
    const row = { date };
    for (let i = 0; i < top5.length; i++) {
      const name = top5[i].name;
      const closerBucket = bucket.filter(c => (c.closerName || c.closerId || 'Unknown') === name);
      row[`closer${i}`] = closerBucket.reduce((s, c) => s + (c.revenueGenerated || 0), 0) || null;
    }
    revenueTrendData.push(row);
  }
  const revenueTrend = {
    data: revenueTrendData,
    series: top5.map((c, i) => ({ key: `closer${i}`, label: c.name, color: rankColors[i] })),
  };

  return {
    closerStats,
    champion,
    topPerformers,
    comparisonTable,
    leaderboards,
    charts: {
      revenueByCloser,
      closeRateByCloser,
      showRateByCloser,
      cashByCloser,
      radarData,
      callQualityByCloser,
      daysToCloseByCloser,
      callsToCloseByCloser,
      objResRateByCloser,
      avgDurationByCloser,
      closeRateTrend,
      revenueTrend,
    },
  };
}


// ─────────────────────────────────────────────────────────────
// MARKET INSIGHT PAGE (Insight+)
// ─────────────────────────────────────────────────────────────

/**
 * Compute Market Insight page data.
 * "What are my prospects actually saying?" — raw pains and goals
 * from the last 30 days of held calls, in their own words.
 *
 * Returns two tables (pains + goals) with date, closer, and the
 * exact text the AI extracted. Most recent calls first.
 */
function computeMarketInsight(rawData) {
  const allCalls = rawData.calls || [];
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff30 = thirtyDaysAgo.toISOString().split('T')[0];

  // Last 30 days, held calls only
  const recent30 = allCalls.filter(c =>
    c.appointmentDate >= cutoff30 && isShow(c)
  );

  // Calls with pain or goal data
  const withData = recent30.filter(c => (c.pains && c.pains.trim()) || (c.goals && c.goals.trim()));

  // ── Scorecards ──
  const callsAnalyzed = withData.length;
  const avgPainScore = round(avg(withData, 'painScore'), 1);
  const avgGoalScore = round(avg(withData, 'goalScore'), 1);
  const dataCoverage = round(sd(withData.length, recent30.length), 3);

  // Sort most recent first
  const sorted = [...withData].sort((a, b) => b.appointmentDate.localeCompare(a.appointmentDate));

  // ── Pains table — every call that has pain text ──
  const painsRows = sorted
    .filter(c => c.pains && c.pains.trim())
    .map(c => ({
      date: c.appointmentDate,
      closerName: c.closerName || 'Unknown',
      prospectName: c.prospectName || '',
      text: c.pains.trim(),
      callId: c.callId,
    }));

  // ── Goals table — every call that has goal text ──
  const goalsRows = sorted
    .filter(c => c.goals && c.goals.trim())
    .map(c => ({
      date: c.appointmentDate,
      closerName: c.closerName || 'Unknown',
      prospectName: c.prospectName || '',
      text: c.goals.trim(),
      callId: c.callId,
    }));

  return {
    sections: {
      summary: {
        callsAnalyzed: m('Calls Analyzed', callsAnalyzed, 'number', 'cyan'),
        avgPainDiscovery: m('Avg Pain Discovery', avgPainScore, 'score', 'red'),
        avgGoalDiscovery: m('Avg Goal Discovery', avgGoalScore, 'score', 'green'),
        dataCoverage: m('Data Coverage', dataCoverage, 'percent', 'amber'),
      },
    },
    charts: {},
    tables: {
      pains: painsRows,
      goals: goalsRows,
    },
  };
}


// ─────────────────────────────────────────────────────────────
// CLOSER VIEW PAGE (Insight+)
// ─────────────────────────────────────────────────────────────

function computeCloserView(rawData, calls, objections, closeCycles, granularity, prev) {
  const allCalls = rawData.calls || [];
  // Activity metrics: only calls with appointments in range
  const apptCalls = calls.filter(c => c._inRangeByAppointment);
  const held = apptCalls.filter(isShow);
  const pApptCalls = prev.calls.filter(c => c._inRangeByAppointment);
  const prevHeld = pApptCalls.filter(isShow);

  // Close/revenue metrics: calls that closed in the date range
  const teamClosedDeals = calls.filter(c => c._inRangeByClose && isShow(c) && isClosed(c));
  const teamRevenueDeals = calls.filter(c => c._inRangeByClose && isShow(c) && hasRevenue(c));

  // Group by closer — include ALL closers (even with few calls)
  const closerBuckets = groupByCloser(held);
  const prevBuckets = groupByCloser(prevHeld);
  const allCallsBuckets = groupByCloser(apptCalls); // includes no-shows for show rate

  // Team-level aggregates for comparison
  const teamClosed = teamClosedDeals;
  const teamRevenue = sum(teamRevenueDeals, 'revenueGenerated');
  const teamCloseRate = sd(teamClosed.length, held.length);
  const teamShowRate = sd(held.length, apptCalls.length);
  const teamCallQuality = avg(held, 'overallCallScore') || 0;
  const teamAvgDealSize = teamClosed.length > 0 ? teamRevenue / teamClosed.length : 0;
  const teamObjResolved = objections.filter(o => o.resolved).length;
  const teamObjResRate = sd(teamObjResolved, objections.length);
  const teamCycles = closeCycles;
  const teamAvgDaysToClose = teamCycles.length > 0
    ? teamCycles.reduce((s, c) => s + (c.daysToClose || 0), 0) / teamCycles.length : 0;
  const teamAvgCallsToClose = teamCycles.length > 0
    ? teamCycles.reduce((s, c) => s + (c.callsToClose || 0), 0) / teamCycles.length : 0;

  const numClosers = closerBuckets.size || 1;
  const teamCash = sum(teamRevenueDeals, 'cashCollected');
  const teamAverages = {
    closeRate: round(teamCloseRate, 3),
    showRate: round(teamShowRate, 3),
    revenue: round(teamRevenue / numClosers, 0),
    cashCollected: round(teamCash / numClosers, 0),
    dealsWon: round(teamClosed.length / numClosers, 1),
    callQuality: round(teamCallQuality, 1),
    avgDealSize: round(teamAvgDealSize, 0),
    objResRate: round(teamObjResRate, 3),
    avgDaysToClose: round(teamAvgDaysToClose, 1),
    avgCallsToClose: round(teamAvgCallsToClose, 1),
    avgCashPerCall: held.length > 0 ? round(teamCash / held.length, 0) : 0,
  };

  // Build per-closer data
  // Group close-range deals by closer
  const closerRevDealBuckets = groupByCloser(teamRevenueDeals);
  const closers = [];
  for (const [name, closerHeld] of closerBuckets) {
    const closerId = closerHeld[0]?.closerId;
    const closerAll = allCallsBuckets.get(name) || [];
    const closerRevDeals = closerRevDealBuckets.get(name) || [];
    const closerClosed = closerRevDeals.filter(isClosed);
    const closerDeposits = closerRevDeals.filter(isDeposit);
    const closerRevenue = closerRevDeals.reduce((s, c) => s + (c.revenueGenerated || 0), 0);
    const closerCash = closerRevDeals.reduce((s, c) => s + (c.cashCollected || 0), 0);
    const closeRate = sd(closerClosed.length, closerHeld.length);
    const showRate = sd(closerHeld.length, closerAll.length);

    // Power score — simplified single-closer version (absolute scale)
    const closerObjsAll = objections.filter(o => o.closerId === closerId);
    const closerObjsResolved = closerObjsAll.filter(o => o.resolved).length;
    const closerObjRate = sd(closerObjsResolved, closerObjsAll.length);
    const powerScore = round(
      (Math.min(closeRate / 0.3, 1) * 25) +
      (Math.min(showRate / 0.8, 1) * 10) +
      (Math.min(closerRevenue / Math.max(teamRevenue * 0.5, 1), 1) * 30) +
      (Math.min(closerCash / Math.max(teamRevenue * 0.4, 1), 1) * 15) +
      (Math.min((avg(closerHeld, 'overallCallScore') || 0) / 10, 1) * 10) +
      (Math.min(closerObjRate, 1) * 10),
    1);

    // Previous period stats
    const prevCloserHeld = prevBuckets.get(name) || [];
    const prevCloserAll = pApptCalls.filter(c => (c.closerName || c.closerId || 'Unknown') === name);
    const prevCloserRevDeals = prev.calls.filter(c => c._inRangeByClose && isShow(c) && hasRevenue(c) && (c.closerName || c.closerId || 'Unknown') === name);
    const prevCloserClosed = prevCloserRevDeals.filter(isClosed);
    const prevRevenue = prevCloserRevDeals.reduce((s, c) => s + (c.revenueGenerated || 0), 0);
    const prevCash = prevCloserRevDeals.reduce((s, c) => s + (c.cashCollected || 0), 0);
    const prevCloseRate = sd(prevCloserClosed.length, prevCloserHeld.length);
    const prevShowRate = sd(prevCloserHeld.length, prevCloserAll.length);

    const hero = {
      revenue: closerRevenue,
      cashCollected: closerCash,
      closeRate,
      showRate,
      dealsWon: closerClosed.length,
      callsHeld: closerHeld.length,
      powerScore,
    };
    const heroPrev = {
      revenue: prevRevenue,
      cashCollected: prevCash,
      closeRate: prevCloseRate,
      showRate: prevShowRate,
      dealsWon: prevCloserClosed.length,
      callsHeld: prevCloserHeld.length,
    };

    // ── Red Zone ──
    // Build a prospect → calls map from ALL calls (not date-filtered) for follow-up staleness
    const allCloserCalls = allCalls.filter(c => c.closerId === closerId);
    const prospectCalls = new Map();
    for (const c of allCloserCalls) {
      const key = (c.prospectEmail || c.prospectName || c.callId).toLowerCase();
      if (!prospectCalls.has(key)) prospectCalls.set(key, []);
      prospectCalls.get(key).push(c);
    }

    // Overdue follow-ups
    const now = new Date();
    const followUpCalls = closerHeld.filter(isFollowUpOutcome);
    const overdueFollowUps = [];
    for (const fu of followUpCalls) {
      const key = (fu.prospectEmail || fu.prospectName || fu.callId).toLowerCase();
      const allForProspect = prospectCalls.get(key) || [];
      const hasSubsequent = allForProspect.some(c => c.appointmentDate > fu.appointmentDate);
      if (hasSubsequent) continue;
      const daysSince = Math.round((now - new Date(fu.appointmentDate + 'T12:00:00')) / 86400000);
      const fitScore = fu.prospectFitScore || 0;
      // Include if high-fit OR stale (7+ days)
      if (fitScore >= 7 || daysSince >= 7) {
        overdueFollowUps.push({
          callId: fu.callId,
          prospectName: fu.prospectName || 'Unknown',
          prospectEmail: fu.prospectEmail || '',
          daysSince,
          lastOutcome: fu.callOutcome,
          appointmentDate: fu.appointmentDate,
          prospectFitScore: fitScore,
        });
      }
    }
    overdueFollowUps.sort((a, b) => (b.prospectFitScore || 0) - (a.prospectFitScore || 0));

    // Aging deposits — deposit calls where no closed_won exists for that prospect
    const depositCalls = closerHeld.filter(isDeposit);
    const agingDeposits = [];
    for (const dep of depositCalls) {
      const key = (dep.prospectEmail || dep.prospectName || dep.callId).toLowerCase();
      const allForProspect = prospectCalls.get(key) || [];
      const hasClosed = allForProspect.some(c => isClosed(c));
      if (hasClosed) continue;
      const daysSince = Math.round((now - new Date(dep.appointmentDate + 'T12:00:00')) / 86400000);
      agingDeposits.push({
        prospectName: dep.prospectName || 'Unknown',
        depositDate: dep.appointmentDate,
        daysSince,
        amount: dep.revenueGenerated || dep.cashCollected || 0,
      });
    }
    agingDeposits.sort((a, b) => b.daysSince - a.daysSince);

    // Recent losses — last 7 days
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const lostCutoff = sevenDaysAgo.toISOString().split('T')[0];
    const recentLosses = closerHeld
      .filter(c => isLost(c) && c.appointmentDate >= lostCutoff)
      .map(c => ({
        prospectName: c.prospectName || 'Unknown',
        lostReason: c.lostReason || 'No reason given',
        date: c.appointmentDate,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    const redZone = { overdueFollowUps, agingDeposits, recentLosses };

    // ── Pipeline ──
    const pipelineFollowUps = closerHeld
      .filter(isFollowUpOutcome)
      .map(c => ({
        prospectName: c.prospectName || 'Unknown',
        email: c.prospectEmail || '',
        lastCallDate: c.appointmentDate,
        callCount: (prospectCalls.get((c.prospectEmail || c.prospectName || c.callId).toLowerCase()) || []).length,
      }))
      .sort((a, b) => b.lastCallDate.localeCompare(a.lastCallDate));

    // All-time deposits for this closer (ignores date filter so open deposits always show)
    const allTimeCloserCalls = rawData.calls.filter(c => (c.closerName || c.closerId || 'Unknown') === name);
    const allTimeDeposits = allTimeCloserCalls.filter(isDeposit);
    const allProspectCalls = new Map();
    allTimeCloserCalls.forEach(c => {
      const pk = (c.prospectEmail || c.prospectName || c.callId).toLowerCase();
      if (!allProspectCalls.has(pk)) allProspectCalls.set(pk, []);
      allProspectCalls.get(pk).push(c);
    });
    const pipelineDeposits = allTimeDeposits
      .filter(c => {
        const pk = (c.prospectEmail || c.prospectName || c.callId).toLowerCase();
        const all = allProspectCalls.get(pk) || [];
        return !all.some(x => isClosed(x));
      })
      .map(c => ({
        prospectName: c.prospectName || 'Unknown',
        email: c.prospectEmail || '',
        depositDate: c.appointmentDate,
        daysSince: Math.round((now - new Date(c.appointmentDate + 'T12:00:00')) / 86400000),
        amount: c.revenueGenerated || c.cashCollected || 0,
      }))
      .sort((a, b) => b.depositDate.localeCompare(a.depositDate));

    const pipelineCloses = closerClosed
      .map(c => {
        const key = (c.prospectEmail || c.prospectName || c.callId).toLowerCase();
        const cycle = closeCycles.find(cy => cy.closerId === closerId &&
          (cy.prospectEmail || '').toLowerCase() === (c.prospectEmail || '').toLowerCase());
        return {
          prospectName: c.prospectName || 'Unknown',
          closeDate: c.appointmentDate,
          revenue: c.revenueGenerated || 0,
          daysToClose: cycle ? cycle.daysToClose : null,
        };
      })
      .sort((a, b) => b.closeDate.localeCompare(a.closeDate));

    const pipeline = { followUps: pipelineFollowUps, deposits: pipelineDeposits, recentCloses: pipelineCloses };

    // ── Scorecards (performance vs team) ──
    const closerObjs = objections.filter(o => o.closerId === closerId);
    const closerObjResolved = closerObjs.filter(o => o.resolved).length;
    const closerObjResRate = sd(closerObjResolved, closerObjs.length);
    const closerCycles = closeCycles.filter(c => c.closerId === closerId);
    const avgDaysToClose = closerCycles.length > 0
      ? closerCycles.reduce((s, c) => s + (c.daysToClose || 0), 0) / closerCycles.length : 0;
    const avgCallsToClose = closerCycles.length > 0
      ? closerCycles.reduce((s, c) => s + (c.callsToClose || 0), 0) / closerCycles.length : 0;
    const closerCallQuality = avg(closerHeld, 'overallCallScore') || 0;
    const avgDealSize = closerClosed.length > 0 ? closerRevenue / closerClosed.length : 0;
    const cashPerCall = sd(closerCash, closerHeld.length);

    // Previous period scorecards
    const prevObjs = prev.objections ? prev.objections.filter(o => o.closerId === closerId) : [];
    const prevObjResRate = sd(prevObjs.filter(o => o.resolved).length, prevObjs.length);
    const prevCycles = prev.closeCycles ? prev.closeCycles.filter(c => c.closerId === closerId) : [];
    const prevAvgDays = prevCycles.length > 0
      ? prevCycles.reduce((s, c) => s + (c.daysToClose || 0), 0) / prevCycles.length : 0;
    const prevAvgCallsToClose = prevCycles.length > 0
      ? prevCycles.reduce((s, c) => s + (c.callsToClose || 0), 0) / prevCycles.length : 0;
    const prevCallQuality = avg(prevCloserHeld, 'overallCallScore') || 0;
    const prevAvgDealSize = prevCloserClosed.length > 0
      ? prevCloserRevDeals.reduce((s, c) => s + (c.revenueGenerated || 0), 0) / prevCloserClosed.length : 0;
    const prevCashPerCall = sd(prevCash, prevCloserHeld.length);

    const scorecards = {
      closeRate: round(closeRate, 3), showRate: round(showRate, 3),
      avgDealSize: round(avgDealSize, 0), cashPerCall: round(cashPerCall, 0),
      avgDaysToClose: round(avgDaysToClose, 1), avgCallsToClose: round(avgCallsToClose, 1),
      objResRate: round(closerObjResRate, 3), callQuality: round(closerCallQuality, 1),
    };
    const scorecardsPrev = {
      closeRate: round(prevCloseRate, 3), showRate: round(prevShowRate, 3),
      avgDealSize: round(prevAvgDealSize, 0), cashPerCall: round(prevCashPerCall, 0),
      avgDaysToClose: round(prevAvgDays, 1), avgCallsToClose: round(prevAvgCallsToClose, 1),
      objResRate: round(prevObjResRate, 3), callQuality: round(prevCallQuality, 1),
    };

    // ── Skills Radar ──
    const scoredCalls = closerHeld.filter(c => c.scriptAdherenceScore > 0);
    const radar = {
      intro: round(avg(scoredCalls, 'introScore') || 0, 1),
      pain: round(avg(scoredCalls, 'painScore') || 0, 1),
      goal: round(avg(scoredCalls, 'goalScore') || 0, 1),
      transition: round(avg(scoredCalls, 'transitionScore') || 0, 1),
      pitch: round(avg(scoredCalls, 'pitchScore') || 0, 1),
      close: round(avg(scoredCalls, 'closeAttemptScore') || 0, 1),
      objection: round(avg(scoredCalls, 'objectionHandlingScore') || 0, 1),
      overall: round(avg(scoredCalls, 'overallCallScore') || 0, 1),
    };

    // ── Objections by Type ──
    const objByType = new Map();
    for (const o of closerObjs) {
      const t = o.objectionType || 'Other';
      if (!objByType.has(t)) objByType.set(t, { total: 0, resolved: 0 });
      const entry = objByType.get(t);
      entry.total++;
      if (o.resolved) entry.resolved++;
    }
    const objTableRows = [...objByType.entries()]
      .map(([type, d]) => ({ type, total: d.total, resolved: d.resolved, resRate: round(sd(d.resolved, d.total), 3) }))
      .sort((a, b) => b.total - a.total);
    const objChartData = objTableRows.map(r => ({
      label: r.type,
      resolved: r.resolved,
      unresolved: r.total - r.resolved,
    }));
    const closerObjections = {
      tableRows: objTableRows,
      chartData: objChartData,
      chartSeries: [
        { key: 'resolved', label: 'Resolved', color: 'green' },
        { key: 'unresolved', label: 'Unresolved', color: 'red' },
      ],
      total: closerObjs.length,
      resolved: closerObjs.filter(o => o.resolved).length,
      resRate: round(closerObjResRate, 3),
    };

    // ── Trends — use _effectiveDate so closes/revenue bucket by close date ──
    const trendGranularity = granularity;
    const closerHeldByTime = groupByTime(closerHeld, '_effectiveDate', trendGranularity);
    const closerAllByTime = groupByTime(closerAll, '_effectiveDate', trendGranularity);

    const revenueTrend = [];
    const closeRateTrend = [];
    const revenueCashTrend = [];
    const callOutcomesTrend = [];
    for (const [date, bucket] of closerHeldByTime) {
      const bucketRevenue = bucket.reduce((s, c) => s + (c.revenueGenerated || 0), 0);
      const bucketCash = bucket.reduce((s, c) => s + (c.cashCollected || 0), 0);
      revenueTrend.push({ date, value: bucketRevenue });
      revenueCashTrend.push({ date, label: date, cash: bucketCash, uncollected: Math.max(bucketRevenue - bucketCash, 0) });
      const bucketClosed = bucket.filter(isClosed);
      closeRateTrend.push({ date, value: bucket.length > 0 ? round(sd(bucketClosed.length, bucket.length), 3) : null });
      // Call outcomes per bucket
      callOutcomesTrend.push({
        date,
        label: date,
        closed_won: bucket.filter(isClosed).length,
        deposit: bucket.filter(isDeposit).length,
        follow_up: bucket.filter(isFollowUpOutcome).length,
        lost: bucket.filter(isLost).length,
        disqualified: bucket.filter(isDQ).length,
        not_pitched: bucket.filter(isNotPitched).length,
      });
    }

    const trends = {
      closeRate: { data: closeRateTrend, series: [{ key: 'value', label: 'Close Rate', color: 'green' }] },
      revenueCash: {
        data: revenueCashTrend,
        series: [
          { key: 'cash', label: 'Cash Collected', color: 'green' },
          { key: 'uncollected', label: 'Uncollected', color: 'teal' },
        ],
      },
      callOutcomes: {
        data: callOutcomesTrend,
        series: [
          { key: 'closed_won', label: 'Won', color: 'green' },
          { key: 'deposit', label: 'Deposit', color: 'amber' },
          { key: 'follow_up', label: 'Follow Up', color: 'purple' },
          { key: 'lost', label: 'Lost', color: 'red' },
          { key: 'disqualified', label: 'DQ', color: 'muted' },
          { key: 'not_pitched', label: 'Not Pitched', color: 'blue' },
        ],
      },
    };

    // ── Recent Calls (expanded with objections) ──
    const recentCalls = [...closerHeld]
      .sort((a, b) => b.appointmentDate.localeCompare(a.appointmentDate))
      .map(c => {
        const callObjs = closerObjs.filter(o => o.callId === c.callId);
        return {
          date: c.appointmentDate,
          prospectName: c.prospectName || 'Unknown',
          outcome: outcomeToKey(c.callOutcome) || c.callOutcome || 'Unknown',
          overallScore: c.overallCallScore || 0,
          duration: c.durationMinutes || 0,
          revenue: c.revenueGenerated || 0,
          cashCollected: c.cashCollected || 0,
          recordingUrl: c.recordingUrl || '',
          objections: callObjs.map(o => o.objectionType || 'Other'),
          hasObjections: callObjs.length > 0,
        };
      });

    closers.push({
      closerId, name,
      hero, heroPrev,
      redZone, pipeline,
      scorecards, scorecardsPrev,
      radar, trends,
      objections: closerObjections,
      recentCalls,
    });
  }

  // Sort closers alphabetically
  closers.sort((a, b) => a.name.localeCompare(b.name));

  // Compute team average power score after all closers are built
  if (closers.length > 0) {
    teamAverages.powerScore = round(
      closers.reduce((s, c) => s + (c.hero.powerScore || 0), 0) / closers.length, 1
    );
  }

  return { closers, teamAverages, deltaLabel: prev.deltaLabel };
}

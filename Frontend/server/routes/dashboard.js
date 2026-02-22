/**
 * DASHBOARD ROUTES — /api/dashboard/*
 *
 * Client-facing dashboard data endpoints.
 * All routes require X-Client-Token header (clientIsolation middleware).
 *
 * Tier gating is handled on the FRONTEND via the TierGate component,
 * which blurs restricted content and shows an "Upgrade to X" overlay.
 * The API returns data for all tiers so the frontend can render blurred
 * previews as upgrade teasers. Client isolation still prevents cross-client access.
 *
 * Routes:
 *   GET /api/dashboard/overview         — All tiers
 *   GET /api/dashboard/financial        — All tiers (blurred for Basic)
 *   GET /api/dashboard/attendance       — All tiers (blurred for Basic)
 *   GET /api/dashboard/call-outcomes    — All tiers (blurred for Basic)
 *   GET /api/dashboard/sales-cycle      — All tiers (blurred for Basic)
 *   GET /api/dashboard/objections       — All tiers (blurred for Basic)
 *   GET /api/dashboard/projections      — All tiers (blurred for Basic)
 *   GET /api/dashboard/violations       — All tiers (blurred for Basic/Insight)
 *   GET /api/dashboard/adherence        — All tiers (blurred for Basic/Insight)
 *
 * Query params (all optional):
 *   dateStart, dateEnd — ISO date strings for filtering
 *   closerId — Filter by specific closer (Insight+ only, ignored for Basic)
 */

const express = require('express');
const clientIsolation = require('../middleware/clientIsolation');
const bq = require('../db/BigQueryClient');
const logger = require('../utils/logger');
const { getOverviewData } = require('../db/queries/overview');
const { getFinancialData } = require('../db/queries/financial');
const { getAttendanceData } = require('../db/queries/attendance');
const { getCallOutcomesData } = require('../db/queries/callOutcomes');
const { getSalesCycleData } = require('../db/queries/salesCycle');
const { getObjectionsData } = require('../db/queries/objections');
const { getProjectionsData } = require('../db/queries/projections');
const { getViolationsData } = require('../db/queries/violations');
const { getAdherenceData } = require('../db/queries/adherence');

const router = express.Router();

// All dashboard routes require client authentication
router.use(clientIsolation);

/**
 * Build the standard response envelope.
 * Every dashboard endpoint returns this shape.
 */
function buildResponse(sections, charts, tables, meta) {
  return {
    success: true,
    data: { sections, charts: charts || {}, tables: tables || {} },
    meta,
  };
}

/**
 * Build metadata from the request context.
 * Included in every response for debugging/display.
 */
function buildMeta(req) {
  return {
    client_id: req.clientId,
    tier: req.tier,
    dateRange: {
      start: req.query.dateStart || null,
      end: req.query.dateEnd || null,
    },
    filters: {
      closerId: req.query.closerId || null,
    },
    bqConnected: bq.isAvailable(),
    isDemo: req.isDemo || false,
  };
}

// ── Overview (All Tiers) ──────────────────────────────────────────

router.get('/overview', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    const result = await getOverviewData(req.clientId, { dateStart, dateEnd, closerId }, req.tier);
    res.json(buildResponse(result.sections, result.charts, {}, buildMeta(req)));
  } catch (err) {
    logger.error('Overview endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load overview data' });
  }
});

// ── Financial (Insight+) ─────────────────────────────────────────

router.get('/financial', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    const result = await getFinancialData(req.clientId, { dateStart, dateEnd, closerId }, req.tier);
    res.json(buildResponse(result.sections, result.charts, result.tables || {}, buildMeta(req)));
  } catch (err) {
    logger.error('Financial endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load financial data' });
  }
});

// ── Attendance (Insight+) ────────────────────────────────────────

router.get('/attendance', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    const result = await getAttendanceData(req.clientId, { dateStart, dateEnd, closerId }, req.tier);
    res.json(buildResponse(result.sections, result.charts, result.tables || {}, buildMeta(req)));
  } catch (err) {
    logger.error('Attendance endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load attendance data' });
  }
});

// ── Call Outcomes (Insight+) ─────────────────────────────────────

router.get('/call-outcomes', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    const result = await getCallOutcomesData(req.clientId, { dateStart, dateEnd, closerId }, req.tier);
    const response = buildResponse(result.sections, result.charts, result.tables || {}, buildMeta(req));
    // Funnel data is a separate top-level key for Call Outcomes
    if (result.funnel) response.data.funnel = result.funnel;
    res.json(response);
  } catch (err) {
    logger.error('Call outcomes endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load call outcomes data' });
  }
});

// ── Sales Cycle (Insight+) ──────────────────────────────────────

router.get('/sales-cycle', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    const result = await getSalesCycleData(req.clientId, { dateStart, dateEnd, closerId }, req.tier);
    res.json(buildResponse(result.sections, result.charts, result.tables || {}, buildMeta(req)));
  } catch (err) {
    logger.error('Sales cycle endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load sales cycle data' });
  }
});

// ── Objections (Insight+) ───────────────────────────────────────

router.get('/objections', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId, objectionType } = req.query;
    const result = await getObjectionsData(
      req.clientId,
      { dateStart, dateEnd, closerId, objectionType },
      req.tier
    );
    res.json(buildResponse(result.sections, result.charts, result.tables || {}, buildMeta(req)));
  } catch (err) {
    logger.error('Objections endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load objections data' });
  }
});

// ── Projections (Insight+) ──────────────────────────────────────

router.get('/projections', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    const result = await getProjectionsData(req.clientId, { dateStart, dateEnd, closerId }, req.tier);
    const response = buildResponse(result.sections, result.charts, {}, buildMeta(req));
    // Add projection baseline data to the response -- the frontend projection
    // engine needs these raw numbers for its ratio-based calculations
    response.data.projectionBaseline = result.projectionBaseline;
    res.json(response);
  } catch (err) {
    logger.error('Projections endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load projections data' });
  }
});

// ── Goals Save (Insight+) ───────────────────────────────────────

router.put('/goals', async (req, res) => {
  try {
    const { monthly_goal, quarterly_goal, yearly_goal } = req.body;

    // Validate input — all must be non-negative numbers
    const goals = { monthly_goal, quarterly_goal, yearly_goal };
    for (const [key, val] of Object.entries(goals)) {
      if (val == null || typeof val !== 'number' || val < 0) {
        return res.status(400).json({
          success: false,
          error: `Invalid ${key}: must be a non-negative number`,
        });
      }
    }

    if (bq.isAvailable()) {
      // Real BQ mode: UPDATE Clients table
      // TODO: Implement when BQ credentials are available
      // await bq.runQuery(`UPDATE ... SET monthly_goal=@m, quarterly_goal=@q, yearly_goal=@y WHERE client_id=@clientId`, { ... });
      logger.info('Goals save (BQ mode not yet implemented)', { clientId: req.clientId, goals });
    } else {
      // Demo mode: log and return success without persisting
      logger.debug('Goals save (demo mode)', { clientId: req.clientId, goals });
    }

    res.json({
      success: true,
      data: { monthly_goal, quarterly_goal, yearly_goal },
    });
  } catch (err) {
    logger.error('Goals save error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to save goals' });
  }
});

// ── Violations (Executive Only) ─────────────────────────────────

router.get('/violations', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    const result = await getViolationsData(req.clientId, { dateStart, dateEnd, closerId }, req.tier);
    res.json(buildResponse(result.sections, result.charts, result.tables || {}, buildMeta(req)));
  } catch (err) {
    logger.error('Violations endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load violations data' });
  }
});

// ── Adherence (Executive Only) ──────────────────────────────────

router.get('/adherence', async (req, res) => {
  try {
    const { dateStart, dateEnd, closerId } = req.query;
    const result = await getAdherenceData(req.clientId, { dateStart, dateEnd, closerId }, req.tier);
    res.json(buildResponse(result.sections, result.charts, result.tables || {}, buildMeta(req)));
  } catch (err) {
    logger.error('Adherence endpoint error', { error: err.message, clientId: req.clientId });
    res.status(500).json({ success: false, error: 'Failed to load adherence data' });
  }
});

module.exports = router;

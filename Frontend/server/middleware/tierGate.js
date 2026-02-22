/**
 * TIER GATE MIDDLEWARE
 *
 * Checks if the authenticated client's plan_tier allows access to the
 * requested resource. Returns 403 with an upgrade message if not.
 *
 * Usage in routes:
 *   const { requireTier } = require('../middleware/tierGate');
 *   router.get('/objections', clientIsolation, requireTier('insight'), handler);
 *   router.get('/violations', clientIsolation, requireTier('executive'), handler);
 *
 * Tier hierarchy: basic < insight < executive
 * A higher tier always has access to lower-tier resources.
 */

/**
 * Tier hierarchy — higher number = more access.
 * Used to check if the client's tier meets the minimum required.
 */
const TIER_LEVELS = {
  basic: 1,
  insight: 2,
  executive: 3,
};

/** Human-readable tier labels for upgrade messages */
const TIER_LABELS = {
  basic: 'Basic',
  insight: 'Insight',
  executive: 'Executive',
};

/**
 * Create a middleware that requires a minimum tier level.
 *
 * @param {string} requiredTier - Minimum tier: 'basic', 'insight', or 'executive'
 * @returns {function} Express middleware
 */
function requireTier(requiredTier) {
  const requiredLevel = TIER_LEVELS[requiredTier];

  if (!requiredLevel) {
    throw new Error(`Invalid tier: ${requiredTier}. Must be basic, insight, or executive.`);
  }

  return (req, res, next) => {
    // req.tier is set by clientIsolation middleware
    const clientLevel = TIER_LEVELS[req.tier] || 0;

    if (clientLevel >= requiredLevel) {
      return next();
    }

    // Client's tier is too low — return upgrade message
    return res.status(403).json({
      success: false,
      error: `Upgrade to ${TIER_LABELS[requiredTier]} tier to access this feature`,
      required_tier: requiredTier,
      current_tier: req.tier,
    });
  };
}

/**
 * Check if a tier meets the minimum required (utility function).
 * Useful outside of middleware context.
 *
 * @param {string} clientTier - The client's current tier
 * @param {string} requiredTier - The minimum tier needed
 * @returns {boolean}
 */
function tierMeetsMinimum(clientTier, requiredTier) {
  return (TIER_LEVELS[clientTier] || 0) >= (TIER_LEVELS[requiredTier] || 0);
}

module.exports = { requireTier, tierMeetsMinimum, TIER_LEVELS };

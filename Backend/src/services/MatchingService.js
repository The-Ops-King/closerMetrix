/**
 * MATCHING SERVICE — Three-Tier Payment-to-Call Matching
 *
 * When a payment webhook arrives, this service finds the right call record
 * using a priority chain:
 *
 * Tier 1: Email match — prospect_email against Calls table (existing behavior)
 * Tier 2: Exact name match — case-insensitive, trimmed comparison
 * Tier 3: Fuzzy name match — Jaro-Winkler against payers only (cash_collected > 0)
 *
 * Returns the matched call and which tier matched, or null if no match found.
 */

const callQueries = require('../db/queries/calls');
const fuzzyMatcher = require('../utils/FuzzyMatcher');
const logger = require('../utils/logger');

class MatchingService {
  /**
   * Finds the best matching call for a payment.
   *
   * @param {string} clientId — Client scope
   * @param {string} prospectEmail — Email from payment webhook
   * @param {string|null} prospectName — Name from payment webhook (may be null)
   * @returns {Object|null} { call, matchTier, matchScore } or null if no match
   */
  async findMatchingCall(clientId, prospectEmail, prospectName) {
    // Tier 1: Email match
    const emailMatch = await callQueries.findMostRecentShowForProspect(prospectEmail, clientId);
    if (emailMatch) {
      logger.info('Payment matched by email (Tier 1)', {
        clientId,
        prospectEmail,
        callId: emailMatch.call_id,
      });
      return { call: emailMatch, matchTier: 'email', matchScore: 1.0 };
    }

    // Tier 2: Exact name match (only if name is provided)
    if (prospectName) {
      const nameMatch = await callQueries.findCallByName(clientId, prospectName);
      if (nameMatch) {
        logger.info('Payment matched by exact name (Tier 2)', {
          clientId,
          prospectName,
          callId: nameMatch.call_id,
        });
        return { call: nameMatch, matchTier: 'exact_name', matchScore: 1.0 };
      }
    }

    // Tier 3: Fuzzy name match against payers only (only if name is provided)
    if (prospectName) {
      const payers = await callQueries.findCallsByPayers(clientId);
      if (payers.length > 0) {
        const fuzzyResult = fuzzyMatcher.findBestMatch(prospectName, payers);
        if (fuzzyResult) {
          logger.info('Payment matched by fuzzy name (Tier 3)', {
            clientId,
            prospectName,
            matchedName: fuzzyResult.call.prospect_name,
            callId: fuzzyResult.call.call_id,
            score: fuzzyResult.score.toFixed(4),
          });
          return {
            call: fuzzyResult.call,
            matchTier: 'fuzzy_name',
            matchScore: fuzzyResult.score,
          };
        }
      }
    }

    // No match found
    logger.warn('No matching call found for payment', {
      clientId,
      prospectEmail,
      prospectName,
    });
    return null;
  }
}

module.exports = new MatchingService();

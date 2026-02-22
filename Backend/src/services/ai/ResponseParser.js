/**
 * RESPONSE PARSER — AI Response Validation & Normalization
 *
 * The AI sometimes returns slightly wrong values (e.g., "Financial Objection"
 * instead of "financial", or scores of 11). This module:
 *
 * 1. Parses the JSON (strips markdown fences if present)
 * 2. Validates call_outcome against call-outcomes.js
 * 3. Validates each objection_type against objection-types.js (fuzzy match)
 * 4. Clamps scores to the valid range
 * 5. Sets defaults for any missing fields
 *
 * If the response is completely unparseable → returns { success: false, error }
 */

const callOutcomes = require('../../config/call-outcomes');
const objectionTypes = require('../../config/objection-types');
const scoringRubric = require('../../config/scoring-rubric');
const logger = require('../../utils/logger');

/** Pre-compute lookup maps for fast validation */
const OUTCOME_LABELS = callOutcomes.map(o => o.label);
const OUTCOME_KEYS = callOutcomes.map(o => o.key);
const OBJECTION_KEYS = objectionTypes.map(o => o.key);
const OBJECTION_LABELS = objectionTypes.map(o => o.label);
const SCORE_KEYS = scoringRubric.scoreTypes.map(s => s.key);
const SCORE_MIN = scoringRubric.scale.min;
const SCORE_MAX = scoringRubric.scale.max;

class ResponseParser {
  /**
   * Parses and validates an AI response string.
   *
   * @param {string} rawResponse — Raw text from the Anthropic API
   * @returns {Object} { success: true, data } or { success: false, error }
   */
  parse(rawResponse) {
    // Step 1: Extract JSON from response
    const json = this._extractJson(rawResponse);
    if (!json) {
      return {
        success: false,
        error: 'Could not extract valid JSON from AI response',
        rawResponse,
      };
    }

    // Step 2: Parse JSON
    let parsed;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      return {
        success: false,
        error: `JSON parse error: ${err.message}`,
        rawResponse,
      };
    }

    if (typeof parsed !== 'object' || parsed === null) {
      return {
        success: false,
        error: 'AI response is not a JSON object',
        rawResponse,
      };
    }

    // Step 3: Validate and normalize
    const normalized = this._normalize(parsed);

    return {
      success: true,
      data: normalized,
    };
  }

  /**
   * Extracts JSON from the AI response, handling common formatting issues:
   * - Markdown code fences (```json ... ```)
   * - Leading/trailing whitespace
   * - Preamble text before the JSON
   */
  _extractJson(raw) {
    if (!raw || typeof raw !== 'string') return null;

    let text = raw.trim();

    // Strip markdown code fences
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
      text = fenceMatch[1].trim();
    }

    // If it starts with {, assume it's JSON
    if (text.startsWith('{')) return text;

    // Try to find the first { and last }
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return text.slice(firstBrace, lastBrace + 1);
    }

    return null;
  }

  /**
   * Normalizes and validates all fields of the parsed response.
   */
  _normalize(parsed) {
    return {
      call_outcome: this._normalizeOutcome(parsed.call_outcome),
      scores: this._normalizeScores(parsed.scores),
      summary: this._normalizeString(parsed.summary, 'No summary provided'),
      objections: this._normalizeObjections(parsed.objections),
      coaching_notes: this._normalizeString(parsed.coaching_notes, null),
      disqualification_reason: this._normalizeString(parsed.disqualification_reason, null),
    };
  }

  /**
   * Validates call_outcome against the configured outcomes.
   * Tries exact match, then case-insensitive, then key match, then fuzzy.
   *
   * @param {string} outcome — Raw outcome from AI
   * @returns {string} Valid outcome label or 'Follow Up' as default
   */
  _normalizeOutcome(outcome) {
    if (!outcome || typeof outcome !== 'string') return 'Follow Up';

    const trimmed = outcome.trim();

    // Exact match on label
    if (OUTCOME_LABELS.includes(trimmed)) return trimmed;

    // Case-insensitive match on label
    const lowerTrimmed = trimmed.toLowerCase();
    const caseMatch = OUTCOME_LABELS.find(l => l.toLowerCase() === lowerTrimmed);
    if (caseMatch) return caseMatch;

    // Match on key (e.g., "closed_won" → "Closed - Won")
    const keyMatch = callOutcomes.find(o => o.key === lowerTrimmed.replace(/[\s-]/g, '_'));
    if (keyMatch) return keyMatch.label;

    // Fuzzy: check if any label is contained in the outcome or vice versa
    const fuzzyMatch = callOutcomes.find(o => {
      const oLower = o.label.toLowerCase();
      return lowerTrimmed.includes(oLower) || oLower.includes(lowerTrimmed);
    });
    if (fuzzyMatch) return fuzzyMatch.label;

    logger.warn('Unknown AI outcome, defaulting to Follow Up', { rawOutcome: outcome });
    return 'Follow Up';
  }

  /**
   * Validates and clamps all scores to the configured range.
   * Missing scores get null (not a default number — we don't fabricate scores).
   */
  _normalizeScores(scores) {
    const normalized = {};

    for (const key of SCORE_KEYS) {
      if (!scores || scores[key] == null) {
        normalized[key] = null;
        continue;
      }

      const val = Number(scores[key]);
      if (isNaN(val)) {
        normalized[key] = null;
        continue;
      }

      // Clamp to valid range
      normalized[key] = Math.min(SCORE_MAX, Math.max(SCORE_MIN, Math.round(val * 10) / 10));
    }

    return normalized;
  }

  /**
   * Validates and normalizes the objections array.
   * Each objection's type is fuzzy-matched against the config.
   */
  _normalizeObjections(objections) {
    if (!Array.isArray(objections)) return [];

    return objections
      .filter(o => o && typeof o === 'object')
      .map(o => ({
        objection_type: this._normalizeObjectionType(o.objection_type),
        objection_text: this._normalizeString(o.objection_text, ''),
        closer_response: this._normalizeString(o.closer_response, ''),
        was_overcome: Boolean(o.was_overcome),
        timestamp_approximate: this._normalizeString(o.timestamp_approximate, null),
      }));
  }

  /**
   * Matches an objection type against the configured types.
   * Tries exact key, then label, then fuzzy match.
   *
   * @param {string} type — Raw objection type from AI
   * @returns {string} Valid objection key or 'other'
   */
  _normalizeObjectionType(type) {
    if (!type || typeof type !== 'string') return 'other';

    const trimmed = type.trim();
    const lower = trimmed.toLowerCase();

    // Exact key match
    if (OBJECTION_KEYS.includes(lower)) return lower;
    if (OBJECTION_KEYS.includes(trimmed)) return trimmed;

    // Key match with underscore normalization
    const normalized = lower.replace(/[\s-]/g, '_');
    if (OBJECTION_KEYS.includes(normalized)) return normalized;

    // Label match (case-insensitive)
    const labelMatch = objectionTypes.find(o => o.label.toLowerCase() === lower);
    if (labelMatch) return labelMatch.key;

    // Fuzzy: check if any label or key is contained
    const fuzzyMatch = objectionTypes.find(o => {
      const oKey = o.key.toLowerCase();
      const oLabel = o.label.toLowerCase();
      return lower.includes(oKey) || oKey.includes(lower)
        || lower.includes(oLabel) || oLabel.includes(lower);
    });
    if (fuzzyMatch) return fuzzyMatch.key;

    logger.warn('Unknown objection type, defaulting to other', { rawType: type });
    return 'other';
  }

  /**
   * Safely normalizes a string value with a default fallback.
   */
  _normalizeString(value, defaultValue) {
    if (value == null || typeof value !== 'string') return defaultValue;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : defaultValue;
  }
}

module.exports = new ResponseParser();

/**
 * FUZZY NAME MATCHER
 *
 * Pure utility for matching payment names to call records using
 * Jaro-Winkler string similarity. No BigQuery dependency — takes
 * an array of calls and returns the best match above threshold.
 *
 * Used by MatchingService (Phase 3) as Tier 3 of the matching chain:
 * email → exact name → fuzzy name (this) against payers only.
 *
 * Jaro-Winkler is preferred over Levenshtein for person names because
 * it weights prefix similarity higher, which matches how names typically
 * vary (e.g., "Jon" vs "John", "Mike" vs "Michael").
 */

const config = require('../config');

/**
 * Computes the Jaro similarity between two strings.
 *
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @returns {number} Similarity score between 0 and 1
 */
function jaro(s1, s2) {
  if (s1 === s2) return 1.0;
  if (s1.length === 0 || s2.length === 0) return 0.0;

  const matchWindow = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  // Find matching characters
  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(i + matchWindow + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0.0;

  // Count transpositions
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  return (
    (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3
  );
}

/**
 * Computes the Jaro-Winkler similarity between two strings.
 * Adds a prefix bonus (up to 4 chars) to the Jaro score.
 *
 * @param {string} s1 - First string
 * @param {string} s2 - Second string
 * @param {number} [prefixScale=0.1] - Scaling factor for prefix bonus (standard: 0.1)
 * @returns {number} Similarity score between 0 and 1
 */
function jaroWinkler(s1, s2, prefixScale = 0.1) {
  const jaroScore = jaro(s1, s2);

  // Count common prefix (up to 4 chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(s1.length, s2.length, 4); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaroScore + prefix * prefixScale * (1 - jaroScore);
}

/**
 * Normalizes a name for comparison: trims whitespace, lowercases,
 * and collapses multiple spaces.
 *
 * @param {string} name - Raw name string
 * @returns {string} Normalized name
 */
function normalizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Finds the best-matching call record from an array of calls
 * using Jaro-Winkler similarity on prospect_name.
 *
 * Returns the highest-scoring match above the configured threshold,
 * or null if no match meets the threshold.
 *
 * @param {string} name - The name to match (from payment webhook)
 * @param {Array<Object>} calls - Array of call records with prospect_name field
 * @returns {{ call: Object, score: number } | null} Best match with score, or null
 */
function findBestMatch(name, calls) {
  const threshold = config.matching.jaroWinklerThreshold;
  const normalizedInput = normalizeName(name);

  if (!normalizedInput) return null;
  if (!calls || calls.length === 0) return null;

  let bestMatch = null;
  let bestScore = 0;

  for (const call of calls) {
    const callName = normalizeName(call.prospect_name);
    if (!callName) continue;

    const score = jaroWinkler(normalizedInput, callName);
    if (score > bestScore && score >= threshold) {
      bestScore = score;
      bestMatch = call;
    }
  }

  if (!bestMatch) return null;

  return { call: bestMatch, score: bestScore };
}

module.exports = { findBestMatch, jaroWinkler, normalizeName };

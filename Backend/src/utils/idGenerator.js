/**
 * ID GENERATOR
 *
 * Generates UUIDs for all entity primary keys (call_id, closer_id, etc.).
 * Uses crypto.randomUUID() which is available in Node.js 22+.
 *
 * Usage:
 *   const { generateId } = require('./utils/idGenerator');
 *   const callId = generateId();  // '550e8400-e29b-41d4-a716-446655440000'
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Generates a new UUID v4 string.
 * @returns {string} UUID like '550e8400-e29b-41d4-a716-446655440000'
 */
function generateId() {
  return uuidv4();
}

module.exports = { generateId };

/**
 * MASTER PROMPT ASSEMBLER
 *
 * Reads all .md prompt section files, substitutes variables, processes
 * conditionals, appends per-client overrides, and returns the assembled
 * system prompt (minus JSON response format — PromptBuilder adds that).
 *
 * EDITING THE PROMPT:
 * Open any .md file in this directory and edit it directly. What you
 * write is what the AI sees. Files are cached at startup for performance.
 *
 * VARIABLES: Use {{variable_name}} in .md files. Available variables:
 *   {{client_name}}              — Client display name
 *   {{closer_name}}              — Closer being evaluated
 *   {{script_template}}          — Client's sales script (empty if none)
 *   {{compliance_level}}         — none / light / medium / aggressive
 *   {{common_objections}}        — Client-specific objections to watch for
 *   {{disqualification_criteria}} — Client-specific DQ rules
 *
 * CONDITIONALS: Use {{#if var}}...{{/if}} and {{#unless var}}...{{/unless}}
 *   {{#if script_template}}Only shown when script exists{{/if}}
 *   {{#unless script_template}}Only shown when NO script{{/unless}}
 *
 * COMPLIANCE LEVELS: Use these special conditionals:
 *   {{#if compliance_none}}...{{/if}}
 *   {{#if compliance_light}}...{{/if}}
 *   {{#if compliance_medium}}...{{/if}}
 *   {{#if compliance_aggressive}}...{{/if}}
 */

const fs = require('fs');
const path = require('path');

// ── Section files in assembly order ──
const SECTION_ORDER = [
  'system-role',
  'scoring',
  'intro',
  'discovery',
  'transition',
  'pitch',
  'close',
  'objections',
  'outcomes',
  'compliance',
  'coaching',
  'prospect',
];

// ── Map section names to client override fields ──
const CLIENT_OVERRIDE_MAP = {
  'discovery': 'ai_prompt_discovery',
  'pitch': 'ai_prompt_pitch',
  'close': 'ai_prompt_close',
  'objections': 'ai_prompt_objections',
};

// ── Read and cache all .md files at startup ──
const sectionCache = {};
for (const section of SECTION_ORDER) {
  const filePath = path.join(__dirname, `${section}.md`);
  try {
    sectionCache[section] = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(`[master.js] Failed to read ${section}.md:`, err.message);
    sectionCache[section] = '';
  }
}

/**
 * Process {{#if var}}...{{/if}} and {{#unless var}}...{{/unless}} blocks.
 * Supports nested blocks. Non-greedy matching within each block.
 *
 * @param {string} text — Template text with conditionals
 * @param {Object} vars — Variable values (truthy/falsy determines inclusion)
 * @returns {string} Processed text with conditionals resolved
 */
function processConditionals(text, vars) {
  // Process {{#if var}}...{{/if}} — keep content if var is truthy
  let result = text.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (match, varName, content) => {
    return vars[varName] ? content : '';
  });

  // Process {{#unless var}}...{{/unless}} — keep content if var is falsy
  result = result.replace(/\{\{#unless\s+(\w+)\}\}([\s\S]*?)\{\{\/unless\}\}/g, (match, varName, content) => {
    return !vars[varName] ? content : '';
  });

  return result;
}

/**
 * Substitute {{variable}} placeholders with actual values.
 *
 * @param {string} text — Template text with placeholders
 * @param {Object} vars — Variable name → value mapping
 * @returns {string} Text with placeholders replaced
 */
function substituteVariables(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    // Don't substitute conditional block markers (handled by processConditionals)
    if (varName.startsWith('#') || varName === '/if' || varName === '/unless') return match;
    return vars[varName] !== undefined && vars[varName] !== null ? String(vars[varName]) : '';
  });
}

/**
 * Build the complete master prompt from .md sections + client overrides.
 *
 * @param {Object} clientSettings — Client record from BigQuery
 * @param {Object} [callMetadata] — { closer_name, call_type, etc. }
 * @returns {string} Assembled system prompt (without JSON response format)
 */
function buildMasterPrompt(clientSettings, callMetadata = {}) {
  const client = clientSettings || {};
  const settings = client.settings_json || {};
  const complianceLevel = settings.compliance_level || 'medium';

  // Build variable context for substitution and conditionals
  const vars = {
    client_name: client.name || '',
    closer_name: callMetadata.closer_name || '',
    script_template: client.script_template || '',
    compliance_level: complianceLevel,
    common_objections: client.common_objections || '',
    disqualification_criteria: client.disqualification_criteria || '',
    // Compliance level booleans for conditional blocks
    compliance_none: complianceLevel === 'none',
    compliance_light: complianceLevel === 'light',
    compliance_medium: complianceLevel === 'medium',
    compliance_aggressive: complianceLevel === 'aggressive',
  };

  // Assemble sections
  const parts = [];

  for (const section of SECTION_ORDER) {
    let content = sectionCache[section] || '';

    // Process conditionals first, then substitute variables
    content = processConditionals(content, vars);
    content = substituteVariables(content, vars);

    // Clean up excess blank lines from removed conditional blocks
    content = content.replace(/\n{3,}/g, '\n\n').trim();

    if (!content) continue;

    parts.push(content);

    // Append client override for this section (if any)
    const overrideField = CLIENT_OVERRIDE_MAP[section];
    if (overrideField && client[overrideField]) {
      parts.push(`\n**CLIENT-SPECIFIC OVERRIDE (takes precedence over defaults above):**\n${client[overrideField]}`);
    }
  }

  // Append client-level context sections (not tied to a specific .md section)
  const clientSections = [];

  if (client.ai_prompt_overall) {
    clientSections.push(`## CLIENT CONTEXT\n${client.ai_prompt_overall}`);
  }

  if (client.offer_name) {
    const offerParts = [`OFFER: ${client.offer_name}`];
    if (client.offer_price) offerParts[0] += ` — $${client.offer_price}`;
    if (client.offer_description) offerParts.push(client.offer_description);
    clientSections.push(`## OFFER DETAILS\n${offerParts.join('\n')}`);
  }

  if (client.script_template) {
    clientSections.push(`## SCRIPT TEMPLATE — SCORE ADHERENCE AGAINST THIS\nThis is the proven sales script this team is expected to follow. Use it as the PRIMARY lens for scoring each call section. The closer should be hitting every key beat in this script while making it feel natural and conversational.\n\n${client.script_template}`);
  }

  if (client.disqualification_criteria) {
    clientSections.push(`## DISQUALIFICATION CRITERIA\n${client.disqualification_criteria}`);
  }

  if (client.common_objections) {
    clientSections.push(`## KNOWN COMMON OBJECTIONS\n${client.common_objections}`);
  }

  if (client.ai_context_notes) {
    clientSections.push(`## ADDITIONAL CONTEXT\n${client.ai_context_notes}`);
  }

  if (clientSections.length > 0) {
    parts.push(`\n# CLIENT-SPECIFIC INSTRUCTIONS\n\n${clientSections.join('\n\n')}`);
  }

  return parts.join('\n\n');
}

/**
 * Force-reload all .md files from disk. Useful for development/testing
 * when editing prompt files without restarting the server.
 */
function reloadSections() {
  for (const section of SECTION_ORDER) {
    const filePath = path.join(__dirname, `${section}.md`);
    try {
      sectionCache[section] = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error(`[master.js] Failed to reload ${section}.md:`, err.message);
    }
  }
}

module.exports = { buildMasterPrompt, reloadSections, SECTION_ORDER };

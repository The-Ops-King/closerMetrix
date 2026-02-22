/**
 * RISK REVIEW TABLE — The Executive Tier Money Feature
 *
 * Detailed table showing SEC/FTC risk flags with exact phrases, timestamps,
 * closer names, risk categories, and links to recordings/transcripts.
 * This is the single most valuable component in the Executive tier —
 * it shows clients EXACTLY what their closers said that could get them in trouble.
 *
 * Props:
 *   rows: Array<{
 *     date: string,            — ISO date or formatted date string
 *     closer: string,          — closer name
 *     callType: string,        — "First Call" or "Follow-Up"
 *     riskCategory: string,    — "Claims" | "Guarantees" | "Earnings" | "Pressure"
 *     timestamp: string,       — minute:second in the call, e.g. "12:34"
 *     exactPhrase: string,     — the actual words flagged (the key column)
 *     whyFlagged: string,      — plain English explanation of why this is a risk
 *     recordingUrl: string,    — link to call recording (opens at timestamp)
 *     transcriptUrl: string,   — link to full transcript
 *   }>
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';

/**
 * Maps risk category names to their accent colors.
 * Claims = red (dangerous), Guarantees = amber (warning),
 * Earnings = magenta (financial), Pressure = purple (behavioral).
 */
const RISK_CATEGORY_COLORS = {
  Claims: COLORS.neon.red,
  Guarantees: COLORS.neon.amber,
  Earnings: COLORS.neon.magenta,
  Pressure: COLORS.neon.purple,
};

/**
 * Returns the accent color for a given risk category.
 * Falls back to red if the category is unrecognized.
 * @param {string} category — risk category name
 * @returns {string} — hex color
 */
function getCategoryColor(category) {
  return RISK_CATEGORY_COLORS[category] || COLORS.neon.red;
}

/**
 * Format a date string into a short readable format.
 * If the date is already formatted, pass it through.
 * @param {string} dateStr — ISO date or pre-formatted string
 * @returns {string} — formatted date like "Jan 15, 2026" or the original string
 */
function formatDate(dateStr) {
  if (!dateStr) return '\u2014';
  try {
    const d = new Date(dateStr);
    // Guard against invalid dates — return original string if parsing fails
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export default function RiskReviewTable({ rows }) {
  /* Empty state — no risk flags found */
  if (!rows || rows.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography sx={{ color: COLORS.text.muted }}>
          No risk flags found for this period
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        width: '100%',
        overflowX: 'auto',
        borderRadius: 2,
        border: `1px solid ${COLORS.border.subtle}`,
        backgroundColor: COLORS.bg.secondary,
      }}
    >
      <Box
        component="table"
        sx={{
          width: '100%',
          borderCollapse: 'collapse',
          /* --- Header cells --- */
          '& th': {
            padding: '10px 12px',
            textAlign: 'left',
            borderBottom: `1px solid ${COLORS.border.subtle}`,
            color: COLORS.text.secondary,
            fontSize: '0.7rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            backgroundColor: COLORS.bg.tertiary,
            whiteSpace: 'nowrap',
          },
          /* --- Body cells --- */
          '& td': {
            padding: '10px 12px',
            textAlign: 'left',
            borderBottom: `1px solid ${COLORS.border.subtle}`,
            color: COLORS.text.primary,
            fontSize: '0.8rem',
            verticalAlign: 'top',
          },
          /* Remove bottom border on last row */
          '& tr:last-child td': {
            borderBottom: 'none',
          },
          /* Row hover — red tint for violations theme */
          '& tbody tr:hover td': {
            backgroundColor: 'rgba(255, 51, 102, 0.03)',
          },
        }}
      >
        <thead>
          <tr>
            <th>Date</th>
            <th>Closer</th>
            <th>Call Type</th>
            <th>Risk Category</th>
            <th>Timestamp</th>
            <th style={{ minWidth: 200 }}>Exact Phrase</th>
            <th>Why Flagged</th>
            <th>Recording</th>
            <th>Transcript</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const categoryColor = getCategoryColor(row.riskCategory);

            return (
              <tr key={idx}>
                {/* Date — muted, left-aligned */}
                <td style={{ color: COLORS.text.muted, whiteSpace: 'nowrap' }}>
                  {formatDate(row.date)}
                </td>

                {/* Closer — bold name */}
                <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {row.closer || '\u2014'}
                </td>

                {/* Call Type — subtle pill/badge */}
                <td>
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: 500,
                      letterSpacing: '0.03em',
                      backgroundColor: 'rgba(148, 163, 184, 0.1)',
                      color: COLORS.text.secondary,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.callType || '\u2014'}
                  </Box>
                </td>

                {/* Risk Category — color-coded pill */}
                <td>
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-block',
                      padding: '2px 10px',
                      borderRadius: '10px',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      letterSpacing: '0.03em',
                      backgroundColor: `${categoryColor}26`,
                      color: categoryColor,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.riskCategory || '\u2014'}
                  </Box>
                </td>

                {/* Timestamp — monospace, small, muted */}
                <td
                  style={{
                    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                    fontSize: '0.75rem',
                    color: COLORS.text.muted,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.timestamp || '\u2014'}
                </td>

                {/* Exact Phrase — the key column, italic, quoted */}
                <td
                  style={{
                    minWidth: 200,
                    maxWidth: 360,
                    fontStyle: 'italic',
                    color: COLORS.text.primary,
                    lineHeight: 1.5,
                  }}
                >
                  {row.exactPhrase ? `\u201C${row.exactPhrase}\u201D` : '\u2014'}
                </td>

                {/* Why Flagged — secondary text, smaller font */}
                <td
                  style={{
                    color: COLORS.text.secondary,
                    fontSize: '0.75rem',
                    maxWidth: 280,
                    lineHeight: 1.5,
                  }}
                >
                  {row.whyFlagged || '\u2014'}
                </td>

                {/* Recording — cyan "Play" link */}
                <td>
                  {row.recordingUrl ? (
                    <Box
                      component="a"
                      href={row.recordingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        color: COLORS.neon.cyan,
                        textDecoration: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        letterSpacing: '0.03em',
                        cursor: 'pointer',
                        transition: 'opacity 0.15s ease',
                        '&:hover': {
                          opacity: 0.8,
                          textDecoration: 'underline',
                        },
                      }}
                    >
                      Play
                    </Box>
                  ) : (
                    <span style={{ color: COLORS.text.muted }}>{'\u2014'}</span>
                  )}
                </td>

                {/* Transcript — purple "View" link */}
                <td>
                  {row.transcriptUrl ? (
                    <Box
                      component="a"
                      href={row.transcriptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{
                        color: COLORS.neon.purple,
                        textDecoration: 'none',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        letterSpacing: '0.03em',
                        cursor: 'pointer',
                        transition: 'opacity 0.15s ease',
                        '&:hover': {
                          opacity: 0.8,
                          textDecoration: 'underline',
                        },
                      }}
                    >
                      View
                    </Box>
                  ) : (
                    <span style={{ color: COLORS.text.muted }}>{'\u2014'}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Box>
    </Box>
  );
}

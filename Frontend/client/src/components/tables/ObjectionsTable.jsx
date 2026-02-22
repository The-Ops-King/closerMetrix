/**
 * OBJECTIONS TABLE — Objection Type Summary
 *
 * Displays objection types with totals, resolved counts, and resolution rates.
 * Uses a simple styled table (not MUI DataGrid) to keep it lightweight.
 *
 * Props:
 *   rows: Array<{ type: string, total: number, resolved: number, resRate: number }>
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';

/**
 * Format a decimal as a percentage string.
 * @param {number|null} value — decimal between 0 and 1
 * @returns {string} — e.g. "73.2%" or em-dash for null
 */
function formatPercent(value) {
  if (value == null) return '\u2014';
  return (value * 100).toFixed(1) + '%';
}

export default function ObjectionsTable({ rows }) {
  if (!rows || rows.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <Typography sx={{ color: COLORS.text.muted }}>No objection data available</Typography>
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
          '& th, & td': {
            padding: '12px 16px',
            textAlign: 'left',
            borderBottom: `1px solid ${COLORS.border.subtle}`,
          },
          '& th': {
            color: COLORS.text.secondary,
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            backgroundColor: COLORS.bg.tertiary,
          },
          '& td': {
            color: COLORS.text.primary,
            fontSize: '0.875rem',
          },
          '& tr:last-child td': {
            borderBottom: 'none',
          },
          '& tr:hover td': {
            backgroundColor: 'rgba(77, 212, 232, 0.03)',
          },
        }}
      >
        <thead>
          <tr>
            <th>Objection Type</th>
            <th style={{ textAlign: 'right' }}>Total</th>
            <th style={{ textAlign: 'right' }}>Resolved</th>
            <th style={{ textAlign: 'right' }}>Unresolved</th>
            <th style={{ textAlign: 'right' }}>Resolution Rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const unresolved = row.total - row.resolved;
            const rateColor = row.resRate >= 0.6
              ? COLORS.neon.green
              : row.resRate >= 0.4
                ? COLORS.neon.amber
                : COLORS.neon.red;

            return (
              <tr key={idx}>
                <td style={{ fontWeight: 500 }}>{row.type}</td>
                <td style={{ textAlign: 'right' }}>{row.total}</td>
                <td style={{ textAlign: 'right', color: COLORS.neon.green }}>{row.resolved}</td>
                <td style={{ textAlign: 'right', color: COLORS.neon.red }}>{unresolved}</td>
                <td style={{ textAlign: 'right', color: rateColor, fontWeight: 600 }}>
                  {formatPercent(row.resRate)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Box>
    </Box>
  );
}

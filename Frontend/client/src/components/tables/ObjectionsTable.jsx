/**
 * OBJECTIONS TABLE — Objection Type / Closer Summary
 *
 * Displays objection data with totals, resolved counts, and resolution rates.
 * Wrapped in a card container matching ChartWrapper's visual treatment so it
 * sits cleanly beside charts in grid layouts.
 *
 * Props:
 *   rows: Array<{ type|closer: string, total: number, resolved: number, resRate: number }>
 *   variant: 'type' | 'closer' — controls first column header and row key (default: 'type')
 *   title: string | null — header label rendered via SectionHeader
 *   accentColor: string — accent border-top color (defaults to cyan)
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS, LAYOUT } from '../../theme/constants';
import { hexToRgba } from '../../utils/colors';
import SectionHeader from '../SectionHeader';

/**
 * Format a decimal as a percentage string.
 * @param {number|null} value — decimal between 0 and 1
 * @returns {string} — e.g. "73.2%" or em-dash for null
 */
function formatPercent(value) {
  if (value == null) return '\u2014';
  return (value * 100).toFixed(1) + '%';
}

export default function ObjectionsTable({ rows, variant = 'type', title, accentColor = COLORS.neon.cyan }) {
  const firstColHeader = variant === 'closer' ? 'Closer' : 'Objection Type';
  const firstColKey = variant === 'closer' ? 'closer' : 'type';

  return (
    <Box
      sx={{
        backgroundColor: COLORS.bg.secondary,
        border: `1px solid ${COLORS.border.subtle}`,
        borderTop: `2px solid ${hexToRgba(accentColor, 0.3)}`,
        borderRadius: `${LAYOUT.cardBorderRadius}px`,
        padding: { xs: 1.5, md: 3 },
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        overflow: 'hidden',
        '&:hover': {
          borderColor: 'rgba(255, 255, 255, 0.06)',
          borderTopColor: hexToRgba(accentColor, 0.3),
          boxShadow: '0 0 25px rgba(0, 0, 0, 0.4)',
        },
      }}
    >
      {/* Title — uses SectionHeader to match ChartWrapper */}
      {title && (
        <Box sx={{ mb: 2 }}>
          <SectionHeader title={title} color={accentColor} size="sm" />
        </Box>
      )}

      {/* Empty state */}
      {(!rows || rows.length === 0) ? (
        <Box sx={{ textAlign: 'center', py: 4, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography sx={{ color: COLORS.text.muted }}>No objection data available</Typography>
        </Box>
      ) : (
        <Box
          sx={{
            width: '100%',
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
            borderRadius: 1,
            border: `1px solid ${COLORS.border.subtle}`,
            flex: 1,
          }}
        >
          <Box
            component="table"
            sx={{
              width: '100%',
              minWidth: 420,
              borderCollapse: 'collapse',
              '& th, & td': {
                padding: { xs: '8px 8px', md: '10px 14px' },
                textAlign: 'left',
                borderBottom: `1px solid ${COLORS.border.subtle}`,
              },
              '& th': {
                color: COLORS.text.secondary,
                fontSize: '0.7rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                backgroundColor: COLORS.bg.tertiary,
              },
              '& td': {
                color: COLORS.text.primary,
                fontSize: '0.825rem',
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
                <th>{firstColHeader}</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Resolved</th>
                <th style={{ textAlign: 'right' }}>Unresolved</th>
                <th style={{ textAlign: 'right' }}>Res. Rate</th>
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
                    <td style={{ fontWeight: 500 }}>{row[firstColKey]}</td>
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
      )}
    </Box>
  );
}

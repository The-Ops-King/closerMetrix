/**
 * TOP PERFORMERS — Ranked Closer Leaderboard
 *
 * Displays a ranked list of top closers with numbered color circles,
 * deal counts, and revenue amounts. Part of the "Sales Command Center" look.
 *
 * Props:
 *   closers: Array<{ name: string, dealsClosed: number, revenue: number }>
 *     — Ordered from top performer to lowest
 *   title: string — Section title (defaults to "Top Performers")
 *
 * Visual Design:
 *   - Dark card container with subtle border
 *   - Each closer gets a row with:
 *     - Numbered circle (colored: 1=green, 2=cyan, 3=blue, 4=purple, 5=amber)
 *     - Name + "X deals closed" subtitle
 *     - Revenue amount (right-aligned, colored to match rank)
 *   - Rows separated by subtle borders
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS, LAYOUT, PALETTES } from '../../theme/constants';
import { fmtDollar } from '../../utils/formatters';
import { hexToRgba } from '../../utils/colors';
import SectionHeader from '../SectionHeader';

export default function TopPerformers({
  closers = [],
  title = 'Top Performers',
}) {
  if (!closers || closers.length === 0) return null;

  return (
    <Box
      sx={{
        backgroundColor: COLORS.bg.secondary,
        border: `1px solid ${COLORS.border.subtle}`,
        borderRadius: `${LAYOUT.cardBorderRadius}px`,
        overflow: 'hidden',
      }}
    >
      {/* Section header with accent bar */}
      <Box sx={{ px: 3, py: 2, borderBottom: `1px solid ${COLORS.border.subtle}` }}>
        <SectionHeader title={title} color={COLORS.neon.green} />
      </Box>

      {/* Closer rows */}
      {closers.map((closer, index) => {
        const rankColor = PALETTES.rank[index % PALETTES.rank.length];
        const isLast = index === closers.length - 1;

        return (
          <Box
            key={closer.name || index}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              px: 3,
              py: 1.5,
              borderBottom: isLast ? 'none' : `1px solid ${COLORS.border.subtle}`,
              transition: 'background-color 0.2s ease',
              '&:hover': {
                backgroundColor: hexToRgba(rankColor, 0.05),
              },
            }}
          >
            {/* Rank number circle */}
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                backgroundColor: hexToRgba(rankColor, 0.15),
                border: `1.5px solid ${hexToRgba(rankColor, 0.5)}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Typography
                sx={{
                  color: rankColor,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                }}
              >
                {index + 1}
              </Typography>
            </Box>

            {/* Name + deals subtitle */}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                sx={{
                  color: COLORS.text.primary,
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  lineHeight: 1.3,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {closer.name}
              </Typography>
              <Typography
                sx={{
                  color: COLORS.text.muted,
                  fontSize: '0.75rem',
                  fontWeight: 400,
                }}
              >
                {closer.dealsClosed} deals closed
              </Typography>
            </Box>

            {/* Revenue amount — colored to match rank */}
            <Typography
              sx={{
                color: rankColor,
                fontSize: '0.95rem',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {fmtDollar(closer.revenue)}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}

/**
 * CLOSER CHAMPION — Hero card for the #1 ranked closer
 *
 * Displayed as a prominent card with green glow (always active, not just hover),
 * crown icon, Power Score badge, and 6 key stat chips.
 *
 * Props:
 *   name: string — closer's name
 *   powerScore: number (0-100) — composite Power Score
 *   stats: Array<{ label: string, value: string }> — 6 formatted stat chips
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS, LAYOUT } from '../../theme/constants';
import { hexToRgba } from '../../utils/colors';
import PowerScoreBadge from './PowerScoreBadge';

/** Simple crown SVG icon */
function CrownIcon({ size = 28, color = COLORS.neon.amber }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M2 17L3.5 8L7.5 12L12 4L16.5 12L20.5 8L22 17H2Z"
        fill={hexToRgba(color, 0.25)}
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      <rect x="2" y="17" width="20" height="2.5" rx="1" fill={color} opacity="0.7" />
    </svg>
  );
}

export default function CloserChampion({ name, powerScore = 0, stats = [] }) {
  if (!name) return null;

  return (
    <Box
      sx={{
        backgroundColor: COLORS.bg.secondary,
        border: `1.5px solid ${hexToRgba(COLORS.neon.green, 0.4)}`,
        borderRadius: `${LAYOUT.cardBorderRadius}px`,
        boxShadow: `0 0 24px ${hexToRgba(COLORS.neon.green, 0.15)}, inset 0 0 16px ${hexToRgba(COLORS.neon.green, 0.05)}`,
        p: 3,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        height: '100%',
      }}
    >
      {/* Header row: crown + name + power score */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <CrownIcon />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              color: COLORS.text.muted,
              fontSize: '0.7rem',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              mb: 0.25,
            }}
          >
            #1 Closer
          </Typography>
          <Typography
            sx={{
              color: COLORS.neon.green,
              fontSize: '1.4rem',
              fontWeight: 800,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {name}
          </Typography>
        </Box>
        <PowerScoreBadge score={powerScore} size={56} color={COLORS.neon.green} />
      </Box>

      {/* Power Score label */}
      <Typography
        sx={{
          color: COLORS.text.muted,
          fontSize: '0.7rem',
          fontWeight: 500,
          textAlign: 'right',
          mt: -1.5,
          letterSpacing: '0.05em',
        }}
      >
        POWER SCORE
      </Typography>

      {/* 6 stat chips in a 3x2 grid */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1,
        }}
      >
        {stats.slice(0, 6).map((stat) => (
          <Box
            key={stat.label}
            sx={{
              backgroundColor: hexToRgba(COLORS.neon.green, 0.05),
              border: `1px solid ${hexToRgba(COLORS.neon.green, 0.15)}`,
              borderRadius: '8px',
              px: 1.5,
              py: 1,
              textAlign: 'center',
            }}
          >
            <Typography
              sx={{
                color: COLORS.text.primary,
                fontSize: '1rem',
                fontWeight: 700,
                lineHeight: 1.2,
              }}
            >
              {stat.value}
            </Typography>
            <Typography
              sx={{
                color: COLORS.text.muted,
                fontSize: '0.6rem',
                fontWeight: 500,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                mt: 0.25,
              }}
            >
              {stat.label}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

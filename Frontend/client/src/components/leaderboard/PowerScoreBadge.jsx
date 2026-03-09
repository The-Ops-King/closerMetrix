/**
 * POWER SCORE BADGE — Circular composite score indicator
 *
 * Displays a 0-100 composite "Power Score" as a circular badge with
 * a colored ring and glow effect. Used in CloserChampion and comparison table.
 *
 * Props:
 *   score: number (0-100) — the composite power score
 *   size: number (default 56) — badge diameter in px
 *   color: string (hex) — ring/text color (defaults to COLORS.neon.green)
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { COLORS } from '../../theme/constants';
import { hexToRgba } from '../../utils/colors';

export default function PowerScoreBadge({ score = 0, size = 56, color }) {
  const resolvedColor = color || COLORS.neon.green;
  const displayScore = Math.round(score);

  const tooltip = 'Power Score is a weighted composite of Revenue (30%), Close Rate (25%), Cash (15%), Show Rate (10%), Call Quality (10%), and Objection Handling (10%), ranked against other closers.';

  return (
    <Tooltip title={tooltip} arrow placement="top">
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: hexToRgba(resolvedColor, 0.1),
        border: `2px solid ${hexToRgba(resolvedColor, 0.6)}`,
        boxShadow: `0 0 12px ${hexToRgba(resolvedColor, 0.3)}, inset 0 0 8px ${hexToRgba(resolvedColor, 0.1)}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <Typography
        sx={{
          color: resolvedColor,
          fontSize: size * 0.35,
          fontWeight: 800,
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        {displayScore}
      </Typography>
    </Box>
    </Tooltip>
  );
}

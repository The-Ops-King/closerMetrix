/**
 * SECTION HEADER — Reusable accent bar + title.
 *
 * Consolidates the identical section header pattern from ScorecardRow,
 * ScorecardGrid, ChartWrapper, TronFunnelChart, and TopPerformers.
 *
 * Props:
 *   title: string        — Section heading text
 *   color: string        — Accent bar color (defaults to cyan)
 *   size: 'md' | 'sm'   — 'md' = 24px bar, uppercase (scorecards/funnel/leaderboard)
 *                          'sm' = 20px bar, normal case (ChartWrapper)
 */

import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../theme/constants';

export default function SectionHeader({ title, color = COLORS.neon.cyan, size = 'md' }) {
  const isSm = size === 'sm';
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box
        sx={{
          width: 4,
          height: isSm ? 20 : 24,
          backgroundColor: color,
          borderRadius: 2,
          flexShrink: 0,
        }}
      />
      <Typography
        sx={{
          color: COLORS.text.primary,
          fontSize: isSm ? '1rem' : '1.1rem',
          fontWeight: 600,
          letterSpacing: isSm ? '0.03em' : '0.05em',
          textTransform: isSm ? 'none' : 'uppercase',
        }}
      >
        {title}
      </Typography>
    </Box>
  );
}

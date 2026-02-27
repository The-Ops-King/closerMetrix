/**
 * DATA ANALYSIS PAGE — COMING SOON PLACEHOLDER
 *
 * Available to all tiers (basic+). Shows a centered "Coming Soon" message
 * with the query_stats icon matching the nav item.
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';
import SectionHeader from '../../components/SectionHeader';

export default function DataAnalysisPage() {
  return (
    <Box>
      <SectionHeader title="Data Analysis" />

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 360,
          gap: 2,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 56, color: COLORS.neon.cyan, opacity: 0.5 }}
        >
          query_stats
        </span>
        <Typography
          variant="h5"
          sx={{ color: COLORS.text.primary, fontWeight: 600 }}
        >
          Coming Soon
        </Typography>
        <Typography
          sx={{ color: COLORS.text.muted, fontSize: '0.9rem', maxWidth: 400, textAlign: 'center' }}
        >
          Ask questions about your data in plain English and get instant answers,
          charts, and insights powered by AI.
        </Typography>
      </Box>
    </Box>
  );
}

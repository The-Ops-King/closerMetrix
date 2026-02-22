/**
 * SCORECARD GRID — Section Layout with Title and Grid of Scorecards
 *
 * Wraps a group of <Scorecard> components in a titled, responsive grid layout.
 * Used for dashboard sections like "Volume / Activity", "Attendance", "Revenue Reality", etc.
 *
 * Each section gets:
 *   - A subtle divider line at the top (separates from previous section)
 *   - A section title with a colored vertical accent bar on the left
 *   - A responsive CSS Grid of scorecard cards (4 columns desktop, 2 mobile)
 *
 * Props:
 *   title: string         — Section heading (e.g. "Volume / Activity")
 *   metrics: object       — Same shape as ScorecardRow:
 *     {
 *       totalCalls: { value: 312, label: 'Total Calls', format: 'number' },
 *       showRate:   { value: 0.73, label: 'Show Rate', format: 'percent', delta: 2.1 },
 *       ...
 *     }
 *   glowColor: string     — Default glow color for all cards in this grid (defaults to cyan)
 *   sectionColor: string  — Color for the section title accent bar (defaults to glowColor)
 *   columns: number       — Number of grid columns at full width (default 4, responsive to 2)
 *   lockedKeys: string[]  — Metric keys to render as locked (tier upsell teaser)
 *   onLockedClick: func   — Handler called when a locked card is clicked (receives metric key)
 *
 * Renders nothing if metrics is null, undefined, or empty.
 */

import React from 'react';
import Box from '@mui/material/Box';
import { COLORS, LAYOUT } from '../../theme/constants';
import Scorecard from './Scorecard';
import SectionHeader from '../SectionHeader';

export default function ScorecardGrid({
  title,
  metrics,
  glowColor = COLORS.neon.cyan,
  sectionColor,
  columns = 4,
  lockedKeys = [],
  onLockedClick = null,
}) {
  // Guard: render nothing if no metrics provided
  if (!metrics || typeof metrics !== 'object' || Object.keys(metrics).length === 0) {
    return null;
  }

  // Convert lockedKeys array to a Set for O(1) lookup
  const lockedSet = new Set(lockedKeys);

  // Accent bar color defaults to the section's glowColor
  const accentColor = sectionColor || glowColor;

  return (
    <Box sx={{ width: '100%' }}>
      {/* Subtle top divider — separates this section from the one above */}
      <Box
        sx={{
          borderTop: `1px solid ${COLORS.border.subtle}`,
          marginBottom: '16px',
          paddingTop: '24px',
        }}
      >
        {/* Section title with colored left accent bar */}
        {title && (
          <Box sx={{ mb: 2 }}>
            <SectionHeader title={title} color={accentColor} />
          </Box>
        )}
      </Box>

      {/* Responsive grid of scorecard cards — equal height, full width */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: `repeat(${Math.min(columns, 3)}, 1fr)`,
            lg: `repeat(${columns}, 1fr)`,
          },
          gridAutoRows: '1fr',
          gap: '16px',
        }}
      >
        {Object.entries(metrics).map(([key, metric]) => {
          const isLocked = lockedSet.has(key);

          return (
            <Scorecard
              key={key}
              label={metric.label || key}
              value={metric.value}
              format={metric.format || 'number'}
              delta={metric.delta != null ? metric.delta : null}
              deltaLabel={metric.deltaLabel || null}
              desiredDirection={metric.desiredDirection || 'up'}
              glowColor={metric.glowColor || glowColor}
              locked={isLocked}
              onClick={isLocked && onLockedClick ? () => onLockedClick(key) : null}
            />
          );
        })}
      </Box>
    </Box>
  );
}

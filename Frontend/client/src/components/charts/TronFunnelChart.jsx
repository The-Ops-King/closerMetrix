/**
 * TRON FUNNEL CHART — Horizontal Funnel Bars
 *
 * Displays a conversion funnel as horizontal bars where each stage
 * is a different color and the bars decrease in width to show drop-off.
 *
 * Stages: Leads → Qualified → Proposal → Negotiation → Closed
 * Colors: cyan → blue → purple → amber → green
 *
 * Props:
 *   data: Array<{ stage: string, count: number, color?: string }>
 *     — Ordered from top of funnel to bottom
 *   title: string — Section title (defaults to "Conversion Pipeline")
 *
 * Visual Design:
 *   - Dark card container matching Tron theme
 *   - Each stage is a horizontal bar with rounded corners
 *   - Bar width is proportional to count relative to the first stage
 *   - Stage label and count shown on each bar
 *   - Drop-off percentage shown between stages
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS, LAYOUT, PALETTES } from '../../theme/constants';
import { fmtNumber } from '../../utils/formatters';
import { hexToRgba } from '../../utils/colors';
import SectionHeader from '../SectionHeader';

export default function TronFunnelChart({
  data = [],
  title = 'Conversion Pipeline',
}) {
  if (!data || data.length === 0) return null;

  // Max count is the first stage (top of funnel)
  const maxCount = data[0]?.count || 1;

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
        <SectionHeader title={title} />
      </Box>

      {/* Funnel bars */}
      <Box sx={{ px: 3, py: 3, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {data.map((stage, index) => {
          const stageColor = stage.color || PALETTES.funnel[index % PALETTES.funnel.length];
          const widthPct = Math.max((stage.count / maxCount) * 100, 8); // Min 8% width so it's visible
          const prevCount = index > 0 ? data[index - 1].count : null;
          const dropOff = prevCount ? ((prevCount - stage.count) / prevCount * 100).toFixed(0) : null;

          return (
            <Box key={stage.stage || index}>
              {/* Drop-off indicator between stages */}
              {dropOff !== null && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    py: 0.25,
                    pl: 1,
                  }}
                >
                  <Box
                    sx={{
                      width: 0,
                      height: 0,
                      borderLeft: '4px solid transparent',
                      borderRight: '4px solid transparent',
                      borderTop: `5px solid ${COLORS.text.muted}`,
                    }}
                  />
                  <Typography
                    sx={{
                      color: COLORS.text.muted,
                      fontSize: '0.65rem',
                      fontWeight: 500,
                    }}
                  >
                    -{dropOff}% drop-off
                  </Typography>
                </Box>
              )}

              {/* Stage bar */}
              <Box sx={{ position: 'relative' }}>
                {/* Background track */}
                <Box
                  sx={{
                    width: '100%',
                    height: 48,
                    borderRadius: 2,
                    backgroundColor: hexToRgba(stageColor, 0.06),
                  }}
                />

                {/* Filled bar */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: `${widthPct}%`,
                    height: 48,
                    borderRadius: 2,
                    background: `linear-gradient(90deg, ${hexToRgba(stageColor, 0.3)} 0%, ${hexToRgba(stageColor, 0.15)} 100%)`,
                    border: `1px solid ${hexToRgba(stageColor, 0.4)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 1.5,
                    minWidth: 120,
                    transition: 'width 0.6s ease',
                  }}
                >
                  {/* Stage name */}
                  <Typography
                    sx={{
                      color: COLORS.text.primary,
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {stage.stage}
                  </Typography>

                  {/* Count */}
                  <Typography
                    sx={{
                      color: stageColor,
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {fmtNumber(stage.count)}
                  </Typography>
                </Box>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Overall conversion rate */}
      {data.length >= 2 && (
        <Box
          sx={{
            px: 3,
            py: 1.5,
            borderTop: `1px solid ${COLORS.border.subtle}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.75rem' }}>
            Overall Conversion
          </Typography>
          <Typography
            sx={{
              color: COLORS.neon.green,
              fontSize: '0.9rem',
              fontWeight: 700,
            }}
          >
            {((data[data.length - 1].count / data[0].count) * 100).toFixed(1)}%
          </Typography>
        </Box>
      )}
    </Box>
  );
}

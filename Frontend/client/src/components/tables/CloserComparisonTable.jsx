/**
 * CLOSER COMPARISON TABLE — Metric x Closer matrix
 *
 * Rows are metrics, columns are closers. Top 3 in each row get
 * rank-colored highlights (green/cyan/blue from PALETTES.rank).
 * Sticky first column for metric names. Horizontally scrollable on mobile.
 *
 * Props:
 *   closers: Array<string> — closer names (column headers)
 *   metrics: Array<{ label: string, key: string, format: string, values: number[], desiredDirection: 'up'|'down' }>
 *     — each metric has an array of values aligned with the closers array
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS, LAYOUT, PALETTES } from '../../theme/constants';
import { hexToRgba } from '../../utils/colors';
import { formatMetric } from '../../utils/formatters';
import SectionHeader from '../SectionHeader';

/** Get rank positions for values in a row (1-indexed). desiredDirection='down' means lower is better. */
function getRanks(values, desiredDirection = 'up') {
  const indexed = values.map((v, i) => ({ v, i }));
  const sorted = [...indexed].sort((a, b) =>
    desiredDirection === 'down' ? a.v - b.v : b.v - a.v
  );
  const ranks = new Array(values.length).fill(0);
  sorted.forEach((item, rank) => {
    ranks[item.i] = rank + 1;
  });
  return ranks;
}

export default function CloserComparisonTable({ closers = [], metrics = [] }) {
  if (!closers.length || !metrics.length) return null;

  return (
    <Box
      sx={{
        backgroundColor: COLORS.bg.secondary,
        border: `1px solid ${COLORS.border.subtle}`,
        borderRadius: `${LAYOUT.cardBorderRadius}px`,
        overflow: 'hidden',
      }}
    >
      <Box sx={{ px: 3, py: 2, borderBottom: `1px solid ${COLORS.border.subtle}` }}>
        <SectionHeader title="Head-to-Head Comparison" color={COLORS.neon.cyan} />
      </Box>

      <Box sx={{ overflowX: 'auto' }}>
        <Box
          component="table"
          sx={{
            width: '100%',
            borderCollapse: 'collapse',
            minWidth: closers.length > 3 ? 600 : 'auto',
          }}
        >
          {/* Header row — closer names */}
          <thead>
            <tr>
              <Box
                component="th"
                sx={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  backgroundColor: COLORS.bg.tertiary,
                  borderBottom: `1px solid ${COLORS.border.subtle}`,
                  px: 2,
                  py: 1.5,
                  textAlign: 'left',
                  minWidth: 140,
                }}
              >
                <Typography sx={{ color: COLORS.text.muted, fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Metric
                </Typography>
              </Box>
              {closers.map((name) => (
                <Box
                  component="th"
                  key={name}
                  sx={{
                    backgroundColor: COLORS.bg.tertiary,
                    borderBottom: `1px solid ${COLORS.border.subtle}`,
                    px: 2,
                    py: 1.5,
                    textAlign: 'center',
                    minWidth: 100,
                  }}
                >
                  <Typography sx={{ color: COLORS.text.primary, fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {name}
                  </Typography>
                </Box>
              ))}
            </tr>
          </thead>

          <tbody>
            {metrics.map((metric) => {
              // Group header row — spans all columns
              if (metric.type === 'group') {
                return (
                  <tr key={metric.key}>
                    <Box
                      component="td"
                      colSpan={closers.length + 1}
                      sx={{
                        backgroundColor: COLORS.bg.tertiary,
                        borderBottom: `1px solid ${COLORS.border.subtle}`,
                        borderTop: `2px solid ${hexToRgba(metric.color || COLORS.neon.cyan, 0.3)}`,
                        px: 2,
                        py: 0.75,
                      }}
                    >
                      <Typography sx={{ color: metric.color || COLORS.neon.cyan, fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        {metric.label}
                      </Typography>
                    </Box>
                  </tr>
                );
              }

              const ranks = getRanks(metric.values, metric.desiredDirection);
              return (
                <tr key={metric.key}>
                  {/* Metric label — sticky */}
                  <Box
                    component="td"
                    sx={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 1,
                      backgroundColor: COLORS.bg.secondary,
                      borderBottom: `1px solid ${COLORS.border.subtle}`,
                      px: 2,
                      py: 1.25,
                    }}
                  >
                    <Typography sx={{ color: COLORS.text.secondary, fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap' }}>
                      {metric.label}
                    </Typography>
                  </Box>

                  {/* Values — colored by rank */}
                  {metric.values.map((value, colIdx) => {
                    const rank = ranks[colIdx];
                    const rankColor = rank <= 3 ? PALETTES.rank[rank - 1] : null;
                    return (
                      <Box
                        component="td"
                        key={colIdx}
                        sx={{
                          borderBottom: `1px solid ${COLORS.border.subtle}`,
                          px: 2,
                          py: 1.25,
                          textAlign: 'center',
                          backgroundColor: rankColor ? hexToRgba(rankColor, 0.06) : 'transparent',
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75 }}>
                          {rank <= 3 && (
                            <Box
                              sx={{
                                width: 18,
                                height: 18,
                                borderRadius: '50%',
                                backgroundColor: hexToRgba(rankColor, 0.2),
                                border: `1px solid ${hexToRgba(rankColor, 0.5)}`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >
                              <Typography sx={{ color: rankColor, fontSize: '0.6rem', fontWeight: 700 }}>
                                {rank}
                              </Typography>
                            </Box>
                          )}
                          <Typography
                            sx={{
                              color: rankColor || COLORS.text.secondary,
                              fontSize: '0.85rem',
                              fontWeight: rank === 1 ? 700 : rank <= 3 ? 600 : 400,
                            }}
                          >
                            {formatMetric(value, metric.format)}
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </Box>
      </Box>
    </Box>
  );
}

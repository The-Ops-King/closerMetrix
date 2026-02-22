/**
 * ChartWrapper — Wraps every chart with consistent loading/error/empty states.
 *
 * This component handles the three non-happy-path states so that individual
 * chart components only need to worry about rendering data. Every chart in
 * the dashboard is wrapped with this component.
 *
 * Visual: Dark card container with subtle colored accent bar on the title,
 * matching the overall Tron/Sales Command Center theme.
 *
 * States:
 *   loading  -> Pulsing skeleton rectangles (dark gray, Tron-style)
 *   error    -> Red-tinted card with the error message
 *   isEmpty  -> "No data for selected period" centered message
 *   success  -> Renders children (the actual chart)
 *
 * Usage:
 *   <ChartWrapper loading={isLoading} error={error} isEmpty={!data?.length} title="Revenue Over Time">
 *     <TronLineChart data={data} series={series} />
 *   </ChartWrapper>
 */

import React from 'react';
import { Box, Typography, Skeleton } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { COLORS, LAYOUT } from '../../theme/constants';
import { hexToRgba } from '../../utils/colors';
import SectionHeader from '../SectionHeader';

/**
 * @param {Object} props
 * @param {boolean} props.loading - Whether data is still being fetched
 * @param {string|null} props.error - Error message string, or null if no error
 * @param {boolean} props.isEmpty - Whether the data set is empty after loading
 * @param {string} props.title - Chart title displayed above the chart
 * @param {string} [props.subtitle] - Optional subtitle / description
 * @param {string} [props.accentColor] - Color for the title accent bar (defaults to cyan)
 * @param {number} [props.height=350] - Height of the chart area in pixels
 * @param {boolean} [props.locked=false] - When true, renders children blurred with lock overlay (for tier gating)
 * @param {React.ReactNode} props.children - The chart component to render on success
 */
export default function ChartWrapper({
  loading = false,
  error = null,
  isEmpty = false,
  title,
  subtitle,
  accentColor = COLORS.neon.cyan,
  height = 350,
  locked = false,
  children,
}) {
  return (
    <Box
      sx={{
        backgroundColor: COLORS.bg.secondary,
        border: `1px solid ${COLORS.border.subtle}`,
        borderTop: `2px solid ${hexToRgba(accentColor, 0.3)}`,
        borderRadius: `${LAYOUT.cardBorderRadius}px`,
        padding: 3,
        transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
        '&:hover': {
          borderColor: 'rgba(255, 255, 255, 0.06)',
          borderTopColor: hexToRgba(accentColor, 0.3),
          boxShadow: `0 0 25px rgba(0, 0, 0, 0.4)`,
        },
      }}
    >
      {/* Chart title with colored accent bar */}
      {title && (
        <Box sx={{ mb: subtitle ? 0.5 : 2 }}>
          <SectionHeader title={title} color={accentColor} size="sm" />
        </Box>
      )}
      {subtitle && (
        <Typography
          variant="body2"
          sx={{
            color: COLORS.text.muted,
            fontSize: '0.8rem',
            mb: 2,
            pl: '22px', // align with title text (past accent bar)
          }}
        >
          {subtitle}
        </Typography>
      )}

      {/* ── LOCKED STATE ── render children blurred with lock overlay */}
      {locked && (
        <Box sx={{ position: 'relative', height }}>
          <Box
            sx={{
              filter: 'blur(8px)',
              pointerEvents: 'none',
              userSelect: 'none',
              opacity: 0.6,
              height: '100%',
            }}
          >
            {children}
          </Box>
          <Box
            sx={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}
          >
            <LockOutlinedIcon sx={{ color: COLORS.text.muted, fontSize: '2rem' }} />
          </Box>
        </Box>
      )}

      {/* ── LOADING STATE ── */}
      {!locked && loading && (
        <Box sx={{ height, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end', height: '100%' }}>
            <Skeleton
              variant="rectangular"
              width={40}
              height="80%"
              sx={{
                bgcolor: COLORS.bg.elevated,
                borderRadius: '4px',
                animation: 'pulse 1.5s ease-in-out infinite',
                '@keyframes pulse': {
                  '0%': { opacity: 0.4 },
                  '50%': { opacity: 0.7 },
                  '100%': { opacity: 0.4 },
                },
              }}
            />
            <Skeleton
              variant="rectangular"
              sx={{
                flex: 1,
                height: '100%',
                bgcolor: COLORS.bg.elevated,
                borderRadius: '4px',
                animation: 'pulse 1.5s ease-in-out 0.2s infinite',
                '@keyframes pulse': {
                  '0%': { opacity: 0.4 },
                  '50%': { opacity: 0.7 },
                  '100%': { opacity: 0.4 },
                },
              }}
            />
          </Box>
          <Skeleton
            variant="rectangular"
            height={20}
            sx={{
              bgcolor: COLORS.bg.elevated,
              borderRadius: '4px',
              ml: '48px',
              animation: 'pulse 1.5s ease-in-out 0.4s infinite',
              '@keyframes pulse': {
                '0%': { opacity: 0.4 },
                '50%': { opacity: 0.7 },
                '100%': { opacity: 0.4 },
              },
            }}
          />
        </Box>
      )}

      {/* ── ERROR STATE ── */}
      {!locked && !loading && error && (
        <Box
          sx={{
            height,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(255, 51, 102, 0.05)',
            border: `1px solid rgba(255, 51, 102, 0.2)`,
            borderRadius: '8px',
          }}
        >
          <Typography
            sx={{
              color: COLORS.neon.red,
              fontSize: '1rem',
              fontWeight: 600,
              mb: 1,
            }}
          >
            Failed to load chart
          </Typography>
          <Typography
            sx={{
              color: COLORS.text.muted,
              fontSize: '0.85rem',
              textAlign: 'center',
              maxWidth: '400px',
              px: 2,
            }}
          >
            {error}
          </Typography>
        </Box>
      )}

      {/* ── EMPTY STATE ── */}
      {!locked && !loading && !error && isEmpty && (
        <Box
          sx={{
            height,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            sx={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              border: `2px solid ${COLORS.border.default}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mb: 2,
            }}
          >
            <Typography sx={{ color: COLORS.text.muted, fontSize: '1.5rem' }}>
              --
            </Typography>
          </Box>
          <Typography
            sx={{
              color: COLORS.text.secondary,
              fontSize: '0.9rem',
            }}
          >
            No data for selected period
          </Typography>
        </Box>
      )}

      {/* ── SUCCESS STATE ── */}
      {!locked && !loading && !error && !isEmpty && (
        <Box sx={{ height }}>
          {children}
        </Box>
      )}
    </Box>
  );
}

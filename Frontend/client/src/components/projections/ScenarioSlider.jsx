/**
 * SCENARIO SLIDER -- Zero-Centered Range Slider
 *
 * Interactive slider for adjusting a metric by +/- from baseline.
 * Zero-centered: positive fills right in accent color, negative fills left in red.
 * Thumb has neon glow shadow (Tron upgrade).
 *
 * Props:
 *   label: string       -- "Show Rate"
 *   value: number       -- Current adjustment value (e.g., 3.5 for +3.5%)
 *   onChange: function   -- (newValue) => void
 *   range: number       -- Symmetric range (e.g., 15 = -15 to +15)
 *   step: number        -- Step increment (e.g., 0.5)
 *   unit: string        -- Display unit ("%" or "")
 *   color: string       -- Neon accent color for positive fill + thumb
 *   formatVal: function -- Optional custom value formatter (e.g., for dollar amounts)
 */

import React from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { COLORS } from '../../theme/constants';

export default function ScenarioSlider({
  label,
  value,
  onChange,
  range,
  step,
  unit = '',
  color,
  formatVal,
}) {
  const min = -range;
  const max = range;
  const pct = ((value - min) / (max - min)) * 100;
  const displayVal = formatVal ? formatVal(value) : value;
  const fillLeft = value >= 0 ? 50 : pct;
  const fillWidth = value >= 0 ? pct - 50 : 50 - pct;

  return (
    <Box sx={{ flex: 1, minWidth: 220 }}>
      {/* Label + current value */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
        <Typography
          sx={{
            fontSize: '0.7rem',
            fontWeight: 600,
            color: COLORS.text.secondary,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}
        >
          {label}
        </Typography>
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color }}>
          {value > 0 ? '+' : ''}{displayVal}{unit}
        </Typography>
      </Box>

      {/* Slider track */}
      <Box sx={{ position: 'relative', height: 28, display: 'flex', alignItems: 'center' }}>
        {/* Background track */}
        <Box
          sx={{
            position: 'absolute',
            width: '100%',
            height: 6,
            backgroundColor: COLORS.bg.primary,
            borderRadius: 3,
          }}
        />

        {/* Center marker */}
        <Box
          sx={{
            position: 'absolute',
            left: '50%',
            width: 2,
            height: 14,
            backgroundColor: COLORS.text.muted,
            borderRadius: 1,
            transform: 'translateX(-1px)',
          }}
        />

        {/* Fill bar (from center to current position) */}
        <Box
          sx={{
            position: 'absolute',
            left: `${fillLeft}%`,
            width: `${fillWidth}%`,
            height: 6,
            backgroundColor: value === 0 ? 'transparent' : value < 0 ? COLORS.neon.red : color,
            borderRadius: 3,
            transition: 'all 0.05s',
            opacity: 0.7,
          }}
        />

        {/* Hidden range input for interaction */}
        <Box
          component="input"
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          sx={{
            position: 'absolute',
            width: '100%',
            height: 28,
            opacity: 0,
            cursor: 'pointer',
            margin: 0,
          }}
        />

        {/* Thumb indicator (visual only, follows the hidden input) */}
        <Box
          sx={{
            position: 'absolute',
            left: `calc(${pct}% - 9px)`,
            width: 18,
            height: 18,
            backgroundColor: color,
            borderRadius: '50%',
            boxShadow: `0 0 10px ${color}66`,
            pointerEvents: 'none',
            transition: 'left 0.05s',
          }}
        />
      </Box>

      {/* Min / 0 / Max labels */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.25 }}>
        <Typography sx={{ fontSize: '0.6rem', color: COLORS.text.muted }}>
          {formatVal ? formatVal(-range) : -range}{unit}
        </Typography>
        <Typography sx={{ fontSize: '0.6rem', color: COLORS.text.muted }}>
          0{unit}
        </Typography>
        <Typography sx={{ fontSize: '0.6rem', color: COLORS.text.muted }}>
          +{formatVal ? formatVal(range) : range}{unit}
        </Typography>
      </Box>
    </Box>
  );
}

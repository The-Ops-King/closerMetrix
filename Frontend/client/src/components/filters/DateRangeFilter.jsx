/**
 * DATE RANGE FILTER — Looker/Airtable-style Popover Picker
 *
 * A compact button that displays the current date selection label (e.g. "This Month",
 * "Last Quarter", "Jan 15 - Feb 17"). Clicking it opens a popover with 3 mode tabs:
 *
 *   Mode 1 — "This":    [Week] [Month] [Quarter] [Year] relative to today
 *   Mode 2 — "Last":    [Week] [Month] [Quarter] [Year] for the previous period
 *   Mode 3 — "Between": Two date inputs with an "Apply" button for custom ranges
 *
 * Reads/writes to FilterContext via useFilters().
 * dateRange shape: { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
 *
 * Default on initial load: "This Month" (start of current month to today).
 */

import React, { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import isoWeek from 'dayjs/plugin/isoWeek';
import { useFilters } from '../../context/FilterContext';
import { COLORS } from '../../theme/constants';

// Extend dayjs with quarter and ISO week (Monday-start) support
dayjs.extend(quarterOfYear);
dayjs.extend(isoWeek);

/** Period options for "This" mode */
const THIS_PERIODS = ['Week', 'Month', 'Quarter', 'Year'];
/** Period options for "Last" mode — includes day-count presets */
const LAST_PERIODS = ['Week', 'Month', 'Quarter', 'Year', '30 Days', '60 Days', '90 Days', '180 Days'];
const FMT = 'YYYY-MM-DD';

/**
 * Calculate the start and end dates for a "This {period}" selection.
 * "This" means from the start of the current period up to today.
 *
 * @param {'Week'|'Month'|'Quarter'|'Year'} period
 * @returns {{ start: string, end: string }}
 */
function calcThisPeriod(period) {
  const today = dayjs();
  const unitMap = { Week: 'isoWeek', Month: 'month', Quarter: 'quarter', Year: 'year' };
  const unit = unitMap[period] || 'month';
  return { start: today.startOf(unit).format(FMT), end: today.format(FMT) };
}

/**
 * Calculate the start and end dates for a "Last {period}" selection.
 * "Last" means the full previous period (e.g. last month = first to last day).
 *
 * @param {'Week'|'Month'|'Quarter'|'Year'} period
 * @returns {{ start: string, end: string }}
 */
function calcLastPeriod(period) {
  const today = dayjs();

  // Handle day-count periods (e.g. "30 Days" → last 30 days from today)
  const dayMatch = period.match(/^(\d+)\s*Days$/);
  if (dayMatch) {
    const days = parseInt(dayMatch[1], 10);
    return { start: today.subtract(days, 'day').format(FMT), end: today.format(FMT) };
  }

  const unitMap = { Week: 'isoWeek', Month: 'month', Quarter: 'quarter', Year: 'year' };
  const unit = unitMap[period] || 'month';
  // For isoWeek, subtract 1 week then get start/end of that week
  const base = unit === 'isoWeek'
    ? today.startOf('isoWeek').subtract(1, 'week')
    : today.subtract(1, unit === 'quarter' ? 'quarter' : unit);
  return { start: base.startOf(unit).format(FMT), end: base.endOf(unit).format(FMT) };
}

/**
 * Format a date range into a human-readable label for the "Between" mode.
 * Example: "Jan 15 - Feb 17, 2026" or "Dec 15, 2025 - Feb 17, 2026"
 *
 * @param {string} start — YYYY-MM-DD
 * @param {string} end   — YYYY-MM-DD
 * @returns {string}
 */
function formatRangeLabel(start, end) {
  const s = dayjs(start);
  const e = dayjs(end);
  const sFmt = s.year() === e.year() ? 'MMM D' : 'MMM D, YYYY';
  return `${s.format(sFmt)} - ${e.format('MMM D, YYYY')}`;
}

/* ─── Shared sx factories ─────────────────────────────────────────────── */

/** Mode tab button sx (This / Last / Between) */
const modeTabSx = (active) => ({
  flex: 1, fontSize: '0.75rem', fontWeight: active ? 600 : 400,
  letterSpacing: '0.04em', textTransform: 'none', borderRadius: 0, minHeight: 36,
  color: active ? COLORS.neon.cyan : COLORS.text.secondary,
  backgroundColor: active ? 'rgba(77, 212, 232, 0.10)' : 'transparent',
  borderBottom: active ? `2px solid ${COLORS.neon.cyan}` : '2px solid transparent',
  '&:hover': {
    backgroundColor: active ? 'rgba(77, 212, 232, 0.14)' : 'rgba(255,255,255,0.04)',
    color: active ? COLORS.neon.cyan : COLORS.text.primary,
  },
});

/** Period option button sx (Week / Month / Quarter / Year) */
const periodBtnSx = (active) => ({
  flex: 1, fontSize: '0.75rem', fontWeight: active ? 600 : 400,
  textTransform: 'none', borderRadius: '6px', minHeight: 34,
  color: active ? COLORS.neon.cyan : COLORS.text.secondary,
  backgroundColor: active ? 'rgba(77, 212, 232, 0.12)' : COLORS.bg.tertiary,
  border: `1px solid ${active ? COLORS.neon.cyan : COLORS.border.subtle}`,
  boxShadow: active ? '0 0 8px rgba(77, 212, 232, 0.25)' : 'none',
  '&:hover': {
    backgroundColor: active ? 'rgba(77, 212, 232, 0.18)' : COLORS.bg.elevated,
    borderColor: active ? COLORS.neon.cyan : COLORS.border.default,
    color: active ? COLORS.neon.cyan : COLORS.text.primary,
  },
});

/** Shared sx for the dark-themed date <input> fields in "Between" mode */
const dateInputSx = {
  fontSize: '0.8rem', color: COLORS.text.primary,
  backgroundColor: COLORS.bg.tertiary, borderRadius: '6px',
  '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.border.subtle },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.border.default },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: COLORS.neon.cyan, boxShadow: '0 0 6px rgba(77, 212, 232, 0.25)',
  },
  '& input::-webkit-calendar-picker-indicator': { filter: 'invert(0.7)' },
};

/** Shared sx for the tiny uppercase labels above date inputs */
const dateLabelSx = {
  fontSize: '0.68rem', fontWeight: 500, color: COLORS.text.muted,
  textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5,
};

/* ─── Component ───────────────────────────────────────────────────────── */

export default function DateRangeFilter() {
  const { dateRange, setDateRange } = useFilters();

  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);

  // Active mode tab: 'this' | 'last' | 'between'
  const [mode, setMode] = useState('this');
  // Human-readable label shown on the trigger button
  const [label, setLabel] = useState('This Month');
  // Which period button is highlighted (null when in "between" mode)
  const [activePeriod, setActivePeriod] = useState('Month');
  // Temporary state for the "Between" custom range inputs
  const [betweenStart, setBetweenStart] = useState('');
  const [betweenEnd, setBetweenEnd] = useState('');

  const handleOpen = useCallback((e) => setAnchorEl(e.currentTarget), []);
  const handleClose = useCallback(() => setAnchorEl(null), []);

  /**
   * Handle a "This {period}" or "Last {period}" selection.
   * Calculates dates, updates context, sets label, and closes the popover.
   */
  const handlePresetSelect = useCallback((selectedMode, period) => {
    const range = selectedMode === 'this' ? calcThisPeriod(period) : calcLastPeriod(period);
    setDateRange(range);
    setLabel(`${selectedMode === 'this' ? 'This' : 'Last'} ${period}`);
    setMode(selectedMode);
    setActivePeriod(period);
    setAnchorEl(null);
  }, [setDateRange]);

  /**
   * Apply the custom "Between" date range.
   * Validates both dates are present and start <= end.
   */
  const handleBetweenApply = useCallback(() => {
    if (!betweenStart || !betweenEnd) return;
    if (dayjs(betweenStart).isAfter(dayjs(betweenEnd))) return;
    setDateRange({ start: betweenStart, end: betweenEnd });
    setLabel(formatRangeLabel(betweenStart, betweenEnd));
    setMode('between');
    setActivePeriod(null);
    setAnchorEl(null);
  }, [betweenStart, betweenEnd, setDateRange]);

  /**
   * Switch mode tabs. Pre-fill "Between" inputs with the current date range.
   */
  const handleModeChange = useCallback((newMode) => {
    setMode(newMode);
    if (newMode === 'between') {
      setBetweenStart(dateRange.start);
      setBetweenEnd(dateRange.end);
    }
  }, [dateRange]);

  return (
    <>
      {/* ── Trigger Button ── */}
      <Button
        onClick={handleOpen}
        size="small"
        startIcon={<CalendarTodayIcon sx={{ fontSize: 16 }} />}
        sx={{
          backgroundColor: COLORS.bg.tertiary,
          border: `1px solid ${COLORS.border.subtle}`,
          borderRadius: '8px', color: COLORS.neon.cyan,
          fontSize: '0.8rem', fontWeight: 500, textTransform: 'none',
          px: 1.5, py: 0.6, minHeight: 34,
          '&:hover': { backgroundColor: COLORS.bg.elevated, borderColor: COLORS.border.default },
        }}
      >
        {label}
      </Button>

      {/* ── Popover ── */}
      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 0.5, backgroundColor: COLORS.bg.secondary, width: 280,
              border: `1px solid ${COLORS.border.default}`, borderRadius: '10px',
              overflow: 'hidden',
            },
          },
        }}
      >
        {/* ── Mode Tabs: [This] [Last] [Between] ── */}
        <Box sx={{ display: 'flex', borderBottom: `1px solid ${COLORS.border.subtle}` }}>
          {['this', 'last', 'between'].map((m) => (
            <Button key={m} onClick={() => handleModeChange(m)} sx={modeTabSx(mode === m)} disableRipple>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </Button>
          ))}
        </Box>

        {/* ── Period Grid (This / Last modes) ── */}
        {(mode === 'this' || mode === 'last') && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, p: 1.5 }}>
            {(mode === 'this' ? THIS_PERIODS : LAST_PERIODS).map((period) => {
              const isActive = activePeriod === period && label === `${mode === 'this' ? 'This' : 'Last'} ${period}`;
              return (
                <Button
                  key={period}
                  onClick={() => handlePresetSelect(mode, period)}
                  sx={periodBtnSx(isActive)}
                  disableRipple
                >
                  {period}
                </Button>
              );
            })}
          </Box>
        )}

        {/* ── Between Mode: Custom Date Inputs ── */}
        {mode === 'between' && (
          <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box>
              <Typography sx={dateLabelSx}>Start Date</Typography>
              <TextField
                type="date" value={betweenStart} size="small" fullWidth
                onChange={(e) => setBetweenStart(e.target.value)}
                InputProps={{ sx: dateInputSx }}
              />
            </Box>
            <Box>
              <Typography sx={dateLabelSx}>End Date</Typography>
              <TextField
                type="date" value={betweenEnd} size="small" fullWidth
                onChange={(e) => setBetweenEnd(e.target.value)}
                InputProps={{ sx: dateInputSx }}
              />
            </Box>
            <Button
              onClick={handleBetweenApply}
              disabled={!betweenStart || !betweenEnd}
              fullWidth
              sx={{
                mt: 0.5, fontSize: '0.8rem', fontWeight: 600, textTransform: 'none',
                color: COLORS.bg.primary, backgroundColor: COLORS.neon.cyan,
                borderRadius: '6px', minHeight: 34,
                '&:hover': { backgroundColor: '#00d4e0' },
                '&.Mui-disabled': { backgroundColor: COLORS.bg.elevated, color: COLORS.text.muted },
              }}
            >
              Apply
            </Button>
          </Box>
        )}
      </Popover>
    </>
  );
}

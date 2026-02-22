/**
 * GOALS & PACING — Revenue pacing + goal-setting section
 *
 * Ported from Tyler's standalone goals app (The-Ops-King/goals/index.html).
 * Now uses full-width layout with standard Scorecard component.
 *
 * Layout:
 *   1. Section header: "Pacing & Goals"
 *   2. Pacing rows (Weekly / Monthly / Quarterly / Yearly)
 *      Each row = period label + 4 cards: [Goal] [Revenue] [% to Goal] [Pace %]
 *      Cards use standard Scorecard component for consistency across all pages
 *   3. Goal inputs: horizontal row — Monthly / Quarterly / Yearly + Update All
 *
 * Props:
 *   goals: { monthlyGoal, quarterlyGoal, yearlyGoal }
 *   actuals: { wtdRevenue, mtdRevenue, qtdRevenue, ytdRevenue }
 *   calendar: { dayOfMonth, daysInCurrentMonth, dayOfYear, daysInYear, dayOfQuarter, daysInQuarter }
 *   onGoalsSaved: () => void  — called after successful save to refetch data
 */

import React, { useState, useMemo, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import InputAdornment from '@mui/material/InputAdornment';
import Divider from '@mui/material/Divider';
import { COLORS } from '../../theme/constants';
import { useAuth } from '../../context/AuthContext';
import { apiPut } from '../../utils/api';
import Scorecard from '../scorecards/Scorecard';

// ── Helpers ────────────────────────────────────────────────────

/** Format number as currency string (e.g. 12345 → "$12,345") */
const fmtDollar = (n) => {
  if (n == null || isNaN(n)) return '$0';
  return '$' + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
};

/** Format decimal as percentage string (e.g. 0.736 → "73.6%") */
const fmtPct = (n) => {
  if (n == null || isNaN(n) || !isFinite(n)) return '—';
  return (n * 100).toFixed(1) + '%';
};

/** Format a number with commas for display in inputs */
const fmtNum = (n) => {
  if (n == null || isNaN(n)) return '';
  return Math.round(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
};

// ── Time Progress Functions (ported from goals app) ────────────

/** Fraction of the current week elapsed (Mon=start, Sun=end). Min 1/7. */
function getWeekProgress() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const adjusted = day === 0 ? 7 : day; // Mon=1 ... Sun=7
  return Math.max(adjusted / 7, 1 / 7);
}

/** Fraction of the current month elapsed */
function getMonthProgress(dayOfMonth, daysInCurrentMonth) {
  return dayOfMonth / daysInCurrentMonth;
}

/** Fraction of the current quarter elapsed */
function getQuarterProgress(dayOfQuarter, daysInQuarter) {
  return dayOfQuarter / daysInQuarter;
}

/** Fraction of the current year elapsed */
function getYearProgress(dayOfYear, daysInYear) {
  return dayOfYear / daysInYear;
}

// ── Color Logic (from goals app) ──────────────────────────

/**
 * Pace color: green (>=95%), orange (>=80%), red (<80%)
 */
function paceColor(pace) {
  if (pace >= 0.95) return COLORS.neon.green;
  if (pace >= 0.80) return COLORS.neon.amber;
  return COLORS.neon.red;
}

/** Pace label */
function paceLabel(pace) {
  if (pace >= 0.95) return 'On Pace';
  if (pace >= 0.80) return 'Slightly Behind';
  return 'Behind Pace';
}

/**
 * % to Goal color: green (>=100%), cyan (>=50%), orange (<50%)
 */
function pctColor(pct) {
  if (pct >= 1.0) return COLORS.neon.green;
  if (pct >= 0.5) return COLORS.neon.cyan;
  return COLORS.neon.amber;
}

// ── Pacing Row (4 cards for one time period) ──────────────

/**
 * A single pacing row: [Period Goal] [Period Revenue] [% to Goal] [Pace %]
 * Period label sits above the cards as a colored header.
 */
function PacingRow({ periodLabel, actual, goal, timeProgress }) {
  const pctOfGoal = goal > 0 ? actual / goal : 0;
  const pace = (goal > 0 && timeProgress > 0) ? (actual / goal) / timeProgress : 0;
  const hasGoal = goal > 0;

  return (
    <Box sx={{ py: 1.5 }}>
      {/* Period label */}
      <Typography
        sx={{
          fontSize: '0.8rem',
          fontWeight: 700,
          color: COLORS.neon.cyan,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          mb: 1,
        }}
      >
        {periodLabel}
      </Typography>

      {/* 4 cards in a row */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.25 }}>
        <Scorecard
          label={`${periodLabel} Goal`}
          value={hasGoal ? goal : NaN}
          format="currency"
          glowColor={COLORS.text.primary}
        />
        <Scorecard
          label={`${periodLabel} Revenue`}
          value={actual}
          format="currency"
          glowColor={COLORS.text.primary}
        />
        <Scorecard
          label="% to Goal"
          value={hasGoal ? pctOfGoal : NaN}
          format="percent"
          glowColor={hasGoal ? pctColor(pctOfGoal) : COLORS.text.muted}
        />
        <Scorecard
          label="Pace"
          value={hasGoal ? pace : NaN}
          format="percent"
          glowColor={hasGoal ? paceColor(pace) : COLORS.text.muted}
          subtitle={hasGoal ? paceLabel(pace) : undefined}
          subtitleColor={hasGoal ? paceColor(pace) : undefined}
        />
      </Box>
    </Box>
  );
}

// ── Goal Input with individual Update button ──────────────

function GoalInput({ label, value, onChange, onUpdate, saving, saved }) {
  const inputSx = {
    '& .MuiOutlinedInput-root': {
      backgroundColor: COLORS.bg.primary,
      color: COLORS.text.primary,
      fontSize: '0.9rem',
      '& fieldset': { borderColor: COLORS.border.default },
      '&:hover fieldset': { borderColor: COLORS.neon.cyan },
      '&.Mui-focused fieldset': {
        borderColor: COLORS.neon.cyan,
        boxShadow: `0 0 8px ${COLORS.neon.cyan}30`,
      },
    },
    '& .MuiInputLabel-root': { color: COLORS.text.muted, fontSize: '0.8rem' },
    '& .MuiInputLabel-root.Mui-focused': { color: COLORS.neon.cyan },
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <TextField
          label={label}
          size="small"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            const num = parseFloat(value.replace(/,/g, ''));
            if (!isNaN(num) && num > 0) {
              onChange(num.toLocaleString('en-US', { maximumFractionDigits: 0 }));
            }
          }}
          onFocus={() => onChange(value.replace(/,/g, ''))}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start" sx={{ color: COLORS.text.muted }}>$</InputAdornment>
            ),
          }}
          sx={{ flex: 1, ...inputSx }}
        />
        <Button
          variant="outlined"
          size="small"
          onClick={onUpdate}
          disabled={saving}
          sx={{
            minWidth: 72,
            height: 40,
            borderColor: saved ? COLORS.neon.green : COLORS.neon.cyan,
            color: saved ? COLORS.neon.green : COLORS.neon.cyan,
            fontSize: '0.75rem',
            fontWeight: 600,
            textTransform: 'none',
            '&:hover': {
              borderColor: COLORS.neon.cyan,
              backgroundColor: `${COLORS.neon.cyan}15`,
            },
            '&.Mui-disabled': {
              borderColor: COLORS.border.default,
              color: COLORS.text.muted,
            },
          }}
        >
          {saving ? '...' : saved ? '✓ Saved' : 'Update'}
        </Button>
      </Box>
    </Box>
  );
}

// ── Main GoalsPacing Component ─────────────────────────────────

export default function GoalsPacing({ goals, actuals, calendar, onGoalsSaved }) {
  const { token, mode, adminViewClientId } = useAuth();

  // Goal input state (what the user is typing — doesn't affect pacing until Update)
  const [monthlyInput, setMonthlyInput] = useState('');
  const [quarterlyInput, setQuarterlyInput] = useState('');
  const [yearlyInput, setYearlyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedField, setSavedField] = useState(null); // 'monthly' | 'quarterly' | 'yearly' | 'all'
  const [snackbar, setSnackbar] = useState({ open: false, message: '', isError: false });

  // Active goals — what the pacing cards actually display.
  // Only updates when the user clicks Update (individual or Update All).
  const [activeGoals, setActiveGoals] = useState({
    monthly: 0, quarterly: 0, yearly: 0,
  });

  // Sync inputs AND active goals when goals data arrives from API
  useEffect(() => {
    if (goals?.monthlyGoal) setMonthlyInput(fmtNum(goals.monthlyGoal));
    if (goals?.quarterlyGoal) setQuarterlyInput(fmtNum(goals.quarterlyGoal));
    if (goals?.yearlyGoal) setYearlyInput(fmtNum(goals.yearlyGoal));
    setActiveGoals({
      monthly: goals?.monthlyGoal || 0,
      quarterly: goals?.quarterlyGoal || 0,
      yearly: goals?.yearlyGoal || 0,
    });
  }, [goals?.monthlyGoal, goals?.quarterlyGoal, goals?.yearlyGoal]);

  // Clear saved indicator after 3 seconds
  useEffect(() => {
    if (savedField) {
      const timer = setTimeout(() => setSavedField(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [savedField]);

  // Computed goals for pacing display — reads from activeGoals (not inputs)
  // Pacing cards only change when user clicks Update
  const computedGoals = useMemo(() => {
    const weekly = activeGoals.monthly / 4.33;
    return { weekly, monthly: activeGoals.monthly, quarterly: activeGoals.quarterly, yearly: activeGoals.yearly };
  }, [activeGoals]);

  // Time progress values
  const weekProgress = getWeekProgress();
  const monthProgress = getMonthProgress(calendar.dayOfMonth, calendar.daysInCurrentMonth);
  const quarterProgress = getQuarterProgress(calendar.dayOfQuarter, calendar.daysInQuarter);
  const yearProgress = getYearProgress(calendar.dayOfYear, calendar.daysInYear);

  // Auto-calculation: monthly → quarterly (x3) + yearly (x12)
  // Formats auto-filled values with commas for display
  function handleMonthlyChange(val) {
    setMonthlyInput(val);
    const num = parseFloat(val.replace(/,/g, ''));
    if (!isNaN(num) && num > 0) {
      setQuarterlyInput(fmtNum(num * 3));
      setYearlyInput(fmtNum(num * 12));
    }
  }

  // Build auth options for API calls
  function getAuthOptions() {
    const authOptions = {};
    if (mode === 'admin' && adminViewClientId) {
      authOptions.viewClientId = adminViewClientId;
    } else if (token) {
      authOptions.token = token;
    }
    return authOptions;
  }

  // Save goals (single field or all) and update active goals for pacing display.
  // Individual update: only that field changes in pacing cards.
  // Update All: all three fields change in pacing cards.
  async function saveGoals(field) {
    const monthly = parseFloat(String(monthlyInput).replace(/,/g, ''));
    const quarterly = parseFloat(String(quarterlyInput).replace(/,/g, ''));
    const yearly = parseFloat(String(yearlyInput).replace(/,/g, ''));

    // Validate only the field(s) being updated
    if (field === 'all') {
      if (isNaN(monthly) || isNaN(quarterly) || isNaN(yearly)) {
        setSnackbar({ open: true, message: 'Please enter valid goal amounts', isError: true });
        return;
      }
    } else {
      const val = field === 'monthly' ? monthly : field === 'quarterly' ? quarterly : yearly;
      if (isNaN(val)) {
        setSnackbar({ open: true, message: `Please enter a valid ${field} goal`, isError: true });
        return;
      }
    }

    // Build the payload — send current active values for fields NOT being updated
    const payload = {
      monthly_goal: field === 'monthly' || field === 'all' ? monthly : activeGoals.monthly,
      quarterly_goal: field === 'quarterly' || field === 'all' ? quarterly : activeGoals.quarterly,
      yearly_goal: field === 'yearly' || field === 'all' ? yearly : activeGoals.yearly,
    };

    setSaving(true);
    try {
      await apiPut('/dashboard/goals', payload, getAuthOptions());

      // Update active goals — only the field(s) that were saved
      setActiveGoals((prev) => {
        if (field === 'all') return { monthly, quarterly, yearly };
        if (field === 'monthly') return { ...prev, monthly };
        if (field === 'quarterly') return { ...prev, quarterly };
        if (field === 'yearly') return { ...prev, yearly };
        return prev;
      });

      setSavedField(field);
      const label = field === 'all' ? 'All goals' : `${field.charAt(0).toUpperCase() + field.slice(1)} goal`;
      setSnackbar({ open: true, message: `${label} saved successfully`, isError: false });
      if (onGoalsSaved) onGoalsSaved();
    } catch (err) {
      setSnackbar({ open: true, message: err.message || 'Failed to save goals', isError: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>

      {/* ── Section Header ── */}
      <Box sx={{ backgroundColor: COLORS.bg.tertiary, borderRadius: 2, p: 2, textAlign: 'center' }}>
        <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: COLORS.text.primary }}>
          Pacing & Goals
        </Typography>
      </Box>

      {/* ── Pacing Rows — full width ── */}
      <Box
        sx={{
          backgroundColor: COLORS.bg.secondary,
          border: `1px solid ${COLORS.border.subtle}`,
          borderRadius: 2,
          padding: '16px 20px',
        }}
      >
        {/* Weekly */}
        <PacingRow
          periodLabel="Weekly"
          actual={actuals.wtdRevenue || 0}
          goal={computedGoals.weekly}
          timeProgress={weekProgress}
        />

        <Divider sx={{ borderColor: COLORS.border.subtle, my: 0.5 }} />

        {/* Monthly */}
        <PacingRow
          periodLabel="Monthly"
          actual={actuals.mtdRevenue || 0}
          goal={computedGoals.monthly}
          timeProgress={monthProgress}
        />

        <Divider sx={{ borderColor: COLORS.border.subtle, my: 0.5 }} />

        {/* Quarterly */}
        <PacingRow
          periodLabel="Quarterly"
          actual={actuals.qtdRevenue || 0}
          goal={computedGoals.quarterly}
          timeProgress={quarterProgress}
        />

        <Divider sx={{ borderColor: COLORS.border.subtle, my: 0.5 }} />

        {/* Yearly */}
        <PacingRow
          periodLabel="Yearly"
          actual={actuals.ytdRevenue || 0}
          goal={computedGoals.yearly}
          timeProgress={yearProgress}
        />
      </Box>

      {/* ── Goal Inputs — horizontal row ── */}
      <Box
        sx={{
          backgroundColor: COLORS.bg.secondary,
          border: `1px solid ${COLORS.border.subtle}`,
          borderRadius: 2,
          padding: '16px 20px',
        }}
      >
        <Typography
          sx={{
            fontSize: '0.8rem',
            fontWeight: 600,
            color: COLORS.text.secondary,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            mb: 2,
          }}
        >
          Set Revenue Goals
        </Typography>

        {/* Three goal inputs in a horizontal grid */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2, mb: 1.5 }}>
          {/* Monthly Goal — auto-fills quarterly (x3) and yearly (x12) */}
          <GoalInput
            label="Monthly Goal"
            value={monthlyInput}
            onChange={handleMonthlyChange}
            onUpdate={() => saveGoals('monthly')}
            saving={saving}
            saved={savedField === 'monthly' || savedField === 'all'}
          />

          {/* Quarterly Goal */}
          <GoalInput
            label="Quarterly Goal"
            value={quarterlyInput}
            onChange={setQuarterlyInput}
            onUpdate={() => saveGoals('quarterly')}
            saving={saving}
            saved={savedField === 'quarterly' || savedField === 'all'}
          />

          {/* Yearly Goal */}
          <GoalInput
            label="Yearly Goal"
            value={yearlyInput}
            onChange={setYearlyInput}
            onUpdate={() => saveGoals('yearly')}
            saving={saving}
            saved={savedField === 'yearly' || savedField === 'all'}
          />
        </Box>

        {/* Auto-calc hint + Update All button */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontSize: '0.65rem', color: COLORS.text.muted }}>
            Setting monthly auto-fills quarterly (&times;3) and yearly (&times;12)
          </Typography>

          <Button
            variant="outlined"
            size="small"
            onClick={() => saveGoals('all')}
            disabled={saving}
            sx={{
              borderColor: COLORS.neon.cyan,
              color: COLORS.neon.cyan,
              fontSize: '0.75rem',
              fontWeight: 600,
              textTransform: 'none',
              px: 3,
              '&:hover': {
                borderColor: COLORS.neon.cyan,
                backgroundColor: `${COLORS.neon.cyan}15`,
                boxShadow: `0 0 12px ${COLORS.neon.cyan}25`,
              },
              '&.Mui-disabled': {
                borderColor: COLORS.border.default,
                color: COLORS.text.muted,
              },
            }}
          >
            {saving ? 'Saving...' : savedField === 'all' ? '✓ All Goals Saved' : 'Update All Goals'}
          </Button>
        </Box>
      </Box>

      {/* ── Snackbar ── */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
        message={snackbar.message}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        ContentProps={{
          sx: {
            backgroundColor: snackbar.isError ? COLORS.neon.red : COLORS.neon.green,
            color: snackbar.isError ? '#fff' : COLORS.bg.primary,
            fontWeight: 600,
          },
        }}
      />
    </Box>
  );
}

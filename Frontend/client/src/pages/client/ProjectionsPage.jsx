/**
 * PROJECTIONS PAGE -- INSIGHT+ ONLY
 *
 * Interactive projection engine with 4 scenario sliders.
 * Ported from the standalone Projections-index.html app.
 *
 * Layout:
 *   1. Your Current Baseline -- 6+3 scorecards showing baseline rates
 *   2. Adjust Your Numbers -- 4 sliders (Show Rate, Close Rate, Deal Size, Prospects)
 *   3. Adjusted Values -- 4 cards showing adjusted values
 *   4. EOM Projection + EOY Projection -- side by side with toggle modes
 *   5. Impact Summary -- Monthly and Yearly impact deltas
 *
 * The projection math runs entirely on the frontend via useMemo.
 * The API provides baseline data; the frontend calculates all projections.
 *
 * Data: GET /api/dashboard/projections
 */

import React, { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Switch from '@mui/material/Switch';
import { COLORS } from '../../theme/constants';
import { useMetrics } from '../../hooks/useMetrics';
import { useAuth } from '../../context/AuthContext';
import { meetsMinTier } from '../../utils/tierConfig';
import { DUMMY_PROJECTIONS } from '../../utils/dummyData';

import ScenarioSlider from '../../components/projections/ScenarioSlider';
import Scorecard from '../../components/scorecards/Scorecard';
import GoalsPacing from '../../components/projections/GoalsPacing';
import TierGate from '../../components/TierGate';

/** Format a number with commas, no decimals */
const fmt = (n) => Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 });

/** Format a decimal as percentage string */
const fmtP = (n) => (n * 100).toFixed(1) + '%';

/** Clamp a value between lo and hi */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Delta indicator -- shows positive/negative change with colored arrow.
 * Used below projection columns to show the impact of slider adjustments.
 *
 * @param {number} value - The delta value (positive = improvement, negative = decline)
 * @param {string} label - Short label like "sched / mo" or "rev / yr"
 * @param {boolean} isDollar - Whether to format as currency
 */
function DeltaIndicator({ value, label, isDollar = false }) {
  const num = Math.round(value);
  const positive = num >= 0;
  const zero = num === 0;

  // Format the display value with sign prefix and optional dollar sign
  const display = zero
    ? (isDollar ? '$0' : '0')
    : isDollar
      ? (positive ? '+$' : '-$') + fmt(num)
      : (positive ? '+' : '-') + fmt(num);

  // Color coding: green for positive, red for negative, muted for zero
  const col = zero ? COLORS.text.muted : positive ? COLORS.neon.green : COLORS.neon.red;
  const bg = zero
    ? 'rgba(100,120,140,0.08)'
    : positive
      ? 'rgba(0, 255, 136, 0.08)'
      : 'rgba(255, 51, 102, 0.08)';
  const bdr = zero
    ? 'rgba(100,120,140,0.15)'
    : positive
      ? 'rgba(0, 255, 136, 0.2)'
      : 'rgba(255, 51, 102, 0.2)';
  const arrow = zero ? '\u2013' : positive ? '\u25B2' : '\u25BC';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.6,
        padding: '5px 8px',
        backgroundColor: bg,
        border: `1px solid ${bdr}`,
        borderRadius: 1.2,
      }}
    >
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: col, whiteSpace: 'nowrap' }}>
        {arrow} {display}
      </Typography>
      <Typography sx={{ fontSize: '0.625rem', color: COLORS.text.secondary, whiteSpace: 'nowrap' }}>
        {label}
      </Typography>
    </Box>
  );
}

/**
 * Impact row -- single line in the impact summary section.
 * Shows a label on the left and a colored delta value on the right.
 *
 * @param {string} label - Row label like "Additional Closes"
 * @param {number} value - The delta value
 * @param {boolean} isDollar - Whether to format as currency
 */
function ImpactRow({ label, value, isDollar = false }) {
  const num = Math.round(value);
  const positive = num >= 0;
  const zero = num === 0;
  const display = zero
    ? (isDollar ? '$0' : '0')
    : isDollar
      ? (positive ? '+$' : '-$') + fmt(num)
      : (positive ? '+' : '-') + fmt(num);
  const col = zero ? COLORS.text.muted : positive ? COLORS.neon.green : COLORS.neon.red;

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px',
        backgroundColor: COLORS.bg.primary,
        borderRadius: 1,
      }}
    >
      <Typography sx={{ fontSize: '0.8rem', color: COLORS.text.secondary }}>{label}</Typography>
      <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: col }}>{display}</Typography>
    </Box>
  );
}

/**
 * Projection Column -- EOM or EOY projection display.
 * Shows a toggle (MTD+remaining vs full projected), 5 projection cards,
 * and delta indicators showing the impact of slider adjustments.
 *
 * @param {string} title - Column title ("End of Month Projection" or "End of Year Projection")
 * @param {boolean} toggleChecked - Current toggle state
 * @param {function} onToggle - Toggle change handler
 * @param {string} toggleOn - Label shown when toggle is ON
 * @param {string} toggleOff - Label shown when toggle is OFF
 * @param {string} sub - Subtitle text below toggle
 * @param {object} data - Projection values: { s, h, c, r, ca } (scheduled, held, closes, revenue, cash)
 * @param {object} delta - Delta from baseline: { s, h, c, r, ca }
 * @param {string} period - Short period label for deltas ("mo" or "yr")
 */
function ProjCol({ title, toggleChecked, onToggle, toggleOn, toggleOff, sub, data, delta, period }) {
  return (
    <Box sx={{ flex: 1 }}>
      {/* Header + Toggle */}
      <Box sx={{ textAlign: 'center', mb: 1.5, minHeight: 62 }}>
        <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color: COLORS.text.primary }}>
          {title}
        </Typography>
        <Box sx={{ mt: 0.75, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
          <Switch
            checked={toggleChecked}
            onChange={(e) => onToggle(e.target.checked)}
            size="small"
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.neon.cyan },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: COLORS.neon.cyan },
            }}
          />
          <Typography sx={{ fontSize: '0.7rem', color: COLORS.text.secondary, minWidth: 190 }}>
            {toggleChecked ? toggleOn : toggleOff}
          </Typography>
        </Box>
        <Typography sx={{ fontSize: '0.625rem', color: COLORS.text.muted, mt: 0.25 }}>
          {sub}
        </Typography>
      </Box>

      {/* Projection Cards -- 3 across + 2 across */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, mb: 0.75 }}>
        <Scorecard label="Calls Scheduled" value={data.s} format="number" glowColor={COLORS.neon.cyan} />
        <Scorecard label="Calls Held" value={data.h} format="number" glowColor={COLORS.neon.cyan} />
        <Scorecard label="Projected Closes" value={data.c} format="number" glowColor={COLORS.neon.green} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 0.75 }}>
        <Scorecard label="Projected Revenue" value={data.r} format="currency" glowColor={COLORS.neon.amber} />
        <Scorecard label="Projected Cash" value={data.ca} format="currency" glowColor={COLORS.neon.amber} />
      </Box>

      {/* Delta indicators -- show impact of slider adjustments */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0.75, mb: 0.5 }}>
        <DeltaIndicator value={delta.s} label={`sched / ${period}`} />
        <DeltaIndicator value={delta.h} label={`held / ${period}`} />
        <DeltaIndicator value={delta.c} label={`closes / ${period}`} />
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
        <DeltaIndicator value={delta.r} label={`rev / ${period}`} isDollar />
        <DeltaIndicator value={delta.ca} label={`cash / ${period}`} isDollar />
      </Box>
    </Box>
  );
}

export default function ProjectionsPage() {
  const { tier } = useAuth();
  const hasAccess = meetsMinTier(tier, 'insight');
  const { data, isLoading, error, refetch } = useMetrics('projections', { enabled: hasAccess });

  // Slider state -- adjustments from baseline (0 = no change)
  const [showRateAdj, setShowRateAdj] = useState(0);
  const [closeRateAdj, setCloseRateAdj] = useState(0);
  const [dealSizeAdj, setDealSizeAdj] = useState(0);
  const [prospectsAdj, setProspectsAdj] = useState(0);

  // Toggle state for EOM/EOY projection modes
  // true = MTD/YTD actuals + projected remaining
  // false = full month/year projected from daily rates
  const [showFullMonth, setShowFullMonth] = useState(true);
  const [showFullYear, setShowFullYear] = useState(true);

  // Track whether any slider has been moved from zero
  const hasChanges = showRateAdj !== 0 || closeRateAdj !== 0 || dealSizeAdj !== 0 || prospectsAdj !== 0;

  // The projection baseline comes from a special field in the API response.
  // Shape matches the existing Projections-index.html API:
  //   { showRate, closeRate, avgDealSize, avgCashCollected, prospectsBookedPerMonth,
  //     avgCallsToClose, callsScheduled, currentCallsHeld, currentCloses,
  //     currentRevenue, currentCash, daysInPeriod, daysInCurrentMonth, dayOfMonth,
  //     daysInYear, dayOfYear, mtdCallsScheduled, mtdCallsHeld, mtdCloses,
  //     mtdRevenue, mtdCash, ytdCallsScheduled, ytdCallsHeld, ytdCloses,
  //     ytdRevenue, ytdCash, dateRange, closers }
  const displayData = hasAccess ? data : DUMMY_PROJECTIONS;
  const b = displayData?.projectionBaseline;

  /**
   * PROJECTION CALCULATION ENGINE
   * Ported from Projections-index.html lines 217-292.
   *
   * Uses ratio-based adjustments applied cumulatively:
   *   pR = adjustedProspects / baseline.prospectsBookedPerMonth
   *   sR = adjustedShowRate / baseline.showRate
   *   cR = adjustedCloseRate / baseline.closeRate
   *   dR = adjustedDealSize / baseline.avgDealSize
   *   caR = adjustedCashPer / baseline.avgCashCollected
   *
   * These ratios are multiplied into daily base rates to produce projections.
   * The cumulative application means each metric compounds:
   *   Scheduled = daily * days * pR
   *   Held      = daily * days * pR * sR
   *   Closes    = daily * days * pR * sR * cR
   *   Revenue   = daily * days * pR * sR * cR * dR
   *   Cash      = daily * days * pR * sR * cR * caR
   */
  const p = useMemo(() => {
    if (!b) return null;

    // Calculate adjusted metric values by applying slider deltas to baseline
    const adjShowRate = clamp(b.showRate + showRateAdj / 100, 0, 1);
    const adjCloseRate = clamp(b.closeRate + closeRateAdj / 100, 0, 1);
    const adjDealSize = Math.max(0, b.avgDealSize + dealSizeAdj);

    // Cash per deal tracks the same ratio as deal size
    // (if deal size goes up 20%, cash collected goes up 20%)
    const cashRatio = b.avgCashCollected / b.avgDealSize;
    const adjCashPer = Math.max(0, adjDealSize * cashRatio);
    const adjProspects = Math.max(0, b.prospectsBookedPerMonth + prospectsAdj);

    // Daily rates derived from the baseline period
    // These are the "normal" daily production rates
    const dailySched = b.callsScheduled / b.daysInPeriod;
    const dailyHeld = b.currentCallsHeld / b.daysInPeriod;
    const dailyCloses = b.currentCloses / b.daysInPeriod;
    const dailyRev = b.currentRevenue / b.daysInPeriod;
    const dailyCash = b.currentCash / b.daysInPeriod;

    // Ratio multipliers -- how much each metric changes relative to baseline
    // A ratio of 1.0 = no change; 1.2 = 20% increase; 0.8 = 20% decrease
    const pR = adjProspects / b.prospectsBookedPerMonth;
    const sR = adjShowRate / b.showRate;
    const cR = adjCloseRate / b.closeRate;
    const dR = adjDealSize / b.avgDealSize;
    const caR = adjCashPer / b.avgCashCollected;

    // ── End of Month projections ──

    const daysRemainingMonth = b.daysInCurrentMonth - b.dayOfMonth;
    const cm = b.daysInCurrentMonth;

    // Full month projection (baseline rates extrapolated across entire month)
    const fmBase = {
      s: dailySched * cm,
      h: dailyHeld * cm,
      c: dailyCloses * cm,
      r: dailyRev * cm,
      ca: dailyCash * cm,
    };

    // Full month with slider adjustments applied
    const fmAdj = {
      s: Math.round(fmBase.s * pR),
      h: Math.round(fmBase.h * pR * sR),
      c: Math.round(fmBase.c * pR * sR * cR),
      r: Math.round(fmBase.r * pR * sR * cR * dR),
      ca: Math.round(fmBase.ca * pR * sR * cR * caR),
    };

    // Full month baseline (no slider adjustments) -- used for delta calculation
    const fmB = {
      s: Math.round(fmBase.s),
      h: Math.round(fmBase.h),
      c: Math.round(fmBase.c),
      r: Math.round(fmBase.r),
      ca: Math.round(fmBase.ca),
    };

    // Remaining month projection (for MTD actuals + remaining mode)
    const rmRemBase = {
      s: dailySched * daysRemainingMonth,
      h: dailyHeld * daysRemainingMonth,
      c: dailyCloses * daysRemainingMonth,
      r: dailyRev * daysRemainingMonth,
      ca: dailyCash * daysRemainingMonth,
    };

    // Remaining month with slider adjustments
    const rmRemAdj = {
      s: Math.round(rmRemBase.s * pR),
      h: Math.round(rmRemBase.h * pR * sR),
      c: Math.round(rmRemBase.c * pR * sR * cR),
      r: Math.round(rmRemBase.r * pR * sR * cR * dR),
      ca: Math.round(rmRemBase.ca * pR * sR * cR * caR),
    };

    // Remaining month baseline (no adjustments)
    const rmRemB = {
      s: Math.round(rmRemBase.s),
      h: Math.round(rmRemBase.h),
      c: Math.round(rmRemBase.c),
      r: Math.round(rmRemBase.r),
      ca: Math.round(rmRemBase.ca),
    };

    // MTD actuals + projected remaining (adjusted)
    const mtdFull = {
      s: b.mtdCallsScheduled + rmRemAdj.s,
      h: b.mtdCallsHeld + rmRemAdj.h,
      c: b.mtdCloses + rmRemAdj.c,
      r: b.mtdRevenue + rmRemAdj.r,
      ca: b.mtdCash + rmRemAdj.ca,
    };

    // MTD actuals + projected remaining (baseline -- for delta calculation)
    const mtdFullBase = {
      s: b.mtdCallsScheduled + rmRemB.s,
      h: b.mtdCallsHeld + rmRemB.h,
      c: b.mtdCloses + rmRemB.c,
      r: b.mtdRevenue + rmRemB.r,
      ca: b.mtdCash + rmRemB.ca,
    };

    // ── End of Year projections ──

    const daysRemainingYear = b.daysInYear - b.dayOfYear;

    // Remaining year projection base rates
    const yrRemBase = {
      s: dailySched * daysRemainingYear,
      h: dailyHeld * daysRemainingYear,
      c: dailyCloses * daysRemainingYear,
      r: dailyRev * daysRemainingYear,
      ca: dailyCash * daysRemainingYear,
    };

    // Remaining year with slider adjustments
    const yrRemAdj = {
      s: Math.round(yrRemBase.s * pR),
      h: Math.round(yrRemBase.h * pR * sR),
      c: Math.round(yrRemBase.c * pR * sR * cR),
      r: Math.round(yrRemBase.r * pR * sR * cR * dR),
      ca: Math.round(yrRemBase.ca * pR * sR * cR * caR),
    };

    // Remaining year baseline (no adjustments)
    const yrRemB = {
      s: Math.round(yrRemBase.s),
      h: Math.round(yrRemBase.h),
      c: Math.round(yrRemBase.c),
      r: Math.round(yrRemBase.r),
      ca: Math.round(yrRemBase.ca),
    };

    // YTD actuals + projected remaining (adjusted)
    const yrFull = {
      s: b.ytdCallsScheduled + yrRemAdj.s,
      h: b.ytdCallsHeld + yrRemAdj.h,
      c: b.ytdCloses + yrRemAdj.c,
      r: b.ytdRevenue + yrRemAdj.r,
      ca: b.ytdCash + yrRemAdj.ca,
    };

    // YTD actuals + projected remaining (baseline -- for delta calculation)
    const yrFullBase = {
      s: b.ytdCallsScheduled + yrRemB.s,
      h: b.ytdCallsHeld + yrRemB.h,
      c: b.ytdCloses + yrRemB.c,
      r: b.ytdRevenue + yrRemB.r,
      ca: b.ytdCash + yrRemB.ca,
    };

    return {
      // Adjusted absolute values (for display in the "Adjusted Values" cards)
      adjShowRate,
      adjCloseRate,
      adjDealSize,
      adjProspects,

      // Days remaining (for subtitle text)
      daysRemainingMonth,
      daysRemainingYear,

      // Full month projected (adjusted + delta from baseline)
      fm: fmAdj,
      fmD: {
        s: fmAdj.s - fmB.s,
        h: fmAdj.h - fmB.h,
        c: fmAdj.c - fmB.c,
        r: fmAdj.r - fmB.r,
        ca: fmAdj.ca - fmB.ca,
      },

      // MTD + remaining (adjusted + delta from baseline)
      mtd: mtdFull,
      mtdD: {
        s: mtdFull.s - mtdFullBase.s,
        h: mtdFull.h - mtdFullBase.h,
        c: mtdFull.c - mtdFullBase.c,
        r: mtdFull.r - mtdFullBase.r,
        ca: mtdFull.ca - mtdFullBase.ca,
      },

      // Remaining year only (adjusted + delta from baseline)
      yr: yrRemAdj,
      yrD: {
        s: yrRemAdj.s - yrRemB.s,
        h: yrRemAdj.h - yrRemB.h,
        c: yrRemAdj.c - yrRemB.c,
        r: yrRemAdj.r - yrRemB.r,
        ca: yrRemAdj.ca - yrRemB.ca,
      },

      // YTD + remaining (adjusted + delta from baseline)
      yf: yrFull,
      yfD: {
        s: yrFull.s - yrFullBase.s,
        h: yrFull.h - yrFullBase.h,
        c: yrFull.c - yrFullBase.c,
        r: yrFull.r - yrFullBase.r,
        ca: yrFull.ca - yrFullBase.ca,
      },
    };
  }, [showRateAdj, closeRateAdj, dealSizeAdj, prospectsAdj, b]);

  // Determine which EOM/EOY data to display based on toggle state.
  // showFullMonth=true  -> MTD actuals + projected remaining days
  // showFullMonth=false -> Full month projected from daily rates
  const eom = p && showFullMonth
    ? { data: p.mtd, delta: p.mtdD, sub: `MTD actuals + ${p.daysRemainingMonth} days projected` }
    : p ? { data: p.fm, delta: p.fmD, sub: `Full month projected (${b.daysInCurrentMonth} days)` } : null;

  // showFullYear=true  -> YTD actuals + projected remaining days
  // showFullYear=false -> Remaining days only
  const eoy = p && showFullYear
    ? { data: p.yf, delta: p.yfD, sub: `YTD actuals + ${p.daysRemainingYear} days projected` }
    : p ? { data: p.yr, delta: p.yrD, sub: `${p.daysRemainingYear} days remaining` } : null;

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ color: COLORS.text.primary, fontWeight: 700 }}>
          Projections
        </Typography>
        <Typography sx={{ color: COLORS.text.muted, fontSize: '0.9rem', mt: 0.5 }}>
          Forecast and scenario modeling
        </Typography>
      </Box>

      {/* Loading state */}
      {isLoading && !data && (
        <Box sx={{ textAlign: 'center', py: 8 }}>
          <Typography sx={{ color: COLORS.text.muted }}>Loading projections data...</Typography>
        </Box>
      )}

      {/* Error state */}
      {error && !data && (
        <Box
          sx={{
            textAlign: 'center', py: 8,
            backgroundColor: 'rgba(255, 51, 102, 0.05)',
            borderRadius: 2,
            border: '1px solid rgba(255, 51, 102, 0.2)',
          }}
        >
          <Typography sx={{ color: COLORS.neon.red, mb: 1 }}>
            Failed to load projections data
          </Typography>
          <Typography sx={{ color: COLORS.text.muted, fontSize: '0.85rem' }}>
            {error.message || 'Please try again later.'}
          </Typography>
        </Box>
      )}

      {/* Goals & Pacing + Projections content -- gated to Insight+ tier */}
      {displayData && (
      <TierGate requiredTier="insight" label="projections and pacing">
      {b && (
        <Box sx={{ mb: 3 }}>
          <GoalsPacing
            goals={{
              monthlyGoal: b.monthlyGoal,
              quarterlyGoal: b.quarterlyGoal,
              yearlyGoal: b.yearlyGoal,
            }}
            actuals={{
              wtdRevenue: b.wtdRevenue,
              mtdRevenue: b.mtdRevenue,
              qtdRevenue: b.qtdRevenue,
              ytdRevenue: b.ytdRevenue,
            }}
            calendar={{
              dayOfMonth: b.dayOfMonth,
              daysInCurrentMonth: b.daysInCurrentMonth,
              dayOfYear: b.dayOfYear,
              daysInYear: b.daysInYear,
              dayOfQuarter: b.dayOfQuarter,
              daysInQuarter: b.daysInQuarter,
            }}
            onGoalsSaved={() => refetch()}
          />
        </Box>
      )}

      {/* Projections content -- only renders when baseline data is available */}
      {b && p && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

          {/* ======== Section 1: Your Current Baseline ======== */}
          <Box sx={{ backgroundColor: COLORS.bg.tertiary, borderRadius: 2, p: 2, textAlign: 'center', mb: 1 }}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: COLORS.text.primary }}>
              Your Current Baseline
            </Typography>
          </Box>

          {/* Baseline cards -- 6 across: core rates and averages */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' }, gap: 1.25 }}>
            <Scorecard label="Prospects / Month" value={b.prospectsBookedPerMonth} format="number" glowColor={COLORS.neon.cyan} />
            <Scorecard label="Show Rate" value={b.showRate} format="percent" glowColor={COLORS.neon.green} />
            <Scorecard label="Close Rate" value={b.closeRate} format="percent" glowColor={COLORS.neon.green} />
            <Scorecard label="Avg Deal Size" value={b.avgDealSize} format="currency" glowColor={COLORS.neon.amber} />
            <Scorecard label="Avg Cash Collected" value={b.avgCashCollected} format="currency" glowColor={COLORS.neon.amber} />
            <Scorecard label="Avg Calls to Close" value={b.avgCallsToClose} format="decimal" glowColor={COLORS.text.primary} />
          </Box>

          {/* Monthly aggregate metrics -- 3 across */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.25 }}>
            <Scorecard label="Monthly Revenue" value={b.currentRevenue} format="currency" glowColor={COLORS.neon.amber} />
            <Scorecard label="Monthly Cash" value={b.currentCash} format="currency" glowColor={COLORS.neon.amber} />
            <Scorecard label="Monthly Closes" value={b.currentCloses} format="number" glowColor={COLORS.neon.green} />
          </Box>

          {/* Date range context -- so user knows what period the baseline is calculated from */}
          <Typography sx={{ fontSize: '0.7rem', color: COLORS.text.muted, textAlign: 'center' }}>
            Rates based on: {b.dateRange} ({b.daysInPeriod} days)
          </Typography>

          {/* ======== Section 2: Adjust Your Numbers ======== */}
          <Box sx={{ backgroundColor: COLORS.bg.tertiary, borderRadius: 2, p: 2, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: COLORS.text.primary }}>
              Adjust Your Numbers
            </Typography>
          </Box>

          {/* 4 Sliders in a 2x2 grid inside a card */}
          <Box
            sx={{
              backgroundColor: COLORS.bg.secondary,
              border: `1px solid ${COLORS.border.subtle}`,
              borderRadius: 2,
              padding: '16px 28px 12px',
            }}
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: '16px 40px' }}>
              <ScenarioSlider
                label="Show Rate"
                value={showRateAdj}
                onChange={setShowRateAdj}
                range={15}
                step={0.5}
                unit="%"
                color={COLORS.neon.green}
              />
              <ScenarioSlider
                label="Close Rate"
                value={closeRateAdj}
                onChange={setCloseRateAdj}
                range={15}
                step={0.5}
                unit="%"
                color={COLORS.neon.cyan}
              />
              <ScenarioSlider
                label="Avg Deal Size"
                value={dealSizeAdj}
                onChange={setDealSizeAdj}
                range={5000}
                step={100}
                unit=""
                color={COLORS.neon.amber}
                formatVal={(v) => (v >= 0 ? '$' : '-$') + fmt(Math.abs(v))}
              />
              <ScenarioSlider
                label="Prospects Booked / Month"
                value={prospectsAdj}
                onChange={setProspectsAdj}
                range={500}
                step={10}
                unit=""
                color={COLORS.neon.purple}
              />
            </Box>

            {/* Reset button -- only enabled when sliders have been moved */}
            <Box sx={{ textAlign: 'center', mt: 1.5 }}>
              <Button
                variant="outlined"
                size="small"
                disabled={!hasChanges}
                onClick={() => {
                  setShowRateAdj(0);
                  setCloseRateAdj(0);
                  setDealSizeAdj(0);
                  setProspectsAdj(0);
                }}
                sx={{
                  borderColor: COLORS.border.default,
                  color: hasChanges ? COLORS.text.secondary : COLORS.text.muted,
                  fontSize: '0.75rem',
                  opacity: hasChanges ? 1 : 0.35,
                  '&:hover': { borderColor: COLORS.neon.cyan },
                }}
              >
                Reset All Sliders
              </Button>
            </Box>
          </Box>

          {/* Adjusted values -- 4 across showing current adjusted metrics */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.25 }}>
            <Scorecard
              label={hasChanges ? 'Adjusted Show Rate' : 'Actual Show Rate'}
              value={p.adjShowRate}
              format="percent"
              glowColor={COLORS.neon.green}
              subtitle={hasChanges ? `was ${fmtP(b.showRate)}` : undefined}
            />
            <Scorecard
              label={hasChanges ? 'Adjusted Close Rate' : 'Actual Close Rate'}
              value={p.adjCloseRate}
              format="percent"
              glowColor={COLORS.neon.cyan}
              subtitle={hasChanges ? `was ${fmtP(b.closeRate)}` : undefined}
            />
            <Scorecard
              label={hasChanges ? 'Adjusted Deal Size' : 'Actual Deal Size'}
              value={p.adjDealSize}
              format="currency"
              glowColor={COLORS.neon.amber}
              subtitle={hasChanges ? `was $${fmt(b.avgDealSize)}` : undefined}
            />
            <Scorecard
              label={hasChanges ? 'Adjusted Prospects / Mo' : 'Actual Prospects / Mo'}
              value={p.adjProspects}
              format="number"
              glowColor={COLORS.neon.purple}
              subtitle={hasChanges ? `was ${fmt(b.prospectsBookedPerMonth)}` : undefined}
            />
          </Box>

          {/* ======== Section 3: EOM + EOY Projections Side by Side ======== */}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 3, mt: 2 }}>
            <ProjCol
              title="End of Month Projection"
              toggleChecked={showFullMonth}
              onToggle={setShowFullMonth}
              toggleOn="MTD actuals + projected remaining"
              toggleOff="Full month projected"
              sub={eom.sub}
              data={eom.data}
              delta={eom.delta}
              period="mo"
            />
            <ProjCol
              title="End of Year Projection"
              toggleChecked={showFullYear}
              onToggle={setShowFullYear}
              toggleOn="YTD actuals + projected remaining"
              toggleOff="Remaining only"
              sub={eoy.sub}
              data={eoy.data}
              delta={eoy.delta}
              period="yr"
            />
          </Box>

          {/* ======== Section 4: Impact Summary ======== */}
          <Box sx={{ backgroundColor: COLORS.bg.tertiary, borderRadius: 2, p: 2, textAlign: 'center', mt: 2 }}>
            <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, color: COLORS.text.primary }}>
              Impact Summary
            </Typography>
          </Box>

          <Box
            sx={{
              backgroundColor: COLORS.bg.secondary,
              border: `1px solid ${COLORS.border.subtle}`,
              borderRadius: 2,
              padding: '20px 28px',
            }}
          >
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
              {/* Monthly impact column */}
              <Box>
                <Typography
                  sx={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: COLORS.text.secondary,
                    mb: 1.5,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Monthly Impact
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                  <ImpactRow label="Additional Closes" value={eom.delta.c} />
                  <ImpactRow label="Additional Revenue" value={eom.delta.r} isDollar />
                  <ImpactRow label="Additional Cash" value={eom.delta.ca} isDollar />
                </Box>
              </Box>

              {/* Yearly impact column */}
              <Box>
                <Typography
                  sx={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: COLORS.text.secondary,
                    mb: 1.5,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                  }}
                >
                  Yearly Impact {!showFullYear && '(Remaining)'}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                  <ImpactRow label="Additional Closes" value={eoy.delta.c} />
                  <ImpactRow label="Additional Revenue" value={eoy.delta.r} isDollar />
                  <ImpactRow label="Additional Cash" value={eoy.delta.ca} isDollar />
                </Box>
              </Box>
            </Box>
          </Box>

          {/* Footer */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              pt: 3,
              pb: 2,
              borderTop: `1px solid ${COLORS.border.subtle}`,
            }}
          >
            <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem' }}>
              Projections are estimates based on current baseline metrics
            </Typography>
            <Typography sx={{ color: COLORS.text.muted, fontSize: '0.8rem' }}>
              Data refreshes every 5 minutes
            </Typography>
          </Box>
        </Box>
      )}
      </TierGate>
      )}
    </Box>
  );
}

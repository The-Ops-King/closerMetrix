/**
 * DATA ANALYSIS PAGE — AI-Powered Team & Individual Insights
 *
 * Features:
 *   - Executive summary with key team metrics
 *   - Team-level insight cards (patterns, risks, opportunities)
 *   - Individual closer insight cards with stats + coaching recommendations
 *   - Closer comparison tool: 1v1 head-to-head or 1-vs-team benchmarking
 *   - Performance radar overlays for visual comparison
 *   - Actionable recommendations with priority levels
 *
 * Uses real AI-generated insights via Sonnet, generated once per day,
 * stored in BigQuery InsightLog. Falls back to loading skeletons while generating.
 */

import React, { useState, useMemo, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import Skeleton from '@mui/material/Skeleton';
import Tooltip from '@mui/material/Tooltip';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { COLORS, LAYOUT } from '../../theme/constants';
import { hexToRgba } from '../../utils/colors';
import { fmtDollar, fmtPercent, fmtNumber } from '../../utils/formatters';
import SectionHeader from '../../components/SectionHeader';
import TronRadarChart from '../../components/charts/TronRadarChart';
import TierGate from '../../components/TierGate';
import { useDataAnalysisAllTabs } from '../../hooks/useDataAnalysisInsight';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useFilters } from '../../context/FilterContext';
import { computePageData } from '../../utils/computePageData';

/* ───────────────────────────────────────────────────────────────── */
/*  COMPARISON METRICS CONFIG                                       */
/* ───────────────────────────────────────────────────────────────── */

const COMPARISON_METRICS = [
  { key: 'closeRate', label: 'Close Rate', format: 'percent', desiredDir: 'up' },
  { key: 'showRate', label: 'Show Rate', format: 'percent', desiredDir: 'up' },
  { key: 'revenue', label: 'Revenue', format: 'currency', desiredDir: 'up' },
  { key: 'avgDealSize', label: 'Avg Deal Size', format: 'currency', desiredDir: 'up' },
  { key: 'cashPerCall', label: 'Cash / Call', format: 'currency', desiredDir: 'up' },
  { key: 'revenuePerCall', label: 'Revenue / Call', format: 'currency', desiredDir: 'up' },
  { key: 'callQuality', label: 'Call Quality', format: 'score', desiredDir: 'up' },
  { key: 'objResRate', label: 'Objection Resolution', format: 'percent', desiredDir: 'up' },
  { key: 'callsToClose', label: 'Calls to Close', format: 'decimal', desiredDir: 'down' },
  { key: 'daysToClose', label: 'Days to Close', format: 'decimal', desiredDir: 'down' },
];

const RADAR_DIMENSIONS = [
  { key: 'callQuality', label: 'Call Quality' },
  { key: 'objHandling', label: 'Obj. Handling' },
  { key: 'closeRate100', label: 'Close Rate' },
  { key: 'showRate100', label: 'Show Rate' },
  { key: 'objResRate100', label: 'Obj. Resolution' },
];

/* ───────────────────────────────────────────────────────────────── */
/*  CLOSER COLOR CYCLE                                              */
/* ───────────────────────────────────────────────────────────────── */

const CLOSER_COLORS = [
  COLORS.neon.green, COLORS.neon.cyan, COLORS.neon.purple,
  COLORS.neon.amber, COLORS.neon.red, COLORS.neon.blue,
];

function getCloserColor(index) {
  return CLOSER_COLORS[index % CLOSER_COLORS.length];
}

/* ───────────────────────────────────────────────────────────────── */
/*  HOOKS: Build live closer data from DataContext                  */
/* ───────────────────────────────────────────────────────────────── */

function useLiveCloserData() {
  const { rawData } = useData();
  const { queryParams } = useFilters();

  return useMemo(() => {
    if (!rawData || !rawData.calls) return { closers: [], teamAvg: null };

    const filters = {
      dateStart: queryParams.dateStart,
      dateEnd: queryParams.dateEnd,
      closerId: null,
      granularity: 'weekly',
      objectionType: null,
      riskCategory: null,
    };

    const scoreboard = computePageData('closer-scoreboard', rawData, filters);
    if (!scoreboard || scoreboard.isEmpty || !scoreboard.closerStats) {
      return { closers: [], teamAvg: null };
    }

    const stats = scoreboard.closerStats;

    // Build closer objects with colors
    const closers = stats.map((c, i) => ({
      id: c.closerId || c.name,
      name: c.name,
      avatar: c.name[0],
      color: getCloserColor(i),
      closeRate: c.closeRate,
      revenue: c.revenue,
      cash: c.cash,
      callsHeld: c.heldCount,
      showRate: c.showRate,
      avgDealSize: c.avgDealSize,
      objResRate: c.objResRate,
      callQuality: c.callQuality,
      objHandling: c.objHandling,
      daysToClose: c.daysToClose,
      callsToClose: c.callsToClose,
      dealsClosed: c.dealsClosed,
      cashPerCall: c.heldCount > 0 ? Math.round(c.cash / c.heldCount) : 0,
      revenuePerCall: c.heldCount > 0 ? Math.round(c.revenue / c.heldCount) : 0,
      // Scaled for radar (0-10)
      closeRate100: c.closeRate * 100 / 5, // 20% = 4, 50% = 10
      showRate100: c.showRate * 100 / 10, // 100% = 10
      objResRate100: c.objResRate * 100 / 10,
    }));

    // Team average
    if (closers.length > 0) {
      const avg = (arr, key) => arr.reduce((s, c) => s + (c[key] || 0), 0) / arr.length;
      const teamAvg = {
        id: 'team', name: 'Team Avg', avatar: 'AVG', color: COLORS.text.muted,
        closeRate: avg(closers, 'closeRate'),
        revenue: Math.round(avg(closers, 'revenue')),
        cash: Math.round(avg(closers, 'cash')),
        callsHeld: Math.round(avg(closers, 'callsHeld')),
        showRate: avg(closers, 'showRate'),
        avgDealSize: Math.round(avg(closers, 'avgDealSize')),
        objResRate: avg(closers, 'objResRate'),
        callQuality: Number(avg(closers, 'callQuality').toFixed(1)),
        objHandling: Number(avg(closers, 'objHandling').toFixed(1)),
        daysToClose: Number(avg(closers, 'daysToClose').toFixed(1)),
        callsToClose: Number(avg(closers, 'callsToClose').toFixed(1)),
        cashPerCall: Math.round(avg(closers, 'cashPerCall')),
        revenuePerCall: Math.round(avg(closers, 'revenuePerCall')),
        closeRate100: avg(closers, 'closeRate100'),
        showRate100: avg(closers, 'showRate100'),
        objResRate100: avg(closers, 'objResRate100'),
      };
      return { closers, teamAvg };
    }

    return { closers, teamAvg: null };
  }, [rawData, queryParams.dateStart, queryParams.dateEnd]);
}

/* ───────────────────────────────────────────────────────────────── */
/*  SMALL COMPONENTS                                                */
/* ───────────────────────────────────────────────────────────────── */

/** Pill selector for closer names */
function CloserPill({ closer, isActive, onClick }) {
  return (
    <ButtonBase
      onClick={onClick}
      sx={{
        px: 1.5, py: 0.5, borderRadius: 2,
        border: `1px solid ${isActive ? hexToRgba(closer.color, 0.6) : COLORS.border.subtle}`,
        background: isActive ? hexToRgba(closer.color, 0.12) : 'transparent',
        transition: 'all 0.2s ease',
        display: 'flex', alignItems: 'center', gap: 0.75,
        '&:hover': {
          borderColor: hexToRgba(closer.color, 0.5),
          background: hexToRgba(closer.color, 0.08),
        },
      }}
    >
      <Box
        sx={{
          width: 22, height: 22, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hexToRgba(closer.color, 0.2),
          border: `1.5px solid ${hexToRgba(closer.color, 0.5)}`,
        }}
      >
        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: closer.color }}>
          {closer.avatar || closer.name[0]}
        </Typography>
      </Box>
      <Typography sx={{ fontSize: '0.78rem', fontWeight: isActive ? 600 : 400, color: isActive ? closer.color : COLORS.text.secondary }}>
        {closer.name}
      </Typography>
    </ButtonBase>
  );
}

/** Priority badge */
function PriorityBadge({ priority }) {
  const cfg = {
    high: { label: 'HIGH PRIORITY', color: COLORS.neon.red },
    medium: { label: 'MEDIUM', color: COLORS.neon.amber },
    low: { label: 'LOW', color: COLORS.neon.green },
  };
  const { label, color } = cfg[priority] || cfg.medium;
  return (
    <Box sx={{ display: 'inline-flex', px: 1, py: 0.25, borderRadius: 1, border: `1px solid ${hexToRgba(color, 0.4)}`, background: hexToRgba(color, 0.1) }}>
      <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color }}>{label}</Typography>
    </Box>
  );
}

/** Insight type tag */
function InsightTag({ type }) {
  const cfg = {
    strength: { label: 'STRENGTH', color: COLORS.neon.green, icon: 'check_circle' },
    opportunity: { label: 'OPPORTUNITY', color: COLORS.neon.amber, icon: 'lightbulb' },
    concern: { label: 'CONCERN', color: COLORS.neon.red, icon: 'error_outline' },
    action: { label: 'RECOMMENDED ACTION', color: COLORS.neon.cyan, icon: 'arrow_forward' },
  };
  const { label, color, icon } = cfg[type] || cfg.opportunity;
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 14, color }}>{icon}</span>
      <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color }}>{label}</Typography>
    </Box>
  );
}

/** Format a metric value by type */
function fmt(value, format) {
  if (value == null) return '—';
  switch (format) {
    case 'percent': return fmtPercent(value);
    case 'currency': return fmtDollar(value);
    case 'score': return typeof value === 'number' ? value.toFixed(1) : value;
    case 'decimal': return typeof value === 'number' ? value.toFixed(1) : value;
    default: return fmtNumber(value);
  }
}

/* ───────────────────────────────────────────────────────────────── */
/*  LOADING SKELETON                                                */
/* ───────────────────────────────────────────────────────────────── */

function InsightSkeleton({ count = 3 }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Box
          key={i}
          sx={{
            p: 2.5, borderRadius: `${LAYOUT.cardBorderRadius}px`,
            background: COLORS.bg.secondary, border: `1px solid ${COLORS.border.subtle}`,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
            <Skeleton variant="rounded" width={32} height={32} sx={{ bgcolor: COLORS.bg.tertiary }} />
            <Box sx={{ flex: 1 }}>
              <Skeleton variant="text" width="30%" sx={{ bgcolor: COLORS.bg.tertiary, fontSize: '0.65rem' }} />
              <Skeleton variant="text" width="70%" sx={{ bgcolor: COLORS.bg.tertiary, fontSize: '0.95rem' }} />
            </Box>
            <Skeleton variant="rounded" width={80} height={20} sx={{ bgcolor: COLORS.bg.tertiary }} />
          </Box>
          <Skeleton variant="text" width="100%" sx={{ bgcolor: COLORS.bg.tertiary }} />
          <Skeleton variant="text" width="85%" sx={{ bgcolor: COLORS.bg.tertiary }} />
          <Skeleton variant="rounded" width="100%" height={40} sx={{ bgcolor: COLORS.bg.tertiary, mt: 1 }} />
        </Box>
      ))}
    </Box>
  );
}

const AI_PROVIDER_LABELS = { claude: 'Claude (Anthropic)', chatgpt: 'ChatGPT (OpenAI)', gemini: 'Gemini (Google)' };

function GeneratingBanner() {
  const { aiProvider } = useAuth();
  const providerLabel = AI_PROVIDER_LABELS[aiProvider] || AI_PROVIDER_LABELS.claude;
  return (
    <Box sx={{
      mb: 3, p: 2, borderRadius: `${LAYOUT.cardBorderRadius}px`,
      background: hexToRgba(COLORS.neon.purple, 0.06),
      border: `1px solid ${hexToRgba(COLORS.neon.purple, 0.2)}`,
      display: 'flex', alignItems: 'center', gap: 1.5,
    }}>
      <Box sx={{
        width: 24, height: 24, borderRadius: '50%',
        border: `2px solid ${COLORS.neon.purple}`,
        borderTopColor: 'transparent',
        animation: 'spin 1s linear infinite',
        '@keyframes spin': { '100%': { transform: 'rotate(360deg)' } },
      }} />
      <Box>
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: COLORS.neon.purple }}>
          Generating AI Analysis...
        </Typography>
        <Typography sx={{ fontSize: '0.7rem', color: COLORS.text.muted }}>
          {providerLabel} is analyzing your team data. This may take 15-30 seconds on first visit.
        </Typography>
      </Box>
    </Box>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/*  SUMMARY ROW — Driven by AI data                                */
/* ───────────────────────────────────────────────────────────────── */

function SummaryRow({ summaryStats }) {
  if (!summaryStats) return null;
  const stats = [
    { label: 'Total Revenue', value: summaryStats.totalRevenue != null ? fmtDollar(summaryStats.totalRevenue) : '—', color: COLORS.neon.green },
    { label: 'Team Close Rate', value: summaryStats.teamCloseRate || '—', color: COLORS.neon.cyan },
    { label: 'Calls Analyzed', value: summaryStats.callsAnalyzed != null ? fmtNumber(summaryStats.callsAnalyzed) : '—', color: COLORS.neon.purple },
    { label: 'Insights Generated', value: summaryStats.insightsGenerated != null ? String(summaryStats.insightsGenerated) : '—', color: COLORS.neon.amber },
    { label: 'High Priority', value: summaryStats.highPriorityCount != null ? String(summaryStats.highPriorityCount) : '—', color: COLORS.neon.red },
  ];
  return (
    <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
      {stats.map(s => (
        <Box
          key={s.label}
          sx={{
            flex: '1 1 120px', p: 1.5, borderRadius: `${LAYOUT.cardBorderRadius}px`,
            background: COLORS.bg.secondary, border: `1px solid ${COLORS.border.subtle}`, textAlign: 'center',
          }}
        >
          <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, color: s.color, lineHeight: 1 }}>{s.value}</Typography>
          <Typography sx={{ fontSize: '0.6rem', color: COLORS.text.muted, letterSpacing: '0.08em', textTransform: 'uppercase', mt: 0.5 }}>{s.label}</Typography>
        </Box>
      ))}
    </Box>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/*  TEAM INSIGHT CARD                                               */
/* ───────────────────────────────────────────────────────────────── */

function TeamInsightCard({ insight }) {
  const accent = COLORS.neon[insight.color] || COLORS.neon.cyan;
  return (
    <Box
      sx={{
        p: 2.5, borderRadius: `${LAYOUT.cardBorderRadius}px`,
        background: COLORS.bg.secondary,
        border: `1px solid ${hexToRgba(accent, 0.2)}`,
        transition: 'all 0.25s ease',
        '&:hover': { borderColor: hexToRgba(accent, 0.5), boxShadow: `0 0 24px ${hexToRgba(accent, 0.15)}` },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ width: 32, height: 32, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexToRgba(accent, 0.12), border: `1px solid ${hexToRgba(accent, 0.25)}`, flexShrink: 0 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: accent }}>{insight.icon || 'auto_awesome'}</span>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.65rem', color: COLORS.text.muted, letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.25 }}>{insight.category}</Typography>
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: COLORS.text.primary, lineHeight: 1.3 }}>{insight.title}</Typography>
        </Box>
        <PriorityBadge priority={insight.priority} />
      </Box>
      <Typography sx={{ fontSize: '0.85rem', color: COLORS.text.secondary, lineHeight: 1.6, mb: 2 }}>{insight.body}</Typography>
      {insight.action && (
        <Box sx={{ p: 1.5, borderRadius: '8px', background: hexToRgba(accent, 0.06), border: `1px solid ${hexToRgba(accent, 0.15)}`, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: accent, marginTop: 2, flexShrink: 0 }}>arrow_forward</span>
          <Typography sx={{ fontSize: '0.8rem', color: COLORS.text.primary, lineHeight: 1.5 }}>{insight.action}</Typography>
        </Box>
      )}
    </Box>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/*  INDIVIDUAL CLOSER CARD                                          */
/* ───────────────────────────────────────────────────────────────── */

function CloserInsightCard({ data, liveCloser }) {
  const colorMap = { green: COLORS.neon.green, cyan: COLORS.neon.cyan, purple: COLORS.neon.purple, amber: COLORS.neon.amber, red: COLORS.neon.red, blue: COLORS.neon.blue };
  // Use live closer data for stats (more accurate), AI data for insights text
  const c = {
    name: data.name,
    color: liveCloser?.color || colorMap[data.color] || COLORS.neon.cyan,
    avatar: data.name?.[0] || '?',
    closeRate: liveCloser?.closeRate ?? data.stats?.closeRate,
    revenue: liveCloser?.revenue ?? data.stats?.revenue,
    adherence: liveCloser?.callQuality ?? data.stats?.adherence,
    callsHeld: liveCloser?.callsHeld ?? data.stats?.callsHeld,
    showRate: liveCloser?.showRate ?? data.stats?.showRate,
    avgDealSize: liveCloser?.avgDealSize ?? data.stats?.avgDealSize,
    objResRate: liveCloser?.objResRate ?? data.stats?.objResolution,
    cash: liveCloser?.cash ?? data.stats?.cash,
    dealsClosed: liveCloser?.dealsClosed ?? data.stats?.dealsClosed,
  };

  return (
    <Box
      sx={{
        p: 2.5, borderRadius: `${LAYOUT.cardBorderRadius}px`,
        background: COLORS.bg.secondary, border: `1px solid ${COLORS.border.subtle}`,
        transition: 'all 0.25s ease',
        '&:hover': { borderColor: hexToRgba(c.color, 0.4), boxShadow: `0 0 24px ${hexToRgba(c.color, 0.12)}` },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <Box sx={{ width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexToRgba(c.color, 0.15), border: `2px solid ${hexToRgba(c.color, 0.5)}`, flexShrink: 0 }}>
          <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: c.color }}>{c.avatar}</Typography>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, color: COLORS.text.primary }}>{c.name}</Typography>
          <Box sx={{ display: 'flex', gap: 2, mt: 0.5, flexWrap: 'wrap' }}>
            {[
              { label: 'Close Rate', value: c.closeRate != null ? fmtPercent(c.closeRate) : '—' },
              { label: 'Revenue', value: c.revenue != null ? fmtDollar(c.revenue) : '—' },
              { label: 'Show Rate', value: c.showRate != null ? fmtPercent(c.showRate) : '—' },
              { label: 'Calls Held', value: c.callsHeld != null ? fmtNumber(c.callsHeld) : '—' },
              { label: 'Cash', value: c.cash != null ? fmtDollar(c.cash) : '—' },
              { label: 'Call Quality', value: c.adherence != null ? Number(c.adherence).toFixed(1) : '—' },
            ].map(s => (
              <Box key={s.label} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5 }}>
                <Typography sx={{ fontSize: '0.6rem', color: COLORS.text.muted, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{s.label}</Typography>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: COLORS.text.primary }}>{s.value}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {(data.insights || []).map((ins, i) => (
          <Box key={i}>
            <InsightTag type={ins.type} />
            <Typography sx={{ fontSize: '0.83rem', color: COLORS.text.secondary, lineHeight: 1.55, mt: 0.5 }}>{ins.text}</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/*  COMPARISON TOOL — Uses live data + AI narrative from BQ         */
/* ───────────────────────────────────────────────────────────────── */

function ComparisonTool({ comparisons }) {
  const { closers, teamAvg } = useLiveCloserData();
  const options = teamAvg ? [...closers, teamAvg] : closers;

  const [leftId, setLeftId] = useState(null);
  const [rightId, setRightId] = useState(null);

  // Default to first two closers when data loads
  const left = options.find(c => c.id === leftId) || options[0];
  const right = options.find(c => c.id === rightId) || (teamAvg || options[1]);

  if (options.length < 2) {
    return (
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <Typography sx={{ color: COLORS.text.muted }}>Need at least 2 closers for comparison.</Typography>
      </Box>
    );
  }

  /** Determine who "wins" each metric row */
  function getWinner(metric) {
    const lv = left?.[metric.key];
    const rv = right?.[metric.key];
    if (lv == null || rv == null || lv === rv) return 'tie';
    const leftBetter = metric.desiredDir === 'up' ? lv > rv : lv < rv;
    return leftBetter ? 'left' : 'right';
  }

  /** Whether one side is team average (triggers AI narrative) */
  const isTeamComparison = left?.id === 'team' || right?.id === 'team';

  // AI narrative — only used for closer-vs-team comparisons
  const aiNarrative = useMemo(() => {
    if (!isTeamComparison || !comparisons || !left) return null;
    const closerSide = left.id !== 'team' ? left : right;
    const match = comparisons.find(c =>
      c.closerId === closerSide?.id || c.closerName === closerSide?.name
    );
    return match?.comparisonSummary || null;
  }, [comparisons, left, right, isTeamComparison]);

  /** Templated factual summary for closer-vs-closer comparisons */
  const templatedSummary = useMemo(() => {
    if (isTeamComparison || !left || !right) return null;

    const leftWins = [];
    const rightWins = [];
    const ties = [];

    COMPARISON_METRICS.forEach(metric => {
      const lv = left[metric.key];
      const rv = right[metric.key];
      if (lv == null || rv == null || lv === rv) { ties.push(metric); return; }
      const leftBetter = metric.desiredDir === 'up' ? lv > rv : lv < rv;
      const entry = { ...metric, leftVal: fmt(lv, metric.format), rightVal: fmt(rv, metric.format) };
      if (leftBetter) leftWins.push(entry); else rightWins.push(entry);
    });

    const parts = [];

    if (leftWins.length > 0) {
      const list = leftWins.map(m => `${m.label} (${m.leftVal} vs ${m.rightVal})`).join(', ');
      parts.push({ bold: `${left.name} outpaces ${right.name}`, rest: ` in ${list}.` });
    }

    if (rightWins.length > 0) {
      const list = rightWins.map(m => `${m.label} (${m.rightVal} vs ${m.leftVal})`).join(', ');
      parts.push({ bold: `${right.name} edges out ${left.name}`, rest: ` in ${list}.` });
    }

    const leftCount = leftWins.length;
    const rightCount = rightWins.length;
    const total = COMPARISON_METRICS.length;
    const overallWinner = leftCount > rightCount ? left.name : rightCount > leftCount ? right.name : null;
    const overallLine = overallWinner
      ? `Overall: ${overallWinner} wins ${Math.max(leftCount, rightCount)} of ${total} metrics.`
      : `Overall: tied at ${leftCount} metrics each.`;

    return { parts, overallLine };
  }, [left, right, isTeamComparison]);

  return (
    <Box>
      {/* Closer selectors */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mb: 3, flexWrap: 'wrap' }}>
        <Box>
          <Typography sx={{ fontSize: '0.6rem', color: COLORS.text.muted, letterSpacing: '0.1em', textTransform: 'uppercase', mb: 1 }}>Compare</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {options.map(c => <CloserPill key={c.id} closer={c} isActive={(left?.id || options[0]?.id) === c.id} onClick={() => setLeftId(c.id)} />)}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', pt: 2 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: COLORS.text.muted }}>compare_arrows</span>
        </Box>
        <Box>
          <Typography sx={{ fontSize: '0.6rem', color: COLORS.text.muted, letterSpacing: '0.1em', textTransform: 'uppercase', mb: 1 }}>Against</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {options.map(c => <CloserPill key={c.id} closer={c} isActive={(right?.id || (teamAvg?.id || options[1]?.id)) === c.id} onClick={() => setRightId(c.id)} />)}
          </Box>
        </Box>
      </Box>

      {/* AI comparison insight — only for closer vs team avg */}
      {isTeamComparison && aiNarrative && (
        <Box sx={{ mb: 3, p: 2, borderRadius: `${LAYOUT.cardBorderRadius}px`, background: hexToRgba(COLORS.neon.purple, 0.06), border: `1px solid ${hexToRgba(COLORS.neon.purple, 0.2)}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: COLORS.neon.purple }}>auto_awesome</span>
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: COLORS.neon.purple, textTransform: 'uppercase' }}>AI Comparison Analysis</Typography>
          </Box>
          <Typography sx={{ fontSize: '0.83rem', color: COLORS.text.primary, lineHeight: 1.55 }}>{aiNarrative}</Typography>
        </Box>
      )}

      {/* Templated factual summary — for closer vs closer */}
      {!isTeamComparison && templatedSummary && (
        <Box sx={{ mb: 3, p: 2, borderRadius: `${LAYOUT.cardBorderRadius}px`, background: hexToRgba(COLORS.neon.cyan, 0.04), border: `1px solid ${hexToRgba(COLORS.neon.cyan, 0.15)}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: COLORS.neon.cyan }}>assessment</span>
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: COLORS.neon.cyan, textTransform: 'uppercase' }}>Head-to-Head Summary</Typography>
          </Box>
          <Typography sx={{ fontSize: '0.83rem', color: COLORS.text.primary, lineHeight: 1.7 }}>
            {templatedSummary.parts.map((p, i) => (
              <React.Fragment key={i}>
                {i > 0 && ' '}
                <strong>{p.bold}</strong>{p.rest}
              </React.Fragment>
            ))}
            {' '}{templatedSummary.overallLine}
          </Typography>
        </Box>
      )}

      {left && right && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 340px' }, gap: 3 }}>
          {/* Metric comparison table */}
          <Box sx={{ borderRadius: `${LAYOUT.cardBorderRadius}px`, background: COLORS.bg.secondary, border: `1px solid ${COLORS.border.subtle}`, overflow: 'hidden' }}>
            {/* Table header */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', p: 1.5, borderBottom: `1px solid ${COLORS.border.subtle}`, background: COLORS.bg.tertiary }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: COLORS.text.muted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Metric</Typography>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: left.color, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>{left.name}</Typography>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: right.color, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'center' }}>{right.name}</Typography>
            </Box>
            {/* Table rows */}
            {COMPARISON_METRICS.map((metric, i) => {
              const winner = getWinner(metric);
              return (
                <Box
                  key={metric.key}
                  sx={{
                    display: 'grid', gridTemplateColumns: '1fr 120px 120px', p: 1.25, px: 1.5,
                    borderBottom: i < COMPARISON_METRICS.length - 1 ? `1px solid ${hexToRgba(COLORS.border.subtle, 0.5)}` : 'none',
                    '&:hover': { background: hexToRgba(COLORS.neon.cyan, 0.03) },
                  }}
                >
                  <Typography sx={{ fontSize: '0.8rem', color: COLORS.text.secondary }}>{metric.label}</Typography>
                  <Typography sx={{
                    fontSize: '0.85rem', fontWeight: winner === 'left' ? 700 : 400, textAlign: 'center',
                    color: winner === 'left' ? COLORS.neon.green : COLORS.text.primary,
                  }}>
                    {fmt(left[metric.key], metric.format)} {winner === 'left' && '\u25cf'}
                  </Typography>
                  <Typography sx={{
                    fontSize: '0.85rem', fontWeight: winner === 'right' ? 700 : 400, textAlign: 'center',
                    color: winner === 'right' ? COLORS.neon.green : COLORS.text.primary,
                  }}>
                    {fmt(right[metric.key], metric.format)} {winner === 'right' && '\u25cf'}
                  </Typography>
                </Box>
              );
            })}
            {/* Score summary */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', p: 1.5, borderTop: `2px solid ${COLORS.border.default}`, background: COLORS.bg.tertiary }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: COLORS.text.primary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Metrics Won</Typography>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, textAlign: 'center', color: left.color }}>
                {COMPARISON_METRICS.filter(m => getWinner(m) === 'left').length}
              </Typography>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, textAlign: 'center', color: right.color }}>
                {COMPARISON_METRICS.filter(m => getWinner(m) === 'right').length}
              </Typography>
            </Box>
          </Box>

          {/* Radar chart */}
          <Box sx={{ borderRadius: `${LAYOUT.cardBorderRadius}px`, background: COLORS.bg.secondary, border: `1px solid ${COLORS.border.subtle}`, p: 2, display: 'flex', flexDirection: 'column' }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: COLORS.text.muted, letterSpacing: '0.08em', textTransform: 'uppercase', mb: 1, textAlign: 'center' }}>
              Skills Radar
            </Typography>
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <TronRadarChart
                axes={RADAR_DIMENSIONS.map(d => d.label)}
                datasets={[
                  { label: left.name, values: RADAR_DIMENSIONS.map(d => left[d.key] || 0), color: left.color },
                  { label: right.name, values: RADAR_DIMENSIONS.map(d => right[d.key] || 0), color: right.color },
                ]}
                maxValue={10}
                height={280}
              />
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/*  TAB SWITCHER                                                    */
/* ───────────────────────────────────────────────────────────────── */

function TabSwitcher({ tabs, activeTab, onTabChange, lockedTabs }) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Mobile: dropdown select
  if (isMobile) {
    return (
      <Select
        value={activeTab}
        onChange={(e) => {
          const val = e.target.value;
          if (!lockedTabs?.has(val)) onTabChange(val);
        }}
        size="small"
        sx={{
          mb: 3, minWidth: 180,
          background: COLORS.bg.secondary,
          border: `1px solid ${COLORS.border.subtle}`,
          borderRadius: 2,
          color: COLORS.neon.cyan,
          fontSize: '0.85rem',
          fontWeight: 600,
          '.MuiOutlinedInput-notchedOutline': { border: 'none' },
          '.MuiSvgIcon-root': { color: COLORS.text.secondary },
        }}
        MenuProps={{
          PaperProps: {
            sx: {
              background: COLORS.bg.elevated,
              border: `1px solid ${COLORS.border.subtle}`,
              borderRadius: 2,
            },
          },
        }}
      >
        {tabs.map(tab => {
          const isLocked = lockedTabs?.has(tab.id);
          return (
            <MenuItem
              key={tab.id}
              value={tab.id}
              disabled={isLocked}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                color: isLocked ? COLORS.text.muted : COLORS.text.primary,
                fontSize: '0.85rem',
                '&.Mui-selected': { background: hexToRgba(COLORS.neon.cyan, 0.12), color: COLORS.neon.cyan },
                '&:hover': { background: hexToRgba(COLORS.neon.cyan, 0.06) },
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{isLocked ? 'lock' : tab.icon}</span>
              {tab.label}
            </MenuItem>
          );
        })}
      </Select>
    );
  }

  // Desktop: horizontal button tabs
  return (
    <Box sx={{ display: 'flex', gap: 0.5, mb: 3, p: 0.5, borderRadius: 2, background: COLORS.bg.secondary, border: `1px solid ${COLORS.border.subtle}`, width: 'fit-content' }}>
      {tabs.map(tab => {
        const isLocked = lockedTabs?.has(tab.id);
        const isActive = activeTab === tab.id && !isLocked;

        const button = (
          <ButtonBase
            key={tab.id}
            onClick={() => !isLocked && onTabChange(tab.id)}
            sx={{
              px: 2, py: 0.75, borderRadius: 1.5,
              background: isActive ? hexToRgba(COLORS.neon.cyan, 0.12) : 'transparent',
              border: isActive ? `1px solid ${hexToRgba(COLORS.neon.cyan, 0.3)}` : '1px solid transparent',
              transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', gap: 0.75,
              opacity: isLocked ? 0.4 : 1,
              cursor: isLocked ? 'default' : 'pointer',
              '&:hover': isLocked ? {} : { background: hexToRgba(COLORS.neon.cyan, 0.06) },
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: isActive ? COLORS.neon.cyan : COLORS.text.muted }}>{isLocked ? 'lock' : tab.icon}</span>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: isActive ? 600 : 400, color: isActive ? COLORS.neon.cyan : COLORS.text.secondary }}>
              {tab.label}
            </Typography>
          </ButtonBase>
        );

        if (isLocked) {
          return (
            <Tooltip
              key={tab.id}
              title="Upgrade to Insight for team & individual analysis"
              arrow
              placement="bottom"
              slotProps={{
                tooltip: {
                  sx: {
                    bgcolor: COLORS.bg.elevated,
                    color: COLORS.text.primary,
                    border: `1px solid ${COLORS.tier?.insight || COLORS.neon.amber}`,
                    fontSize: '0.8rem',
                    py: 1, px: 1.5,
                    boxShadow: `0 0 12px ${hexToRgba(COLORS.neon.amber, 0.2)}`,
                  },
                },
                arrow: { sx: { color: COLORS.bg.elevated } },
              }}
            >
              <span>{button}</span>
            </Tooltip>
          );
        }

        return button;
      })}
    </Box>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/*  MAIN PAGE                                                       */
/* ───────────────────────────────────────────────────────────────── */

const TABS = [
  { id: 'overview', label: 'Overview', icon: 'dashboard' },
  { id: 'team', label: 'Team Insights', icon: 'groups' },
  { id: 'individual', label: 'Individual', icon: 'person' },
  { id: 'compare', label: 'Compare', icon: 'compare_arrows' },
];

export default function DataAnalysisPage() {
  const [activeTab, setActiveTab] = useState('overview');
  const { tabs: allTabs, isLoading: anyLoading } = useDataAnalysisAllTabs();
  const { closers: liveClosers, teamAvg } = useLiveCloserData();
  const { tier } = useAuth();

  // Basic tier can only see the Overview tab — lock closer-specific tabs
  const isBasic = tier === 'basic';
  const lockedTabs = useMemo(() => {
    if (!isBasic) return null;
    return new Set(['team', 'individual', 'compare']);
  }, [isBasic]);

  // Get current tab data
  const aiData = allTabs[activeTab]?.data || null;
  const generatedAt = allTabs[activeTab]?.generatedAt || null;
  const isLoading = anyLoading && !aiData;

  // Format "last updated" from generatedAt
  const lastUpdated = useMemo(() => {
    if (!generatedAt) return null;
    try {
      const d = new Date(generatedAt);
      return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch { return null; }
  }, [generatedAt]);

  // Download all AI insights as a text document
  const handleDownload = useCallback(() => {
    const lines = [];
    const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    lines.push(`CLOSERMETRIX — AI DATA ANALYSIS REPORT`);
    lines.push(`Generated: ${now}`);
    lines.push(`Closers: ${liveClosers.length}`);
    lines.push('='.repeat(60));
    lines.push('');

    // Overview
    const ov = allTabs.overview?.data;
    if (ov) {
      lines.push('EXECUTIVE OVERVIEW');
      lines.push('-'.repeat(40));
      if (ov.executiveSummary) lines.push(ov.executiveSummary);
      lines.push('');
      if (ov.summaryStats) {
        const ss = ov.summaryStats;
        if (ss.totalRevenue != null) lines.push(`Total Revenue: ${fmtDollar(ss.totalRevenue)}`);
        if (ss.teamCloseRate) lines.push(`Team Close Rate: ${ss.teamCloseRate}`);
        if (ss.callsAnalyzed != null) lines.push(`Calls Analyzed: ${fmtNumber(ss.callsAnalyzed)}`);
      }
      if (ov.priorityActions?.length > 0) {
        lines.push('');
        lines.push('Priority Actions:');
        ov.priorityActions.forEach((a, i) => {
          lines.push(`  ${i + 1}. [${(a.priority || '').toUpperCase()}] ${a.title}`);
          lines.push(`     ${a.body}`);
          if (a.action) lines.push(`     -> ${a.action}`);
        });
      }
      lines.push('');
    }

    // Team
    const tm = allTabs.team?.data;
    if (tm?.insights?.length > 0) {
      lines.push('TEAM INSIGHTS');
      lines.push('-'.repeat(40));
      tm.insights.forEach((ins, i) => {
        lines.push(`${i + 1}. [${(ins.priority || '').toUpperCase()}] ${ins.category}: ${ins.title}`);
        lines.push(`   ${ins.body}`);
        if (ins.action) lines.push(`   -> ${ins.action}`);
        lines.push('');
      });
    }

    // Individual
    const ind = allTabs.individual?.data;
    if (ind?.closers?.length > 0) {
      lines.push('INDIVIDUAL CLOSER INSIGHTS');
      lines.push('-'.repeat(40));
      ind.closers.forEach(cl => {
        const live = liveClosers.find(c => c.name === cl.name || c.id === cl.closerId);
        lines.push(`${cl.name}`);
        if (live) {
          lines.push(`  Close Rate: ${fmtPercent(live.closeRate)} | Revenue: ${fmtDollar(live.revenue)} | Show Rate: ${fmtPercent(live.showRate)} | Calls: ${live.callsHeld}`);
        }
        (cl.insights || []).forEach(ins => {
          lines.push(`  [${(ins.type || '').toUpperCase()}] ${ins.text}`);
        });
        lines.push('');
      });
    }

    // Compare
    const cmp = allTabs.compare?.data;
    if (cmp?.comparisons?.length > 0) {
      lines.push('CLOSER COMPARISONS (vs Team Average)');
      lines.push('-'.repeat(40));
      cmp.comparisons.forEach(c => {
        lines.push(`${c.closerName}`);
        lines.push(`  ${c.comparisonSummary}`);
        if (c.keyStrength) lines.push(`  Strength: ${c.keyStrength}`);
        if (c.keyGap) lines.push(`  Gap: ${c.keyGap}`);
        lines.push('');
      });
    }

    // Create and trigger download
    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const monthYear = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    const filename = `${monthYear} AI Analysis.txt`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Delay cleanup so browser can start the download
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 500);
  }, [allTabs, liveClosers]);

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <SectionHeader title="Data Analysis" color={COLORS.neon.purple} />
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.5, borderRadius: 2, background: hexToRgba(COLORS.neon.purple, 0.1), border: `1px solid ${hexToRgba(COLORS.neon.purple, 0.3)}` }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: COLORS.neon.purple }}>auto_awesome</span>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: COLORS.neon.purple }}>AI-POWERED</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, ml: 'auto' }}>
          {lastUpdated && (
            <Typography sx={{ fontSize: '0.7rem', color: COLORS.text.muted }}>
              Generated {lastUpdated} | {liveClosers.length} closers
            </Typography>
          )}
          <ButtonBase
            onClick={handleDownload}
            disabled={!allTabs.overview?.data && !allTabs.team?.data}
            sx={{
              px: 1.5, py: 0.5, borderRadius: 1.5,
              border: `1px solid ${COLORS.border.subtle}`,
              background: COLORS.bg.secondary,
              display: 'flex', alignItems: 'center', gap: 0.75,
              transition: 'all 0.2s ease',
              opacity: (!allTabs.overview?.data && !allTabs.team?.data) ? 0.4 : 1,
              '&:hover': { borderColor: hexToRgba(COLORS.neon.cyan, 0.4), background: hexToRgba(COLORS.neon.cyan, 0.06) },
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: COLORS.neon.cyan }}>download</span>
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: COLORS.text.secondary }}>Download</Typography>
          </ButtonBase>
        </Box>
      </Box>

      {/* Tabs */}
      <TabSwitcher tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} lockedTabs={lockedTabs} />

      {/* Loading state */}
      {isLoading && <GeneratingBanner />}

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <>
          {isLoading && !aiData ? (
            <>
              <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Box key={i} sx={{ flex: '1 1 120px', p: 1.5, borderRadius: `${LAYOUT.cardBorderRadius}px`, background: COLORS.bg.secondary, border: `1px solid ${COLORS.border.subtle}`, textAlign: 'center' }}>
                    <Skeleton variant="text" width="60%" sx={{ bgcolor: COLORS.bg.tertiary, fontSize: '1.4rem', mx: 'auto' }} />
                    <Skeleton variant="text" width="80%" sx={{ bgcolor: COLORS.bg.tertiary, fontSize: '0.6rem', mx: 'auto' }} />
                  </Box>
                ))}
              </Box>
              <Skeleton variant="rounded" width="100%" height={80} sx={{ bgcolor: COLORS.bg.tertiary, mb: 3 }} />
              <InsightSkeleton count={2} />
            </>
          ) : aiData ? (
            <>
              <SummaryRow summaryStats={aiData.summaryStats} />

              {/* Executive Summary */}
              {aiData.executiveSummary && (
                <Box sx={{ mb: 3, p: 2.5, borderRadius: `${LAYOUT.cardBorderRadius}px`, background: `linear-gradient(135deg, ${hexToRgba(COLORS.neon.purple, 0.08)} 0%, ${hexToRgba(COLORS.neon.cyan, 0.05)} 100%)`, border: `1px solid ${hexToRgba(COLORS.neon.purple, 0.25)}`, boxShadow: `0 0 30px ${hexToRgba(COLORS.neon.purple, 0.1)}` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: COLORS.neon.purple }}>psychology</span>
                    <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', color: COLORS.neon.purple, textTransform: 'uppercase' }}>Executive Summary</Typography>
                  </Box>
                  <Typography sx={{ fontSize: '0.9rem', color: COLORS.text.primary, lineHeight: 1.6 }}>
                    {aiData.executiveSummary}
                  </Typography>
                </Box>
              )}

              {/* Trend Analysis — directional metric cards */}
              {aiData.trendAnalysis?.length > 0 && (
                <>
                  <Box sx={{ mb: 1 }}><SectionHeader title="Trend Analysis" color={COLORS.neon.cyan} /></Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 4 }}>
                    {aiData.trendAnalysis.map((t, idx) => {
                      const dirCfg = {
                        up: { icon: 'trending_up', color: COLORS.neon.green },
                        down: { icon: 'trending_down', color: COLORS.neon.red },
                        stable: { icon: 'trending_flat', color: COLORS.neon.amber },
                      };
                      const { icon, color } = dirCfg[t.direction] || dirCfg.stable;
                      return (
                        <Box key={idx} sx={{ p: 2, borderRadius: `${LAYOUT.cardBorderRadius}px`, background: COLORS.bg.secondary, border: `1px solid ${hexToRgba(color, 0.2)}`, transition: 'border-color 0.2s', '&:hover': { borderColor: hexToRgba(color, 0.4) } }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: COLORS.text.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t.metric}</Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 18, color }}>{icon}</span>
                              {t.changePercent != null && (
                                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color }}>
                                  {t.changePercent > 0 ? '+' : ''}{typeof t.changePercent === 'number' ? t.changePercent.toFixed(1) : t.changePercent}%
                                </Typography>
                              )}
                            </Box>
                          </Box>
                          <Box sx={{ display: 'flex', gap: 2, mb: 1 }}>
                            <Box>
                              <Typography sx={{ fontSize: '0.6rem', color: COLORS.text.muted }}>Current</Typography>
                              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: COLORS.text.primary }}>{t.current}</Typography>
                            </Box>
                            <Box>
                              <Typography sx={{ fontSize: '0.6rem', color: COLORS.text.muted }}>Previous</Typography>
                              <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: COLORS.text.secondary }}>{t.previous}</Typography>
                            </Box>
                          </Box>
                          {t.insight && (
                            <Typography sx={{ fontSize: '0.78rem', color: COLORS.text.secondary, lineHeight: 1.5 }}>{t.insight}</Typography>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                </>
              )}

              {/* Market Intelligence — pains/goals themes + script gaps */}
              {aiData.marketIntelligence && (
                <>
                  <Box sx={{ mb: 1 }}><SectionHeader title="Market Intelligence" color={COLORS.neon.purple} /></Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 3 }}>
                    {/* Pains themes */}
                    {aiData.marketIntelligence.topPains?.length > 0 && (
                      <Box sx={{ p: 2, borderRadius: `${LAYOUT.cardBorderRadius}px`, background: COLORS.bg.secondary, border: `1px solid ${hexToRgba(COLORS.neon.red, 0.15)}` }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: COLORS.neon.red }}>heart_broken</span>
                          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: COLORS.neon.red, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Top Prospect Pains</Typography>
                        </Box>
                        {aiData.marketIntelligence.topPains.map((p, idx) => (
                          <Box key={idx} sx={{ mb: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                              <Typography sx={{ fontSize: '0.78rem', color: COLORS.text.primary }}>{p.theme}</Typography>
                              <Typography sx={{ fontSize: '0.7rem', color: COLORS.text.muted }}>{p.count ? `${p.count} mentions` : `${p.percentage}%`}</Typography>
                            </Box>
                            <Box sx={{ height: 4, borderRadius: 2, background: hexToRgba(COLORS.neon.red, 0.1) }}>
                              <Box sx={{ height: '100%', borderRadius: 2, background: COLORS.neon.red, width: `${Math.min(p.percentage || (p.count ? p.count * 10 : 50), 100)}%`, transition: 'width 0.6s ease' }} />
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    )}
                    {/* Goals themes */}
                    {aiData.marketIntelligence.topGoals?.length > 0 && (
                      <Box sx={{ p: 2, borderRadius: `${LAYOUT.cardBorderRadius}px`, background: COLORS.bg.secondary, border: `1px solid ${hexToRgba(COLORS.neon.green, 0.15)}` }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 16, color: COLORS.neon.green }}>flag</span>
                          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: COLORS.neon.green, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Top Prospect Goals</Typography>
                        </Box>
                        {aiData.marketIntelligence.topGoals.map((g, idx) => (
                          <Box key={idx} sx={{ mb: 1 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                              <Typography sx={{ fontSize: '0.78rem', color: COLORS.text.primary }}>{g.theme}</Typography>
                              <Typography sx={{ fontSize: '0.7rem', color: COLORS.text.muted }}>{g.count ? `${g.count} mentions` : `${g.percentage}%`}</Typography>
                            </Box>
                            <Box sx={{ height: 4, borderRadius: 2, background: hexToRgba(COLORS.neon.green, 0.1) }}>
                              <Box sx={{ height: '100%', borderRadius: 2, background: COLORS.neon.green, width: `${Math.min(g.percentage || (g.count ? g.count * 10 : 50), 100)}%`, transition: 'width 0.6s ease' }} />
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    )}
                  </Box>
                  {/* Script alignment gaps */}
                  {aiData.marketIntelligence.scriptGaps?.length > 0 && (
                    <Box sx={{ p: 2, borderRadius: `${LAYOUT.cardBorderRadius}px`, background: hexToRgba(COLORS.neon.amber, 0.04), border: `1px solid ${hexToRgba(COLORS.neon.amber, 0.2)}`, mb: 4 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: COLORS.neon.amber }}>warning</span>
                        <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: COLORS.neon.amber, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Script Alignment Gaps</Typography>
                      </Box>
                      {aiData.marketIntelligence.scriptGaps.map((gap, idx) => (
                        <Box key={idx} sx={{ mb: idx < aiData.marketIntelligence.scriptGaps.length - 1 ? 1.5 : 0 }}>
                          <Typography sx={{ fontSize: '0.82rem', color: COLORS.text.primary, fontWeight: 600, mb: 0.25 }}>{gap.finding}</Typography>
                          <Typography sx={{ fontSize: '0.75rem', color: COLORS.neon.cyan, fontStyle: 'italic' }}>{gap.recommendation}</Typography>
                        </Box>
                      ))}
                    </Box>
                  )}
                </>
              )}

              {/* Priority Actions — show ALL priorities */}
              {aiData.priorityActions && aiData.priorityActions.length > 0 && (
                <>
                  <Box sx={{ mb: 1 }}><SectionHeader title="Priority Actions" color={COLORS.neon.red} /></Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
                    {aiData.priorityActions
                      .map((i, idx) => <TeamInsightCard key={idx} insight={i} />)}
                  </Box>
                </>
              )}

              {/* Closer Coaching — Insight+ only */}
              {!isBasic && aiData.closerCoaching?.length > 0 && (
                <>
                  <Box sx={{ mb: 1 }}><SectionHeader title="Closer Coaching" color={COLORS.neon.amber} /></Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 4 }}>
                    {aiData.closerCoaching.map((c, idx) => {
                      const statusCfg = {
                        strong: { color: COLORS.neon.green, icon: 'check_circle' },
                        improving: { color: COLORS.neon.cyan, icon: 'trending_up' },
                        declining: { color: COLORS.neon.red, icon: 'trending_down' },
                        'needs-coaching': { color: COLORS.neon.amber, icon: 'school' },
                      };
                      const { color, icon } = statusCfg[c.status] || statusCfg['needs-coaching'];
                      return (
                        <Box key={c.closerId || idx} sx={{ p: 2, borderRadius: `${LAYOUT.cardBorderRadius}px`, background: COLORS.bg.secondary, border: `1px solid ${hexToRgba(color, 0.2)}`, transition: 'border-color 0.2s', '&:hover': { borderColor: hexToRgba(color, 0.4) } }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18, color }}>{icon}</span>
                            <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: COLORS.text.primary, flex: 1 }}>{c.name}</Typography>
                            <Box sx={{ px: 0.75, py: 0.25, borderRadius: 1, background: hexToRgba(color, 0.1), border: `1px solid ${hexToRgba(color, 0.3)}` }}>
                              <Typography sx={{ fontSize: '0.5rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.status}</Typography>
                            </Box>
                          </Box>
                          {c.keyFinding && (
                            <Typography sx={{ fontSize: '0.78rem', color: COLORS.text.secondary, mb: 0.75, lineHeight: 1.5 }}>{c.keyFinding}</Typography>
                          )}
                          {c.recommendation && (
                            <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                              <span className="material-symbols-outlined" style={{ fontSize: 14, color: COLORS.neon.cyan, marginTop: 2 }}>arrow_forward</span>
                              <Typography sx={{ fontSize: '0.75rem', color: COLORS.neon.cyan, fontStyle: 'italic', lineHeight: 1.4 }}>{c.recommendation}</Typography>
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Box>
                </>
              )}

              {/* Quick Closer Overview — Insight+ only, tooltip for basic */}
              {aiData.closerQuickView && aiData.closerQuickView.length > 0 && (
                isBasic ? (
                  <Tooltip
                    title="Upgrade to Insight for individual closer breakdowns"
                    arrow
                    placement="top"
                    slotProps={{
                      tooltip: {
                        sx: {
                          bgcolor: COLORS.bg.elevated,
                          color: COLORS.text.primary,
                          border: `1px solid ${COLORS.tier?.insight || COLORS.neon.amber}`,
                          fontSize: '0.8rem',
                          py: 1, px: 1.5,
                          boxShadow: `0 0 12px ${hexToRgba(COLORS.neon.amber, 0.2)}`,
                        },
                      },
                      arrow: { sx: { color: COLORS.bg.elevated } },
                    }}
                  >
                    <Box sx={{ position: 'relative', cursor: 'default' }}>
                      <Box sx={{ filter: 'blur(6px)', opacity: 0.4, pointerEvents: 'none', userSelect: 'none' }}>
                        <Box sx={{ mb: 1 }}><SectionHeader title="Closer Quick View" color={COLORS.neon.cyan} /></Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: `repeat(${Math.min(aiData.closerQuickView.length, 4)}, 1fr)` }, gap: 2, mb: 3 }}>
                          {aiData.closerQuickView.slice(0, 4).map((c, i) => {
                            const color = getCloserColor(i);
                            return (
                              <Box key={c.closerId || c.name} sx={{ p: 2, borderRadius: `${LAYOUT.cardBorderRadius}px`, background: COLORS.bg.secondary, border: `1px solid ${hexToRgba(color, 0.2)}`, height: 100 }} />
                            );
                          })}
                        </Box>
                      </Box>
                    </Box>
                  </Tooltip>
                ) : (
                  <>
                    <Box sx={{ mb: 1 }}><SectionHeader title="Closer Quick View" color={COLORS.neon.cyan} /></Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: `repeat(${Math.min(aiData.closerQuickView.length, 4)}, 1fr)` }, gap: 2, mb: 3 }}>
                      {aiData.closerQuickView.map((c, i) => {
                        const color = getCloserColor(i);
                        const statusColors = { strong: COLORS.neon.green, average: COLORS.neon.amber, 'needs-coaching': COLORS.neon.red };
                        return (
                          <Box
                            key={c.closerId || c.name}
                            sx={{
                              p: 2, borderRadius: `${LAYOUT.cardBorderRadius}px`, background: COLORS.bg.secondary,
                              border: `1px solid ${hexToRgba(color, 0.2)}`,
                              transition: 'all 0.25s ease', cursor: 'pointer',
                              '&:hover': { borderColor: hexToRgba(color, 0.5), boxShadow: `0 0 20px ${hexToRgba(color, 0.15)}` },
                            }}
                            onClick={() => { setActiveTab('individual'); }}
                          >
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                              <Box sx={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexToRgba(color, 0.15), border: `2px solid ${hexToRgba(color, 0.5)}` }}>
                                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color }}>{c.name?.[0] || '?'}</Typography>
                              </Box>
                              <Box sx={{ flex: 1 }}>
                                <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: COLORS.text.primary }}>{c.name}</Typography>
                              </Box>
                              {c.status && (
                                <Box sx={{ px: 0.75, py: 0.25, borderRadius: 1, background: hexToRgba(statusColors[c.status] || COLORS.neon.cyan, 0.1), border: `1px solid ${hexToRgba(statusColors[c.status] || COLORS.neon.cyan, 0.3)}` }}>
                                  <Typography sx={{ fontSize: '0.5rem', fontWeight: 700, color: statusColors[c.status] || COLORS.neon.cyan, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.status}</Typography>
                                </Box>
                              )}
                            </Box>
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                              {[
                                { label: 'Close Rate', value: c.closeRate != null ? fmtPercent(c.closeRate) : '—', good: c.closeRate >= 0.22 },
                                { label: 'Revenue', value: c.revenue != null ? fmtDollar(c.revenue, false) : '—', good: c.revenue >= 60000 },
                                { label: 'Show Rate', value: c.showRate != null ? fmtPercent(c.showRate) : '—', good: c.showRate >= 0.70 },
                                { label: 'Adherence', value: c.adherence != null ? Number(c.adherence).toFixed(1) : '—', good: c.adherence >= 7.5 },
                              ].map(s => (
                                <Box key={s.label}>
                                  <Typography sx={{ fontSize: '0.55rem', color: COLORS.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</Typography>
                                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: s.good ? COLORS.neon.green : COLORS.neon.red }}>{s.value}</Typography>
                                </Box>
                              ))}
                            </Box>
                          </Box>
                        );
                      })}
                    </Box>
                  </>
                )
              )}
            </>
          ) : null}
        </>
      )}

      {/* ── Team Insights Tab (Insight+ only — tabs are locked for basic) ── */}
      {activeTab === 'team' && (
        <>
          <Box sx={{ mb: 1 }}><SectionHeader title="Team Insights" color={COLORS.neon.amber} /></Box>
          <Typography sx={{ fontSize: '0.78rem', color: COLORS.text.muted, mb: 2, ml: 2.5 }}>Cross-team patterns, risks, and opportunities identified from your data</Typography>
          {isLoading && !aiData ? (
            <InsightSkeleton count={5} />
          ) : aiData?.insights ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {aiData.insights.map((i, idx) => <TeamInsightCard key={idx} insight={i} />)}
            </Box>
          ) : null}
        </>
      )}

      {/* ── Individual Tab (Insight+ only — tabs are locked for basic) ── */}
      {activeTab === 'individual' && (
        <>
          <Box sx={{ mb: 1 }}><SectionHeader title="Individual Closer Insights" color={COLORS.neon.cyan} /></Box>
          <Typography sx={{ fontSize: '0.78rem', color: COLORS.text.muted, mb: 2, ml: 2.5 }}>Per-closer performance analysis with strengths, gaps, and coaching recommendations</Typography>
          {isLoading && !aiData ? (
            <InsightSkeleton count={4} />
          ) : aiData?.closers ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
              {aiData.closers.map((d, idx) => {
                // Match AI closer to live closer data by name or id
                const live = liveClosers.find(c =>
                  c.name === d.name || c.id === d.closerId
                );
                return <CloserInsightCard key={d.closerId || idx} data={d} liveCloser={live} />;
              })}
            </Box>
          ) : null}
        </>
      )}

      {/* ── Compare Tab (Insight+ only — tabs are locked for basic) ── */}
      {activeTab === 'compare' && (
        <>
          <Box sx={{ mb: 1 }}><SectionHeader title="Closer Comparison" color={COLORS.neon.cyan} /></Box>
          <Typography sx={{ fontSize: '0.78rem', color: COLORS.text.muted, mb: 2, ml: 2.5 }}>Select any two closers — or compare one closer against the team average — to see a head-to-head breakdown</Typography>
          {isLoading && !aiData ? (
            <InsightSkeleton count={2} />
          ) : (
            <ComparisonTool comparisons={aiData?.comparisons} />
          )}
        </>
      )}
    </Box>
  );
}

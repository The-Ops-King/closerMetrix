/**
 * CLOSER VIEW PAGE — INSIGHT+ ONLY
 *
 * Personal dashboard for individual closers. Manager selects a closer
 * via tabs to see their hero metrics, action items (Red Zone), pipeline,
 * charts, objection data, skills radar, and recent calls.
 *
 * Phase 1: Manager-facing with closer tabs.
 * Phase 2: Closer-scoped tokens give closers their own shareable link.
 */

import React, { useState, useCallback } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Chip from '@mui/material/Chip';
import Avatar from '@mui/material/Avatar';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Checkbox from '@mui/material/Checkbox';
import ListItemText from '@mui/material/ListItemText';
import TextField from '@mui/material/TextField';
import LinkIcon from '@mui/icons-material/Link';
import CheckIcon from '@mui/icons-material/Check';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(quarterOfYear);
dayjs.extend(isoWeek);
import { COLORS } from '../../theme/constants';
import { hexToRgba } from '../../utils/colors';
import { useMetrics } from '../../hooks/useMetrics';
import { useAuth } from '../../context/AuthContext';
import { meetsMinTier } from '../../utils/tierConfig';
import { apiPost } from '../../utils/api';
import ScorecardGrid from '../../components/scorecards/ScorecardGrid';
import ChartWrapper from '../../components/charts/ChartWrapper';
import TronLineChart from '../../components/charts/TronLineChart';
import TronBarChart from '../../components/charts/TronBarChart';
import TronRadarChart from '../../components/charts/TronRadarChart';
import ObjectionsTable from '../../components/tables/ObjectionsTable';
import TierGate from '../../components/TierGate';

/** Get initials from a full name */
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/** Outcome color mapping */
function outcomeColor(outcome) {
  const o = (outcome || '').toLowerCase();
  if (o.includes('closed') || o === 'closed_won') return COLORS.neon.green;
  if (o.includes('deposit')) return COLORS.neon.teal;
  if (o.includes('follow')) return COLORS.neon.cyan;
  if (o.includes('lost')) return COLORS.neon.red;
  if (o.includes('dq') || o.includes('disqualif')) return COLORS.neon.amber;
  return COLORS.text.muted;
}

/** Format currency */
function fmtCurrency(v) {
  if (v == null || v === 0) return '$0';
  return '$' + v.toLocaleString();
}

/** Format percent from decimal */
function fmtPct(v) {
  if (v == null) return '-';
  return Math.round(v * 100) + '%';
}

/** Section header with colored accent */
function SectionHeader({ title, color }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, mt: 4 }}>
      <Box sx={{ width: 4, height: 24, borderRadius: 1, backgroundColor: color }} />
      <Typography variant="h6" sx={{ color: COLORS.text.primary, fontWeight: 600, fontSize: '1.1rem' }}>
        {title}
      </Typography>
    </Box>
  );
}

/** Card for pipeline/red zone items */
function ItemCard({ children, accentColor }) {
  return (
    <Box sx={{
      backgroundColor: COLORS.bg.elevated,
      border: `1px solid ${COLORS.border.subtle}`,
      borderLeft: `3px solid ${accentColor || COLORS.border.subtle}`,
      borderRadius: 1,
      px: 2, py: 1.5,
      '&:hover': { borderColor: accentColor || COLORS.border.glow },
    }}>
      {children}
    </Box>
  );
}

/** Empty state for red zone */
function AllClearState() {
  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.5,
      backgroundColor: hexToRgba(COLORS.neon.green, 0.06),
      border: `1px solid ${hexToRgba(COLORS.neon.green, 0.2)}`,
      borderRadius: 1, px: 3, py: 2,
    }}>
      <CheckCircleOutlineIcon sx={{ color: COLORS.neon.green }} />
      <Typography sx={{ color: COLORS.neon.green, fontWeight: 500 }}>
        All clear — no urgent items
      </Typography>
    </Box>
  );
}

/* ─── Standalone Date Filter (matches DateRangeFilter pattern) ─── */

const FMT = 'YYYY-MM-DD';
const THIS_PERIODS = ['Week', 'Month', 'Quarter', 'Year'];
const LAST_PERIODS = ['Week', 'Month', 'Quarter', 'Year', '30 Days', '60 Days', '90 Days', '180 Days'];

function calcThisPeriod(period) {
  const today = dayjs();
  const unitMap = { Week: 'isoWeek', Month: 'month', Quarter: 'quarter', Year: 'year' };
  return { start: today.startOf(unitMap[period] || 'month').format(FMT), end: today.format(FMT) };
}

function calcLastPeriod(period) {
  const today = dayjs();
  const dayMatch = period.match(/^(\d+)\s*Days$/);
  if (dayMatch) {
    return { start: today.subtract(parseInt(dayMatch[1], 10), 'day').format(FMT), end: today.format(FMT) };
  }
  const unitMap = { Week: 'isoWeek', Month: 'month', Quarter: 'quarter', Year: 'year' };
  const unit = unitMap[period] || 'month';
  const base = unit === 'isoWeek'
    ? today.startOf('isoWeek').subtract(1, 'week')
    : today.subtract(1, unit === 'quarter' ? 'quarter' : unit);
  return { start: base.startOf(unit).format(FMT), end: base.endOf(unit).format(FMT) };
}

function formatRangeLabel(start, end) {
  const s = dayjs(start);
  const e = dayjs(end);
  return `${s.format(s.year() === e.year() ? 'MMM D' : 'MMM D, YYYY')} - ${e.format('MMM D, YYYY')}`;
}

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

const dateLabelSx = {
  fontSize: '0.68rem', fontWeight: 500, color: COLORS.text.muted,
  textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5,
};

function CallsDateFilter({ label, onSelect }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const [mode, setMode] = useState('this');
  const [activePeriod, setActivePeriod] = useState(null);
  const [betweenStart, setBetweenStart] = useState('');
  const [betweenEnd, setBetweenEnd] = useState('');

  const handlePreset = useCallback((m, period) => {
    const range = m === 'this' ? calcThisPeriod(period) : calcLastPeriod(period);
    const lbl = `${m === 'this' ? 'This' : 'Last'} ${period}`;
    setMode(m);
    setActivePeriod(period);
    setAnchorEl(null);
    onSelect(range.start, range.end, lbl);
  }, [onSelect]);

  const handleBetween = useCallback(() => {
    if (!betweenStart || !betweenEnd) return;
    if (dayjs(betweenStart).isAfter(dayjs(betweenEnd))) return;
    setMode('between');
    setActivePeriod(null);
    setAnchorEl(null);
    onSelect(betweenStart, betweenEnd, formatRangeLabel(betweenStart, betweenEnd));
  }, [betweenStart, betweenEnd, onSelect]);

  return (
    <>
      <Button
        onClick={(e) => setAnchorEl(e.currentTarget)}
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
      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
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
        <Box sx={{ display: 'flex', borderBottom: `1px solid ${COLORS.border.subtle}` }}>
          {['this', 'last', 'between'].map((m) => (
            <Button key={m} onClick={() => setMode(m)} sx={modeTabSx(mode === m)} disableRipple>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </Button>
          ))}
        </Box>
        {(mode === 'this' || mode === 'last') && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, p: 1.5 }}>
            {(mode === 'this' ? THIS_PERIODS : LAST_PERIODS).map((period) => {
              const isActive = activePeriod === period && label.includes(period);
              return (
                <Button key={period} onClick={() => handlePreset(mode, period)} sx={periodBtnSx(isActive)} disableRipple>
                  {period}
                </Button>
              );
            })}
          </Box>
        )}
        {mode === 'between' && (
          <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box>
              <Typography sx={dateLabelSx}>Start Date</Typography>
              <TextField type="date" value={betweenStart} size="small" fullWidth onChange={(e) => setBetweenStart(e.target.value)} InputProps={{ sx: dateInputSx }} />
            </Box>
            <Box>
              <Typography sx={dateLabelSx}>End Date</Typography>
              <TextField type="date" value={betweenEnd} size="small" fullWidth onChange={(e) => setBetweenEnd(e.target.value)} InputProps={{ sx: dateInputSx }} />
            </Box>
            <Button
              onClick={handleBetween}
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

/** Styled dropdown for filters */
const selectSx = {
  minWidth: 160,
  backgroundColor: COLORS.bg.secondary,
  color: COLORS.text.primary,
  fontSize: '0.85rem',
  '& .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.border.subtle },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.neon.cyan },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: COLORS.neon.cyan },
  '& .MuiSelect-icon': { color: COLORS.text.muted },
};
const menuItemSx = {
  fontSize: '0.85rem',
  color: COLORS.text.primary,
  '&:hover': { backgroundColor: hexToRgba(COLORS.neon.cyan, 0.08) },
  '&.Mui-selected': { backgroundColor: hexToRgba(COLORS.neon.cyan, 0.12) },
};

export default function CloserViewPage() {
  const { tier, closerScope, mode, token, clientId, adminViewClientId } = useAuth();
  const { data, isLoading } = useMetrics('closer-view');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [linkCopied, setLinkCopied] = useState(null);
  const [linkLoading, setLinkLoading] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [callsOutcomeFilter, setCallsOutcomeFilter] = useState([]);
  const [callsObjFilter, setCallsObjFilter] = useState([]);
  const [callsDateStart, setCallsDateStart] = useState('');
  const [callsDateEnd, setCallsDateEnd] = useState('');
  const [callsDateLabel, setCallsDateLabel] = useState('All Dates');
  // Popover state for team average tooltips
  const [teamPopover, setTeamPopover] = useState({ anchorEl: null, text: '' });

  const hasAccess = meetsMinTier(tier, 'insight');
  const isManager = mode === 'admin' || (!closerScope && mode === 'client');

  // Generate or retrieve closer link and copy to clipboard
  const handleCopyCloserLink = useCallback(async (closerId, closerName) => {
    if (linkLoading) return;
    setLinkLoading(closerId);
    try {
      const authOptions = {};
      if (mode === 'client') {
        authOptions.token = token;
      } else if (mode === 'admin' && adminViewClientId) {
        authOptions.viewClientId = adminViewClientId;
      }
      const res = await apiPost('/dashboard/closer-token', { closerId, closerName }, authOptions);
      if (res.success && res.data?.token_id) {
        const url = `${window.location.origin}/d/${res.data.token_id}/closer-view`;
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = url;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        setLinkCopied(closerId);
        setCopiedUrl(url);
        setTimeout(() => { setLinkCopied(null); setCopiedUrl(null); }, 5000);
      }
    } catch (err) {
      console.error('Failed to generate closer link:', err.message);
    } finally {
      setLinkLoading(null);
    }
  }, [mode, token, adminViewClientId, linkLoading]);


  if (!hasAccess) {
    return (
      <TierGate requiredTier="insight" currentTier={tier} pageName="Closer View">
        <Box sx={{ p: 3, filter: 'blur(4px)', pointerEvents: 'none' }}>
          <Typography variant="h5" sx={{ color: COLORS.text.primary, mb: 2 }}>Closer View</Typography>
          <Typography sx={{ color: COLORS.text.muted }}>Upgrade to Insight to access individual closer dashboards.</Typography>
        </Box>
      </TierGate>
    );
  }

  if (isLoading) {
    return (
      <Box sx={{ p: 3, display: 'flex', justifyContent: 'center', pt: 10 }}>
        <Typography sx={{ color: COLORS.text.muted }}>Loading closer data...</Typography>
      </Box>
    );
  }

  if (!data || !data.closers || data.closers.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ color: COLORS.text.primary, mb: 2 }}>Closer View</Typography>
        <Typography sx={{ color: COLORS.text.muted }}>No closer data available for the selected date range.</Typography>
      </Box>
    );
  }

  // If closer-scoped token, find and lock to that closer
  let effectiveIdx = selectedIdx;
  if (closerScope) {
    const scopedIdx = data.closers.findIndex(c => c.closerId === closerScope);
    if (scopedIdx >= 0) effectiveIdx = scopedIdx;
    else effectiveIdx = 0;
  }

  const closer = data.closers[effectiveIdx] || data.closers[0];
  const { hero, heroPrev, redZone, pipeline, scorecards, scorecardsPrev, radar, trends, recentCalls, objections: closerObjData } = closer;
  const team = data.teamAverages;
  const deltaLabel = data.deltaLabel;

  // Build hero scorecards — team avg shown via popover on click
  const heroMetric = (label, value, format, glowColor, prevValue, teamValue, teamFormat, desiredDirection) => {
    const metric = { label, value, format, glowColor };
    if (desiredDirection) metric.desiredDirection = desiredDirection;
    if (prevValue != null && prevValue !== 0) {
      metric.delta = Math.round(((value - prevValue) / Math.abs(prevValue)) * 1000) / 10;
      metric.deltaLabel = deltaLabel;
    }
    // Store team value for popover (rendered outside scorecard)
    if (teamValue != null) {
      const teamStr = teamFormat === 'currency' ? fmtCurrency(teamValue)
        : teamFormat === 'percent' ? fmtPct(teamValue)
        : typeof teamValue === 'number' ? teamValue.toFixed(1) : String(teamValue);
      metric._teamText = `Team Avg: ${teamStr}`;
    }
    return metric;
  };

  const heroMetrics = {
    revenue: heroMetric('Total Revenue', hero.revenue, 'currency', 'teal', heroPrev.revenue, team.revenue, 'currency'),
    cashCollected: heroMetric('Cash Collected', hero.cashCollected, 'currency', 'green', heroPrev.cashCollected, null, null),
    closeRate: heroMetric('Close Rate', hero.closeRate, 'percent', 'cyan', heroPrev.closeRate, team.closeRate, 'percent'),
    showRate: heroMetric('Show Rate', hero.showRate, 'percent', 'blue', heroPrev.showRate, team.showRate, 'percent'),
    dealsWon: heroMetric('Deals Won', hero.dealsWon, 'number', 'purple', heroPrev.dealsWon, null, null),
    powerScore: heroMetric('Power Score', hero.powerScore, 'number', 'amber', null, null, null),
    avgDealSize: heroMetric('Avg Deal Size', scorecards.avgDealSize, 'currency', 'green', scorecardsPrev.avgDealSize, team.avgDealSize, 'currency'),
    avgDaysToClose: heroMetric('Avg Days to Close', scorecards.avgDaysToClose, 'decimal', 'amber', scorecardsPrev.avgDaysToClose, team.avgDaysToClose, 'number', 'down'),
    callQuality: heroMetric('Call Quality', scorecards.callQuality, 'score', 'purple', scorecardsPrev.callQuality, team.callQuality, 'number'),
    objResRate: heroMetric('Obj Res Rate', scorecards.objResRate, 'percent', 'cyan', scorecardsPrev.objResRate, team.objResRate, 'percent'),
  };

  // Radar data
  const radarAxes = ['Intro', 'Pain', 'Goal', 'Transition', 'Pitch', 'Close', 'Objection', 'Overall'];
  const radarDatasets = [{
    label: closer.name,
    color: COLORS.neon.cyan,
    values: [radar.intro, radar.pain, radar.goal, radar.transition, radar.pitch, radar.close, radar.objection, radar.overall],
  }];

  const totalRedZone = redZone.overdueFollowUps.length + redZone.agingDeposits.length + redZone.recentLosses.length;

  // Filter recent calls by outcome, objection, and date
  const filteredCalls = recentCalls.filter(c => {
    if (callsOutcomeFilter.length > 0) {
      if (!callsOutcomeFilter.includes(c.outcome)) return false;
    }
    if (callsObjFilter.length > 0) {
      const matchesObj = callsObjFilter.some(f => c.objections.includes(f));
      if (!matchesObj) return false;
    }
    if (callsDateStart && c.date < callsDateStart) return false;
    if (callsDateEnd && c.date > callsDateEnd) return false;
    return true;
  });

  // Unique objection types for filter chips
  const uniqueObjTypes = [...new Set(recentCalls.flatMap(c => c.objections || []))].sort();

  return (
    <Box sx={{ px: { xs: 1, md: 2 }, py: 2 }}>
      {/* ── Closer Tabs (hidden for closer-scoped tokens) ── */}
      {!closerScope && data.closers.length > 1 && (
        <Tabs
          value={effectiveIdx}
          onChange={(_, v) => setSelectedIdx(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            mb: 3,
            '& .MuiTabs-indicator': { backgroundColor: COLORS.neon.cyan },
            '& .MuiTab-root': {
              color: COLORS.text.muted,
              textTransform: 'none',
              fontWeight: 500,
              minHeight: 48,
              '&.Mui-selected': { color: COLORS.neon.cyan },
            },
          }}
        >
          {data.closers.map((c, i) => (
            <Tab
              key={c.closerId || i}
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  {c.name}
                  {isManager && c.closerId && (
                    <Tooltip title={linkCopied === c.closerId ? 'Link copied!' : 'Copy closer link'} arrow>
                      <IconButton
                        size="small"
                        onClick={(e) => { e.stopPropagation(); handleCopyCloserLink(c.closerId, c.name); }}
                        disabled={linkLoading === c.closerId}
                        sx={{
                          color: linkCopied === c.closerId ? COLORS.neon.green : COLORS.text.muted,
                          p: 0.5, ml: 0.5,
                          '&:hover': { color: COLORS.neon.cyan, backgroundColor: hexToRgba(COLORS.neon.cyan, 0.08) },
                        }}
                      >
                        {linkCopied === c.closerId ? <CheckIcon sx={{ fontSize: 14 }} /> : <LinkIcon sx={{ fontSize: 14 }} />}
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              }
            />
          ))}
        </Tabs>
      )}
      {copiedUrl && (
        <Typography
          variant="caption"
          sx={{
            color: COLORS.neon.green,
            backgroundColor: hexToRgba(COLORS.neon.green, 0.08),
            border: `1px solid ${hexToRgba(COLORS.neon.green, 0.2)}`,
            borderRadius: 1, px: 1.5, py: 0.5, mb: 2,
            fontFamily: 'monospace', fontSize: '0.75rem',
            display: 'block', wordBreak: 'break-all',
          }}
        >
          Copied: {copiedUrl}
        </Typography>
      )}

      {/* ── Hero Section ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Avatar sx={{
          width: 48, height: 48,
          backgroundColor: hexToRgba(COLORS.neon.cyan, 0.15),
          color: COLORS.neon.cyan,
          fontWeight: 700, fontSize: '1.1rem',
        }}>
          {getInitials(closer.name)}
        </Avatar>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h5" sx={{ color: COLORS.text.primary, fontWeight: 700 }}>
            {closer.name}
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.text.muted }}>
            {hero.callsHeld} calls held · {hero.dealsWon} deals closed
          </Typography>
        </Box>
      </Box>

      {/* Team Average Popover */}
      <Popover
        open={Boolean(teamPopover.anchorEl)}
        anchorEl={teamPopover.anchorEl}
        onClose={() => setTeamPopover({ anchorEl: null, text: '' })}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        transformOrigin={{ vertical: 'top', horizontal: 'center' }}
        slotProps={{ paper: { sx: { backgroundColor: COLORS.bg.elevated, border: `1px solid ${COLORS.border.glow}`, px: 2, py: 1 } } }}
      >
        <Typography sx={{ color: COLORS.neon.cyan, fontSize: '0.85rem', fontWeight: 500 }}>
          {teamPopover.text}
        </Typography>
      </Popover>

      <ScorecardGrid title="Performance" metrics={heroMetrics} columns={5} sectionColor="cyan" />

      {/* ── Red Zone (Action Items) ── */}
      <SectionHeader title="Action Items" color={COLORS.neon.red} />
      {totalRedZone === 0 ? (
        <AllClearState />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
          {/* Overdue Follow-Ups */}
          <Box>
            <Typography variant="subtitle2" sx={{ color: COLORS.neon.amber, mb: 1, fontWeight: 600 }}>
              Overdue Follow-Ups ({redZone.overdueFollowUps.length})
            </Typography>
            {redZone.overdueFollowUps.length === 0 ? (
              <Typography variant="body2" sx={{ color: COLORS.text.muted }}>None</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {redZone.overdueFollowUps.slice(0, 10).map((fu, i) => (
                  <ItemCard key={i} accentColor={COLORS.neon.amber}>
                    <Typography variant="body2" sx={{ color: COLORS.text.primary, fontWeight: 600 }}>
                      {fu.prospectName}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                      <Chip label={`${fu.daysSince}d overdue`} size="small" sx={{ backgroundColor: hexToRgba(COLORS.neon.amber, 0.15), color: COLORS.neon.amber, fontSize: '0.7rem', height: 22 }} />
                      {fu.prospectFitScore >= 7 && (
                        <Chip label={`Fit: ${fu.prospectFitScore}/10`} size="small" sx={{ backgroundColor: hexToRgba(COLORS.neon.green, 0.15), color: COLORS.neon.green, fontSize: '0.7rem', height: 22 }} />
                      )}
                    </Box>
                  </ItemCard>
                ))}
              </Box>
            )}
          </Box>

          {/* Aging Deposits */}
          <Box>
            <Typography variant="subtitle2" sx={{ color: COLORS.neon.purple, mb: 1, fontWeight: 600 }}>
              Aging Deposits ({redZone.agingDeposits.length})
            </Typography>
            {redZone.agingDeposits.length === 0 ? (
              <Typography variant="body2" sx={{ color: COLORS.text.muted }}>None</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {redZone.agingDeposits.slice(0, 10).map((dep, i) => (
                  <ItemCard key={i} accentColor={COLORS.neon.purple}>
                    <Typography variant="body2" sx={{ color: COLORS.text.primary, fontWeight: 600 }}>
                      {dep.prospectName}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                      <Chip label={`${dep.daysSince}d ago`} size="small" sx={{ backgroundColor: hexToRgba(COLORS.neon.purple, 0.15), color: COLORS.neon.purple, fontSize: '0.7rem', height: 22 }} />
                      {dep.amount > 0 && (
                        <Chip label={fmtCurrency(dep.amount)} size="small" sx={{ backgroundColor: hexToRgba(COLORS.neon.teal, 0.15), color: COLORS.neon.teal, fontSize: '0.7rem', height: 22 }} />
                      )}
                    </Box>
                  </ItemCard>
                ))}
              </Box>
            )}
          </Box>

          {/* Recent Losses */}
          <Box>
            <Typography variant="subtitle2" sx={{ color: COLORS.neon.red, mb: 1, fontWeight: 600 }}>
              Recent Losses ({redZone.recentLosses.length})
            </Typography>
            {redZone.recentLosses.length === 0 ? (
              <Typography variant="body2" sx={{ color: COLORS.text.muted }}>None</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {redZone.recentLosses.slice(0, 10).map((loss, i) => (
                  <ItemCard key={i} accentColor={COLORS.neon.red}>
                    <Typography variant="body2" sx={{ color: COLORS.text.primary, fontWeight: 600 }}>
                      {loss.prospectName}
                    </Typography>
                    <Typography variant="caption" sx={{ color: COLORS.text.muted }}>
                      {loss.lostReason} · {loss.date}
                    </Typography>
                  </ItemCard>
                ))}
              </Box>
            )}
          </Box>
        </Box>
      )}

      {/* ── Pipeline ── */}
      <SectionHeader title="Pipeline" color={COLORS.neon.cyan} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
        <Box>
          <Typography variant="subtitle2" sx={{ color: COLORS.neon.cyan, mb: 1, fontWeight: 600 }}>
            Follow-Up Stage ({pipeline.followUps.length})
          </Typography>
          {pipeline.followUps.length === 0 ? (
            <Typography variant="body2" sx={{ color: COLORS.text.muted }}>No active follow-ups</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {pipeline.followUps.slice(0, 8).map((fu, i) => (
                <ItemCard key={i} accentColor={COLORS.neon.cyan}>
                  <Typography variant="body2" sx={{ color: COLORS.text.primary, fontWeight: 600 }}>{fu.prospectName}</Typography>
                  <Typography variant="caption" sx={{ color: COLORS.text.muted }}>
                    Last: {fu.lastCallDate} · {fu.callCount} call{fu.callCount !== 1 ? 's' : ''}
                  </Typography>
                </ItemCard>
              ))}
            </Box>
          )}
        </Box>
        <Box>
          <Typography variant="subtitle2" sx={{ color: COLORS.neon.teal, mb: 1, fontWeight: 600 }}>
            Deposit Stage ({pipeline.deposits.length})
          </Typography>
          {pipeline.deposits.length === 0 ? (
            <Typography variant="body2" sx={{ color: COLORS.text.muted }}>No pending deposits</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {pipeline.deposits.slice(0, 8).map((dep, i) => (
                <ItemCard key={i} accentColor={COLORS.neon.teal}>
                  <Typography variant="body2" sx={{ color: COLORS.text.primary, fontWeight: 600 }}>{dep.prospectName}</Typography>
                  <Typography variant="caption" sx={{ color: COLORS.text.muted }}>
                    {dep.depositDate} · {fmtCurrency(dep.amount)}
                  </Typography>
                </ItemCard>
              ))}
            </Box>
          )}
        </Box>
        <Box>
          <Typography variant="subtitle2" sx={{ color: COLORS.neon.green, mb: 1, fontWeight: 600 }}>
            Recently Closed ({pipeline.recentCloses.length})
          </Typography>
          {pipeline.recentCloses.length === 0 ? (
            <Typography variant="body2" sx={{ color: COLORS.text.muted }}>No closes in this period</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {pipeline.recentCloses.slice(0, 8).map((cl, i) => (
                <ItemCard key={i} accentColor={COLORS.neon.green}>
                  <Typography variant="body2" sx={{ color: COLORS.text.primary, fontWeight: 600 }}>{cl.prospectName}</Typography>
                  <Typography variant="caption" sx={{ color: COLORS.text.muted }}>
                    {cl.closeDate} · {fmtCurrency(cl.revenue)}{cl.daysToClose != null ? ` · ${cl.daysToClose}d` : ''}
                  </Typography>
                </ItemCard>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      {/* ── Charts Row 1: Close Rate + Revenue/Cash ── */}
      <SectionHeader title="Performance Trends" color={COLORS.neon.teal} />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <ChartWrapper title="Close Rate Over Time">
          <TronLineChart
            data={trends.closeRate.data}
            series={trends.closeRate.series}
            yAxisFormat="percent"
            height={300}
          />
        </ChartWrapper>
        <ChartWrapper title="Revenue Breakdown">
          <TronBarChart
            data={trends.revenueCash.data}
            series={trends.revenueCash.series}
            stacked={true}
            stackTotalLabel="Total Revenue"
            yAxisFormat="currency"
            height={300}
          />
        </ChartWrapper>
      </Box>

      {/* ── Charts Row 2: Call Outcomes + Skills Radar ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mt: 2 }}>
        <ChartWrapper title="Call Outcomes Over Time">
          <TronBarChart
            data={trends.callOutcomes.data}
            series={trends.callOutcomes.series}
            stacked={true}
            stackTotalLabel="Total Calls"
            height={300}
          />
        </ChartWrapper>
        <ChartWrapper title="Script Adherence">
          <TronRadarChart axes={radarAxes} datasets={radarDatasets} maxValue={10} />
        </ChartWrapper>
      </Box>

      {/* ── Objections ── */}
      {closerObjData && closerObjData.total > 0 && (
        <>
          <SectionHeader title="Objections" color={COLORS.neon.amber} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <ChartWrapper title="Objections by Type">
              <TronBarChart
                data={closerObjData.chartData}
                series={closerObjData.chartSeries}
                stacked={true}
                stackTotalLabel="Total"
                layout="horizontal"
                height={300}
              />
            </ChartWrapper>
            <ObjectionsTable
              rows={closerObjData.tableRows}
              variant="type"
              title="Objection Breakdown"
              accentColor={COLORS.neon.amber}
            />
          </Box>
        </>
      )}

      {/* ── Revenue Trend ── */}
      <SectionHeader title="Revenue Over Time" color={COLORS.neon.teal} />
      <ChartWrapper title="">
        <TronLineChart
          data={trends.revenue.data}
          series={trends.revenue.series}
          yAxisFormat="currency"
          height={300}
        />
      </ChartWrapper>

      {/* ── Recent Calls ── */}
      <SectionHeader title="Recent Calls" color={COLORS.neon.cyan} />
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl size="small">
          <Select
            multiple
            value={callsOutcomeFilter}
            onChange={(e) => setCallsOutcomeFilter(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
            displayEmpty
            renderValue={(sel) => sel.length === 0 ? 'All Outcomes' : sel.map(s => ({ closed_won: 'Closed - Won', deposit: 'Deposit', follow_up: 'Follow Up', lost: 'Lost', disqualified: 'DQ', not_pitched: 'Not Pitched', refunded: 'Refunded' }[s] || s)).join(', ')}
            sx={{ ...selectSx, color: callsOutcomeFilter.length === 0 ? COLORS.text.muted : COLORS.text.primary }}
            MenuProps={{ PaperProps: { sx: { backgroundColor: COLORS.bg.elevated, border: `1px solid ${COLORS.border.subtle}` } } }}
          >
            {[
              { key: 'closed_won', label: 'Closed - Won' },
              { key: 'deposit', label: 'Deposit' },
              { key: 'follow_up', label: 'Follow Up' },
              { key: 'lost', label: 'Lost' },
              { key: 'disqualified', label: 'Disqualified' },
              { key: 'not_pitched', label: 'Not Pitched' },
              { key: 'refunded', label: 'Refunded' },
            ].map(o => (
              <MenuItem key={o.key} value={o.key} sx={menuItemSx}>
                <Checkbox checked={callsOutcomeFilter.includes(o.key)} size="small" sx={{ color: COLORS.text.muted, '&.Mui-checked': { color: COLORS.neon.cyan }, p: 0.5, mr: 1 }} />
                <ListItemText primary={o.label} primaryTypographyProps={{ fontSize: '0.85rem' }} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {uniqueObjTypes.length > 0 && (
          <FormControl size="small">
            <Select
              multiple
              value={callsObjFilter}
              onChange={(e) => setCallsObjFilter(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
              displayEmpty
              renderValue={(sel) => sel.length === 0 ? 'All Objections' : sel.join(', ')}
              sx={{ ...selectSx, color: callsObjFilter.length === 0 ? COLORS.text.muted : COLORS.text.primary }}
              MenuProps={{ PaperProps: { sx: { backgroundColor: COLORS.bg.elevated, border: `1px solid ${COLORS.border.subtle}` } } }}
            >
              {uniqueObjTypes.map(t => (
                <MenuItem key={t} value={t} sx={menuItemSx}>
                  <Checkbox checked={callsObjFilter.includes(t)} size="small" sx={{ color: COLORS.text.muted, '&.Mui-checked': { color: COLORS.neon.amber }, p: 0.5, mr: 1 }} />
                  <ListItemText primary={t} primaryTypographyProps={{ fontSize: '0.85rem' }} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <CallsDateFilter
          label={callsDateLabel}
          onSelect={(start, end, lbl) => {
            setCallsDateStart(start);
            setCallsDateEnd(end);
            setCallsDateLabel(lbl);
          }}
        />
      </Box>
      {filteredCalls.length === 0 ? (
        <Typography sx={{ color: COLORS.text.muted }}>No calls match the selected filters.</Typography>
      ) : (
        <Box sx={{
          backgroundColor: COLORS.bg.elevated,
          border: `1px solid ${COLORS.border.subtle}`,
          borderRadius: 1, overflow: 'auto',
        }}>
          <Box component="table" sx={{
            width: '100%', borderCollapse: 'collapse',
            '& th, & td': {
              px: 2, py: 1.2, textAlign: 'left',
              borderBottom: `1px solid ${COLORS.border.subtle}`,
              fontSize: '0.85rem',
            },
            '& th': { color: COLORS.text.muted, fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' },
            '& td': { color: COLORS.text.primary },
          }}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Prospect</th>
                <th>Outcome</th>
                <th>Score</th>
                <th>Duration</th>
                <th>Revenue</th>
                <th>Objections</th>
              </tr>
            </thead>
            <tbody>
              {filteredCalls.map((call, i) => (
                <tr key={i}>
                  <td>{call.date}</td>
                  <td>{call.prospectName}</td>
                  <td>
                    <Chip
                      label={call.outcome.replace(/_/g, ' ')}
                      size="small"
                      sx={{
                        backgroundColor: hexToRgba(outcomeColor(call.outcome), 0.15),
                        color: outcomeColor(call.outcome),
                        fontSize: '0.7rem', height: 22, textTransform: 'capitalize',
                      }}
                    />
                  </td>
                  <td>{call.overallScore > 0 ? call.overallScore.toFixed(1) : '-'}</td>
                  <td>{call.duration > 0 ? call.duration.toFixed(0) + 'm' : '-'}</td>
                  <td>{call.revenue > 0 ? fmtCurrency(call.revenue) : '-'}</td>
                  <td>
                    {call.objections.length > 0 ? (
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {call.objections.slice(0, 3).map((obj, j) => (
                          <Chip key={j} label={obj} size="small" sx={{
                            backgroundColor: hexToRgba(COLORS.neon.amber, 0.12),
                            color: COLORS.neon.amber,
                            fontSize: '0.65rem', height: 20,
                          }} />
                        ))}
                        {call.objections.length > 3 && (
                          <Typography variant="caption" sx={{ color: COLORS.text.muted }}>
                            +{call.objections.length - 3}
                          </Typography>
                        )}
                      </Box>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </Box>
        </Box>
      )}
    </Box>
  );
}

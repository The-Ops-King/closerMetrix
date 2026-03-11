/**
 * CLOSER VIEW PAGE — INSIGHT+ ONLY
 *
 * Personal dashboard for individual closers. Manager selects a closer
 * via tabs to see their hero metrics, pipeline (hot follow-ups, deposits,
 * recently closed), charts, objection data, skills radar, and recent calls.
 *
 * Uses the global date filter from FilterContext (shown in TopBar).
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
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import FormControl from '@mui/material/FormControl';
import Checkbox from '@mui/material/Checkbox';
import ListItemText from '@mui/material/ListItemText';
import LinkIcon from '@mui/icons-material/Link';
import CheckIcon from '@mui/icons-material/Check';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import dayjs from 'dayjs';

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
import DateRangeFilter from '../../components/filters/DateRangeFilter';

/** Get initials from a full name */
function getInitials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

/** Outcome color mapping */
function outcomeColor(outcome) {
  const o = (outcome || '').toLowerCase();
  if (o.includes('closed') || o === 'closed_won') return COLORS.neon.green;
  if (o.includes('deposit')) return COLORS.neon.amber;
  if (o.includes('follow')) return COLORS.neon.purple;
  if (o.includes('lost')) return COLORS.neon.red;
  if (o.includes('dq') || o.includes('disqualif')) return COLORS.text.muted;
  if (o.includes('not_pitched') || o.includes('not pitched')) return COLORS.neon.blue;
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

/** Card for pipeline items */
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

/** Empty state for pipeline */
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

/** Styled dropdown sx */
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

const PIPELINE_PER_PAGE = 5;
const CALLS_PER_PAGE = 50;

/** Paginated pipeline column */
function PipelineColumn({ title, items, color, page, onPageChange, emptyLabel, renderItem }) {
  const totalPages = Math.ceil(items.length / PIPELINE_PER_PAGE);
  const paged = items.slice(page * PIPELINE_PER_PAGE, (page + 1) * PIPELINE_PER_PAGE);

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ color, mb: 1, fontWeight: 600 }}>
        {title} ({items.length})
      </Typography>
      {items.length === 0 ? (
        <Typography variant="body2" sx={{ color: COLORS.text.muted }}>{emptyLabel}</Typography>
      ) : (
        <>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {paged.map((item, i) => (
              <ItemCard key={i} accentColor={color}>
                {renderItem(item)}
              </ItemCard>
            ))}
          </Box>
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mt: 1.5 }}>
              <IconButton
                size="small"
                disabled={page === 0}
                onClick={() => onPageChange(p => p - 1)}
                sx={{ color: COLORS.text.secondary, p: 0.5, '&:hover': { color } }}
              >
                <NavigateBeforeIcon fontSize="small" />
              </IconButton>
              <Typography variant="caption" sx={{ color: COLORS.text.muted }}>
                {page + 1} / {totalPages}
              </Typography>
              <IconButton
                size="small"
                disabled={page >= totalPages - 1}
                onClick={() => onPageChange(p => p + 1)}
                sx={{ color: COLORS.text.secondary, p: 0.5, '&:hover': { color } }}
              >
                <NavigateNextIcon fontSize="small" />
              </IconButton>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

export default function CloserViewPage() {
  const { tier, closerScope, mode, token, adminViewClientId } = useAuth();
  const { data, isLoading } = useMetrics('closer-view');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [dismissedFollowUps, setDismissedFollowUps] = useState(new Set());
  const [linkCopied, setLinkCopied] = useState(null);
  const [linkLoading, setLinkLoading] = useState(null);
  const [copiedUrl, setCopiedUrl] = useState(null);
  const [callsOutcomeFilter, setCallsOutcomeFilter] = useState([]);
  const [callsObjFilter, setCallsObjFilter] = useState([]);
  const [callsPage, setCallsPage] = useState(0);
  const [fuPage, setFuPage] = useState(0);
  const [depPage, setDepPage] = useState(0);
  const [closePage, setClosePage] = useState(0);
  const [teamPopover, setTeamPopover] = useState({ anchorEl: null, text: '' });

  const hasAccess = meetsMinTier(tier, 'insight');
  const isManager = mode === 'admin' || (!closerScope && mode === 'client');

  // Mark a follow-up as lost in BQ and remove from UI
  const handleDismissFollowUp = useCallback(async (callId, prospectName) => {
    setDismissedFollowUps(prev => new Set([...prev, prospectName]));
    try {
      const authOptions = {};
      if (mode === 'client') authOptions.token = token;
      else if (mode === 'admin' && adminViewClientId) authOptions.viewClientId = adminViewClientId;
      await apiPost('/dashboard/mark-lost', { callId }, authOptions);
    } catch (err) {
      console.error('Failed to mark as lost:', err.message);
    }
  }, [mode, token, adminViewClientId]);

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

  // Build hero scorecards
  const heroMetric = (label, value, format, glowColor, prevValue, teamValue, teamFormat, desiredDirection) => {
    const metric = { label, value, format, glowColor };
    if (desiredDirection) metric.desiredDirection = desiredDirection;
    if (prevValue != null && prevValue !== 0) {
      metric.delta = Math.round(((value - prevValue) / Math.abs(prevValue)) * 1000) / 10;
      metric.deltaLabel = deltaLabel;
    }
    if (teamValue != null) {
      const teamStr = teamFormat === 'currency' ? fmtCurrency(teamValue)
        : teamFormat === 'percent' ? fmtPct(teamValue)
        : typeof teamValue === 'number' ? teamValue.toFixed(1) : String(teamValue);
      metric.hoverText = `Team Avg: ${teamStr}`;
    }
    return metric;
  };

  const heroMetrics = {
    revenue: heroMetric('Total Revenue', hero.revenue, 'currency', 'teal', heroPrev.revenue, team.revenue, 'currency'),
    cashCollected: heroMetric('Cash Collected', hero.cashCollected, 'currency', 'green', heroPrev.cashCollected, team.cashCollected, 'currency'),
    closeRate: heroMetric('Close Rate', hero.closeRate, 'percent', 'cyan', heroPrev.closeRate, team.closeRate, 'percent'),
    showRate: heroMetric('Show Rate', hero.showRate, 'percent', 'blue', heroPrev.showRate, team.showRate, 'percent'),
    dealsWon: heroMetric('Deals Won', hero.dealsWon, 'number', 'green', heroPrev.dealsWon, team.dealsWon, 'number'),
    avgCashPerCall: heroMetric('Avg Cash / Call', hero.callsHeld > 0 ? Math.round(hero.cashCollected / hero.callsHeld) : 0, 'currency', 'teal',
      heroPrev.callsHeld > 0 ? Math.round(heroPrev.cashCollected / heroPrev.callsHeld) : null, team.avgCashPerCall, 'currency'),
    avgDealSize: heroMetric('Avg Deal Size', scorecards.avgDealSize, 'currency', 'green', scorecardsPrev.avgDealSize, team.avgDealSize, 'currency'),
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

  // Pipeline counts
  const totalPipeline = (redZone?.overdueFollowUps?.length || 0) + (pipeline?.deposits?.length || 0) + (pipeline?.recentCloses?.length || 0);

  // Filter recent calls
  const filteredCalls = recentCalls.filter(c => {
    if (callsOutcomeFilter.length > 0 && !callsOutcomeFilter.includes(c.outcome)) return false;
    if (callsObjFilter.length > 0) {
      const matchesObj = callsObjFilter.some(f => c.objections.includes(f));
      if (!matchesObj) return false;
    }
    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredCalls.length / CALLS_PER_PAGE);
  const pagedCalls = filteredCalls.slice(callsPage * CALLS_PER_PAGE, (callsPage + 1) * CALLS_PER_PAGE);

  // Reset page when filters change
  const handleOutcomeFilter = (e) => {
    setCallsOutcomeFilter(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value);
    setCallsPage(0);
  };
  const handleObjFilter = (e) => {
    setCallsObjFilter(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value);
    setCallsPage(0);
  };

  // Unique objection types
  const uniqueObjTypes = [...new Set(recentCalls.flatMap(c => c.objections || []))].sort();

  return (
    <Box sx={{ px: { xs: 1, md: 2 }, py: 2 }}>
      {/* Closer Tabs (hidden for closer-scoped tokens) */}
      {!closerScope && data.closers.length > 1 && (
        <Tabs
          value={effectiveIdx}
          onChange={(_, v) => { setSelectedIdx(v); setCallsPage(0); }}
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

      {/* Hero Section */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <Avatar sx={{
          width: 48, height: 48,
          backgroundColor: hexToRgba(COLORS.neon.cyan, 0.15),
          color: COLORS.neon.cyan,
          fontWeight: 700, fontSize: '1.1rem',
        }}>
          {getInitials(closer.name)}
        </Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h5" sx={{ color: COLORS.text.primary, fontWeight: 700 }}>
            {closer.name}
          </Typography>
          <Typography variant="body2" sx={{ color: COLORS.text.muted }}>
            {hero.callsHeld} calls held · {hero.dealsWon} deals closed
          </Typography>
        </Box>
      </Box>

      <ScorecardGrid title="Performance" metrics={heroMetrics} columns={4} sectionColor="cyan" />

      {/* Pipeline: Hot Follow-Ups, Open Deposits, Recently Closed */}
      <SectionHeader title="Pipeline" color={COLORS.neon.cyan} />
      {totalPipeline === 0 ? (
        <AllClearState />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
          {/* Hot Follow-Ups */}
          <PipelineColumn
            title="Hot Follow-Ups"
            items={(redZone?.overdueFollowUps || []).filter(fu => !dismissedFollowUps.has(fu.prospectName))}
            color={COLORS.neon.purple}
            page={fuPage}
            onPageChange={setFuPage}
            emptyLabel="None"
            renderItem={(fu) => (
              <>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ color: COLORS.text.primary, fontWeight: 600 }}>
                    {fu.prospectName}
                  </Typography>
                  <Tooltip title="Mark as lost" arrow>
                    <IconButton
                      size="small"
                      onClick={(e) => { e.stopPropagation(); handleDismissFollowUp(fu.callId, fu.prospectName); }}
                      sx={{ color: COLORS.text.muted, p: 0.25, '&:hover': { color: COLORS.neon.red } }}
                    >
                      <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
                  <Chip label={`${fu.daysSince}d ago`} size="small" sx={{ backgroundColor: hexToRgba(COLORS.neon.purple, 0.15), color: COLORS.neon.purple, fontSize: '0.7rem', height: 22 }} />
                  {fu.prospectFitScore >= 7 && (
                    <Chip label={`Fit: ${fu.prospectFitScore}/10`} size="small" sx={{ backgroundColor: hexToRgba(COLORS.neon.green, 0.15), color: COLORS.neon.green, fontSize: '0.7rem', height: 22 }} />
                  )}
                </Box>
              </>
            )}
          />

          {/* Open Deposits */}
          <PipelineColumn
            title="Open Deposits"
            items={pipeline?.deposits || []}
            color={COLORS.neon.amber}
            page={depPage}
            onPageChange={setDepPage}
            emptyLabel="None"
            renderItem={(dep) => (
              <>
                <Typography variant="body2" sx={{ color: COLORS.text.primary, fontWeight: 600 }}>{dep.prospectName}</Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                  <Chip label={`${dep.daysSince || '?'}d ago`} size="small" sx={{ backgroundColor: hexToRgba(COLORS.neon.amber, 0.15), color: COLORS.neon.amber, fontSize: '0.7rem', height: 22 }} />
                  {dep.amount > 0 && (
                    <Chip label={fmtCurrency(dep.amount)} size="small" sx={{ backgroundColor: hexToRgba(COLORS.neon.cyan, 0.15), color: COLORS.neon.cyan, fontSize: '0.7rem', height: 22 }} />
                  )}
                </Box>
              </>
            )}
          />

          {/* Recently Closed */}
          <PipelineColumn
            title="Recently Closed"
            items={pipeline?.recentCloses || []}
            color={COLORS.neon.green}
            page={closePage}
            onPageChange={setClosePage}
            emptyLabel="No closes in this period"
            renderItem={(cl) => (
              <>
                <Typography variant="body2" sx={{ color: COLORS.text.primary, fontWeight: 600 }}>{cl.prospectName}</Typography>
                <Typography variant="caption" sx={{ color: COLORS.text.muted }}>
                  {cl.closeDate} · {fmtCurrency(cl.revenue)}{cl.daysToClose != null ? ` · ${cl.daysToClose}d` : ''}
                </Typography>
              </>
            )}
          />
        </Box>
      )}

      {/* Charts Row 1: Close Rate + Revenue/Cash */}
      <SectionHeader title="Performance Trends" color={COLORS.neon.cyan} />
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

      {/* Charts Row 2: Call Outcomes + Skills Radar */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mt: 2, alignItems: 'stretch' }}>
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
          <TronRadarChart axes={radarAxes} datasets={radarDatasets} maxValue={10} height={300} />
        </ChartWrapper>
      </Box>

      {/* Objections */}
      {closerObjData && closerObjData.total > 0 && (
        <>
          <SectionHeader title="Objections" color={COLORS.neon.amber} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, alignItems: 'stretch' }}>
            <ChartWrapper title="Objections by Type" sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <TronBarChart
                data={closerObjData.chartData}
                series={closerObjData.chartSeries}
                stacked={true}
                stackTotalLabel="Total"
                layout="horizontal"
                height={Math.max(300, (closerObjData.chartData?.length || 5) * 40)}
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

      {/* Recent Calls */}
      <SectionHeader title="Recent Calls" color={COLORS.neon.cyan} />

      {/* Outcome count scorecards */}
      {(() => {
        const counts = {};
        recentCalls.forEach(c => { counts[c.outcome] = (counts[c.outcome] || 0) + 1; });
        const outcomeConfig = [
          { key: 'closed_won', label: 'Closed', glowColor: 'green' },
          { key: 'deposit', label: 'Deposits', glowColor: 'amber' },
          { key: 'follow_up', label: 'Follow Ups', glowColor: 'purple' },
          { key: 'lost', label: 'Lost', glowColor: 'red' },
          { key: 'disqualified', label: 'DQ', glowColor: 'muted' },
          { key: 'not_pitched', label: 'Not Pitched', glowColor: 'blue' },
          { key: 'refunded', label: 'Refunded', glowColor: 'red' },
        ].filter(o => (counts[o.key] || 0) > 0);
        const metrics = {};
        outcomeConfig.forEach(o => {
          metrics[o.key] = { label: o.label, value: counts[o.key] || 0, format: 'number', glowColor: o.glowColor };
        });
        return (
          <Box sx={{ mt: -2, mb: 2 }}>
            <ScorecardGrid metrics={metrics} columns={outcomeConfig.length} />
          </Box>
        );
      })()}

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'center' }}>
        <FormControl size="small">
          <Select
            multiple
            value={callsOutcomeFilter}
            onChange={handleOutcomeFilter}
            displayEmpty
            renderValue={(sel) => sel.length === 0 ? 'All Outcomes' : sel.map(s => ({ closed_won: 'Closed', deposit: 'Deposit', follow_up: 'Follow Up', lost: 'Lost', disqualified: 'DQ', not_pitched: 'Not Pitched', refunded: 'Refunded' }[s] || s)).join(', ')}
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
              onChange={handleObjFilter}
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
        <DateRangeFilter />
        <Typography variant="body2" sx={{ color: COLORS.text.muted, ml: 'auto' }}>
          {filteredCalls.length} call{filteredCalls.length !== 1 ? 's' : ''}
        </Typography>
      </Box>
      {filteredCalls.length === 0 ? (
        <Typography sx={{ color: COLORS.text.muted }}>No calls match the selected filters.</Typography>
      ) : (
        <>
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
                  <th>Revenue</th>
                  <th>Cash Collected</th>
                  <th>Objections</th>
                  <th>Recording</th>
                </tr>
              </thead>
              <tbody>
                {pagedCalls.map((call, i) => (
                  <tr key={i}>
                    <td>{dayjs(call.date).format('MMM D')}</td>
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
                    <td>{call.revenue > 0 ? fmtCurrency(call.revenue) : '-'}</td>
                    <td>{call.cashCollected > 0 ? fmtCurrency(call.cashCollected) : '-'}</td>
                    <td>
                      {call.objections.length > 0 ? (
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {call.objections.slice(0, 3).map((obj, j) => (
                            <Chip key={j} label={obj} size="small" sx={{
                              backgroundColor: hexToRgba(COLORS.neon.cyan, 0.12),
                              color: COLORS.neon.cyan,
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
                    <td>
                      {call.recordingUrl ? (
                        <Tooltip title="Play recording" arrow>
                          <IconButton
                            size="small"
                            component="a"
                            href={call.recordingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            sx={{ color: COLORS.neon.cyan, p: 0.5, '&:hover': { color: COLORS.neon.green } }}
                          >
                            <PlayArrowIcon sx={{ fontSize: 18 }} />
                          </IconButton>
                        </Tooltip>
                      ) : (
                        <Typography variant="caption" sx={{ color: COLORS.text.muted }}>-</Typography>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Box>
          </Box>
          {/* Pagination */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mt: 2 }}>
              <IconButton
                size="small"
                disabled={callsPage === 0}
                onClick={() => setCallsPage(p => p - 1)}
                sx={{ color: COLORS.text.secondary, '&:hover': { color: COLORS.neon.cyan } }}
              >
                <NavigateBeforeIcon />
              </IconButton>
              <Typography variant="body2" sx={{ color: COLORS.text.secondary }}>
                Page {callsPage + 1} of {totalPages}
              </Typography>
              <IconButton
                size="small"
                disabled={callsPage >= totalPages - 1}
                onClick={() => setCallsPage(p => p + 1)}
                sx={{ color: COLORS.text.secondary, '&:hover': { color: COLORS.neon.cyan } }}
              >
                <NavigateNextIcon />
              </IconButton>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

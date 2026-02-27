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
 * Uses hardcoded demo data for showcase purposes.
 */

import React, { useState, useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import ButtonBase from '@mui/material/ButtonBase';
import { COLORS, LAYOUT } from '../../theme/constants';
import { hexToRgba } from '../../utils/colors';
import { fmtDollar, fmtPercent, fmtNumber } from '../../utils/formatters';
import SectionHeader from '../../components/SectionHeader';
import TronRadarChart from '../../components/charts/TronRadarChart';

/* ───────────────────────────────────────────────────────────────── */
/*  DEMO DATA                                                       */
/* ───────────────────────────────────────────────────────────────── */

const CLOSERS = [
  {
    id: 'barney', name: 'Barney', avatar: 'B', color: COLORS.neon.green,
    closeRate: 0.34, revenue: 138400, cash: 99648, callsHeld: 87, adherence: 6.8,
    showRate: 0.76, avgDealSize: 5600, objResolution: 0.78, lostRate: 0.12,
    callsToClose: 1.8, daysToClose: 3.2, oneCallClose: 0.38,
    discoveryScore: 7.2, pitchScore: 8.8, closeAttemptScore: 9.1, objectionScore: 8.6,
    depositRate: 0.44, cashPerCall: 1145, revenuePerCall: 1591, qualifiedCloseRate: 0.41,
  },
  {
    id: 'ted', name: 'Ted', avatar: 'T', color: COLORS.neon.cyan,
    closeRate: 0.22, revenue: 67300, cash: 48456, callsHeld: 64, adherence: 8.1,
    showRate: 0.71, avgDealSize: 4200, objResolution: 0.55, lostRate: 0.18,
    callsToClose: 2.3, daysToClose: 5.8, oneCallClose: 0.22,
    discoveryScore: 8.0, pitchScore: 7.4, closeAttemptScore: 7.2, objectionScore: 6.8,
    depositRate: 0.38, cashPerCall: 757, revenuePerCall: 1052, qualifiedCloseRate: 0.29,
  },
  {
    id: 'lily', name: 'Lily', avatar: 'L', color: COLORS.neon.purple,
    closeRate: 0.14, revenue: 42800, cash: 29960, callsHeld: 72, adherence: 9.2,
    showRate: 0.79, avgDealSize: 5350, objResolution: 0.42, lostRate: 0.24,
    callsToClose: 2.9, daysToClose: 8.1, oneCallClose: 0.12,
    discoveryScore: 9.1, pitchScore: 8.2, closeAttemptScore: 5.8, objectionScore: 5.4,
    depositRate: 0.32, cashPerCall: 416, revenuePerCall: 594, qualifiedCloseRate: 0.19,
  },
  {
    id: 'marshal', name: 'Marshal', avatar: 'M', color: COLORS.neon.amber,
    closeRate: 0.19, revenue: 59056, cash: 41339, callsHeld: 58, adherence: 7.5,
    showRate: 0.61, avgDealSize: 6200, objResolution: 0.51, lostRate: 0.21,
    callsToClose: 2.1, daysToClose: 5.4, oneCallClose: 0.26,
    discoveryScore: 7.8, pitchScore: 8.4, closeAttemptScore: 7.6, objectionScore: 6.2,
    depositRate: 0.41, cashPerCall: 713, revenuePerCall: 1018, qualifiedCloseRate: 0.25,
  },
];

const TEAM_AVG = {
  name: 'Team Avg', avatar: 'T', color: COLORS.text.muted, id: 'team',
  closeRate: 0.22, revenue: 76889, cash: 54851, callsHeld: 70, adherence: 7.9,
  showRate: 0.73, avgDealSize: 5100, objResolution: 0.52, lostRate: 0.19,
  callsToClose: 2.3, daysToClose: 5.4, oneCallClose: 0.24,
  discoveryScore: 8.0, pitchScore: 8.2, closeAttemptScore: 7.4, objectionScore: 6.8,
  depositRate: 0.39, cashPerCall: 784, revenuePerCall: 1101, qualifiedCloseRate: 0.28,
};

const TEAM_INSIGHTS = [
  {
    id: 1, priority: 'high', category: 'Revenue Concentration', color: 'amber',
    icon: 'warning',
    title: '45% of revenue is coming from one closer',
    body: 'Barney is responsible for 45% of all revenue generated this quarter ($138,400 of $307,556). While his performance is exceptional, this creates a significant single-point-of-failure risk. If Barney takes time off or leaves, nearly half your revenue pipeline disappears.',
    action: 'Consider having Barney host a weekly training session, or have Lily, Marshal, and Ted review more of his recorded calls to model his techniques.',
  },
  {
    id: 2, priority: 'high', category: 'Script vs. Results Mismatch', color: 'red',
    icon: 'swap_horiz',
    title: 'Highest script adherence is not translating to closes',
    body: 'Lily scores 9.2/10 on script adherence (highest on the team) but has the lowest close rate at 14%. Meanwhile, Barney scores 6.8/10 on adherence but leads with a 34% close rate. This suggests the current script may not be optimized for conversions, or that Barney\'s deviations are actually what\'s working.',
    action: 'Audit Barney\'s calls to identify where he deviates from the script. Consider updating the script to incorporate his natural objection handling and closing patterns.',
  },
  {
    id: 3, priority: 'medium', category: 'Follow-Up Conversion', color: 'green',
    icon: 'trending_up',
    title: 'Follow-up calls are converting 2.3x better than first calls',
    body: 'Your team\'s first-call close rate is 11% but follow-up close rate is 26%. This is significantly above industry average (18% follow-up). Your follow-up process is a competitive advantage — but 38% of scheduled follow-ups are being ghosted.',
    action: 'Reduce follow-up ghost rate by implementing same-day confirmation texts. Even a 10% improvement would add an estimated $18,200/mo in revenue.',
  },
  {
    id: 4, priority: 'medium', category: 'Scheduling Pattern', color: 'cyan',
    icon: 'calendar_month',
    title: 'Tuesday and Wednesday calls close at 2x the rate of Friday calls',
    body: 'Close rate by day: Tue (28%), Wed (26%), Thu (21%), Mon (18%), Fri (12%). Friday appointments are dragging down your overall numbers. 23% of your booked calls land on Fridays.',
    action: 'Shift booking weight toward Tue-Thu. Consider removing Friday call slots or reserving them for follow-ups only.',
  },
  {
    id: 5, priority: 'low', category: 'Team Velocity', color: 'green',
    icon: 'speed',
    title: 'Average days to close has dropped from 8.2 to 5.4 days',
    body: 'Over the last 60 days, your team is closing deals 34% faster. This is primarily driven by Marshal and Ted shortening their follow-up cadence from 5-7 days to 2-3 days between touches. One-call closes are also up from 18% to 24%.',
    action: 'Reinforce the faster follow-up cadence in your next team meeting. The tighter cadence is keeping prospects engaged.',
  },
  {
    id: 6, priority: 'medium', category: 'Objection Handling Gap', color: 'purple',
    icon: 'psychology',
    title: 'Financial objections are 3x more likely to result in a lost deal',
    body: '"I can\'t afford it" and "It\'s too expensive" objections have a 68% loss rate, while "I need to think about it" and "Spouse" objections only have a 31% loss rate. Financial objections appear in 42% of lost calls but only 12% of closed calls.',
    action: 'Build a dedicated financial objection framework. Have Barney (78% resolution rate) record his best financial objection rebuttals for the team playbook.',
  },
];

const INDIVIDUAL_INSIGHTS = [
  {
    closer: CLOSERS[0],
    insights: [
      { type: 'strength', text: 'Highest converting closer at 34% close rate. Objection resolution rate is 78% — 50% higher than team average. His close attempt score (9.1) shows he confidently asks for the sale multiple times.' },
      { type: 'opportunity', text: 'Script adherence is lowest on the team (6.8/10), but his results suggest his deviations are working. His discovery phase diverges most — he asks 40% more qualifying questions than the script calls for.' },
      { type: 'action', text: 'Record and transcribe Barney\'s top 5 closes from this month. Extract his objection handling rebuttals and qualifying questions for the team playbook.' },
    ],
  },
  {
    closer: CLOSERS[1],
    insights: [
      { type: 'strength', text: 'Most improved closer over the last 30 days — close rate jumped from 16% to 22% after shortening follow-up cadence. Cash collection rate is highest on the team at 72%.' },
      { type: 'concern', text: 'Average deal size ($4,200) is 18% below team average ($5,100). 0 of his last 12 closes included the VIP upsell, suggesting he may be discounting or not presenting premium options.' },
      { type: 'action', text: 'Review Ted\'s pitch section recordings — he may be skipping the premium tier presentation. Coach on anchoring high before negotiating down.' },
    ],
  },
  {
    closer: CLOSERS[2],
    insights: [
      { type: 'strength', text: 'Highest script adherence on the team (9.2/10). Discovery and rapport scores are both 9+. Prospects consistently rate her calls as "helpful" in post-call surveys.' },
      { type: 'concern', text: 'Despite highest adherence and rapport, Lily has the lowest close rate (14%). Close attempt score is 5.8/10 — she averages 1.2 close attempts per call vs. Barney\'s 3.1. She\'s building great relationships but not asking for the sale.' },
      { type: 'action', text: 'Lily needs close attempt coaching, not script coaching. Have her shadow Barney\'s calls from pitch-to-close. Her rapport skills + stronger closing = potential top performer.' },
    ],
  },
  {
    closer: CLOSERS[3],
    insights: [
      { type: 'strength', text: 'Highest average deal size ($6,200). 4 of his last 8 closes included the VIP upsell. Pitch score is 8.4/10 — he\'s the best at presenting premium value.' },
      { type: 'concern', text: 'Show rate on Marshal\'s booked calls is only 61% vs. team average of 73%. He\'s losing prospects before they even show up — costing an estimated $22,000/mo in unrealized revenue.' },
      { type: 'action', text: 'Investigate pre-call confirmation process. Implement personalized video reminders before appointments. Improving show rate by 10% would add ~3 more closes per month ($18,600).' },
    ],
  },
];

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
  { key: 'adherence', label: 'Script Adherence', format: 'score', desiredDir: 'up' },
  { key: 'objResolution', label: 'Objection Resolution', format: 'percent', desiredDir: 'up' },
  { key: 'lostRate', label: 'Lost Rate', format: 'percent', desiredDir: 'down' },
  { key: 'callsToClose', label: 'Calls to Close', format: 'decimal', desiredDir: 'down' },
  { key: 'daysToClose', label: 'Days to Close', format: 'decimal', desiredDir: 'down' },
  { key: 'oneCallClose', label: '1-Call Close %', format: 'percent', desiredDir: 'up' },
  { key: 'depositRate', label: 'Deposit Rate', format: 'percent', desiredDir: 'up' },
  { key: 'qualifiedCloseRate', label: 'Qualified Close Rate', format: 'percent', desiredDir: 'up' },
];

const RADAR_DIMENSIONS = [
  { key: 'discoveryScore', label: 'Discovery' },
  { key: 'pitchScore', label: 'Pitch' },
  { key: 'closeAttemptScore', label: 'Close Attempt' },
  { key: 'objectionScore', label: 'Objection Handling' },
  { key: 'adherence', label: 'Adherence' },
];

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
    case 'score': return value.toFixed(1);
    case 'decimal': return value.toFixed(1);
    default: return fmtNumber(value);
  }
}

/* ───────────────────────────────────────────────────────────────── */
/*  SUMMARY ROW                                                     */
/* ───────────────────────────────────────────────────────────────── */

function SummaryRow() {
  const stats = [
    { label: 'Total Revenue', value: fmtDollar(307556), color: COLORS.neon.green },
    { label: 'Team Close Rate', value: '22%', color: COLORS.neon.cyan },
    { label: 'Calls Analyzed', value: '281', color: COLORS.neon.purple },
    { label: 'Insights Generated', value: '15', color: COLORS.neon.amber },
    { label: 'High Priority', value: '2', color: COLORS.neon.red },
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
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: accent }}>{insight.icon}</span>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.65rem', color: COLORS.text.muted, letterSpacing: '0.08em', textTransform: 'uppercase', mb: 0.25 }}>{insight.category}</Typography>
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: COLORS.text.primary, lineHeight: 1.3 }}>{insight.title}</Typography>
        </Box>
        <PriorityBadge priority={insight.priority} />
      </Box>
      <Typography sx={{ fontSize: '0.85rem', color: COLORS.text.secondary, lineHeight: 1.6, mb: 2 }}>{insight.body}</Typography>
      <Box sx={{ p: 1.5, borderRadius: '8px', background: hexToRgba(accent, 0.06), border: `1px solid ${hexToRgba(accent, 0.15)}`, display: 'flex', gap: 1, alignItems: 'flex-start' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16, color: accent, marginTop: 2, flexShrink: 0 }}>arrow_forward</span>
        <Typography sx={{ fontSize: '0.8rem', color: COLORS.text.primary, lineHeight: 1.5 }}>{insight.action}</Typography>
      </Box>
    </Box>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/*  INDIVIDUAL CLOSER CARD                                          */
/* ───────────────────────────────────────────────────────────────── */

function CloserInsightCard({ data }) {
  const c = data.closer;
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
              { label: 'Close Rate', value: fmtPercent(c.closeRate) },
              { label: 'Revenue', value: fmtDollar(c.revenue) },
              { label: 'Adherence', value: c.adherence.toFixed(1) },
              { label: 'Calls', value: c.callsHeld },
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
        {data.insights.map((ins, i) => (
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
/*  COMPARISON TOOL                                                 */
/* ───────────────────────────────────────────────────────────────── */

function ComparisonTool() {
  const [leftId, setLeftId] = useState('barney');
  const [rightId, setRightId] = useState('lily');
  const options = [...CLOSERS, { ...TEAM_AVG, avatar: 'AVG' }];

  const left = options.find(c => c.id === leftId) || CLOSERS[0];
  const right = options.find(c => c.id === rightId) || CLOSERS[2];

  /** Determine who "wins" each metric row */
  function getWinner(metric) {
    const lv = left[metric.key];
    const rv = right[metric.key];
    if (lv == null || rv == null || lv === rv) return 'tie';
    const leftBetter = metric.desiredDir === 'up' ? lv > rv : lv < rv;
    return leftBetter ? 'left' : 'right';
  }

  // Radar data for both closers
  const radarData = RADAR_DIMENSIONS.map(d => ({
    label: d.label,
    values: [left[d.key], right[d.key]],
  }));

  // AI comparison summary
  const comparisonInsight = useMemo(() => {
    const leftWins = COMPARISON_METRICS.filter(m => getWinner(m) === 'left').length;
    const rightWins = COMPARISON_METRICS.filter(m => getWinner(m) === 'right').length;
    const winner = leftWins > rightWins ? left : right;
    const loser = leftWins > rightWins ? right : left;

    // Generate contextual comparison insight
    if (left.id === 'barney' && right.id === 'lily') {
      return `${left.name} outperforms ${right.name} in ${leftWins} of ${COMPARISON_METRICS.length} metrics, but the gap tells an interesting story. ${right.name}'s rapport and discovery skills (9.1) actually exceed ${left.name}'s (7.2) — she's building better relationships but not converting them. The key difference is close attempts: ${left.name} averages 3.1 per call vs ${right.name}'s 1.2. If ${right.name} adopted ${left.name}'s closing persistence while keeping her rapport skills, she could realistically reach a 25%+ close rate — adding an estimated $24,000/mo in revenue.`;
    }
    if (left.id === 'barney' && right.id === 'ted') {
      return `${left.name} leads in ${leftWins} metrics, most notably close rate (34% vs 22%) and objection resolution (78% vs 55%). However, ${right.name} is the fastest improving closer — up 6 points in 30 days. ${right.name}'s biggest gap is deal size ($4,200 vs $5,600). Coaching ${right.name} on premium positioning could close the revenue gap significantly without needing more calls.`;
    }
    if (right.id === 'team') {
      const aboveAvg = COMPARISON_METRICS.filter(m => {
        const lv = left[m.key]; const rv = right[m.key];
        return m.desiredDir === 'up' ? lv > rv : lv < rv;
      });
      return `${left.name} outperforms the team average in ${aboveAvg.length} of ${COMPARISON_METRICS.length} metrics. Key strengths above average: ${aboveAvg.slice(0, 3).map(m => m.label).join(', ')}. Focus areas below team average: ${COMPARISON_METRICS.filter(m => !aboveAvg.includes(m)).slice(0, 3).map(m => m.label).join(', ')}.`;
    }
    return `${winner.name} leads in ${Math.max(leftWins, rightWins)} of ${COMPARISON_METRICS.length} tracked metrics. The most significant gaps are in close rate (${fmtPercent(left.closeRate)} vs ${fmtPercent(right.closeRate)}) and objection resolution (${fmtPercent(left.objResolution)} vs ${fmtPercent(right.objResolution)}). Consider pairing these two closers for peer coaching sessions.`;
  }, [leftId, rightId]);

  return (
    <Box>
      {/* Closer selectors */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mb: 3, flexWrap: 'wrap' }}>
        <Box>
          <Typography sx={{ fontSize: '0.6rem', color: COLORS.text.muted, letterSpacing: '0.1em', textTransform: 'uppercase', mb: 1 }}>Compare</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {options.map(c => <CloserPill key={c.id} closer={c} isActive={leftId === c.id} onClick={() => setLeftId(c.id)} />)}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', pt: 2 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: COLORS.text.muted }}>compare_arrows</span>
        </Box>
        <Box>
          <Typography sx={{ fontSize: '0.6rem', color: COLORS.text.muted, letterSpacing: '0.1em', textTransform: 'uppercase', mb: 1 }}>Against</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {options.map(c => <CloserPill key={c.id} closer={c} isActive={rightId === c.id} onClick={() => setRightId(c.id)} />)}
          </Box>
        </Box>
      </Box>

      {/* AI comparison insight */}
      <Box sx={{ mb: 3, p: 2, borderRadius: `${LAYOUT.cardBorderRadius}px`, background: hexToRgba(COLORS.neon.purple, 0.06), border: `1px solid ${hexToRgba(COLORS.neon.purple, 0.2)}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: COLORS.neon.purple }}>auto_awesome</span>
          <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', color: COLORS.neon.purple, textTransform: 'uppercase' }}>AI Comparison Analysis</Typography>
        </Box>
        <Typography sx={{ fontSize: '0.83rem', color: COLORS.text.primary, lineHeight: 1.55 }}>{comparisonInsight}</Typography>
      </Box>

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
                  {fmt(left[metric.key], metric.format)} {winner === 'left' && '●'}
                </Typography>
                <Typography sx={{
                  fontSize: '0.85rem', fontWeight: winner === 'right' ? 700 : 400, textAlign: 'center',
                  color: winner === 'right' ? COLORS.neon.green : COLORS.text.primary,
                }}>
                  {fmt(right[metric.key], metric.format)} {winner === 'right' && '●'}
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
                { label: left.name, values: RADAR_DIMENSIONS.map(d => left[d.key]), color: left.color },
                { label: right.name, values: RADAR_DIMENSIONS.map(d => right[d.key]), color: right.color },
              ]}
              maxValue={10}
              height={280}
            />
          </Box>
          {/* Legend */}
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 1 }}>
            {[left, right].map(c => (
              <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: c.color }} />
                <Typography sx={{ fontSize: '0.75rem', color: COLORS.text.secondary }}>{c.name}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/* ───────────────────────────────────────────────────────────────── */
/*  TAB SWITCHER                                                    */
/* ───────────────────────────────────────────────────────────────── */

function TabSwitcher({ tabs, activeTab, onTabChange }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5, mb: 3, p: 0.5, borderRadius: 2, background: COLORS.bg.secondary, border: `1px solid ${COLORS.border.subtle}`, width: 'fit-content' }}>
      {tabs.map(tab => (
        <ButtonBase
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          sx={{
            px: 2, py: 0.75, borderRadius: 1.5,
            background: activeTab === tab.id ? hexToRgba(COLORS.neon.cyan, 0.12) : 'transparent',
            border: activeTab === tab.id ? `1px solid ${hexToRgba(COLORS.neon.cyan, 0.3)}` : '1px solid transparent',
            transition: 'all 0.2s ease',
            display: 'flex', alignItems: 'center', gap: 0.75,
            '&:hover': { background: hexToRgba(COLORS.neon.cyan, 0.06) },
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: activeTab === tab.id ? COLORS.neon.cyan : COLORS.text.muted }}>{tab.icon}</span>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: activeTab === tab.id ? 600 : 400, color: activeTab === tab.id ? COLORS.neon.cyan : COLORS.text.secondary }}>
            {tab.label}
          </Typography>
        </ButtonBase>
      ))}
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

  return (
    <Box>
      {/* Page header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <SectionHeader title="Data Analysis" color={COLORS.neon.purple} />
        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.5, borderRadius: 2, background: hexToRgba(COLORS.neon.purple, 0.1), border: `1px solid ${hexToRgba(COLORS.neon.purple, 0.3)}` }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: COLORS.neon.purple }}>auto_awesome</span>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: COLORS.neon.purple }}>AI-POWERED</Typography>
        </Box>
        <Typography sx={{ fontSize: '0.7rem', color: COLORS.text.muted, ml: 'auto' }}>Last updated 2h ago | 281 calls analyzed | 90-day window</Typography>
      </Box>

      {/* Tabs */}
      <TabSwitcher tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

      {/* ── Overview Tab ── */}
      {activeTab === 'overview' && (
        <>
          <SummaryRow />

          {/* Executive Summary */}
          <Box sx={{ mb: 3, p: 2.5, borderRadius: `${LAYOUT.cardBorderRadius}px`, background: `linear-gradient(135deg, ${hexToRgba(COLORS.neon.purple, 0.08)} 0%, ${hexToRgba(COLORS.neon.cyan, 0.05)} 100%)`, border: `1px solid ${hexToRgba(COLORS.neon.purple, 0.25)}`, boxShadow: `0 0 30px ${hexToRgba(COLORS.neon.purple, 0.1)}` }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: COLORS.neon.purple }}>psychology</span>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em', color: COLORS.neon.purple, textTransform: 'uppercase' }}>Executive Summary</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.9rem', color: COLORS.text.primary, lineHeight: 1.6 }}>
              Your team closed $307,556 in revenue this quarter with a 22% overall close rate across 281 held calls. The biggest risk is revenue concentration — Barney generates 45% of all revenue.
              The biggest opportunity is Lily: she has the highest rapport and adherence scores but the lowest close rate, suggesting a coaching gap in closing technique, not fundamentals.
              Fixing Lily's close attempts alone could add an estimated $24,000/mo. Your follow-up process is a hidden strength — converting at 2.3x the rate of first calls.
            </Typography>
          </Box>

          {/* Top 3 Priority Actions */}
          <Box sx={{ mb: 1 }}><SectionHeader title="Top Priority Actions" color={COLORS.neon.red} /></Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mb: 4 }}>
            {TEAM_INSIGHTS.filter(i => i.priority === 'high').map(i => <TeamInsightCard key={i.id} insight={i} />)}
          </Box>

          {/* Quick Closer Overview */}
          <Box sx={{ mb: 1 }}><SectionHeader title="Closer Quick View" color={COLORS.neon.cyan} /></Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr 1fr' }, gap: 2, mb: 3 }}>
            {CLOSERS.map(c => (
              <Box
                key={c.id}
                sx={{
                  p: 2, borderRadius: `${LAYOUT.cardBorderRadius}px`, background: COLORS.bg.secondary,
                  border: `1px solid ${hexToRgba(c.color, 0.2)}`,
                  transition: 'all 0.25s ease', cursor: 'pointer',
                  '&:hover': { borderColor: hexToRgba(c.color, 0.5), boxShadow: `0 0 20px ${hexToRgba(c.color, 0.15)}` },
                }}
                onClick={() => { setActiveTab('individual'); }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Box sx={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: hexToRgba(c.color, 0.15), border: `2px solid ${hexToRgba(c.color, 0.5)}` }}>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: c.color }}>{c.avatar}</Typography>
                  </Box>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: COLORS.text.primary }}>{c.name}</Typography>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  {[
                    { label: 'Close Rate', value: fmtPercent(c.closeRate), good: c.closeRate >= 0.22 },
                    { label: 'Revenue', value: fmtDollar(c.revenue, false), good: c.revenue >= 60000 },
                    { label: 'Show Rate', value: fmtPercent(c.showRate), good: c.showRate >= 0.70 },
                    { label: 'Adherence', value: c.adherence.toFixed(1), good: c.adherence >= 7.5 },
                  ].map(s => (
                    <Box key={s.label}>
                      <Typography sx={{ fontSize: '0.55rem', color: COLORS.text.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</Typography>
                      <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: s.good ? COLORS.neon.green : COLORS.neon.red }}>{s.value}</Typography>
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        </>
      )}

      {/* ── Team Insights Tab ── */}
      {activeTab === 'team' && (
        <>
          <Box sx={{ mb: 1 }}><SectionHeader title="Team Insights" color={COLORS.neon.amber} /></Box>
          <Typography sx={{ fontSize: '0.78rem', color: COLORS.text.muted, mb: 2, ml: 2.5 }}>Cross-team patterns, risks, and opportunities identified from your data</Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {TEAM_INSIGHTS.map(i => <TeamInsightCard key={i.id} insight={i} />)}
          </Box>
        </>
      )}

      {/* ── Individual Tab ── */}
      {activeTab === 'individual' && (
        <>
          <Box sx={{ mb: 1 }}><SectionHeader title="Individual Closer Insights" color={COLORS.neon.cyan} /></Box>
          <Typography sx={{ fontSize: '0.78rem', color: COLORS.text.muted, mb: 2, ml: 2.5 }}>Per-closer performance analysis with strengths, gaps, and coaching recommendations</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
            {INDIVIDUAL_INSIGHTS.map(d => <CloserInsightCard key={d.closer.id} data={d} />)}
          </Box>
        </>
      )}

      {/* ── Compare Tab ── */}
      {activeTab === 'compare' && (
        <>
          <Box sx={{ mb: 1 }}><SectionHeader title="Closer Comparison" color={COLORS.neon.cyan} /></Box>
          <Typography sx={{ fontSize: '0.78rem', color: COLORS.text.muted, mb: 2, ml: 2.5 }}>Select any two closers — or compare one closer against the team average — to see a head-to-head breakdown</Typography>
          <ComparisonTool />
        </>
      )}
    </Box>
  );
}

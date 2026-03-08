/**
 * TEST DATA FOR EMAIL TEMPLATES
 *
 * Realistic sample data for previewing and testing email reports
 * without needing a BigQuery connection. Used by the preview and
 * test-send endpoints.
 *
 * Data shape mirrors what the real data fetcher will produce —
 * every section has current period values plus a `prev` comparison object.
 */

const weeklyTestData = {
  company_name: 'Acme Coaching',
  report_type: 'weekly',
  report_period: {
    label: 'Feb 24 – Mar 2, 2026',
    start: '2026-02-24',
    end: '2026-03-02',
  },
  prev_period: {
    label: 'Feb 17 – Feb 23, 2026',
    start: '2026-02-17',
    end: '2026-02-23',
  },

  // ── Overview ──────────────────────────────────────────────
  overview: {
    total_calls: 47,
    shows: 38,
    closes: 8,
    show_rate: 0.8085,
    close_rate: 0.2105,
    revenue: 125000,
    cash_collected: 87500,
    prev: {
      total_calls: 42,
      shows: 33,
      closes: 6,
      show_rate: 0.7857,
      close_rate: 0.1818,
      revenue: 96000,
      cash_collected: 72000,
    },
  },

  // ── Financial ─────────────────────────────────────────────
  financial: {
    revenue: 125000,
    cash_collected: 87500,
    avg_deal_size: 15625,
    deals_closed: 8,
    deposits: 2,
    deposit_total: 5000,
    prev: {
      revenue: 96000,
      cash_collected: 72000,
      avg_deal_size: 16000,
      deals_closed: 6,
      deposits: 1,
      deposit_total: 2500,
    },
  },

  // ── Attendance ────────────────────────────────────────────
  attendance: {
    total_booked: 47,
    shows: 38,
    ghosted: 6,
    canceled: 2,
    rescheduled: 1,
    show_rate: 0.8085,
    ghost_rate: 0.1277,
    cancel_rate: 0.0426,
    prev: {
      total_booked: 42,
      shows: 33,
      ghosted: 5,
      canceled: 3,
      rescheduled: 1,
      show_rate: 0.7857,
      ghost_rate: 0.1190,
      cancel_rate: 0.0714,
    },
  },

  // ── Call Outcomes ─────────────────────────────────────────
  callOutcomes: {
    closed_won: 8,
    deposit: 2,
    follow_up: 15,
    lost: 10,
    disqualified: 2,
    not_pitched: 1,
    prev: {
      closed_won: 6,
      deposit: 1,
      follow_up: 14,
      lost: 9,
      disqualified: 2,
      not_pitched: 1,
    },
  },

  // ── Sales Cycle ───────────────────────────────────────────
  salesCycle: {
    avg_days_to_close: 4.2,
    one_call_close_rate: 0.35,
    avg_follow_ups_before_close: 1.8,
    longest_cycle_days: 14,
    shortest_cycle_days: 0,
    prev: {
      avg_days_to_close: 5.1,
      one_call_close_rate: 0.30,
      avg_follow_ups_before_close: 2.1,
      longest_cycle_days: 18,
      shortest_cycle_days: 0,
    },
  },

  // ── Objections ────────────────────────────────────────────
  objections: {
    total: 34,
    resolved: 22,
    overall_resolution_rate: 0.6471,
    top: [
      { type: 'Financial',      count: 12, resolved: 8,  res_rate: 0.6667 },
      { type: 'Think About It', count: 8,  resolved: 5,  res_rate: 0.6250 },
      { type: 'Spouse/Partner', count: 5,  resolved: 4,  res_rate: 0.8000 },
      { type: 'Timing',         count: 4,  resolved: 2,  res_rate: 0.5000 },
      { type: 'Trust',          count: 3,  resolved: 2,  res_rate: 0.6667 },
      { type: 'DIY',            count: 2,  resolved: 1,  res_rate: 0.5000 },
    ],
    prev: {
      total: 28,
      resolved: 17,
      overall_resolution_rate: 0.6071,
    },
  },

  // ── Market Insight ────────────────────────────────────────
  marketInsight: {
    hot_leads: 5,
    warm_leads: 12,
    cold_leads: 21,
    avg_prospect_fit: 6.8,
    top_pains: [
      'The economy is making it harder to find clients',
      'Struggling to scale beyond 1-on-1 coaching',
      'Burnout from doing everything themselves',
      'Can\'t figure out paid ads / lead gen',
    ],
    top_goals: [
      'Want to travel while running their business remotely',
      'Looking to hit $50K/month consistently',
      'Build a team so they can step back from fulfillment',
      'Launch a group coaching program',
    ],
    prev: {
      hot_leads: 3,
      warm_leads: 10,
      cold_leads: 20,
      avg_prospect_fit: 6.5,
    },
  },

  // ── Violations / Risk ─────────────────────────────────────
  violations: {
    flagged_calls: 2,
    total_flags: 3,
    items: [
      {
        closer_name: 'Jake Martinez',
        call_date: '2026-02-26',
        risk_category: 'Income Guarantee',
        phrase: 'You\'ll definitely make your money back in 30 days',
        severity: 'high',
      },
      {
        closer_name: 'Sarah Chen',
        call_date: '2026-02-28',
        risk_category: 'Pressure Tactic',
        phrase: 'This price is only available right now, I can\'t hold it',
        severity: 'medium',
      },
      {
        closer_name: 'Jake Martinez',
        call_date: '2026-02-28',
        risk_category: 'Misleading Claim',
        phrase: 'Everyone who joins sees results in the first week',
        severity: 'medium',
      },
    ],
    prev: {
      flagged_calls: 1,
      total_flags: 1,
    },
  },

  // ── AI Insights (one per section + leaderboard) ────────────
  insights: {
    overview: 'Strong week overall — team booked 5 more calls than last week and converted at a higher rate. Sarah Chen carried the bulk of closes (4 of 8), while Michael Park continues to struggle with show rate at 57%. Revenue jumped $29K week-over-week, largely driven by two high-ticket closes from Sarah.',
    financial: 'Cash collection improved significantly this week (+$15,500). Average deal size dipped slightly from $16K to $15.6K as two smaller deals closed, but total volume more than compensated. Jake Martinez landed one large deal ($18K) that pulled his averages up despite only 2 total closes.',
    attendance: 'Show rate climbed 2.3 points to 80.9% — the best week this month. Ghosting ticked up by 1 though, with Michael Park accounting for 3 of the 6 no-shows. Cancellations dropped from 3 to 2, suggesting better prospect qualification on the front end.',
    callOutcomes: 'Close rate improved from 18.2% to 21.1%, with the team adding 2 more closes than last week. Emily Rodriguez moved from 0 closes to 1 this week — small progress but a positive sign. Follow-ups remain high at 15, creating a strong pipeline for next week.',
    salesCycle: 'Sales cycle shortened by nearly a full day (5.1 → 4.2 days). One-call close rate jumped from 30% to 35%, with Sarah Chen closing 3 of her 4 deals on the first call. The longest cycle dropped from 18 to 14 days, showing the team is tightening up follow-up discipline.',
    objections: 'Financial objections remain the #1 blocker (12 this week, up from 9 last week). The good news: Spouse/Partner objections hit 80% resolution rate — Sarah Chen resolved all 3 she faced. Timing objections at only 50% resolution suggest the team needs better urgency-building techniques.',
    marketInsight: 'Prospects mentioning "the economy" as a pain point doubled since last week (8 vs 4 mentions). More people than ever are expressing interest in scaling their business remotely — this came up in 60% of discovery calls. Budget sensitivity is rising but so is urgency, creating a window for payment plan positioning.',
    violations: 'Jake Martinez triggered 2 of the 3 flags this week — both involving income guarantees and misleading claims. This is a repeat pattern from last month. Sarah Chen had one pressure tactic flag, though it was borderline. Recommend a 1-on-1 compliance review with Jake before next week.',
    leaderboard: 'Sarah Chen holds the top spot for the 3rd consecutive week with $38K cash collected — she\'s pulling away from the pack. Jake Martinez dropped to #2 despite strong revenue ($32K) because his cash collection lagged at $22K due to deposit-heavy deals. Michael Park remains the lowest performer but managed to increase his show rate from last week and had zero violations — small wins worth noting.',
  },

  // ── Closer Leaderboard ────────────────────────────────────
  closerLeaderboard: [
    { name: 'Sarah Chen',      calls: 14, shows: 12, closes: 4, close_rate: 0.3333, revenue: 52000, cash_collected: 38000 },
    { name: 'Jake Martinez',   calls: 12, shows: 10, closes: 2, close_rate: 0.2000, revenue: 32000, cash_collected: 22000 },
    { name: 'Emily Rodriguez', calls: 11, shows: 9,  closes: 1, close_rate: 0.1111, revenue: 25000, cash_collected: 18000 },
    { name: 'Michael Park',    calls: 10, shows: 7,  closes: 1, close_rate: 0.1429, revenue: 16000, cash_collected: 9500 },
  ],

  // ── Metric Alerts (threshold-based) ───────────────────────
  alerts: [
    {
      metric: 'show_rate',
      label: 'Show Rate',
      operator: 'below',
      threshold: 0.75,
      current_value: 0.5714,
      closer_name: 'Michael Park',
      duration_days: 5,
    },
    {
      metric: 'close_rate',
      label: 'Close Rate',
      operator: 'below',
      threshold: 0.15,
      current_value: 0.1111,
      closer_name: 'Emily Rodriguez',
      duration_days: 3,
    },
  ],
};

/**
 * Monthly test data extends weekly with additional monthly-specific fields.
 * In production, monthly aggregates 4-5 weeks of data.
 */
const monthlyTestData = {
  ...weeklyTestData,
  report_type: 'monthly',
  report_period: {
    label: 'February 2026',
    start: '2026-02-01',
    end: '2026-02-28',
  },
  prev_period: {
    label: 'January 2026',
    start: '2026-01-01',
    end: '2026-01-31',
  },
  overview: {
    ...weeklyTestData.overview,
    total_calls: 189,
    shows: 152,
    closes: 31,
    show_rate: 0.8042,
    close_rate: 0.2039,
    revenue: 496000,
    cash_collected: 348000,
    prev: {
      total_calls: 175,
      shows: 138,
      closes: 26,
      show_rate: 0.7886,
      close_rate: 0.1884,
      revenue: 412000,
      cash_collected: 295000,
    },
  },
};

/**
 * Daily onboarding test data — single closer, single day.
 * Tracks a new closer's performance during their first 30 days.
 */
const dailyOnboardingTestData = {
  report_type: 'daily_onboarding',
  report_date: 'Friday, March 7, 2026',
  company_name: 'How I Met Your Mother Dating',
  closer: { closer_id: 'lilly_erickson', name: 'Lilly Erickson', timezone: 'PST' },
  days_remaining: 7,
  days_elapsed: 23,
  close_watch_start_date: '2026-02-19',
  watch_type: 'onboarding',  // 'onboarding' or 'pip'

  // Real data — Lilly's calls on 2026-03-07
  calls_booked: 9,
  calls_showed: 5,
  calls_closed: 0,
  cash_collected: 0,
  revenue_generated: 0,
  show_rate: 0.5556,
  close_rate: 0.00,

  // Script adherence — real avg from today's calls
  script_adherence: {
    score: 7.04,
    team_avg: 7.04,
  },

  // Team averages over the last 30 days (real BQ data)
  targets: {
    source: 'team_avg',
    period_label: 'Last 30 Days',
    show_rate: 0.6884,
    close_rate: 0.3354,
    avg_deal_size: 6413,
    avg_cash_per_deal: 3527,
    cash_collected: 0,
    revenue_generated: 0,
  },

  // No violations found for Lilly in recent data
  violations: [],

  // Real objections from Lilly's last 30 days
  objections: [
    { objection_type: 'Spouse/Partner', count: 2, resolved_count: 1, resolution_rate: 0.50 },
    { objection_type: 'Already Tried', count: 2, resolved_count: 0, resolution_rate: 0.00 },
    { objection_type: 'Financial',     count: 2, resolved_count: 1, resolution_rate: 0.50 },
    { objection_type: 'Think About It', count: 1, resolved_count: 1, resolution_rate: 1.00 },
    { objection_type: 'Timing',        count: 1, resolved_count: 0, resolution_rate: 0.00 },
    { objection_type: 'Not Ready',     count: 1, resolved_count: 1, resolution_rate: 1.00 },
  ],

  // Cumulative stats from close_watch_start_date to today
  cumulative: {
    calls_booked: 42,
    calls_showed: 28,
    calls_closed: 3,
    show_rate: 0.6667,
    close_rate: 0.1071,
    cash_collected: 9500,
    revenue_generated: 18000,
    script_adherence_avg: 6.8,
    objections: [
      { objection_type: 'Financial', count: 5, resolved_count: 3, resolution_rate: 0.60 },
      { objection_type: 'Spouse/Partner', count: 3, resolved_count: 2, resolution_rate: 0.67 },
      { objection_type: 'Think About It', count: 2, resolved_count: 1, resolution_rate: 0.50 },
    ],
    violations_count: 2,
    violations_items: [
      { call_date: '2026-02-28', risk_category: 'High Pressure', phrase: 'You need to decide right now', severity: 'high' },
      { call_date: '2026-02-24', risk_category: 'Income Claims', phrase: 'You will make six figures guaranteed', severity: 'medium' },
    ],
  },
};

module.exports = { weeklyTestData, monthlyTestData, dailyOnboardingTestData };

/**
 * DUMMY DATA — Used when charts/sections are locked behind a tier gate.
 *
 * Provides plausible fake data so locked components render behind blur.
 * Generic closer names ("Closer A" through "Closer D") to avoid confusion
 * with real data. Shapes match what each chart component expects.
 */

// ─────────────────────────────────────────────────────────────
// FINANCIAL PAGE — per-closer charts
// ─────────────────────────────────────────────────────────────

export const DUMMY_FINANCIAL = {
  revenueByCloserBar: [
    { date: 'Closer A', cash: 22800, uncollected: 15200 },
    { date: 'Closer B', cash: 19200, uncollected: 12800 },
    { date: 'Closer C', cash: 16800, uncollected: 11200 },
    { date: 'Closer D', cash: 10200, uncollected: 6800 },
  ],
  perCallByCloser: [
    { date: 'Closer A', revPerCall: 850, cashPerCall: 510 },
    { date: 'Closer B', revPerCall: 720, cashPerCall: 432 },
    { date: 'Closer C', revPerCall: 640, cashPerCall: 384 },
    { date: 'Closer D', revPerCall: 560, cashPerCall: 336 },
  ],
  avgPerDealByCloser: [
    { date: 'Closer A', avgCash: 3480, avgUncollected: 2320 },
    { date: 'Closer B', avgCash: 3120, avgUncollected: 2080 },
    { date: 'Closer C', avgCash: 2760, avgUncollected: 1840 },
    { date: 'Closer D', avgCash: 2460, avgUncollected: 1640 },
  ],
  revenueByCloserPie: [
    { label: 'Closer A', value: 38000 },
    { label: 'Closer B', value: 32000 },
    { label: 'Closer C', value: 28000 },
    { label: 'Closer D', value: 17000 },
  ],
};

// ─────────────────────────────────────────────────────────────
// ATTENDANCE PAGE — per-closer charts
// ─────────────────────────────────────────────────────────────

export const DUMMY_ATTENDANCE = {
  showRatePerCloser: {
    data: [
      { date: 'Closer A', showRate: 0.82 },
      { date: 'Closer B', showRate: 0.75 },
      { date: 'Closer C', showRate: 0.71 },
      { date: 'Closer D', showRate: 0.68 },
    ],
    series: [{ key: 'showRate', label: 'Show Rate', color: '#00f0ff' }],
  },
  attendancePerCloser: {
    data: [
      { date: 'Closer A', show: 28, noShow: 6 },
      { date: 'Closer B', show: 24, noShow: 8 },
      { date: 'Closer C', show: 22, noShow: 9 },
      { date: 'Closer D', show: 18, noShow: 8 },
    ],
    series: [
      { key: 'show', label: 'Show', color: '#00ff88' },
      { key: 'noShow', label: 'No Show', color: '#ff3366' },
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// CALL OUTCOMES PAGE — per-closer charts (7 sections)
// ─────────────────────────────────────────────────────────────

export const DUMMY_CALL_OUTCOMES = {
  // Section 1: Health — outcome by closer
  outcomeByCloser: {
    data: [
      { label: 'Closer A', closed: 68, deposit: 15, followUp: 140, lost: 165, disqualified: 18, notPitched: 12 },
      { label: 'Closer B', closed: 55, deposit: 12, followUp: 120, lost: 150, disqualified: 14, notPitched: 10 },
      { label: 'Closer C', closed: 48, deposit: 10, followUp: 105, lost: 130, disqualified: 11, notPitched: 8 },
      { label: 'Closer D', closed: 38, deposit: 8, followUp: 90, lost: 110, disqualified: 9, notPitched: 7 },
    ],
    series: [
      { key: 'closed', label: 'Closed', color: '#6BCF7F' },
      { key: 'deposit', label: 'Deposit', color: '#FFD93D' },
      { key: 'followUp', label: 'Follow Up', color: '#B84DFF' },
      { key: 'lost', label: 'Lost', color: '#FF4D6D' },
      { key: 'disqualified', label: 'Disqualified', color: '#64748b' },
      { key: 'notPitched', label: 'Not Pitched', color: '#4D7CFF' },
    ],
  },
  // Section 1: Health — deals closed by product per closer
  closesByProduct: {
    data: [
      { label: 'Closer A', productA: 14, productB: 10, productC: 6, productD: 3 },
      { label: 'Closer B', productA: 12, productB: 8, productC: 5, productD: 2 },
      { label: 'Closer C', productA: 10, productB: 6, productC: 4, productD: 2 },
      { label: 'Closer D', productA: 8, productB: 5, productC: 3, productD: 1 },
    ],
    series: [
      { key: 'productA', label: 'Product A', color: '#6BCF7F' },
      { key: 'productB', label: 'Product B', color: '#4DD4E8' },
      { key: 'productC', label: 'Product C', color: '#FFD93D' },
      { key: 'productD', label: 'Product D', color: '#B84DFF' },
    ],
  },
  // Section 2: Closed - Won
  closesByCloser: {
    data: [
      { label: 'Closer A', firstCall: 58, followUp: 14 },
      { label: 'Closer B', firstCall: 52, followUp: 11 },
      { label: 'Closer C', firstCall: 44, followUp: 8 },
      { label: 'Closer D', firstCall: 36, followUp: 6 },
    ],
    series: [
      { key: 'firstCall', label: 'First Call', color: '#6BCF7F' },
      { key: 'followUp', label: 'Follow-Up', color: '#4DD4E8' },
    ],
  },
  // Section 3: Deposits
  depositCloseByCloser: {
    data: [
      { label: 'Closer A', depositCloseRate: 0.28 },
      { label: 'Closer B', depositCloseRate: 0.22 },
      { label: 'Closer C', depositCloseRate: 0.18 },
      { label: 'Closer D', depositCloseRate: 0.14 },
    ],
    series: [{ key: 'depositCloseRate', label: 'Deposit Close %', color: '#FFD93D' }],
  },
  // Section 4: Follow Up
  followUpOutcomeByCloser: {
    data: [
      { label: 'Closer A', closed: 14, stillOpen: 18, lost: 38, noShow: 20 },
      { label: 'Closer B', closed: 11, stillOpen: 14, lost: 32, noShow: 16 },
      { label: 'Closer C', closed: 8, stillOpen: 12, lost: 28, noShow: 14 },
      { label: 'Closer D', closed: 6, stillOpen: 10, lost: 22, noShow: 12 },
    ],
    series: [
      { key: 'closed', label: 'Closed', color: '#6BCF7F' },
      { key: 'stillOpen', label: 'Still Open', color: '#B84DFF' },
      { key: 'lost', label: 'Lost', color: '#FF4D6D' },
      { key: 'noShow', label: 'No Show', color: '#4DD4E8' },
    ],
  },
  // Section 5: Lost — rate by closer
  lostRateByCloser: {
    data: [
      { label: 'Closer A', firstCallLostRate: 0.38, followUpLostRate: 0.52 },
      { label: 'Closer B', firstCallLostRate: 0.42, followUpLostRate: 0.58 },
      { label: 'Closer C', firstCallLostRate: 0.48, followUpLostRate: 0.62 },
      { label: 'Closer D', firstCallLostRate: 0.54, followUpLostRate: 0.68 },
    ],
    series: [
      { key: 'firstCallLostRate', label: 'First Call Lost %', color: '#FF4D6D' },
      { key: 'followUpLostRate', label: 'Follow-Up Lost %', color: '#FFD93D' },
    ],
  },
  // Section 5: Lost — reasons by closer
  lostReasonsByCloser: {
    data: [
      { label: 'Closer A', cantAfford: 42, closerError: 38, notInterested: 8, other: 5 },
      { label: 'Closer B', cantAfford: 52, closerError: 44, notInterested: 10, other: 6 },
      { label: 'Closer C', cantAfford: 60, closerError: 50, notInterested: 12, other: 7 },
      { label: 'Closer D', cantAfford: 68, closerError: 56, notInterested: 14, other: 8 },
    ],
    series: [
      { key: 'cantAfford', label: "Can't Afford", color: '#FFD93D' },
      { key: 'closerError', label: 'Closer Error', color: '#FF4D6D' },
      { key: 'notInterested', label: 'Not Interested', color: '#4DD4E8' },
      { key: 'other', label: 'Other', color: '#B84DFF' },
    ],
  },
  // Section 6: Disqualified
  dqByCloser: {
    data: [
      { label: 'Closer A', dqRate: 0.06 },
      { label: 'Closer B', dqRate: 0.05 },
      { label: 'Closer C', dqRate: 0.04 },
      { label: 'Closer D', dqRate: 0.03 },
    ],
    series: [{ key: 'dqRate', label: 'DQ Rate', color: '#64748b' }],
  },
  // Section 7: Not Pitched
  notPitchedByCloser: {
    data: [
      { label: 'Closer A', notPitchedRate: 0.05 },
      { label: 'Closer B', notPitchedRate: 0.04 },
      { label: 'Closer C', notPitchedRate: 0.03 },
      { label: 'Closer D', notPitchedRate: 0.02 },
    ],
    series: [{ key: 'notPitchedRate', label: 'Not Pitched Rate', color: '#4D7CFF' }],
  },
};

// ─────────────────────────────────────────────────────────────
// SALES CYCLE PAGE — per-closer chart
// ─────────────────────────────────────────────────────────────

export const DUMMY_SALES_CYCLE = {
  callsToCloseByCloser: {
    data: [
      { date: 'Closer A', oneCall: 4, twoCalls: 3, threePlus: 1 },
      { date: 'Closer B', oneCall: 2, twoCalls: 3, threePlus: 2 },
      { date: 'Closer C', oneCall: 2, twoCalls: 1, threePlus: 2 },
      { date: 'Closer D', oneCall: 1, twoCalls: 1, threePlus: 1 },
    ],
    series: [
      { key: 'oneCall',   label: '1 Call',  color: '#6BCF7F' },
      { key: 'twoCalls',  label: '2 Calls', color: '#4DD4E8' },
      { key: 'threePlus', label: '3+',      color: '#FFD93D' },
    ],
  },
  daysToCloseByCloser: {
    data: [
      { date: 'Closer A', sameDay: 2, oneToThree: 3, fourToSeven: 2, eightPlus: 1 },
      { date: 'Closer B', sameDay: 1, oneToThree: 1, fourToSeven: 2, eightPlus: 3 },
      { date: 'Closer C', sameDay: 1, oneToThree: 0, fourToSeven: 1, eightPlus: 3 },
      { date: 'Closer D', sameDay: 1, oneToThree: 0, fourToSeven: 0, eightPlus: 2 },
    ],
    series: [
      { key: 'sameDay',     label: 'Same Day', color: '#6BCF7F' },
      { key: 'oneToThree',  label: '1-3',      color: '#4DD4E8' },
      { key: 'fourToSeven', label: '4-7',      color: '#FFD93D' },
      { key: 'eightPlus',   label: '8+',       color: '#FF4D6D' },
    ],
  },
};

// ─────────────────────────────────────────────────────────────
// OBJECTIONS PAGE — full page dummy data
// ─────────────────────────────────────────────────────────────

export const DUMMY_OBJECTIONS = {
  sections: {
    summary: {
      callsHeld: { label: 'Calls Held', value: 104, format: 'number' },
      objectionsFaced: { label: 'Objections Faced', value: 67, format: 'number' },
      pctCallsWithObj: { label: '% Calls w/ Objections', value: 0.42, format: 'percent' },
      avgObjPerCall: { label: 'Avg Obj / Call', value: 1.5, format: 'decimal' },
      resolvedCount: { label: 'Resolved', value: 48, format: 'number' },
      resolutionRate: { label: 'Resolution Rate', value: 0.72, format: 'percent' },
      objectionlessCloses: { label: 'Objectionless Closes', value: 8, format: 'number' },
      closedWithObj: { label: 'Closed w/ Objections', value: 15, format: 'number' },
      lostToObj: { label: 'Lost to Objections', value: 12, format: 'number' },
    },
  },
  charts: {
    objectionsByType: {
      data: [
        { date: 'Financial', resolved: 14, unresolved: 6 },
        { date: 'Think About It', resolved: 12, unresolved: 5 },
        { date: 'Spouse/Partner', resolved: 10, unresolved: 4 },
        { date: 'Timing', resolved: 8, unresolved: 3 },
        { date: 'Other', resolved: 4, unresolved: 1 },
      ],
      series: [
        { key: 'resolved', label: 'Resolved', color: '#00ff88' },
        { key: 'unresolved', label: 'Unresolved', color: '#ff3366' },
      ],
    },
    objectionTrends: {
      data: [
        { date: '2026-01-06', financial: 5, thinkAboutIt: 4, spouse: 3 },
        { date: '2026-01-13', financial: 4, thinkAboutIt: 5, spouse: 2 },
        { date: '2026-01-20', financial: 6, thinkAboutIt: 3, spouse: 4 },
        { date: '2026-01-27', financial: 3, thinkAboutIt: 4, spouse: 3 },
      ],
      series: [
        { key: 'financial', label: 'Financial', color: '#00f0ff' },
        { key: 'thinkAboutIt', label: 'Think About It', color: '#ff00e5' },
        { key: 'spouse', label: 'Spouse/Partner', color: '#ffb800' },
      ],
    },
    unresolvedByType: {
      data: [
        { label: 'Financial', value: 6 },
        { label: 'Think About It', value: 5 },
        { label: 'Spouse/Partner', value: 4 },
        { label: 'Timing', value: 3 },
        { label: 'Other', value: 1 },
      ],
    },
    resolutionByCloser: {
      data: [
        { date: 'Closer A', rate: 0.82 },
        { date: 'Closer B', rate: 0.74 },
        { date: 'Closer C', rate: 0.68 },
        { date: 'Closer D', rate: 0.61 },
      ],
      series: [{ key: 'rate', label: 'Resolution Rate', color: '#00ff88' }],
    },
  },
  tables: {
    byType: {
      rows: [
        { type: 'Financial', total: 20, resolved: 14, rate: 0.70 },
        { type: 'Think About It', total: 17, resolved: 12, rate: 0.71 },
        { type: 'Spouse/Partner', total: 14, resolved: 10, rate: 0.71 },
        { type: 'Timing', total: 11, resolved: 8, rate: 0.73 },
        { type: 'Other', total: 5, resolved: 4, rate: 0.80 },
      ],
    },
  },
};

// ─────────────────────────────────────────────────────────────
// PROJECTIONS PAGE — full page dummy data
// ─────────────────────────────────────────────────────────────

export const DUMMY_PROJECTIONS = {
  projectionBaseline: {
    showRate: 0.73,
    closeRate: 0.22,
    avgDealSize: 5000,
    avgCashCollected: 3000,
    prospectsBookedPerMonth: 48,
    avgCallsToClose: 2.3,
    callsScheduled: 142,
    currentCallsHeld: 104,
    currentCloses: 23,
    currentRevenue: 115000,
    currentCash: 69000,
    daysInPeriod: 90,
    daysInCurrentMonth: 28,
    dayOfMonth: 17,
    daysInYear: 365,
    dayOfYear: 48,
    mtdCallsScheduled: 38,
    mtdCallsHeld: 28,
    mtdCloses: 6,
    mtdRevenue: 30000,
    mtdCash: 18000,
    ytdCallsScheduled: 280,
    ytdCallsHeld: 204,
    ytdCloses: 45,
    ytdRevenue: 225000,
    ytdCash: 135000,
    dateRange: 'Nov 19, 2025 - Feb 17, 2026',
    monthlyGoal: 50000,
    quarterlyGoal: 150000,
    yearlyGoal: 600000,
    wtdRevenue: 8500,
    qtdRevenue: 95000,
    dayOfQuarter: 48,
    daysInQuarter: 90,
  },
};

// ─────────────────────────────────────────────────────────────
// VIOLATIONS PAGE — full page dummy data
// ─────────────────────────────────────────────────────────────

export const DUMMY_VIOLATIONS = {
  sections: {
    overview: {
      flagCount: { label: 'Risk Flags', value: 14, format: 'number' },
      uniqueCalls: { label: 'Unique Calls w/ Risk', value: 9, format: 'number' },
      pctCalls: { label: '% Calls w/ Flags', value: 0.087, format: 'percent' },
      trend: { label: 'Risk Trend', value: 'Stable', format: 'text' },
      ftcSecCount: { label: 'FTC / SEC Warnings', value: 7, format: 'number' },
    },
    riskCategories: {
      claims: { label: 'Claims', value: 5, format: 'number' },
      guarantees: { label: 'Guarantees', value: 3, format: 'number' },
      earnings: { label: 'Earnings / Income', value: 4, format: 'number' },
      pressure: { label: 'Pressure / Urgency', value: 2, format: 'number' },
    },
    riskByCallType: {
      firstCall: { label: 'First Call Infractions', value: 0.06, format: 'percent' },
      followUp: { label: 'Follow-Up Infractions', value: 0.11, format: 'percent' },
    },
  },
  charts: {
    complianceOverTime: {
      data: [
        { date: '2026-01-06', flags: 4 },
        { date: '2026-01-13', flags: 3 },
        { date: '2026-01-20', flags: 5 },
        { date: '2026-01-27', flags: 2 },
      ],
      series: [{ key: 'flags', label: 'Compliance Flags', color: '#ff3366' }],
    },
    flagsByCloser: {
      data: [
        { date: 'Closer A', flags: 2 },
        { date: 'Closer B', flags: 5 },
        { date: 'Closer C', flags: 4 },
        { date: 'Closer D', flags: 3 },
      ],
      series: [{ key: 'flags', label: 'Risk Flags', color: '#ffb800' }],
    },
    riskTrends: {
      data: [
        { date: '2026-01-06', claims: 2, guarantees: 1, earnings: 1 },
        { date: '2026-01-13', claims: 1, guarantees: 1, earnings: 1 },
        { date: '2026-01-20', claims: 2, guarantees: 0, earnings: 2 },
        { date: '2026-01-27', claims: 0, guarantees: 1, earnings: 1 },
      ],
      series: [
        { key: 'claims', label: 'Claims', color: '#ff3366' },
        { key: 'guarantees', label: 'Guarantees', color: '#ff00e5' },
        { key: 'earnings', label: 'Earnings', color: '#ffb800' },
      ],
    },
  },
  tables: {
    riskReview: {
      rows: [
        { date: '2026-01-22', closer: 'Closer B', callType: 'First Call', category: 'Claims', timestamp: '12:34', phrase: 'You will definitely see results...', reason: 'Unsubstantiated claim', recordingUrl: '#', transcriptUrl: '#' },
        { date: '2026-01-20', closer: 'Closer C', callType: 'Follow-Up', category: 'Guarantees', timestamp: '08:15', phrase: 'I guarantee this will work...', reason: 'Prohibited guarantee language', recordingUrl: '#', transcriptUrl: '#' },
        { date: '2026-01-18', closer: 'Closer B', callType: 'First Call', category: 'Earnings', timestamp: '22:10', phrase: 'Most people make back their investment...', reason: 'Income claim without disclaimer', recordingUrl: '#', transcriptUrl: '#' },
      ],
    },
  },
};

// ─────────────────────────────────────────────────────────────
// ADHERENCE PAGE — full page dummy data
// ─────────────────────────────────────────────────────────────

export const DUMMY_ADHERENCE = {
  sections: {
    overall: {
      adherenceScore: { label: 'Script Adherence Score', value: 7.4, format: 'score' },
      objHandlingScore: { label: 'Objection Handling Quality', value: 6.8, format: 'score' },
    },
    bySection: {
      intro: { label: 'Intro & Rapport', value: 8.1, format: 'score' },
      pain: { label: 'Current Situation / Pain', value: 7.2, format: 'score' },
      discovery: { label: 'Discovery', value: 6.9, format: 'score' },
      goal: { label: 'Desired Situation / Goal', value: 7.5, format: 'score' },
      transition: { label: 'Transition', value: 7.8, format: 'score' },
      pitch: { label: 'Pitch', value: 7.0, format: 'score' },
      close: { label: 'Close', value: 6.5, format: 'score' },
      objections: { label: 'Objections', value: 6.8, format: 'score' },
    },
  },
  charts: {
    radarData: {
      axes: ['Intro', 'Pain', 'Discovery', 'Goal', 'Transition', 'Pitch', 'Close', 'Objections'],
      data: [
        { label: 'Team Average', values: [8.1, 7.2, 6.9, 7.5, 7.8, 7.0, 6.5, 6.8], color: '#4DD4E8' },
        { label: 'Top Performer', values: [9.2, 8.5, 8.1, 8.8, 9.0, 8.3, 7.9, 8.0], color: '#00ff88' },
      ],
    },
    adherenceByCloser: {
      data: [
        { date: 'Closer A', score: 8.2 },
        { date: 'Closer B', score: 7.5 },
        { date: 'Closer C', score: 7.1 },
        { date: 'Closer D', score: 6.4 },
      ],
      series: [{ key: 'score', label: 'Adherence Score', color: '#00f0ff' }],
    },
    objHandlingByCloser: {
      data: [
        { date: 'Closer A', score: 7.8 },
        { date: 'Closer B', score: 6.9 },
        { date: 'Closer C', score: 6.5 },
        { date: 'Closer D', score: 5.9 },
      ],
      series: [{ key: 'score', label: 'Obj Handling Score', color: '#ffb800' }],
    },
    adherenceOverTime: {
      data: [
        { date: '2026-01-06', score: 7.1 },
        { date: '2026-01-13', score: 7.3 },
        { date: '2026-01-20', score: 7.4 },
        { date: '2026-01-27', score: 7.6 },
      ],
      series: [{ key: 'score', label: 'Adherence Score', color: '#00ff88' }],
    },
  },
};

# CloserMetrix — Complete Platform Review

> This document catalogs every page, scorecard, chart, and table in the CloserMetrix dashboard, including the formula used to compute each metric.

---

## Architecture Overview

- **Monorepo**: Frontend (Express + Vite React) and Backend (Express + BigQuery)
- **Data Source**: Google BigQuery — primary view: `v_calls_joined_flat_prefixed`
- **Computation**: Server-side queries aggregate data, client-side `computePageData.js` handles filtering, deltas, and chart bucketing
- **Tier System**: Basic (overview only), Insight (+ financial, attendance, outcomes, sales cycle, objections, projections), Executive (+ violations, adherence)
- **Design System**: Tron dark theme with neon accent colors (cyan, green, red, amber, purple, blue, teal). Magenta exists as emergency backup only (8+ segment charts).

---

## Shared Formulas & Definitions

These formulas are referenced throughout all pages:

| Formula Name | Definition |
|---|---|
| Safe Divide `sd(a, b)` | Returns `a / b`, or 0 if `b` is 0 |
| Show Rate | `calls held / calls scheduled` |
| Close Rate (held-to-close) | `closed deals / calls held` |
| Scheduled-to-Close Rate | `closed deals / calls scheduled` |
| Lost Rate | `lost calls / calls held` |
| Resolution Rate | `resolved objections / total objections` |
| % Collected | `cash collected / revenue generated` |
| Delta (period-over-period) | `((current - previous) / abs(previous)) * 100` |

### Call Classification Rules

| Classification | Rule |
|---|---|
| isShow | `attendance === 'Show'` |
| isFirstCall | `callType in ['First Call', 'Rescheduled - First Call']` |
| isFollowUp | `callType in ['Follow Up', 'Rescheduled - Follow Up']` (and any other non-first-call type) |
| isClosed | `callOutcome === 'Closed - Won'` |
| isDeposit | `callOutcome === 'Deposit'` |
| isLost | `callOutcome === 'Lost'` |
| isDQ | `callOutcome in ['DQ', 'Disqualified']` |
| isNotPitched | `callOutcome === 'Not Pitched'` |
| isFollowUpOutcome | `callOutcome in ['Follow Up', 'Follow-Up']` |
| isGhost | `attendance contains 'Ghost' or 'No Show'` |
| isCanceled | `attendance contains 'Cancel'` |
| isRescheduled | `attendance contains 'Rescheduled'` |
| hasRevenue | `callOutcome in ['Closed - Won', 'Deposit']` |

---

## Page 1: Overview (All Tiers)

**Route**: `/d/:token/overview`
**Purpose**: At-a-glance summary of sales performance across 5 sections

### Scorecards

#### Section 1 — Revenue & Deals

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Revenue Generated | currency | `SUM(revenueGenerated) where isShow AND hasRevenue` | blue |
| Cash Collected | currency | `SUM(cashCollected) where isShow AND hasRevenue` | teal |
| Cash / Call Held | currency | `totalCash / held.length` | purple |
| Avg Deal Size | currency | `totalRevenue / revenueDeals.length` (revenue deals = Closed + Deposit) | purple |

#### Section 2 — Deals Closed

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Closed Deals | number | `COUNT(isShow AND isClosed)` | green |
| Potential Violations | number | `COUNT(complianceFlags)` — falls back to keyMoments parsing for older calls | red |
| 1 Call Close % | percent | `oneCallCloses / totalClosedDeals` (from closeCycles) | blue |
| Calls Required per Deal | decimal | `held.length / closedDeals.length` | white |

#### Section 3 — Prospects & Show Rate

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Unique Prospects Booked | number | `COUNT(DISTINCT prospectEmail where isFirstCall)` — falls back to `COUNT(isFirstCall)` if no emails | cyan |
| Unique Prospects Held | number | `COUNT(DISTINCT prospectEmail where isFirstCall AND isShow)` — falls back to `COUNT` | cyan |
| Show Rate | percent | `held.length / calls.length` | amber |

#### Section 4 — Close Rates & Calls Lost

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Show → Close Rate | percent | `closedDeals.length / held.length` | purple |
| Scheduled → Close Rate | percent | `closedDeals.length / calls.length` | purple |
| Calls Lost | number | `COUNT(isShow AND isLost)` | red |
| Lost % | percent | `lost.length / held.length` | red |

#### Section 5 — Funnel & Outcomes

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Avg Call Duration | duration | `SUM(held.durationMinutes) / held.length` | amber |
| Active Follow Up | number | `COUNT(isShow AND isFollowUpOutcome)` | purple |
| Disqualified | number | `COUNT(isShow AND isDQ)` | red |

*All 18 scorecards include period-over-period delta comparison.*

### Charts

| Chart Title | Type | Series / Data | Formula per Data Point |
|---|---|---|---|
| Revenue Generated & Cash Collected | Line (dual, area) | `revenue` (green), `cash` (teal) | Per time bucket: `SUM(revenueGenerated where hasRevenue)`, `SUM(cashCollected where hasRevenue)` |
| Deals Closed Over Time | Bar (vertical) | `closes` (green) | Per time bucket: `COUNT(isClosed AND isShow)` |
| Show Rate Over Time | Line (area) | `showRate` (green) | Per time bucket: `held / total` |
| Close Rate Over Time | Line (area) | `closeRate` (cyan) | Per time bucket: `closed / held` |
| All Calls (Funnel) | Funnel | 4 stages | Booked → Held (isShow) → Qualified (held - DQ) → Closed (isClosed) |
| Call Outcomes | Pie (donut) | 6 segments | Closed (green), Deposit (amber), Follow-Up (purple), Lost (red), DQ (muted), Not Pitched (blue) — each is `COUNT(matching outcome)` |

---

## Page 2: Financial (Insight+ Only)

**Route**: `/d/:token/financial`
**Purpose**: Revenue, cash collection, deal economics, per-closer financial performance

### Scorecards

#### Row 1 — Total Revenue & Cash

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Revenue Generated | currency | `SUM(revenueGenerated) where isShow AND hasRevenue` | green |
| Cash Collected | currency | `SUM(cashCollected) where isShow AND hasRevenue` | teal |

#### Row 2 — Per-Call Metrics

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Revenue / Call Held | currency | `totalRevenue / held.length` | purple |
| Cash / Call Held | currency | `totalCash / held.length` | blue |

#### Row 3 — Deal Economics

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Avg Revenue Per Deal | currency | `closedRevenue / closedDeals.length` | green |
| % Collected | percent | `totalCash / totalRevenue` | purple |
| # of Refunds | number | Shown as `'-'` (not yet computed) | red |
| Avg Cash Per Deal | currency | `closedCash / closedDeals.length` | teal |
| % PIFs | percent | `COUNT(paymentPlan matches 'paid in full', 'pay in full', 'pif', or 'full') / revenueDeals.length` | amber |
| $ of Refunds | currency | Shown as `'-'` (not yet computed) | red |

*All scorecards include deltas.*

### Charts

| Chart Title | Type | Series / Data | Formula per Data Point |
|---|---|---|---|
| Total Cash & Revenue Over Time | Line (dual, area) | `revenue` (green), `cash` (teal) | Per time bucket: `SUM(revenueGenerated)`, `SUM(cashCollected)` |
| Total Cash & Revenue per Closer | Bar (horizontal, stacked) | `cash`, `uncollected` | Per closer: `SUM(cashCollected)`, `SUM(revenue) - SUM(cash)` |
| Avg Cash & Revenue per Closer | Bar (horizontal, stacked) | `avgCash`, `avgUncollected` | Per closer: `closedCash / closedCount`, `(closedRev - closedCash) / closedCount` |
| Cash & Revenue per Call Over Time | Line (dual, area) | `revPerCall` (purple), `cashPerCall` (blue) | Per time bucket: `revenue / held`, `cash / held` |
| % of Revenue by Closer | Pie (donut) | Per closer | `SUM(revenueGenerated)` per closer |
| Payment Plan Breakdown | Pie (donut) | PIF (green), Deposit (cyan), Payment Plan (purple), Financed (blue), Unknown (amber) | `COUNT` per payment plan type. Matches real BQ values: `Full`→PIF, `Deposit`→Deposit, `Payment Plan`/`Installments`→Payment Plan, `Financed`→Financed |

---

## Page 3: Attendance (Insight+ Only)

**Route**: `/d/:token/attendance`
**Purpose**: Show rates, attendance breakdown, volume metrics, lost revenue from no-shows

### Scorecards

#### 4-Column Layout (each column has 3 scorecards)

| Column | Scheduled | Held | Show Rate |
|---|---|---|---|
| Unique Prospects | `COUNT(DISTINCT prospectEmail where isFirstCall)` | `COUNT(DISTINCT prospectEmail where isFirstCall AND isShow)` | `uniqueHeld / uniqueScheduled` |
| Total Calls | `COUNT(all calls)` | `COUNT(isShow)` | `held / all` |
| First Calls | `COUNT(isFirstCall)` | `COUNT(isFirstCall AND isShow)` | `firstHeld / firstScheduled` |
| Follow-Up Calls | `COUNT(isFollowUp)` | `COUNT(isFollowUp AND isShow)` | `followUpHeld / followUpScheduled` |

#### Standalone Metrics

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Active Follow Up | number | `COUNT(isShow AND isFollowUpOutcome)` | purple |
| Not Yet Held | number | `COUNT(appointmentDate >= today AND NOT show AND NOT ghost AND NOT canceled AND NOT rescheduled)` — future dates only | blue |

#### Calls Not Taken Section (8 scorecards)

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Not Taken | number | `COUNT(isNoShow)` | white |
| # Ghosted | number | `COUNT(isGhost)` | amber |
| # Canceled | number | `COUNT(isCanceled)` | red |
| # Rescheduled | number | `COUNT(isRescheduled)` | orange |
| % Not Taken | percent | `noShows / all` | white |
| % Ghosted | percent | `ghosted / noShows` | amber |
| % Canceled | percent | `canceled / noShows` | red |
| % Rescheduled | percent | `rescheduled / noShows` | orange |

#### Lost Revenue Section (4 scorecards)

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Not Taken | number | `COUNT(isNoShow)` | red |
| Show → Close Rate | percent | `closedDeals / held` | red |
| Average Deal Size | currency | `SUM(revenue) / COUNT(isClosed)` | red |
| Lost Potential Revenue | currency | `noShowCount * showCloseRate * avgDealSize` | red |

*All scorecards include deltas.*

### Charts

| Chart Title | Type | Series / Data | Formula per Data Point |
|---|---|---|---|
| Scheduled vs Held | Line (dual) | `scheduled`, `held` | Per bucket: `bucket.length`, `COUNT(isShow in bucket)` |
| First Call / Follow Up Show Rate | Line (dual) | `firstCallShowRate`, `followUpShowRate` | Per bucket: `firstHeld / firstScheduled`, `followUpHeld / followUpScheduled` |
| Attendance Breakdown | Pie (donut) | Show, Ghosted - No Show, Canceled, Rescheduled | `COUNT` per attendance category (filtered to >0) |
| First / Follow Ups Held | Bar (vertical, stacked) | `firstHeld`, `followUpHeld` | Per bucket: `COUNT(isFirstCall AND isShow)`, `COUNT(isFollowUp AND isShow)` |
| Show Rate per Closer | Bar (horizontal) | `showRate` per closer | Per closer: `COUNT(isShow) / COUNT(all)` — sorted highest first |
| Attendance per Closer | Bar (vertical, stacked) | Show, Ghost, Reschedule, Cancel | Per closer: `COUNT` per attendance type |
| Not Taken Breakdown | Bar (vertical, stacked) | Ghosted, Canceled, Rescheduled | Per bucket: `COUNT` per not-taken reason |
| Not Taken Reason | Pie (donut) | Ghosted, Canceled, Rescheduled | `COUNT` per not-taken reason |

---

## Page 4: Call Outcomes (Insight+ Only)

**Route**: `/d/:token/call-outcomes`
**Purpose**: Comprehensive call funnel analysis — closes, deposits, follow-ups, lost, DQ, not pitched

### Scorecards

#### Hero Scorecard

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Total Calls Held | number | `COUNT(isShow)` | teal |

#### Health at a Glance (6 columns x 3 rows = 18 scorecards)

For each outcome type (Closed, Deposits, Follow-Up, Lost, DQ, Not Pitched):

| Row | Formula |
|---|---|
| Total | `COUNT(matching outcome AND isShow)` |
| % of Total | `outcomeCount / held.length` |
| Close Rate | `closed from this category / total in category` |

Colors: Closed=green, Deposits=amber, Follow-Up=purple, Lost=red, DQ=muted, Not Pitched=blue

#### Closed - Won Section (4 scorecards)

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| First Call Closes | number | `COUNT(isFirstCall AND isClosed AND isShow)` | green |
| First Call Close Rate | percent | `firstCallClosed / firstCallHeld` | green |
| Follow-Up Closes | number | `COUNT(isFollowUp AND isClosed AND isShow)` | purple |
| Follow-Up Close Rate | percent | `followUpClosed / followUpHeld` | purple |

#### Deposits Section (4 scorecards)

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Deposits Taken | number | `COUNT(isDeposit AND isShow)` | amber |
| Deposit → Closed % | percent | `depositsConverted / depositsTaken` | amber |
| Deposits Lost | number | `COUNT(deposits that became lost)` | amber |
| Deposits Still Open | number | `COUNT(deposits still in follow-up)` | amber |

#### Follow-Up Section (4 scorecards)

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Follow-Ups Scheduled | number | `COUNT(isFollowUp)` | purple |
| Follow-Ups Held | number | `COUNT(isFollowUp AND isShow)` | purple |
| Follow-Up Show Rate | percent | `followUpHeld / followUpScheduled` | purple |
| Still in Follow-Up | number | `COUNT(isShow AND isFollowUpOutcome)` | purple |

#### Lost Section (4 scorecards)

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| First Call Lost | number | `COUNT(isFirstCall AND isLost AND isShow)` | red |
| First Call Lost Rate | percent | `firstCallLost / firstCallHeld` | red |
| Follow-Up Lost | number | `COUNT(isFollowUp AND isLost AND isShow)` | red |
| Follow-Up Lost Rate | percent | `followUpLost / followUpHeld` | red |

#### Disqualified Section (2 scorecards)

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| First Call DQ | number | `COUNT(isFirstCall AND isDQ AND isShow)` | muted |
| DQ Rate | percent | `firstCallDQ / firstCallHeld` | muted |

#### Not Pitched Section (2 scorecards)

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Not Pitched | number | `COUNT(isNotPitched AND isShow)` | blue |
| Not Pitched Rate | percent | `notPitched / held` | blue |

*All scorecards include deltas. Lost/DQ/Not Pitched use `desiredDirection: 'down'` (lower is better).*

### Charts

| Chart Title | Type | Series / Data | Formula per Data Point |
|---|---|---|---|
| Call Outcomes Distribution | Pie (donut) | 6 segments | `COUNT` per outcome type (Closed, Deposit, Follow-Up, Lost, DQ, Not Pitched) |
| Call Outcome by Closer | Bar (horizontal, stacked) | 6 outcomes per closer | Per closer: `COUNT` per outcome — sorted by total DESC |
| Outcomes Over Time | Line (stacked area) | 6 outcome lines | Per bucket: `COUNT` per outcome type |
| Deals Closed by Product | Bar (horizontal, stacked) | Dynamic product names | Per closer: `COUNT(isClosed AND matching product)` per product |
| Closes Over Time | Bar (vertical, stacked) | `firstCall`, `followUp` | Per bucket: `COUNT(isFirstCall AND isClosed)`, `COUNT(isFollowUp AND isClosed)` |
| Close Rate Over Time | Line (dual) | `totalCloseRate`, `firstCloseRate` | Per bucket: `closed / held`, `firstClosed / firstHeld` |
| Closes by Closer | Bar (horizontal, stacked) | `firstCall`, `followUp` | Per closer: `COUNT` first/follow-up closes — sorted by total DESC |
| Deposit Outcomes | Pie (donut) | Per closer deposit counts | `COUNT(isDeposit)` per closer (>0 only) |
| Deposit Close Rate by Closer | Bar (horizontal) | `depositRate` | Per closer: `depositsConverted / depositsTaken` |
| Follow-Up Volume Over Time | Line (stacked area) | `scheduled`, `held` | Per bucket: `COUNT(isFollowUp)`, `COUNT(isFollowUp AND isShow)` |
| Follow-Up Outcomes | Pie (donut) | Closed, Still Open, Lost | From follow-up calls: `COUNT` per final outcome |
| Follow-Up Outcome by Closer | Bar (horizontal, stacked) | `closed`, `followUp`, `lost` | Per closer: `COUNT` per follow-up outcome |
| Lost Calls Over Time | Line (stacked area) | `firstCall`, `followUp` | Per bucket: `COUNT(isFirstCall AND isLost)`, `COUNT(isFollowUp AND isLost)` |
| Lost Reasons | Pie (donut) | Dynamic reasons | Aggregated by `lostReason` field |
| Lost Rate by Closer | Bar (horizontal) | `lostRate` | Per closer: `COUNT(isLost) / closerTotal` — sorted ASCENDING (best first) |
| Lost Reasons by Closer | Bar (horizontal, stacked) | Dynamic reason names | Per closer: `COUNT` per lost reason |
| DQ Over Time | Line | `dq` | Per bucket: `COUNT(isDQ)` |
| DQ Rate by Closer | Bar (horizontal) | `dqRate` | Per closer: `COUNT(isDQ) / closerTotal` |
| Not Pitched Over Time | Line | `notPitched` | Per bucket: `COUNT(isNotPitched)` |
| Not Pitched by Closer | Bar (horizontal) | `notPitchedRate` | Per closer: `COUNT(isNotPitched) / closerTotal` |

---

## Page 5: Sales Cycle (Insight+ Only)

**Route**: `/d/:token/sales-cycle`
**Purpose**: How many calls and days it takes to close deals. 1-call vs multi-call analysis.

### Scorecards

#### Calls to Close Section

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| 1-Call Closes | number | `COUNT(callsToClose === 1)` | green |
| 2-Call Closes | number | `COUNT(callsToClose === 2)` | blue |
| 3+ Call Closes | number | `COUNT(callsToClose >= 3)` | amber |
| 1-Call Close % | percent | `oneCallCloses / totalCloses` | green |
| 2-Call Close % | percent | `twoCallCloses / totalCloses` | blue |
| 3+ Call Close % | percent | `threePlusCloses / totalCloses` | amber |
| Avg Calls to Close | decimal | `AVG(callsToClose)` — non-zero values only | cyan |
| Median Calls to Close | decimal | `MEDIAN(callsToClose)` | cyan |
| Calls Scheduled per Close | decimal | `totalCallsScheduled / closedDeals` | cyan |

#### Days to Close Section

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Avg Days to Close | decimal | `AVG(daysToClose)` — non-negative values only | cyan |
| Median Days to Close | decimal | `MEDIAN(daysToClose)` | cyan |

*All scorecards include deltas. Lower avg/median is better (desiredDirection: 'down').*

### Charts

| Chart Title | Type | Series / Data | Formula per Data Point |
|---|---|---|---|
| 1-Call vs Multi-Call Closes | Pie (donut) | 1-Call (green), 2-Call (cyan), 3+ (amber) | `COUNT` per bucket |
| # of Calls to Close | Bar (vertical) | Distribution bars | Per bucket: `COUNT(callsToClose in bucket range)` |
| Calls to Close by Closer | Bar (horizontal, stacked) | `oneCall`, `twoCalls`, `threePlus` | Per closer (by name via Closers JOIN): `COUNT` per calls-to-close bucket. **Sorted by total descending** (most closes at top) |
| Days to Close Breakdown | Pie (donut) | Same Day (green), 1-3 Days (cyan), 4-7 (amber), 8-14 (purple), 15+ (red) | `COUNT` per bucket |
| # of Days to Close | Bar (vertical) | Distribution bars | Per bucket: `COUNT(daysToClose in bucket range)` |
| Days to Close by Closer | Bar (horizontal, stacked) | `sameDay`, `oneToThree`, `fourToSeven`, `eightPlus` | Per closer (by name via Closers JOIN): `COUNT` per days-to-close bucket. **Sorted by total descending** (most closes at top) |

---

## Page 6: Objections (Insight+ Only)

**Route**: `/d/:token/objections`
**Purpose**: Objection intelligence — counts, resolution rates, per-type and per-closer analysis

### Scorecards (9 total via ScorecardGrid)

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Calls Held | number | `COUNT(isShow)` | amber |
| Objections Faced | number | `COUNT(all objections)` | amber |
| % Calls w/ Objections | percent | `COUNT(DISTINCT callIds with objections) / held.length` | amber |
| Avg Obj / Flagged Call | decimal | `objections.length / callsWithObjections.size` (denominator is only calls that had objections) | amber |
| Resolved | number | `COUNT(objections where resolved === true)` | amber |
| Resolution Rate | percent | `resolved / totalObjections` | amber |
| Objectionless Closes | number | `COUNT(isClosed AND no objections on that call)` | amber |
| Closed w/ Objections | number | `COUNT(isClosed AND had objections on that call)` | amber |
| Lost to Objections | number | `COUNT(isLost AND had objections on that call)` | amber |

*All scorecards include deltas.*

### Tables

| Table | Columns | Data |
|---|---|---|
| Objection Type Breakdown | Objection Type, Total, Resolved, Unresolved, Res. Rate | Per type: `COUNT`, `COUNT(resolved)`, `total - resolved`, `resolved / total` — sorted by total DESC |
| Resolved by Closer | Closer, Total, Resolved, Unresolved, Res. Rate | Per closer: same formulas as above — sorted by res rate DESC |
| Objection Detail (drill-down) | Objection Type, Resolved (badge), Closer, Call Outcome, Date, Recording (link) | Individual objection records with 5 inline filters + pagination (10/page) + CSV export |

### Charts

| Chart Title | Type | Series / Data | Formula per Data Point |
|---|---|---|---|
| Objections by Type (Resolved vs Unresolved) | Bar (horizontal, stacked) | `resolved`, `unresolved` | Per type: `COUNT(resolved)`, `COUNT(!resolved)` — sorted by total DESC |
| Top 3 Objections Over Time | Line (multi-line) | Top 3 objection types | Per bucket: `COUNT(matching type)` for the 3 most common types |
| Unresolved Objections by Type | Pie (donut) | Per type | `COUNT(!resolved)` per type — types <5% aggregated as "Other" |
| Resolution Rate by Closer | Bar (horizontal) | `rate` per closer | Per closer: `resolved / total` — sorted highest first |

---

## Page 7: Projections (Insight+ Only)

**Route**: `/d/:token/projections`
**Purpose**: Interactive projection engine with scenario sliders for what-if analysis

### Baseline Scorecards (6 metrics computed from actual data)

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Show Rate | percent | `held.length / calls.length` | cyan |
| Close Rate | percent | `closedDeals.length / held.length` | cyan |
| Avg Deal Size | currency | `SUM(revenue where hasRevenue) / closedDeals.length` | cyan |
| Avg Cash Collected | currency | `SUM(cash where hasRevenue) / closedDeals.length` | cyan |
| Prospects / Month | number | `COUNT(isFirstCall) / (daysInPeriod / 30)` | cyan |
| Avg Calls to Close | decimal | `AVG(closeCycles.callsToClose)` — non-zero only | cyan |

### Scenario Sliders (4 interactive controls)

| Slider | Range | Default | Purpose |
|---|---|---|---|
| Show Rate | 0–100% | Baseline show rate | Adjust projected show rate |
| Close Rate | 0–100% | Baseline close rate | Adjust projected close rate |
| Avg Deal Size | $0–$50,000 | Baseline deal size | Adjust projected deal size |
| Prospects / Month | 0–500 | Baseline prospect count | Adjust projected prospect count |

### Projection Output Scorecards

| Scorecard Title | Format | Formula |
|---|---|---|
| Projected Monthly Revenue | currency | `adjustedProspects * adjustedShowRate * adjustedCloseRate * adjustedDealSize` |
| Projected Annual Revenue | currency | `projectedMonthly * 12` |
| Projected Monthly Closes | number | `adjustedProspects * adjustedShowRate * adjustedCloseRate` |
| Delta vs Baseline | percent | `(projected - baseline) / baseline * 100` |

### Goals & Pacing Section (4 scorecards per period: Weekly, Monthly, Quarterly, Yearly)

| Scorecard Title | Format | Formula |
|---|---|---|
| {Period} Goal | currency | From client's saved goal settings |
| {Period} Revenue | currency | `SUM(revenue)` for period-to-date |
| % to Goal | percent | `periodRevenue / periodGoal` |
| Pace | percent | `(periodRevenue / daysPassed) * daysInPeriod / periodGoal` |

---

## Page 8: Violations (Executive Only)

**Route**: `/d/:token/violations`
**Purpose**: SEC/FTC compliance risk intelligence — flags exact phrases from call transcripts

### Scorecards

#### Risk Overview (5 scorecards via ScorecardGrid)

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Risk Flags | number | `COUNT(all complianceFlags)` — uses structured JSON field, falls back to keyMoments for older calls | red |
| Unique Calls w/ Risk | number | `COUNT(DISTINCT callId+closerId combinations with risk flags)` | red |
| % Calls w/ Flags | percent | `uniqueCallsWithRisk / held.length` | amber |
| FTC / SEC Warnings | number | `COUNT(all risk flags)` | red |

#### Risk Categories (4 scorecards via ScorecardGrid)

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Claims | number | `COUNT(riskCategory === 'Claims')` | red |
| Guarantees | number | `COUNT(riskCategory === 'Guarantees')` | amber |
| Earnings / Income | number | `COUNT(riskCategory === 'Earnings')` | cyan |
| Pressure / Urgency | number | `COUNT(riskCategory === 'Pressure')` | purple |

#### Risk by Call Type (2 scorecards via ScorecardGrid)

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| First Call Infractions % | percent | `firstCallFlags / firstCallTotal` | red |
| Follow-Up Infractions % | percent | `followUpFlags / followUpTotal` | amber |

*All scorecards include deltas. All use desiredDirection: 'down' (fewer flags is better).*

### Tables

| Table | Columns | Data |
|---|---|---|
| Risk Review (drill-down) | Date, Closer, Call Type (badge), Risk Category (color pill), Timestamp (mm:ss), Exact Phrase (italic, quoted), Why Flagged, Recording (link), Transcript (link) | Individual risk flag records — paginated 10/page with 3 inline filters (Risk Category, Closer, Date Range) |

### Charts

| Chart Title | Type | Series / Data | Formula per Data Point |
|---|---|---|---|
| Compliance Issues Over Time | Line (area) | `flags` | Per time bucket: `COUNT(risk flags in bucket)` |
| Risk Flags by Closer | Bar (horizontal) | `flags` per closer | Per closer: `COUNT(risk flags)` — sorted highest first |
| Risk Category Trends | Line (multi-line) | Claims (red), Guarantees (amber), Earnings (cyan), Pressure (purple) | Per bucket: `COUNT(matching category)` |

---

## Page 9: Adherence (Executive Only)

**Route**: `/d/:token/adherence`
**Purpose**: Script adherence scoring (1-10) by section with radar chart comparison

### Scorecards

#### Overall Scores (2 scorecards via ScorecardGrid)

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Script Adherence Score | score | `AVG(scriptAdherenceScore)` — Show calls with `scriptAdherenceScore > 0` only | purple |
| Objection Handling Quality | score | `AVG(objectionAdherenceScore)` — Show calls with `scriptAdherenceScore > 0` only | purple |

#### Score by Script Section (7 scorecards via ScorecardGrid)

BigQuery columns: `intro_score`, `pain_score`, `goal_score`, `transition_score`, `pitch_adherence_score`, `close_adherence_score`, `objection_adherence_score`. No `discovery_score` — it was split into pain/goal.

| Scorecard Title | Format | Source Score Field (JS prop → BQ column) | Color |
|---|---|---|---|
| Intro | score | `introScore` → `intro_score` | cyan |
| Pain | score | `painScore` → `pain_score` | cyan |
| Goal | score | `goalScore` → `goal_score` | cyan |
| Transition | score | `transitionScore` → `transition_score` | cyan |
| Pitch | score | `pitchAdherenceScore` → `pitch_adherence_score` | cyan |
| Close | score | `closeAdherenceScore` → `close_adherence_score` | cyan |
| Objections | score | `objectionAdherenceScore` → `objection_adherence_score` | cyan |

*All 7 sections have distinct score fields from the AI pipeline. All include deltas.*

### Charts

| Chart Title | Type | Series / Data | Formula per Data Point |
|---|---|---|---|
| Script Adherence Comparison | Radar (custom SVG) | 2 overlay polygons (selectable closers), 7 axes | Per axis: `AVG(scoreField)` for selected closer — axes: Intro, Pain, Goal, Transition, Pitch, Close, Objections |
| Adherence by Closer | Bar (horizontal) | `score` per closer | Per closer: `AVG(scriptAdherenceScore)` — sorted highest first |
| Objection Handling by Closer | Bar (horizontal) | `score` per closer | Per closer: `AVG(objectionAdherenceScore)` — sorted highest first |
| Adherence Over Time | Line (multi-line) | Adherence trend per selected closer | Per bucket: `AVG(scriptAdherenceScore) where score > 0` |

---

## Admin Pages

### Admin Dashboard (`/admin`)

| Scorecard Title | Format | Formula | Color |
|---|---|---|---|
| Total Clients | number | `COUNT(all clients)` | cyan |
| Active Clients | number | `COUNT(status = 'Active')` | green |
| Total Closers | number | Live subquery: `COUNT(DISTINCT closers across all clients)` | purple |
| Total Calls | number | Live subquery: `COUNT(all calls across all clients)` | amber |
| Basic Tier | number | `COUNT(tier = 'basic')` | tier.basic color |
| Insight Tier | number | `COUNT(tier = 'insight')` | tier.insight color |
| Executive Tier | number | `COUNT(tier = 'executive')` | tier.executive color |

**Client Table Columns**: Client Name, Tier (badge), Closers (live count), Total Calls (live count), Status, Actions (View, Deactivate)

### Token Manager (`/admin/tokens`)

No scorecards or charts. Management interface for generating/revoking access tokens.

### API Console (`/admin/api-console`)

No scorecards or charts. CRUD interface for Backend API operations (Clients, Closers, System health).

### Client Detail (`/admin/clients/:clientId`)

Renders the same dashboard pages as the client view but in admin context with an admin toolbar showing tier badge and navigation.

### Partner Dashboard (`/partner/:token`)

Read-only list of assigned clients. No scorecards or charts of its own — clicking a client opens their dashboard.

---

## Global Filters (Available on All Client Pages)

| Filter | Component | Scope | Tier Required |
|---|---|---|---|
| Date Range | DateRangeFilter | All pages | All |
| Closer | CloserFilter | All pages | Insight+ |
| Objection Type | ObjectionTypeFilter | Objections page | Insight+ |
| Risk Category | RiskCategoryFilter | Violations page | Executive |

### Date Range Presets

- **"This" mode**: Week, Month, Quarter, Year (relative to today)
- **"Last" mode**: Week, Month, Quarter, Year, 30 Days, 60 Days, 90 Days, 180 Days
- **"Between" mode**: Custom start/end date picker

### Auto-Granularity for Time-Series Charts

| Date Range Span | Granularity |
|---|---|
| ≤31 days | Daily |
| 32–90 days | Weekly |
| >90 days | Monthly |

---

## Data Pipeline Summary

1. **Calls ingested** → BigQuery `Calls` table (with `key_moments` JSON, `compliance_flags` JSON, `payment_plan_offered` STRING, and 11 score fields for AI analysis)
2. **AI pipeline** → `Backend/src/services/ai/` — PromptBuilder → Anthropic API → ResponseParser → AIProcessor → writes `compliance_flags`, `payment_plan_offered`, and all score fields back to Calls table. Score columns: `intro_score`, `pain_score`, `goal_score`, `transition_score`, `pitch_adherence_score`, `close_adherence_score`, `objection_adherence_score`, `script_adherence_score`, `discovery_score`, `overall_call_score`, `prospect_fit_score`
3. **Views materialized** → `v_calls_joined_flat_prefixed` (joins Calls + Closers + Clients), `v_close_cycle_stats_dated` (LEFT JOIN Closers for closer names), `v_objections_joined`, `v_calls_with_objection_counts`
4. **Server queries** → `Frontend/server/db/queries/*.js` aggregate metrics via BigQuery SQL
5. **Client computation** → `Frontend/client/src/utils/computePageData.js` handles filtering, time bucketing, deltas, and chart data shaping
6. **Rendering** → Tron-themed chart components (`TronLineChart`, `TronBarChart`, `TronPieChart`, `TronRadarChart`, `TronFunnelChart`) + `Scorecard` component with glow effects

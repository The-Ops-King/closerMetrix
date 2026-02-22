/**
 * CANONICAL METRIC KEYS — Used by both API and client to ensure consistent naming.
 * Every metric in the system has a key defined here.
 */

const METRIC_KEYS = {
  // At a Glance
  PROSPECTS_BOOKED: 'prospectsBooked',
  PROSPECT_CALLS_HELD: 'prospectCallsHeld',
  SHOW_RATE: 'showRate',
  CLOSED: 'closed',
  CLOSE_RATE: 'closeRate',
  REVENUE_CLOSED: 'revenueClosed',
  CASH_COLLECTED: 'cashCollected',
  CASH_PER_CALL_HELD: 'cashPerCallHeld',
  AVG_DEAL_SIZE: 'avgDealSize',
  SEC_VIOLATIONS: 'secViolations',

  // Volume / Activity
  TOTAL_CALLS_BOOKED: 'totalCallsBooked',
  TOTAL_CALLS_HELD: 'totalCallsHeld',
  FIRST_CALLS_SCHEDULED: 'firstCallsScheduled',
  FIRST_CALLS_HELD: 'firstCallsHeld',
  FOLLOWUPS_SCHEDULED: 'followUpsScheduled',
  FOLLOWUPS_HELD: 'followUpCallsHeld',
  ACTIVE_FOLLOWUPS_PENDING: 'activeFollowUpsPending',

  // Attendance
  SHOW_RATE_FIRST: 'showRateFirst',
  SHOW_RATE_FOLLOWUP: 'showRateFollowUp',
  NO_SHOWS: 'noShows',
  NO_SHOW_PCT: 'noShowPct',
  GHOSTED: 'ghosted',
  GHOSTED_PCT_BOOKED: 'ghostedPctBooked',
  GHOSTED_PCT_NOSHOWS: 'ghostedPctNoShows',
  RESCHEDULED: 'rescheduled',
  RESCHEDULED_PCT: 'rescheduledPct',
  CANCELED: 'canceled',
  CANCELED_PCT: 'canceledPct',

  // Outcomes
  CLOSE_RATE_FIRST: 'closeRateFirst',
  CLOSE_RATE_FOLLOWUP: 'closeRateFollowUp',
  BOOK_TO_CLOSE_RATE: 'bookToCloseRate',
  SHOW_TO_CLOSE_RATE: 'showToCloseRate',
  QUALIFIED_CLOSE_RATE: 'qualifiedCloseRate',
  SCHED_CALLS_PER_DEAL: 'schedCallsPerDeal',
  HELD_CALLS_PER_DEAL: 'heldCallsPerDeal',
  DEPOSITS_TAKEN: 'depositsTaken',
  DEPOSITS_TO_CLOSE: 'depositsToClose',
  DEPOSIT_CLOSE_PCT: 'depositClosePct',
  NUM_DQ: 'numDQ',
  DQ_PCT: 'dqPct',

  // Sales Cycle
  AVG_CALLS_TO_CLOSE: 'avgCallsToClose',
  MEDIAN_CALLS_TO_CLOSE: 'medianCallsToClose',
  AVG_DAYS_TO_CLOSE: 'avgDaysToClose',
  MEDIAN_DAYS_TO_CLOSE: 'medianDaysToClose',
  ONE_CALL_CLOSES: 'oneCallCloses',
  ONE_CALL_CLOSE_PCT: 'oneCallClosePct',
  TWO_CALL_CLOSES: 'twoCallCloses',
  TWO_CALL_CLOSE_PCT: 'twoCallClosePct',
  THREE_PLUS_CLOSES: 'threePlusCloses',
  THREE_PLUS_CLOSE_PCT: 'threePlusClosePct',

  // Revenue
  TOTAL_REVENUE: 'totalRevenue',
  NEW_CASH_PERIOD: 'newCashPeriod',
  REVENUE_PER_SHOW: 'revenuePerShow',
  REVENUE_PER_CALL: 'revenuePerCall',
  DEPOSIT_RATE: 'depositRate',
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { METRIC_KEYS };
}

export { METRIC_KEYS };

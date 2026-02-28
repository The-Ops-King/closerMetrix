/**
 * FULL E2E LIFECYCLE TEST
 *
 * Tests the complete backend flow against real BigQuery + real Anthropic API:
 *   1. Client onboarding
 *   2. Closer onboarding (x2)
 *   3. Transcript submission → AI processing → scoring + objections
 *   4. Payment → state transition (Follow Up → Closed-Won)
 *   5. Refund → state reversion + cash zeroed
 *   6. Cleanup: soft-delete test data
 *
 * IMPORTANT: These tests hit real external services (BigQuery, Anthropic).
 * They are slow (~60s per AI call) and cost real money (~$0.03 per call).
 * Run only when needed: `npx jest tests/e2e/ --testTimeout=300000`
 */

const request = require('supertest');
const app = require('../../src/app');
const bq = require('../../src/db/BigQueryClient');
const { generateId } = require('../../src/utils/idGenerator');

jest.setTimeout(300000); // 5 minutes

const ADMIN_KEY = process.env.ADMIN_API_KEY || 'dev-admin-key';
const adminAuth = `Bearer ${ADMIN_KEY}`;

// Unique per run to avoid collisions
const testRunId = generateId().substring(0, 8);

// Shared state across tests
let clientId;
let webhookSecret;
let closer1Id;
let closer2Id;
let sarahCallId;
let jakeCallId;

/**
 * Polls BigQuery until a condition is met or timeout expires.
 * Returns the matching rows or throws on timeout.
 */
async function pollBQ(sql, params, predicate, timeoutMs = 90000, intervalMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = await bq.query(sql, params);
    if (predicate(rows)) return rows;
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`BQ poll timed out after ${timeoutMs}ms`);
}

describe('Full E2E Lifecycle', () => {

  // ──────────────────────────────────────────────────
  // 1. CLIENT ONBOARDING
  // ──────────────────────────────────────────────────
  describe('1. Client Onboarding', () => {
    it('should create a new client', async () => {
      const res = await request(app)
        .post('/admin/clients')
        .set('Authorization', adminAuth)
        .send({
          company_name: `E2E Test ${testRunId}`,
          name: `Test Owner ${testRunId}`,
          primary_contact_email: `owner-${testRunId}@e2etest.dev`,
          timezone: 'America/New_York',
          offer_name: 'Sales Intelligence Platform',
          offer_price: 2500,
          offer_description: 'AI-powered sales call analysis and coaching platform',
          filter_word: 'strategy,discovery,sales call',
          plan_tier: 'executive',
          transcript_provider: 'generic',
          ai_prompt_overall: 'This is a high-ticket B2B SaaS sales intelligence platform. Closers sell to business owners and sales managers who want to improve their team close rates through AI-driven call analysis.',
          common_objections: 'Price, need to talk to spouse/partner, want to think about it',
          disqualification_criteria: 'Less than 3 closers, less than $500K annual revenue',
        });

      expect(res.status).toBe(201);
      expect(res.body.client_id).toBeDefined();
      expect(res.body.webhook_secret).toBeDefined();

      clientId = res.body.client_id;
      webhookSecret = res.body.webhook_secret;
    });

    it('should retrieve the client', async () => {
      const res = await request(app)
        .get(`/admin/clients/${clientId}`)
        .set('Authorization', adminAuth);

      expect(res.status).toBe(200);
      expect(res.body.company_name).toBe(`E2E Test ${testRunId}`);
      expect(res.body.plan_tier).toBe('executive');
    });
  });

  // ──────────────────────────────────────────────────
  // 2. CLOSER ONBOARDING
  // ──────────────────────────────────────────────────
  describe('2. Closer Onboarding', () => {
    it('should add closer 1 (Sarah)', async () => {
      const res = await request(app)
        .post(`/admin/clients/${clientId}/closers`)
        .set('Authorization', adminAuth)
        .send({
          name: `Sarah Chen ${testRunId}`,
          work_email: `sarah-${testRunId}@e2etest.dev`,
          timezone: 'America/Los_Angeles',
          transcript_provider: 'generic',
        });

      expect(res.status).toBe(201);
      closer1Id = res.body.closer_id;
    });

    it('should add closer 2 (Jake)', async () => {
      const res = await request(app)
        .post(`/admin/clients/${clientId}/closers`)
        .set('Authorization', adminAuth)
        .send({
          name: `Jake Martinez ${testRunId}`,
          work_email: `jake-${testRunId}@e2etest.dev`,
          timezone: 'America/Chicago',
          transcript_provider: 'generic',
        });

      expect(res.status).toBe(201);
      closer2Id = res.body.closer_id;
    });

    it('should list both closers', async () => {
      const res = await request(app)
        .get(`/admin/clients/${clientId}/closers`)
        .set('Authorization', adminAuth);

      expect(res.status).toBe(200);
      const closers = res.body.closers || res.body;
      expect(closers.length).toBe(2);
    });
  });

  // ──────────────────────────────────────────────────
  // 3. TRANSCRIPT → AI PROCESSING (Closed-Won)
  // ──────────────────────────────────────────────────
  describe('3. Transcript Processing — Closed-Won', () => {
    it('should accept transcript, process via AI, score call, extract objections, and track cost', async () => {
      // Send the transcript
      const res = await request(app)
        .post('/webhooks/transcript/generic')
        .send({
          client_id: clientId,
          closer_email: `sarah-${testRunId}@e2etest.dev`,
          prospect_email: `lisa-${testRunId}@prospect.dev`,
          prospect_name: 'Lisa Wang',
          scheduled_start_time: '2026-02-28T19:00:00Z',
          recording_start_time: '2026-02-28T19:02:00Z',
          recording_end_time: '2026-02-28T19:42:00Z',
          duration_seconds: 2400,
          title: 'Sales Call - Lisa Wang',
          speakers: [
            { name: `Sarah Chen ${testRunId}`, email: `sarah-${testRunId}@e2etest.dev` },
            { name: 'Lisa Wang', email: `lisa-${testRunId}@prospect.dev` },
          ],
          transcript: buildClosedWonTranscript(`Sarah Chen ${testRunId}`),
        });
      expect(res.status).toBe(200);

      // Poll until call record appears and AI completes
      const calls = await pollBQ(
        `SELECT call_id, processing_status, call_outcome, attendance,
                overall_call_score, discovery_score, pitch_score,
                close_attempt_score, objection_handling_score,
                script_adherence_score, prospect_fit_score,
                ai_summary, ai_feedback, compliance_flags
         FROM ${bq.table('Calls')}
         WHERE client_id = @clientId AND closer_id = @closerId
         ORDER BY created DESC LIMIT 1`,
        { clientId, closerId: closer1Id },
        rows => rows.length > 0 && rows[0].processing_status === 'complete',
        120000, // 2 min timeout for AI
        5000
      );

      const call = calls[0];
      sarahCallId = call.call_id;

      // Verify outcome
      expect(call.call_outcome).toBe('Closed - Won');
      expect(call.attendance).toBe('Closed - Won');

      // Verify all scores exist and are in range
      for (const score of [
        call.overall_call_score, call.discovery_score, call.pitch_score,
        call.close_attempt_score, call.objection_handling_score,
      ]) {
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(10);
      }

      // Verify summary and feedback
      expect(call.ai_summary).toBeTruthy();
      expect(call.ai_feedback).toBeTruthy();

      // Verify objections (may be written slightly after processing_status=complete)
      const objs = await pollBQ(
        `SELECT objection_type, resolved, objection_text FROM ${bq.table('Objections')}
         WHERE call_id = @callId AND client_id = @clientId`,
        { callId: sarahCallId, clientId },
        rows => rows.length > 0,
        30000,
        3000
      );
      for (const obj of objs) {
        expect(obj.objection_type).toBeTruthy();
        expect(obj.objection_text).toBeTruthy();
        expect(typeof obj.resolved).toBe('boolean');
      }
      // For Closed-Won, most objections should be resolved
      expect(objs.filter(o => o.resolved).length).toBeGreaterThan(0);

      // Verify cost tracking (written after objections)
      const costs = await pollBQ(
        `SELECT model, input_tokens, output_tokens, total_cost_usd FROM ${bq.table('CostTracking')}
         WHERE call_id = @callId AND client_id = @clientId`,
        { callId: sarahCallId, clientId },
        rows => rows.length > 0,
        15000,
        3000
      );
      expect(costs[0].input_tokens).toBeGreaterThan(0);
      expect(costs[0].output_tokens).toBeGreaterThan(0);
      expect(costs[0].total_cost_usd).toBeGreaterThan(0);
    });
  });

  // ──────────────────────────────────────────────────
  // 4. TRANSCRIPT → AI PROCESSING (Follow Up)
  // ──────────────────────────────────────────────────
  describe('4. Transcript Processing — Follow Up', () => {
    it('should process transcript as Follow Up with unresolved objections', async () => {
      const res = await request(app)
        .post('/webhooks/transcript/generic')
        .send({
          client_id: clientId,
          closer_email: `jake-${testRunId}@e2etest.dev`,
          prospect_email: `michael-${testRunId}@prospect.dev`,
          prospect_name: 'Michael Thompson',
          scheduled_start_time: '2026-02-28T20:00:00Z',
          recording_start_time: '2026-02-28T20:01:00Z',
          recording_end_time: '2026-02-28T20:38:00Z',
          duration_seconds: 2220,
          title: 'Discovery Call - Michael Thompson',
          speakers: [
            { name: `Jake Martinez ${testRunId}`, email: `jake-${testRunId}@e2etest.dev` },
            { name: 'Michael Thompson', email: `michael-${testRunId}@prospect.dev` },
          ],
          transcript: buildFollowUpTranscript(`Jake Martinez ${testRunId}`),
        });
      expect(res.status).toBe(200);

      // Poll until AI completes
      const calls = await pollBQ(
        `SELECT call_id, processing_status, call_outcome, attendance, overall_call_score
         FROM ${bq.table('Calls')}
         WHERE client_id = @clientId AND closer_id = @closerId
         ORDER BY created DESC LIMIT 1`,
        { clientId, closerId: closer2Id },
        rows => rows.length > 0 && rows[0].processing_status === 'complete',
        120000,
        5000
      );

      const call = calls[0];
      jakeCallId = call.call_id;

      expect(call.call_outcome).toBe('Follow Up');
      expect(call.attendance).toBe('Follow Up');
      expect(call.overall_call_score).toBeGreaterThanOrEqual(1);

      // Verify objections with at least one unresolved (may lag behind processing_status)
      const objs = await pollBQ(
        `SELECT objection_type, resolved FROM ${bq.table('Objections')}
         WHERE call_id = @callId AND client_id = @clientId`,
        { callId: jakeCallId, clientId },
        rows => rows.length > 0,
        30000,
        3000
      );
      expect(objs.some(o => !o.resolved)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────
  // 5. PAYMENT → STATE TRANSITION
  // ──────────────────────────────────────────────────
  describe('5. Payment Processing', () => {
    it('should accept payment and transition Follow Up → Closed-Won', async () => {
      expect(jakeCallId).toBeDefined(); // guard

      const res = await request(app)
        .post('/webhooks/payment')
        .set('Authorization', `Bearer ${webhookSecret}`)
        .send({
          client_id: clientId,
          prospect_email: `michael-${testRunId}@prospect.dev`,
          prospect_name: 'Michael Thompson',
          payment_amount: 7500,
          payment_type: 'full',
          product_name: 'Sales Intelligence Platform',
        });

      expect(res.status).toBe(200);
      expect(res.body.action).toBe('new_close');
      expect(res.body.previous_outcome).toBe('Follow Up');
      expect(res.body.new_outcome).toBe('Closed - Won');
      expect(res.body.cash_collected).toBe(7500);

      // Verify call record
      const rows = await bq.query(
        `SELECT attendance, cash_collected, total_payment_amount FROM ${bq.table('Calls')}
         WHERE call_id = @callId AND client_id = @clientId`,
        { callId: jakeCallId, clientId }
      );
      expect(rows[0].attendance).toBe('Closed - Won');
      expect(rows[0].cash_collected).toBe(7500);

      // Verify prospect record
      const prospects = await bq.query(
        `SELECT total_cash_collected, deal_status, payment_count FROM ${bq.table('Prospects')}
         WHERE prospect_email = @email AND client_id = @clientId`,
        { email: `michael-${testRunId}@prospect.dev`, clientId }
      );
      expect(prospects.length).toBe(1);
      expect(prospects[0].total_cash_collected).toBe(7500);
      expect(prospects[0].deal_status).toBe('closed_won');
    });
  });

  // ──────────────────────────────────────────────────
  // 6. REFUND → STATE REVERSION
  // ──────────────────────────────────────────────────
  describe('6. Refund Processing', () => {
    it('should process refund and set Refunded outcome (cash preserved)', async () => {
      expect(jakeCallId).toBeDefined(); // guard

      const res = await request(app)
        .post('/webhooks/payment')
        .set('Authorization', `Bearer ${webhookSecret}`)
        .send({
          client_id: clientId,
          prospect_email: `michael-${testRunId}@prospect.dev`,
          payment_amount: 7500,
          payment_type: 'refund',
        });

      expect(res.status).toBe(200);
      expect(res.body.action).toBe('refund');
      expect(res.body.remaining_cash).toBe(7500);
      expect(res.body.outcome).toBe('Refunded');

      // Verify call outcome is Refunded and cash_collected is preserved
      const rows = await bq.query(
        `SELECT call_outcome, cash_collected, total_payment_amount FROM ${bq.table('Calls')}
         WHERE call_id = @callId AND client_id = @clientId`,
        { callId: jakeCallId, clientId }
      );
      expect(rows[0].call_outcome).toBe('Refunded');
      expect(rows[0].cash_collected).toBe(7500);
      expect(rows[0].total_payment_amount).toBe(0);

      // Verify prospect deal_status is 'refunded'
      const prospects = await bq.query(
        `SELECT total_cash_collected, deal_status FROM ${bq.table('Prospects')}
         WHERE prospect_email = @email AND client_id = @clientId`,
        { email: `michael-${testRunId}@prospect.dev`, clientId }
      );
      expect(prospects[0].total_cash_collected).toBe(0);
      expect(prospects[0].deal_status).toBe('refunded');
    });
  });

  // ──────────────────────────────────────────────────
  // 7. AUDIT TRAIL
  // ──────────────────────────────────────────────────
  describe('7. Audit Trail', () => {
    it('should have audit entries for key events', async () => {
      const entries = await bq.query(
        `SELECT action, entity_type, trigger_source FROM ${bq.table('AuditLog')}
         WHERE client_id = @clientId ORDER BY timestamp ASC`,
        { clientId }
      );

      expect(entries.length).toBeGreaterThan(0);
      expect(entries.some(e => e.entity_type === 'client' && e.action === 'created')).toBe(true);
      expect(entries.some(e => e.action === 'ai_processed')).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────
  // CLEANUP
  // ──────────────────────────────────────────────────
  afterAll(async () => {
    if (clientId) {
      try {
        await bq.update('Clients', { status: 'Inactive' }, { client_id: clientId });
        await bq.query(
          `UPDATE ${bq.table('Closers')} SET status = 'inactive' WHERE client_id = @clientId`,
          { clientId }
        );
      } catch (err) {
        console.warn('Cleanup warning:', err.message);
      }
    }
  });
});

// ──────────────────────────────────────────────────
// TRANSCRIPT FIXTURES
// ──────────────────────────────────────────────────

function buildClosedWonTranscript(closerName) {
  return `00:00:05 - ${closerName}: Hey Lisa, thanks so much for taking the time today. How are you doing?

00:00:12 - Lisa Wang: I am doing well, thanks. A little nervous honestly, but excited to learn more about what you guys do.

00:00:20 - ${closerName}: Oh no need to be nervous at all! This is really just a conversation to see if we might be a good fit. So tell me a little about yourself and what brought you to book this call?

00:00:35 - Lisa Wang: Sure. I run a digital marketing agency called BrightPath. We have been in business for about three years, doing around 1.2 million in revenue with 15 employees.

00:00:55 - ${closerName}: Congrats on building that. So what is the biggest challenge right now that made you want to hop on this call?

00:01:05 - Lisa Wang: Honestly, the sales side. I am still doing all the sales calls myself. I have tried hiring closers twice and both times it did not work out. They could not sell our services the way I can. I spend about 60% of my time on sales when I should be running the business.

00:01:28 - ${closerName}: That is super common. You built the business on your own sales ability and now you are trapped by it. How many calls are you taking per week?

00:01:38 - Lisa Wang: Anywhere from 12 to 18 calls a week. My close rate is around 35%, which is decent, but I am exhausted by the end of the week.

00:01:52 - ${closerName}: What would it mean for your business if you could get those hours back and still maintain or even improve that close rate?

00:02:08 - Lisa Wang: It would be game-changing. I could focus on service delivery, maybe launch the new SEO division I have been planning. Right now I do not have the bandwidth.

00:02:22 - ${closerName}: Makes total sense. And your average deal size?

00:02:28 - Lisa Wang: Our retainers start at 3,500 a month with a 6-month minimum, so 21,000 per client minimum.

00:02:38 - ${closerName}: So even one or two extra closes per month from better trained closers would be significant. When your closers did not work out before, what went wrong?

00:02:52 - Lisa Wang: They were generic salespeople. They could not handle objections about our pricing or explain why we are different. And I had no way to evaluate what they were doing wrong because I was not on the calls.

00:03:12 - ${closerName}: That is one of the core problems we solve. We provide AI-powered sales intelligence. We analyze every call your closers take, score them on discovery, pitch quality, objection handling, and close attempts. We identify exactly where they are losing deals and give specific coaching feedback.

00:03:45 - Lisa Wang: How does the scoring work?

00:03:50 - ${closerName}: After every call, our AI generates a detailed scorecard. Each call gets scored 1 to 10 across seven categories. Your closers get instant feedback and you get a dashboard showing all the data across your entire team.

00:04:15 - Lisa Wang: So I could see which closers struggle with objection handling versus which ones are not following the pitch correctly?

00:04:24 - ${closerName}: Exactly. You can see patterns across your whole team. Maybe everyone loses deals at the same point, that tells you the pitch needs work. Or maybe one closer handles financial objections perfectly and another freezes up. We surface all of that.

00:04:45 - Lisa Wang: I really like that. How much does this cost though? We are growing but not huge.

00:04:52 - ${closerName}: Our executive tier is 2,500 per month. Let me put it in perspective though. Your average deal is 21,000. If our system helps your team close just one additional deal per month, that is an 8x return. Most clients see improvement within the first two weeks.

00:05:28 - Lisa Wang: 2,500 a month, that is 30,000 a year. That is a big commitment when I am not sure it will work for us.

00:05:38 - ${closerName}: Totally understand. We had a client very similar to you, a boutique digital agency doing about a million. Within 60 days, their close rate went from 28% to 41%. That translated to an additional 150,000 in revenue over the next quarter. The 2,500 per month paid for itself in the first three weeks.

00:06:08 - Lisa Wang: Wow. But what if my closers just are not good enough? What if the problem is not coaching but that I need better people?

00:06:18 - ${closerName}: Great question. Our data helps you figure that out too. If a closer consistently scores below a 4 after getting feedback, that tells you it is a hiring issue. Either way you get clarity.

00:06:42 - Lisa Wang: My husband runs the financial side and I usually discuss big purchases with him first. Could we schedule a follow-up?

00:06:56 - ${closerName}: Completely understand. Let me ask you this though. If your husband looked at the numbers, what would he say? You spend 60% of your time on sales. One extra close per month more than covers the investment. And you would finally have data to make informed decisions.

00:07:22 - Lisa Wang: You know what, you are right. He has been telling me I need to stop doing everything myself. I think he would be supportive.

00:07:34 - ${closerName}: And we have a 60-day evaluation period. If you are not seeing measurable improvement, we will work with you to make it right.

00:07:52 - Lisa Wang: OK, I think I am in. What does onboarding look like?

00:07:58 - ${closerName}: Awesome! We set up your account, connect to your call recording tool, customize the AI scoring for your sales process. The whole setup takes 48 hours and your very next call is being analyzed.

00:08:55 - Lisa Wang: OK let us do it. Where do I sign up?

00:08:58 - ${closerName}: Perfect! I will send you the enrollment link right after this call. 2,500 per month and you will be live within 48 hours. Sound good?

00:09:15 - Lisa Wang: Sounds great. Really looking forward to having visibility into what happens on our sales calls.

00:09:22 - ${closerName}: You are going to love it, Lisa. Welcome aboard!

00:09:36 - Lisa Wang: Thanks, this was really helpful. Talk to you soon!`;
}

function buildFollowUpTranscript(closerName) {
  return `00:00:03 - ${closerName}: Hey Michael, appreciate you hopping on today. How are you doing?

00:00:08 - Michael Thompson: Good, good. Thanks for making time. I saw the ad on LinkedIn and figured I would check it out.

00:00:16 - ${closerName}: Awesome, glad you reached out. Tell me a little about yourself and what prompted you to book this call?

00:00:25 - Michael Thompson: Sure. I own a real estate coaching company. We help new agents get their first 10 deals in their first year. Been around for about two years, doing around 800K annually. I have three closers right now.

00:00:45 - ${closerName}: That is solid growth. What is the biggest bottleneck you are dealing with?

00:00:52 - Michael Thompson: I do not have any visibility into what my closers are doing on calls. I hired them, trained them for two weeks, and basically just look at close rates. But I feel like we are losing deals we should be winning.

00:01:12 - ${closerName}: Super common. You are flying blind. Do you record the calls currently?

00:01:18 - Michael Thompson: Yeah we use Fathom. Every call gets recorded. I just do not have time to listen to them all. There are like 40 to 50 calls a week across three closers.

00:01:30 - ${closerName}: 40 to 50, yeah there is no way you can review all those manually. What is your current close rate?

00:01:38 - Michael Thompson: It varies a lot. My best closer David is around 30%. But the other two are at maybe 18% and 22%.

00:01:55 - ${closerName}: Right, and without data you are just guessing why. Here is what we do. We plug into Fathom and our AI analyzes every call automatically. You get a scorecard, coaching feedback, and a dashboard showing where deals fall apart.

00:02:22 - Michael Thompson: How granular does the analysis get?

00:02:25 - ${closerName}: Very granular. Seven different scoring areas: discovery, pitch quality, close attempt, objection handling, script adherence, prospect fit, and overall. Everything 1 to 10. Plus we track every objection.

00:02:48 - Michael Thompson: That is exactly what I need. What does something like this cost?

00:02:53 - ${closerName}: For your setup with three closers, our executive tier at 2,500 per month covers unlimited calls, full analytics, coaching notes, compliance monitoring, and a custom dashboard.

00:03:08 - Michael Thompson: 2,500 a month. That is a significant expense for us right now. We are still in growth mode and every dollar counts.

00:03:18 - ${closerName}: I hear you. Let me ask though. Your two underperforming closers at 18% and 22%, if we got them to 28%, just a 6 to 10 point improvement, how many extra deals per month?

00:03:38 - Michael Thompson: Probably 3 to 5 extra per month. Our program is 4,500 so that would be 13 to 22 thousand in additional monthly revenue.

00:03:52 - ${closerName}: Right, so the math works quickly. Is it really that 2,500 feels too expensive, or is it more about cash flow timing?

00:04:05 - Michael Thompson: It is both honestly. We just hired closer three and onboarding has been expensive. My wife also manages our books and she would want to see proof that this works before we commit.

00:04:20 - ${closerName}: Makes sense. We have clients in real estate coaching I can connect you with as references. Do you think your wife would want to hop on a call to see the dashboard?

00:04:45 - Michael Thompson: She might, yeah. She is pretty analytical.

00:04:52 - ${closerName}: I do not want to rush you. At 40 to 50 calls a week with significant variance in close rates, there is almost certainly low-hanging fruit we would identify within the first week.

00:05:15 - Michael Thompson: I appreciate you not being pushy. Let me talk to my wife this weekend and review our budget. I am definitely interested, just need to make sure we can swing it.

00:05:28 - ${closerName}: Absolutely. Can we schedule a follow-up for Tuesday at 2 PM Eastern?

00:05:45 - Michael Thompson: Yeah, Tuesday at 2 PM works.

00:05:50 - ${closerName}: Perfect. I will send a calendar invite and a one-pager showing our typical results for coaching companies, so you and your wife have concrete data.

00:06:05 - Michael Thompson: That would be helpful. Thanks.

00:06:10 - ${closerName}: One more thing. You mentioned David at 30%. What close rate would you be thrilled with across all three?

00:06:22 - Michael Thompson: If all three were at 30% or above, I would be ecstatic. That is probably another 200 to 300K in annual revenue.

00:06:32 - ${closerName}: Very achievable. Alright Michael, I will get the reference and one-pager over today. Talk Tuesday at 2.

00:06:47 - Michael Thompson: Sounds like a plan. Thanks, appreciate it.

00:06:52 - ${closerName}: Thank you Michael, have a great weekend!`;
}

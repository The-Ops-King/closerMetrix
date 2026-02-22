# CloserMetrix Onboarding SOP

Step-by-step guide for onboarding new clients and closers. Follow in order.

---

## New Client Onboarding

### What you need from the client

1. Company name
2. Primary contact email
3. Their offer name and price
4. Filter words — the words that appear in their sales call calendar event titles (e.g. "strategy", "discovery", "sales call"). Comma-separated.
5. Their timezone (e.g. "America/New_York")
6. Plan tier: starter, insight, growth, or enterprise
7. (Optional) Their sales script, AI prompt customizations, common objections, DQ criteria

### What you do

**Send this API call** (replace values with the client's info):

```bash
curl -X POST "https://closermetrix-api-b4x4dur6ha-uc.a.run.app/admin/clients" \
  -H "Authorization: Bearer {ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "company_name": "Acme Coaching",
    "primary_contact_email": "john@acme.com",
    "offer_name": "Executive Coaching Program",
    "offer_price": 10000,
    "filter_word": "strategy,discovery,sales call",
    "plan_tier": "insight",
    "timezone": "America/New_York",
    "transcript_provider": "fathom",
    "script_template": "paste their sales script here if they have one",
    "ai_prompt_overall": "paste any custom AI context about their business here",
    "common_objections": "price, spouse, timing",
    "disqualification_criteria": "under $50k income, not a business owner"
  }'
```

**Save from the response:**
- `client_id` — you need this for everything else
- `webhook_secret` — give this to the client for their payment webhook

**Send the client:**
- Payment webhook URL: `https://closermetrix-api-b4x4dur6ha-uc.a.run.app/webhooks/payment`
- Their `webhook_secret` (goes in the `Authorization: Bearer` header)
- Instructions: configure their payment processor (Stripe, etc.) to POST to that URL

---

## New Closer Onboarding

Do this for EACH closer on the client's team.

### Step 1: What the closer needs to do (send them these instructions)

**A) Share their Google Calendar**

This is just like sharing a calendar with a coworker — no OAuth, no admin panels, no technical setup on their end. They just share it with our service account email:

1. Open Google Calendar
2. Click the gear icon (Settings)
3. Under "Settings for my calendars", click on their main calendar
4. Click "Share with specific people"
5. Click "+ Add people and groups"
6. Add: `closermetrix@closer-automation.iam.gserviceaccount.com`
7. Set permission to: **"Make changes to events"**
8. Click Send

That's it on their end. Our system already has credentials for that service account — once they share, we can set up the calendar watch from our side. The closer never has to touch OAuth, tokens, or any admin settings.

**B) Get their Fathom API key**
1. Log into Fathom (https://fathom.video)
2. Click their profile icon (bottom left)
3. Go to "Settings"
4. Click "API" in the left sidebar (or go to https://fathom.video/settings/api)
5. Click "Create API Key"
6. Copy the API key and send it to you

**C) Send you:**
- Their full name
- Their work email (the one on their Google Calendar)
- Their Fathom API key (from step B)

### Step 2: Wait for the closer to complete Step 1

Do NOT proceed until they've shared their calendar and sent you their Fathom API key. If you skip this, calendar watches will fail and Fathom transcripts won't flow.

### Step 3: Create the closer record

**Send this API call** (replace `{clientId}` and the closer's info):

```bash
curl -X POST "https://closermetrix-api-b4x4dur6ha-uc.a.run.app/admin/clients/{clientId}/closers" \
  -H "Authorization: Bearer {ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sarah Closer",
    "work_email": "sarah@acme.com",
    "transcript_api_key": "paste-their-fathom-api-key-here"
  }'
```

**Check the response — look for these two things:**
```
"fathom_webhook_status": "registered"    <-- MUST say "registered"
"fathom_webhook_id": "some-id"          <-- MUST have a value
```

If `fathom_webhook_status` says `"failed"`, the Fathom API key is probably wrong. Get a new one from the closer and retry (see Troubleshooting).

**Save from the response:**
- `closer_id` — you need this for the next step

### Step 4: Create the Google Calendar watch

**Send this API call** (replace `{clientId}` and `{closerId}`):

```bash
curl -X POST "https://closermetrix-api-b4x4dur6ha-uc.a.run.app/admin/calendar/watch/{clientId}/{closerId}" \
  -H "Authorization: Bearer {ADMIN_API_KEY}"
```

**Check the response:**
```
"status": "ok"
"channel": { "channelId": "...", "expiration": "..." }
```

The expiration should be ~7 days from now. The system auto-renews these, so you don't need to worry about it after this.

### Step 5: Verify it's all working

**Quick check — list the client's closers:**
```bash
curl "https://closermetrix-api-b4x4dur6ha-uc.a.run.app/admin/clients/{clientId}/closers" \
  -H "Authorization: Bearer {ADMIN_API_KEY}"
```

Confirm the closer shows:
- `fathom_webhook_id` is not null
- `transcript_api_key` is not null
- `status` is "active"

**Real test:** Have the closer hop on a short test call with Fathom recording. After Fathom processes the recording (usually 1-2 minutes), verify:
- A call record appears in BigQuery with `attendance = 'Show'`
- AI scores are populated (`overall_call_score`, `ai_summary`, etc.)

---

## Deactivate a Closer

```bash
curl -X DELETE "https://closermetrix-api-b4x4dur6ha-uc.a.run.app/admin/clients/{clientId}/closers/{closerId}" \
  -H "Authorization: Bearer {ADMIN_API_KEY}"
```

This sets them to inactive, stops their calendar watch, deletes their Fathom webhook, and preserves all historical data.

---

## Onboarding Checklist (copy-paste per closer)

```
Client: _______________  Client ID: _______________

Closer: _______________  Work Email: _______________

[ ] Closer shared Google Calendar with closermetrix@closer-automation.iam.gserviceaccount.com
[ ] Closer created Fathom API key and sent it to me
[ ] Created closer record (POST /admin/clients/{clientId}/closers)
    [ ] Response shows fathom_webhook_status: "registered"
    [ ] Saved closer_id: _______________
[ ] Created calendar watch (POST /admin/calendar/watch/{clientId}/{closerId})
    [ ] Response shows status: "ok"
[ ] Verified with test call — transcript arrived and AI processed it
```

---

## Troubleshooting

### Fathom webhook failed during closer creation

The API key was probably wrong, or Fathom was temporarily down.

**Fix:** Retry with the manual endpoint:
```bash
curl -X POST "https://closermetrix-api-b4x4dur6ha-uc.a.run.app/admin/clients/{clientId}/closers/{closerId}/register-fathom" \
  -H "Authorization: Bearer {ADMIN_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{ "transcript_api_key": "the-closer-fathom-api-key" }'
```

### Transcripts not arriving after a call

1. **Polling fallback:** Even if the Fathom webhook fails, the system polls Fathom every 5 minutes. Wait 5-10 minutes before panicking.
2. **Check the closer has a `transcript_api_key`** — without this, polling won't work either.
3. **Check `fathom_webhook_id` is not null** — if it is, the webhook was never registered. Use the manual endpoint above.

### Calendar events not being picked up

1. **Did the closer actually share their calendar?** Check by trying to view their calendar from the service account.
2. **Is the calendar watch active?** Check:
   ```bash
   curl "https://closermetrix-api-b4x4dur6ha-uc.a.run.app/admin/calendar/channels" \
     -H "Authorization: Bearer {ADMIN_API_KEY}"
   ```
3. **Do the event titles match the filter words?** The calendar event title must contain at least one of the client's `filter_word` values (case-insensitive). If the client's filter word is "strategy" but their events say "intro call", those won't match.
4. **Does the closer's `work_email` match their Google Calendar email?** Must be exact.

### Closer works for multiple clients

Each client needs a separate closer record with a different `work_email` per client. Example:
- `luke@goshenites.com` → closer record under Goshenites
- `luke@nomoremondays.io` → closer record under No More Mondays

Same person, different email per client. Each gets its own Fathom webhook and calendar watch.

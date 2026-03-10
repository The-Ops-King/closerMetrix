# Security Remediation — Remaining Items (Manual/Infra Only)

All code-level fixes from the 2026-03-09 audit are complete. These 3 items require manual GCP actions.

---

## 1. H-14: Remove `--allow-unauthenticated` from Cloud Run

**What**: Backend Cloud Run currently allows public access. Switch to IAM service-to-service auth.

**Steps**:
1. In GCP Console → Cloud Run → Backend service → Security tab
2. Change "Authentication" from "Allow unauthenticated" to "Require authentication"
3. Grant the Frontend Cloud Run service account `roles/run.invoker` on the Backend service:
   ```bash
   gcloud run services add-iam-policy-binding closermetrix-backend \
     --member="serviceAccount:<frontend-sa>@closer-automation.iam.gserviceaccount.com" \
     --role="roles/run.invoker" \
     --project=closer-automation
   ```
4. Update Frontend's backend proxy to include an ID token when calling Backend
5. Test: Frontend → Backend proxy calls still work, direct public access is blocked

## 2. M-16: Switch to Application Default Credentials for local dev

**What**: Stop using a downloaded service account key file. Use ADC instead.

**Steps**:
1. Run once on your machine:
   ```bash
   gcloud auth application-default login --project=closer-automation
   ```
2. Remove `GOOGLE_APPLICATION_CREDENTIALS` from your `.env` file
3. Delete the service account key JSON file from disk
4. Restart servers — BigQuery client will auto-detect ADC

## 3. M-21: Replace calendar webhook channel token with a real secret

**What**: Google Calendar webhook uses `client_id` as channel token (guessable). Replace with a cryptographic secret.

**Steps**:
1. The code already stores `webhook_secret` per client in the Clients table
2. When registering/re-registering Google Calendar watch channels, use `webhook_secret` as the channel token instead of `client_id`
3. Update `webhookAuth.calendar` middleware to look up the client by webhook_secret instead of comparing against clientId
4. Re-register all active calendar watch channels with the new tokens

---

## Also: Create GCP Secrets for SMTP (before next deploy)

```bash
echo -n "jt@jtylerray.com" | gcloud secrets create smtp-user --data-file=- --project=closer-automation
echo -n "<your-gmail-app-password>" | gcloud secrets create smtp-pass --data-file=- --project=closer-automation
```

---

## All Code Fixes Complete (45 items)

CR-1–4, CR-6–8, H-1–4, H-6–11, M-1–5, M-7–15, M-18–20, L-1–5, L-7–9, L-12–13, plus calendar safeCompare and dashboard input validation.

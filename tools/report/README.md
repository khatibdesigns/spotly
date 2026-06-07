# Spotly daily report

Emails a daily **app-health + traffic** digest to `nader@khatibdesigns.com`, every
morning at **07:00 Kuwait** (04:00 UTC), via GitHub Actions → Resend.

- Workflow: [`.github/workflows/daily-report.yml`](../../.github/workflows/daily-report.yml)
- Script: [`daily-report.mjs`](./daily-report.mjs)
- Data: **Firestore** (always) + **GA4** (if configured) + **Search Console** (if configured)

The report works the moment the two required secrets are set; GA4 and Search
Console light up as you grant access. Run it any time from the **Actions** tab →
*Spotly daily report* → **Run workflow**.

---

## Setup checklist

### 1. Resend (email) — required
1. Sign up at <https://resend.com> using **nader@khatibdesigns.com** (so the
   onboarding sender can deliver to you with zero domain setup).
2. **API Keys → Create** → copy the `re_...` key.

### 2. GitHub repo secrets
`khatibdesigns/spotly` → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value | Required |
|---|---|---|
| `GA4_KEY` | The **service-account JSON** (whole file) used to auth Firestore + GA4 + Search Console. Written to a file → `GOOGLE_APPLICATION_CREDENTIALS`, same convention as the existing SEO report. | ✅ |
| `RESEND_API_KEY` | The `re_...` key from step 1 (delivers the email) | ✅ |
| `FIREBASE_SA_JSON` | Optional **second** SA, only if the `GA4_KEY` SA can't read spotly-6ca9a Firestore (then Firestore uses this, GA4/GSC use `GA4_KEY`) | optional |
| `GA4_PROPERTY` | GA4 **numeric** property id. Defaults to `540327946`. Not a `G-XXXX` id. | optional |
| `GSC_SITE` | Defaults to `sc-domain:meetspotly.com` | optional |
| `REPORT_TO` | override recipient (defaults to nader@khatibdesigns.com) | optional |

### 3. Make the service account able to read all three sources
A service account can only call an API if **that API is enabled on the SA's own
project**. Pick one model:

**A — single SA (simplest).** Use the spotly admin SA
(`firebase-adminsdk-fbsvc@spotly-6ca9a.iam.gserviceaccount.com`) as `GA4_KEY` — it
already reads Firestore. Then, on project **spotly-6ca9a**, enable:
- Analytics Data API → <https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com?project=spotly-6ca9a>
- Search Console API → <https://console.cloud.google.com/apis/library/searchconsole.googleapis.com?project=spotly-6ca9a>

and grant that email **GA4 Viewer** on property `540327946` and **Search Console**
access on `meetspotly.com`.

**B — two SAs.** Keep your existing analytics SA in `GA4_KEY` (its project already
has the two APIs enabled + Viewer on the property + GSC access) and add the spotly
admin SA as `FIREBASE_SA_JSON` for Firestore. Nothing to enable on spotly-6ca9a.

> The report is fail-soft: app-health always renders; GA4/SEO sections show a clear
> error (with the exact "enable this API" link) until their SA is ready.

### 4. GA4 website tag
- **Website tracking**: GA4 → Admin → **Data streams → Add stream → Web** →
  `https://meetspotly.com` → copy the **Measurement ID** (`G-XXXXXXXXXX`) and paste
  it into [`/analytics.js`](../../analytics.js) (one line). Until then the site tag
  is a harmless no-op.

### 5. (optional) Enable the "today" deltas for plans & memories
These two come from collection-group queries that need a one-time single-field
index (Firestore doesn't auto-create group indexes). The report shows `today: n/a`
for them until you click each link once (Firestore console → **Create index**):

- plans.createdAt — `console.firebase.google.com/project/spotly-6ca9a/firestore/indexes` → add a **collection-group** single-field index on `plans.createdAt` (ASC)
- memories.createdAt — same, for `memories.createdAt`

> The exact one-click links are printed in the Actions run log the first time the
> query fails (look for `COLLECTION_GROUP_ASC index`).

### 6. Test
**Actions** tab → *Spotly daily report* → **Run workflow**. Check your inbox; the
full text report is also printed in the run log.

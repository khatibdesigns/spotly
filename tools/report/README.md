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
| `FIREBASE_SA_JSON` | Paste the **entire** Firebase service-account JSON (`spotly-6ca9a-firebase-adminsdk-…json`) | ✅ |
| `RESEND_API_KEY` | The `re_...` key from step 1 | ✅ |
| `GA4_PROPERTY_ID` | GA4 **numeric** property id, e.g. `483920114` (step 4). `GA4_KEY` is also accepted. **Not** a `G-XXXX` id or an API key. | for GA4 section |
| `GSC_SITE` | `sc-domain:meetspotly.com` (this is the default if unset) | for SEO section |
| `REPORT_TO` | override recipient (defaults to nader@khatibdesigns.com) | optional |

### 3. Grant the service account read access
Service-account email: **`firebase-adminsdk-fbsvc@spotly-6ca9a.iam.gserviceaccount.com`**

- **GA4**: Admin → **Property Access Management** → add that email as **Viewer**.
  Then enable the **Google Analytics Data API** in the GCP project `spotly-6ca9a`
  (<https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com>).
- **Search Console**: open the `meetspotly.com` property → **Settings → Users and
  permissions → Add user** → that email (Restricted is fine). Then enable the
  **Search Console API** (<https://console.cloud.google.com/apis/library/searchconsole.googleapis.com>).

### 4. GA4 IDs + website tag
- **Property id**: GA4 → Admin → **Property settings** → copy the numeric id → `GA4_PROPERTY_ID`.
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

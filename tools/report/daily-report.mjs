// Spotly — daily app-health + traffic report.
//
// Pulls three data sources, each independently and fail-soft (one failing
// never blocks the others or the email):
//   1. Firestore   → app health (families, engagement, bookings, catalog)   [always]
//   2. GA4         → app + site usage (active users, sessions, sources)      [if GA4_PROPERTY_ID]
//   3. SearchConsole → organic SEO (clicks, impressions, queries, position)  [if GSC_SITE]
//
// Then emails the digest to REPORT_TO via FormSubmit (no API key).
//
// Env:
//   GA4_KEY / GOOGLE_APPLICATION_CREDENTIALS  (required) — service-account JSON
//                     (or a file path) with Firestore + GA4 + GSC access
//   FIREBASE_SA_JSON  (optional) — separate Firestore SA if GA4_KEY can't read it
//   REPORT_TO         (default nader@khatibdesigns.com)
//   GA4_PROPERTY / GA4_PROPERTY_ID  (numeric GA4 property id; default 538818604 via workflow)
//   GSC_SITE          (default "sc-domain:meetspotly.com")
//   REPORT_DRYRUN     (set to print fields instead of sending)

import fs from 'node:fs';
import admin from 'firebase-admin';
import { BetaAnalyticsDataClient } from '@google-analytics/data';
import { google } from 'googleapis';

// REPORT_TO may be a comma-separated list; Resend gets all, fallbacks use the first.
const TO_LIST = (process.env.REPORT_TO || 'nader@khatibdesigns.com').split(',').map((s) => s.trim()).filter(Boolean);
const TO = TO_LIST[0];
// GA4 numeric property id (GA4_PROPERTY is the env name used by the existing
// SEO report; GA4_PROPERTY_ID also accepted).
const GA4_PROPERTY_ID = (process.env.GA4_PROPERTY_ID || process.env.GA4_PROPERTY || '').trim();
const GSC_SITE = (process.env.GSC_SITE || 'sc-domain:meetspotly.com').trim();

const DAY = 86400000;
const now = Date.now();
const cut24 = now - DAY;
const cut7 = now - 7 * DAY;

// Two credential slots so the Firestore SA and the GA4/GSC SA can differ:
//  - Firestore needs read access on spotly-6ca9a.
//  - GA4/GSC need a SA whose OWN project has the Analytics Data + Search Console
//    APIs enabled, plus Viewer on the GA4 property / access to the GSC site.
// If a single SA has all three (e.g. the spotly admin SA with those two APIs
// enabled on spotly-6ca9a), put it in GA4_KEY and it is used for everything.
const parseSA = (s, where) => { try { return JSON.parse(s); } catch { console.error(`FATAL: invalid JSON in ${where}`); process.exit(1); } };
const gacPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const saFirebase = process.env.FIREBASE_SA_JSON ? parseSA(process.env.FIREBASE_SA_JSON, 'FIREBASE_SA_JSON') : null;
const saGa4 = process.env.GA4_KEY ? parseSA(process.env.GA4_KEY, 'GA4_KEY') : null;
const saGac = (gacPath && fs.existsSync(gacPath)) ? parseSA(fs.readFileSync(gacPath, 'utf8'), 'GOOGLE_APPLICATION_CREDENTIALS') : null;
const saGsc = process.env.GSC_SA_JSON ? parseSA(process.env.GSC_SA_JSON, 'GSC_SA_JSON') : null;
const firestoreSA = saFirebase || saGac || saGa4; // prefer a dedicated Firestore SA
const analyticsSA = saGa4 || saGac || saFirebase; // prefer the GA4/GSC SA
// Search Console can't add a service account via API and its UI rejects SA emails
// ("user not found"), so allow a SEPARATE GSC credential (an SA already added to
// the property). Falls back to the analytics SA when they're the same.
const gscSA = saGsc || analyticsSA;
if (!firestoreSA) { console.error('FATAL: no service-account credential. Set GA4_KEY (or FIREBASE_SA_JSON / GOOGLE_APPLICATION_CREDENTIALS).'); process.exit(1); }
// Pin the Firestore project so app-health reads Spotly even if the SA's own project differs.
admin.initializeApp({ credential: admin.credential.cert(firestoreSA), projectId: 'spotly-6ca9a' });
const db = admin.firestore();
const Timestamp = admin.firestore.Timestamp;
const ts24 = Timestamp.fromMillis(cut24);

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const pct = (n) => (n == null ? '—' : (n * 100).toFixed(1) + '%');

// ---------------------------------------------------------------- Growth scorecard
//
// The point of this section: give Nader a daily "am I growing?" read he can trust
// — real day-over-day (DoD) and week-over-week (WoW) movement, arrows, and a
// single composite Growth Index that starts at 100 today and climbs (or dips) as
// the business moves. Honesty rules baked in:
//   • Absolute numbers ALWAYS shown next to %, because early on the counts are
//     tiny and a % swing off a base of 1–2 is noise, not signal.
//   • When the prior value is small (<5) we show the absolute change, not a % —
//     "0 → 1 click" is "+1", never "+∞%".
//   • WoW works from day one (GA4/GSC give us prior-week ranges directly).
//   • DoD needs a stored snapshot of yesterday, so it lights up from tomorrow.
//     Today is the honest baseline.

const SNAP_DIR = process.env.SNAP_DIR || `${process.env.HOME}/.spotly-report/snapshots`;
// Kuwait-local calendar date, so "today" matches the report's date label.
const kwDate = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Kuwait' }); // YYYY-MM-DD
const loadSnap = (dateStr) => {
  try { return JSON.parse(fs.readFileSync(`${SNAP_DIR}/${dateStr}.json`, 'utf8')); } catch { return null; }
};
const saveSnap = (dateStr, obj) => {
  try { fs.mkdirSync(SNAP_DIR, { recursive: true }); fs.writeFileSync(`${SNAP_DIR}/${dateStr}.json`, JSON.stringify(obj)); }
  catch (e) { console.error('snapshot save failed (non-fatal):', e.message); }
};
const earliestSnap = () => {
  try {
    const files = fs.readdirSync(SNAP_DIR).filter((f) => f.endsWith('.json')).sort();
    return files.length ? JSON.parse(fs.readFileSync(`${SNAP_DIR}/${files[0]}`, 'utf8')) : null;
  } catch { return null; }
};

// One growth cell: arrow + change, absolute for small/undefined bases, % otherwise.
function cell(now, prev) {
  if (prev == null || now == null) return '—';
  const d = now - prev;
  const arrow = d > 0 ? '▲' : d < 0 ? '▼' : '–';
  const sign = d > 0 ? '+' : '';                              // '-' already comes from fmt/toFixed
  if (prev < 5) return `${arrow} ${sign}${fmt(d)}`;          // tiny base → show absolute
  return `${arrow} ${sign}${(d / prev * 100).toFixed(0)}%`;   // real base → show %
}

// Compute today's metric set + composite index from the live report data.
function scorecardMetrics(h, g, s) {
  const gsc = (s.configured && !s.error) ? s : { totals: {}, prev: {} };
  const gaOk = g.configured && !g.error;
  const conv = gaOk && g.conversions ? g.conversions : {};
  const convSum = (slot) => ['store_click', 'get_app_click', 'notify_signup'].reduce((a, k) => a + (conv[k]?.[slot] || 0), 0);
  const m = {
    impr7:      gsc.totals?.impressions ?? null,
    imprPrev:   gsc.prev?.impressions ?? null,
    clicks7:    gsc.totals?.clicks ?? null,
    clicksPrev: gsc.prev?.clicks ?? null,
    sess7:      gaOk ? (g.web?.last7?.sessions ?? 0) : null,
    sessPrev:   gaOk ? (g.web?.last7prev?.sessions ?? 0) : null,
    installs7:  gaOk ? (g.last7?.newUsers ?? 0) : null,       // app new users ≈ installs
    installsPrev: gaOk ? (g.last7prev?.newUsers ?? 0) : null,
    conv7:      gaOk ? convSum('last7') : null,
    convPrev:   gaOk ? convSum('last7prev') : null,
    families:   h.familiesTotal ?? null,
    plans:      h.plansTotal ?? null,
    bookings:   h.bookingsTotal ?? null,
  };
  // Composite "raw" — weighted so a rare high-value event (install, conversion)
  // moves the index more than a cheap one (an impression). Weights are a
  // deliberate editorial call, documented so the index is reproducible.
  const W = { impr: 1, clicks: 20, sess: 5, installs: 30, conv: 15, families: 8 };
  m.raw = (m.impr7 || 0) * W.impr + (m.clicks7 || 0) * W.clicks + (m.sess7 || 0) * W.sess
        + (m.installs7 || 0) * W.installs + (m.conv7 || 0) * W.conv + (m.families || 0) * W.families;
  // Traffic-only raw (no cumulative families) → used for the this-week-vs-last
  // "momentum" %, which needs a comparable prior-week figure.
  m.trafNow  = (m.impr7 || 0) * W.impr + (m.clicks7 || 0) * W.clicks + (m.sess7 || 0) * W.sess + (m.installs7 || 0) * W.installs + (m.conv7 || 0) * W.conv;
  m.trafPrev = (m.imprPrev || 0) * W.impr + (m.clicksPrev || 0) * W.clicks + (m.sessPrev || 0) * W.sess + (m.installsPrev || 0) * W.installs + (m.convPrev || 0) * W.conv;
  return m;
}

// Build the scorecard text block (used for console + Telegram) and the ordered
// field rows (used for the email). `today` is this run's metrics; `ySnap`/`wSnap`
// are yesterday's / last-week's saved snapshots (null until history accrues).
function buildScorecard(today, ySnap, wSnap, baseline, dateLabel) {
  const baseRaw = baseline?.raw || today.raw || 1;
  const level = baseline ? (100 * today.raw / baseRaw) : 100;
  const isBaseline = !baseline || !ySnap;
  // Growth Index movement
  const idxDoD = (ySnap?.level != null) ? cell(round1(level), ySnap.level) : '—';
  const idxWoW = (wSnap?.level != null) ? cell(round1(level), wSnap.level) : '—';
  // Momentum — this week vs last week, single number, available today.
  const momentum = today.trafPrev > 0
    ? cell(today.trafNow, today.trafPrev)
    : (today.trafNow > 0 ? '▲ new activity' : '– building baseline');

  // rows: [label, nowValue, WoW cell, DoD cell]
  const dod = (key) => ySnap ? cell(today[key], ySnap[key]) : '—';
  const rows = [
    ['SEO impressions 7d', today.impr7,    cell(today.impr7, today.imprPrev),       dod('impr7')],
    ['SEO clicks 7d',      today.clicks7,  cell(today.clicks7, today.clicksPrev),   dod('clicks7')],
    ['Site sessions 7d',   today.sess7,    cell(today.sess7, today.sessPrev),       dod('sess7')],
    ['App installs 7d',    today.installs7,cell(today.installs7, today.installsPrev),dod('installs7')],
    ['Conversions 7d',     today.conv7,    cell(today.conv7, today.convPrev),       dod('conv7')],
    ['Families (total)',   today.families, '—',                                     ySnap ? cell(today.families, ySnap.families) : 'baseline'],
    ['Plans built (total)',today.plans,    '—',                                     ySnap ? cell(today.plans, ySnap.plans) : 'baseline'],
  ];

  // Text block (monospace-ish, plain — renders fine in Telegram & terminal).
  const L = [];
  L.push('📈 GROWTH SCORECARD');
  L.push(`Growth Index: ${round1(level).toFixed(1)}${isBaseline ? '  (baseline set today)' : `   DoD ${idxDoD}  ·  WoW ${idxWoW}`}`);
  L.push(`Momentum (this wk vs last): ${momentum}`);
  L.push('');
  L.push(pad('', 20) + pad('now', 7) + pad('WoW', 10) + 'DoD');
  for (const [label, nv, wow, dd] of rows) L.push(pad(label, 20) + pad(fmt(nv), 7) + pad(wow, 10) + dd);
  if (isBaseline) { L.push(''); L.push('· Baseline set today — daily % moves begin tomorrow.'); L.push('· Weekly (WoW) moves are live now where data exists.'); }

  // Email field rows (label → value), one per metric, WoW + DoD inline.
  const F = {};
  F['▾ 📈 GROWTH SCORECARD'] = isBaseline ? 'baseline set today · weekly moves live now' : `Index ${round1(level).toFixed(1)} · momentum ${momentum}`;
  F['Growth Index'] = `${round1(level).toFixed(1)}${isBaseline ? '  (baseline — climbs from here)' : `   (DoD ${idxDoD} · WoW ${idxWoW})`}`;
  F['Momentum (wk/wk)'] = momentum;
  for (const [label, nv, wow, dd] of rows) F[label] = `${fmt(nv)}    WoW ${wow}${dd !== '—' ? ` · DoD ${dd}` : ''}`;

  return { textLines: L, fields: F, level: round1(level) };
}
const round1 = (n) => Math.round(n * 10) / 10;
const pad = (s, n) => { s = String(s); return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length); };

// ---------------------------------------------------------------- Firestore

// Aggregation count() — cheap, no doc reads. Returns null on error so one bad
// query never kills the report.
async function count(ref) {
  try {
    const s = await ref.count().get();
    return s.data().count;
  } catch (e) {
    console.error('count() failed:', e.message);
    return null;
  }
}

async function firestoreHealth() {
  const families = db.collection('families');
  const [
    familiesTotal, familiesNew24, familiesNew7, withFcm,
    plansTotal, plansNew24, memoriesTotal, memoriesNew24,
    bookingsTotal, bookingsNew24, ordersTotal, ordersNew24,
    voucherOrdersTotal, voucherOrdersNew24,
    placesTotal, screenedTotal, screenedKept, merchantsTotal,
  ] = await Promise.all([
    count(families),
    // families.createdAt is a millis NUMBER (profile.tsx writes Date.now()).
    count(families.where('createdAt', '>=', cut24)),
    count(families.where('createdAt', '>=', cut7)),
    // Push tokens live in users/{uid}.fcmToken (push.ts) — a registered device.
    count(db.collection('users').where('fcmToken', '>', '')),
    // plans/memories live in subcollections → collectionGroup, Timestamp createdAt.
    count(db.collectionGroup('plans')),
    count(db.collectionGroup('plans').where('createdAt', '>=', ts24)),
    count(db.collectionGroup('memories')),
    count(db.collectionGroup('memories').where('createdAt', '>=', ts24)),
    count(db.collection('bookings')),
    count(db.collection('bookings').where('createdAt', '>=', ts24)),
    count(db.collection('orders')),
    count(db.collection('orders').where('createdAt', '>=', ts24)),
    count(db.collection('voucherOrders')),
    count(db.collection('voucherOrders').where('createdAt', '>=', ts24)),
    count(db.collection('places')),
    count(db.collection('screenedPlaces')),
    count(db.collection('screenedPlaces').where('keep', '==', true)),
    count(db.collection('merchants')),
  ]);

  const keptRatio = screenedTotal ? screenedKept / screenedTotal : null;
  return {
    familiesTotal, familiesNew24, familiesNew7, withFcm,
    plansTotal, plansNew24, memoriesTotal, memoriesNew24,
    bookingsTotal, bookingsNew24, ordersTotal, ordersNew24,
    voucherOrdersTotal, voucherOrdersNew24,
    placesTotal, screenedTotal, screenedKept, keptRatio, merchantsTotal,
  };
}

// ---------------------------------------------------------------- GA4

async function ga4() {
  if (!GA4_PROPERTY_ID) return { configured: false };
  // The GA4 Data API authenticates via the service account (FIREBASE_SA_JSON);
  // there is no "GA4 API key". The only GA4-specific value is the NUMERIC
  // property id. Catch a wrong value (e.g. a G-XXXX measurement id or an API key).
  if (!/^\d+$/.test(GA4_PROPERTY_ID)) {
    return { configured: true, error: `GA4 property id must be numeric (GA4 → Admin → Property Settings → Property ID), got "${GA4_PROPERTY_ID}". A G-XXXX measurement id or an API key won't work here.` };
  }
  try {
    const client = new BetaAnalyticsDataClient({
      credentials: { client_email: analyticsSA.client_email, private_key: analyticsSA.private_key },
      projectId: analyticsSA.project_id,
    });
    const property = `properties/${GA4_PROPERTY_ID}`;

    // This GA4 property holds THREE data streams: iOS app, Android app, and the
    // meetspotly.com web stream. Keep app-health app-only (exclude web) so the
    // website's traffic doesn't inflate the app numbers; the website + the tester
    // CTA event are reported separately below.
    const APP_ONLY = { notExpression: { filter: { fieldName: 'platform', stringFilter: { matchType: 'EXACT', value: 'web' } } } };
    const WEB_ONLY = { filter: { fieldName: 'platform', stringFilter: { matchType: 'EXACT', value: 'web' } } };

    const [totals] = await client.runReport({
      property,
      dateRanges: [
        { startDate: 'yesterday', endDate: 'yesterday' },     // date_range_0
        { startDate: '7daysAgo', endDate: 'yesterday' },       // date_range_1 — last 7d
        { startDate: '14daysAgo', endDate: '8daysAgo' },       // date_range_2 — prior 7d (for WoW)
      ],
      metrics: [
        { name: 'activeUsers' }, { name: 'newUsers' },
        { name: 'sessions' }, { name: 'screenPageViews' },
      ],
      dimensionFilter: APP_ONLY,
    });
    // With multiple date ranges, GA4 returns a dateRange dimension; map by it.
    const byRange = {};
    for (const r of totals.rows || []) {
      const rng = r.dimensionValues?.[0]?.value || 'date_range_0';
      byRange[rng] = r.metricValues.map((m) => Number(m.value || 0));
    }
    const d1 = byRange['date_range_0'] || [0, 0, 0, 0];
    const d7 = byRange['date_range_1'] || [null, null, null, null];
    const d7prev = byRange['date_range_2'] || [null, null, null, null];

    // Top acquisition channels over the last 7 days.
    const [chan] = await client.runReport({
      property,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 6,
    });
    const channels = (chan.rows || []).map((r) => ({
      name: r.dimensionValues[0].value,
      sessions: Number(r.metricValues[0].value || 0),
    }));

    // Website-only traffic (meetspotly.com web stream) — yesterday + last 7d.
    const [webR] = await client.runReport({
      property,
      dateRanges: [
        { startDate: 'yesterday', endDate: 'yesterday' },      // date_range_0
        { startDate: '7daysAgo', endDate: 'yesterday' },        // date_range_1 — last 7d
        { startDate: '14daysAgo', endDate: '8daysAgo' },        // date_range_2 — prior 7d (WoW)
      ],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' }],
      dimensionFilter: WEB_ONLY,
    });
    const webBy = {};
    for (const r of webR.rows || []) webBy[r.dimensionValues?.[0]?.value || 'date_range_0'] = r.metricValues.map((m) => Number(m.value || 0));
    const w1 = webBy['date_range_0'] || [0, 0, 0];
    const w7 = webBy['date_range_1'] || [0, 0, 0];
    const w7prev = webBy['date_range_2'] || [0, 0, 0];

    // Tester CTA clicks — the tester_join_click event on the Android beta pages.
    const [tcR] = await client.runReport({
      property,
      dateRanges: [
        { startDate: 'yesterday', endDate: 'yesterday' },
        { startDate: '7daysAgo', endDate: 'yesterday' },
      ],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { matchType: 'EXACT', value: 'tester_join_click' } } },
    });
    const tcBy = {};
    for (const r of tcR.rows || []) tcBy[r.dimensionValues?.[0]?.value || 'date_range_0'] = Number(r.metricValues?.[0]?.value || 0);

    // ── Acquisition conversions — the events analytics.js fires (install intent,
    // get-app, email signup, invites). Counts per event, yesterday + last 7d.
    // Fail-soft: an empty/absent result just shows zeros.
    const CONVERSION_EVENTS = ['store_click', 'get_app_click', 'notify_signup', 'join_open', 'whatsapp_click'];
    const [cvR] = await client.runReport({
      property,
      dateRanges: [
        { startDate: 'yesterday', endDate: 'yesterday' },       // date_range_0
        { startDate: '7daysAgo', endDate: 'yesterday' },         // date_range_1 — last 7d
        { startDate: '14daysAgo', endDate: '8daysAgo' },         // date_range_2 — prior 7d (WoW)
      ],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: CONVERSION_EVENTS } } },
    });
    const conversions = {};
    CONVERSION_EVENTS.forEach((e) => { conversions[e] = { yesterday: 0, last7: 0, last7prev: 0 }; });
    for (const r of cvR.rows || []) {
      const name = r.dimensionValues?.[0]?.value;
      const rng = r.dimensionValues?.[1]?.value || 'date_range_0';
      if (!conversions[name]) continue;
      const slot = rng === 'date_range_1' ? 'last7' : rng === 'date_range_2' ? 'last7prev' : 'yesterday';
      conversions[name][slot] = Number(r.metricValues?.[0]?.value || 0);
    }

    // ── Paid/campaign attribution — web sessions by source/medium+campaign (7d).
    // Once ads run with UTMs, this shows which campaign drove the traffic.
    const [campR] = await client.runReport({
      property,
      dateRanges: [{ startDate: '7daysAgo', endDate: 'yesterday' }],
      dimensions: [{ name: 'sessionSourceMedium' }, { name: 'sessionCampaignName' }],
      metrics: [{ name: 'sessions' }],
      dimensionFilter: WEB_ONLY,
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 6,
    });
    const campaigns = (campR.rows || []).map((r) => ({
      sourceMedium: r.dimensionValues?.[0]?.value || '(unknown)',
      campaign: r.dimensionValues?.[1]?.value || '(none)',
      sessions: Number(r.metricValues?.[0]?.value || 0),
    })).filter((c) => c.sessions > 0);

    return {
      configured: true,
      yesterday: { activeUsers: d1[0], newUsers: d1[1], sessions: d1[2], views: d1[3] },
      last7: { activeUsers: d7[0], newUsers: d7[1], sessions: d7[2], views: d7[3] },
      last7prev: { activeUsers: d7prev[0], newUsers: d7prev[1], sessions: d7prev[2], views: d7prev[3] },
      channels,
      web: { yesterday: { activeUsers: w1[0], sessions: w1[1], views: w1[2] }, last7: { activeUsers: w7[0], sessions: w7[1], views: w7[2] }, last7prev: { activeUsers: w7prev[0], sessions: w7prev[1], views: w7prev[2] } },
      testerClicks: { yesterday: tcBy['date_range_0'] || 0, last7: tcBy['date_range_1'] || 0 },
      conversions,
      campaigns,
    };
  } catch (e) {
    console.error('GA4 failed:', e.message);
    return { configured: true, error: e.message };
  }
}

// ---------------------------------------------------------------- Search Console

const ymd = (t) => new Date(t).toISOString().slice(0, 10);

async function searchConsole() {
  if (!GSC_SITE) return { configured: false };
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: gscSA.client_email, private_key: gscSA.private_key },
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });
    const sc = google.searchconsole({ version: 'v1', auth });
    // GSC data lags ~2 days. Compare the last 7 complete days to the 7 before.
    const curEnd = ymd(now - 2 * DAY), curStart = ymd(now - 9 * DAY);
    const prevEnd = ymd(now - 9 * DAY), prevStart = ymd(now - 16 * DAY);
    const q = (start, end, body) => sc.searchanalytics.query({ siteUrl: GSC_SITE, requestBody: { startDate: start, endDate: end, ...body } });

    const [curTotR, prevTotR, curQR, prevQR, pagesR, daysR] = await Promise.all([
      q(curStart, curEnd, {}),
      q(prevStart, prevEnd, {}),
      q(curStart, curEnd, { dimensions: ['query'], rowLimit: 25 }),
      q(prevStart, prevEnd, { dimensions: ['query'], rowLimit: 25 }),
      q(curStart, curEnd, { dimensions: ['page'], rowLimit: 5 }),
      q(curStart, curEnd, { dimensions: ['date'] }),
    ]);

    const cur = curTotR.data.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const prev = prevTotR.data.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const days = (daysR.data.rows || []).map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions }));

    // Rising queries: biggest impression gain vs the prior week.
    const prevByQ = new Map((prevQR.data.rows || []).map((r) => [r.keys[0], r]));
    const rising = (curQR.data.rows || [])
      .map((r) => ({ q: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position, impDelta: r.impressions - (prevByQ.get(r.keys[0])?.impressions || 0) }))
      .sort((a, b) => b.impDelta - a.impDelta).slice(0, 5);

    // Index coverage from submitted sitemaps (submitted vs indexed urls).
    let coverage = null;
    try {
      const sm = await sc.sitemaps.list({ siteUrl: GSC_SITE });
      let submitted = 0, indexed = 0, errors = 0, warnings = 0, n = 0;
      for (const s of (sm.data.sitemap || [])) {
        n++; errors += Number(s.errors || 0); warnings += Number(s.warnings || 0);
        for (const c of (s.contents || [])) { submitted += Number(c.submitted || 0); indexed += Number(c.indexed || 0); }
      }
      coverage = { sitemaps: n, submitted, indexed, errors, warnings };
    } catch { /* no sitemaps yet */ }

    return {
      configured: true,
      window: { startDate: curStart, endDate: curEnd },
      totals: { clicks: cur.clicks, impressions: cur.impressions, ctr: cur.ctr, position: cur.position },
      prev: { clicks: prev.clicks, impressions: prev.impressions, ctr: prev.ctr, position: prev.position },
      latestDay: days[days.length - 1] || null,
      queries: (curQR.data.rows || []).slice(0, 8).map((r) => ({ q: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position })),
      rising,
      pages: (pagesR.data.rows || []).map((r) => ({ url: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
      coverage,
    };
  } catch (e) {
    console.error('Search Console failed:', e.message);
    return { configured: true, error: e.message };
  }
}

// ---------------------------------------------------------------- App Store (iOS)
// Public iTunes lookup — no auth. Returns rating count/average per store (a proxy
// for reach/traction; it is NOT a download count). Kept from the EC2 report so
// consolidating here doesn't lose the App Store ratings line.
async function appStore() {
  const APP_ID = '6772814230';
  const COUNTRIES = [['kw', 'Kuwait'], ['sa', 'Saudi Arabia'], ['ae', 'UAE'], ['qa', 'Qatar'], ['bh', 'Bahrain'], ['om', 'Oman'], ['eg', 'Egypt']];
  try {
    const out = [];
    for (const [cc, name] of COUNTRIES) {
      try {
        const r = await fetch(`https://itunes.apple.com/lookup?id=${APP_ID}&country=${cc}`, { signal: AbortSignal.timeout(12000) });
        const j = await r.json();
        const x = j.resultCount ? j.results[0] : null;
        if (!x || !x.userRatingCount) continue;
        out.push({ cc: cc.toUpperCase(), name, avg: x.averageUserRating, count: x.userRatingCount });
      } catch { /* per-country failure is non-fatal */ }
    }
    if (!out.length) return { configured: true, empty: true };
    out.sort((a, b) => b.count - a.count);
    const primary = out.find((o) => o.cc === 'KW') || out[0];
    const totalCount = out.reduce((s, o) => s + o.count, 0);
    return { configured: true, primary, byCountry: out, totalCount };
  } catch (e) {
    return { configured: true, error: String(e).slice(0, 120) };
  }
}

// ---------------------------------------------------------------- HTML email

const C = { coral: '#fa7959', ink: '#2b2622', ink2: '#6f675f', line: '#ece7df', bg: '#fcfaf6', card: '#ffffff', good: '#2e7d57' };

function statCard(label, value, sub) {
  return `<td style="padding:6px;" width="33%" valign="top">
    <div style="background:${C.card};border:1px solid ${C.line};border-radius:14px;padding:14px 16px;">
      <div style="font:600 12px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:${C.ink2};text-transform:uppercase;letter-spacing:.04em;">${label}</div>
      <div style="font:700 26px/1.2 -apple-system,Segoe UI,Roboto,sans-serif;color:${C.ink};margin-top:6px;">${value}</div>
      ${sub ? `<div style="font:500 12px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:${C.coral};margin-top:3px;">${sub}</div>` : ''}
    </div></td>`;
}
function cards(items) {
  let rows = '';
  for (let i = 0; i < items.length; i += 3) {
    const group = items.slice(i, i + 3);
    let cell = group.map((it) => statCard(it.label, it.value, it.sub)).join('');
    for (let pad = group.length; pad < 3; pad++) cell += '<td width="33%"></td>'; // pad last row to 3
    rows += `<tr>${cell}</tr>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 -6px;">${rows}</table>`;
}
function sectionTitle(t, note) {
  return `<h2 style="font:700 17px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;color:${C.ink};margin:26px 0 10px;">${t}${note ? `<span style="font:500 13px/1 -apple-system,sans-serif;color:${C.ink2};"> &middot; ${note}</span>` : ''}</h2>`;
}
function listTable(title, rows) {
  if (!rows.length) return '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.card};border:1px solid ${C.line};border-radius:14px;margin-top:8px;">
    ${rows.map((r, i) => `<tr>
      <td style="padding:10px 16px;border-top:${i ? `1px solid ${C.line}` : '0'};font:500 14px/1.3 -apple-system,sans-serif;color:${C.ink};">${r.left}</td>
      <td align="right" style="padding:10px 16px;border-top:${i ? `1px solid ${C.line}` : '0'};font:600 14px/1.3 -apple-system,sans-serif;color:${C.ink2};white-space:nowrap;">${r.right}</td>
    </tr>`).join('')}
  </table>`;
}
const note = (txt) => `<div style="font:500 13px/1.4 -apple-system,sans-serif;color:${C.ink2};background:#fff7f2;border:1px solid #ffe0d2;border-radius:12px;padding:12px 14px;margin-top:8px;">${txt}</div>`;

function buildHtml(h, g, s, dateLabel) {
  const delta = (n) => (n == null ? 'today: n/a' : n ? `+${fmt(n)} today` : 'none today');

  // Traffic — Search Console
  let seo = '';
  if (!s.configured) {
    seo = note('🔌 <b>Not connected yet.</b> Add <code>GSC_SITE</code> (e.g. <code>sc-domain:meetspotly.com</code>) as a secret and grant the service account access in Search Console → Settings → Users.');
  } else if (s.error) {
    seo = note(`⚠️ Couldn't read Search Console: ${s.error}`);
  } else {
    seo = cards([
      { label: 'Clicks (7d)', value: fmt(s.totals.clicks), sub: s.latestDay ? `${fmt(s.latestDay.clicks)} on ${s.latestDay.date}` : '' },
      { label: 'Impressions (7d)', value: fmt(s.totals.impressions) },
      { label: 'Avg position', value: s.totals.position ? s.totals.position.toFixed(1) : '—', sub: `CTR ${pct(s.totals.ctr)}` },
    ]);
    seo += listTable('Top queries', s.queries.map((q) => ({ left: q.q, right: `${fmt(q.clicks)} clk · ${fmt(q.impressions)} imp · #${q.position.toFixed(0)}` })));
    if (s.pages?.length) seo += listTable('Top pages', s.pages.map((p) => ({ left: p.url.replace('https://meetspotly.com', '') || '/', right: `${fmt(p.clicks)} clk · ${fmt(p.impressions)} imp` })));
    seo = `<div style="font:500 12px/1.3 -apple-system,sans-serif;color:${C.ink2};margin-bottom:6px;">Window ${s.window.startDate} → ${s.window.endDate} (Search Console lags ~2 days)</div>` + seo;
  }

  // Traffic — GA4
  let usage = '';
  if (!g.configured) {
    usage = note('🔌 <b>Not connected yet.</b> Add <code>GA4_PROPERTY_ID</code> as a secret and grant the service account Viewer in GA4 → Admin → Property Access Management.');
  } else if (g.error) {
    usage = note(`⚠️ Couldn't read GA4: ${g.error}`);
  } else {
    usage = cards([
      { label: 'App active users (yest.)', value: fmt(g.yesterday.activeUsers), sub: `${fmt(g.last7.activeUsers)} in 7d` },
      { label: 'App new users (yest.)', value: fmt(g.yesterday.newUsers) },
      { label: 'App sessions (yest.)', value: fmt(g.yesterday.sessions), sub: `${fmt(g.yesterday.views)} views` },
    ]);
    // Website (meetspotly.com) + Android tester-CTA clicks — reported separately from the app.
    if (g.web) usage += cards([
      { label: 'Website users (yest.)', value: fmt(g.web.yesterday.activeUsers), sub: `${fmt(g.web.last7.activeUsers)} in 7d` },
      { label: 'Website views (yest.)', value: fmt(g.web.yesterday.views), sub: `${fmt(g.web.last7.views)} in 7d` },
      { label: '“Become a tester” clicks (yest.)', value: fmt(g.testerClicks?.yesterday ?? 0), sub: `${fmt(g.testerClicks?.last7 ?? 0)} in 7d` },
    ]);
    if (g.channels?.length) usage += listTable('Acquisition channels (7d, app + site)', g.channels.map((c) => ({ left: c.name, right: `${fmt(c.sessions)} sessions` })));
  }

  return `<!doctype html><html><body style="margin:0;background:${C.bg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};padding:24px 12px;">
   <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="padding:4px 6px 18px;">
        <div style="font:800 22px/1.1 -apple-system,Segoe UI,Roboto,sans-serif;color:${C.ink};">
          <span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${C.coral};margin-right:8px;"></span>Spotly — daily report
        </div>
        <div style="font:500 13px/1.4 -apple-system,sans-serif;color:${C.ink2};margin-top:4px;">${dateLabel}</div>
      </td></tr>

      <tr><td style="padding:0 6px;">${sectionTitle('App health')}
        ${cards([
          { label: 'Families', value: fmt(h.familiesTotal), sub: delta(h.familiesNew24) },
          { label: 'Active devices', value: fmt(h.withFcm), sub: 'push-registered' },
          { label: 'New (7 days)', value: fmt(h.familiesNew7) },
        ])}
      </td></tr>

      <tr><td style="padding:0 6px;">${sectionTitle('Engagement')}
        ${cards([
          { label: 'Plans built', value: fmt(h.plansTotal), sub: delta(h.plansNew24) },
          { label: 'Memories saved', value: fmt(h.memoriesTotal), sub: delta(h.memoriesNew24) },
          { label: 'Bookings', value: fmt(h.bookingsTotal), sub: delta(h.bookingsNew24) },
        ])}
      </td></tr>

      <tr><td style="padding:0 6px;">${sectionTitle('Catalog & AI screening')}
        ${cards([
          { label: 'Curated places', value: fmt(h.placesTotal) },
          { label: 'AI-vetted (kept)', value: fmt(h.screenedKept), sub: `of ${fmt(h.screenedTotal)} screened` },
          { label: 'Keep rate', value: pct(h.keptRatio) },
        ])}
        ${(h.ordersNew24 || h.voucherOrdersNew24 || h.merchantsTotal) ? listTable('', [
          { left: 'Album orders (total / today)', right: `${fmt(h.ordersTotal)} / ${fmt(h.ordersNew24)}` },
          { left: 'Voucher orders (total / today)', right: `${fmt(h.voucherOrdersTotal)} / ${fmt(h.voucherOrdersNew24)}` },
          { left: 'Merchant accounts', right: fmt(h.merchantsTotal) },
        ]) : ''}
      </td></tr>

      <tr><td style="padding:0 6px;">${sectionTitle('Traffic — organic search', 'meetspotly.com')}${seo}</td></tr>
      <tr><td style="padding:0 6px;">${sectionTitle('Traffic — app & site usage', 'GA4')}${usage}</td></tr>

      <tr><td style="padding:22px 6px 6px;">
        <div style="font:500 12px/1.5 -apple-system,sans-serif;color:${C.ink2};border-top:1px solid ${C.line};padding-top:14px;">
          Phase 1 · Kuwait. Commerce hidden until company registration — album/voucher orders shown for completeness.<br>
          Generated automatically by GitHub Actions.
        </div>
      </td></tr>
    </table>
   </td></tr>
  </table></body></html>`;
}

function buildText(h, g, s, a) {
  const L = [];
  L.push('SPOTLY — DAILY REPORT');
  L.push('');
  L.push('APP HEALTH');
  L.push(`  Families: ${fmt(h.familiesTotal)} (+${fmt(h.familiesNew24)} today, +${fmt(h.familiesNew7)} in 7d)`);
  L.push(`  Active (push-registered) devices: ${fmt(h.withFcm)}`);
  const td = (n) => (n == null ? 'today n/a' : `+${fmt(n)} today`);
  L.push('APP STORE (iOS · all-time ratings)');
  if (a?.error) L.push('  error: ' + a.error);
  else if (a?.empty) L.push('  live — no ratings yet');
  else if (a?.primary) L.push(`  Kuwait: ${a.primary.avg != null ? a.primary.avg.toFixed(2) : '—'}★ (${fmt(a.primary.count)} ratings) · all stores: ${fmt(a.totalCount)}`);
  L.push('ENGAGEMENT');
  L.push(`  Plans built: ${fmt(h.plansTotal)} (${td(h.plansNew24)})`);
  L.push(`  Memories saved: ${fmt(h.memoriesTotal)} (${td(h.memoriesNew24)})`);
  L.push(`  Bookings: ${fmt(h.bookingsTotal)} (${td(h.bookingsNew24)})`);
  L.push('CATALOG & AI SCREENING');
  L.push(`  Curated places: ${fmt(h.placesTotal)}`);
  L.push(`  AI-vetted kept: ${fmt(h.screenedKept)} of ${fmt(h.screenedTotal)} (keep rate ${pct(h.keptRatio)})`);
  L.push(`  Album orders: ${fmt(h.ordersTotal)} (+${fmt(h.ordersNew24)} today) · Voucher orders: ${fmt(h.voucherOrdersTotal)} (+${fmt(h.voucherOrdersNew24)} today)`);
  const dw = (c, p) => (p == null ? '' : ` (${c - p >= 0 ? '+' : ''}${fmt(c - p)} vs prior 7d)`);
  L.push('TRAFFIC — SEARCH CONSOLE (7d vs prior 7d)');
  if (!s.configured) L.push('  (not connected — set GSC_SITE + grant access)');
  else if (s.error) L.push('  error: ' + s.error);
  else {
    L.push(`  Clicks: ${fmt(s.totals.clicks)}${dw(s.totals.clicks, s.prev?.clicks)} · Impressions: ${fmt(s.totals.impressions)}${dw(s.totals.impressions, s.prev?.impressions)}`);
    L.push(`  Avg pos: ${s.totals.position ? s.totals.position.toFixed(1) : '—'}${s.prev?.position ? ` (was ${s.prev.position.toFixed(1)})` : ''} · CTR ${pct(s.totals.ctr)}`);
    if (s.coverage) L.push(`  Indexed: ${fmt(s.coverage.indexed)} of ${fmt(s.coverage.submitted)} submitted${s.coverage.errors ? `, ${fmt(s.coverage.errors)} errors` : ''}`);
    s.queries.slice(0, 5).forEach((q) => L.push(`    "${q.q}" — ${fmt(q.clicks)} clk / ${fmt(q.impressions)} imp / #${q.position.toFixed(0)}`));
    if (s.rising?.length && s.rising[0].impDelta > 0) L.push(`  Rising: "${s.rising[0].q}" +${fmt(s.rising[0].impDelta)} imp`);
  }
  L.push('TRAFFIC — GA4 (7d vs prior 7d)');
  if (!g.configured) L.push('  (not connected — set GA4_PROPERTY + grant access)');
  else if (g.error) L.push('  error: ' + g.error);
  else {
    L.push(`  Yesterday: ${fmt(g.yesterday.activeUsers)} active, ${fmt(g.yesterday.newUsers)} new, ${fmt(g.yesterday.sessions)} sessions`);
    L.push(`  7d active users: ${fmt(g.last7.activeUsers)}${dw(g.last7.activeUsers, g.last7prev?.activeUsers)}`);
  }
  L.push('ACQUISITION — CONVERSIONS (yest · 7d)');
  if (g.configured && !g.error && g.conversions) {
    const c = g.conversions;
    const line = (lbl, k) => L.push(`  ${lbl}: ${fmt(c[k]?.yesterday || 0)} · ${fmt(c[k]?.last7 || 0)}`);
    line('Install intent (store tap)', 'store_click');
    line('Get-app CTA', 'get_app_click');
    line('Waitlist signups', 'notify_signup');
    line('Family invites opened', 'join_open');
    if (g.campaigns?.length) {
      const paid = g.campaigns.filter((x) => x.campaign && x.campaign !== '(none)' && x.campaign !== '(not set)' && x.campaign !== '(organic)');
      (paid.length ? paid : g.campaigns).slice(0, 3).forEach((x) => L.push(`    ${x.campaign} · ${x.sourceMedium} — ${fmt(x.sessions)} sess`));
    }
  } else L.push('  (GA4 not connected — conversions unavailable)');
  L.push('REVENUE (proxy — orders/bookings)');
  L.push(`  Bookings: ${fmt(h.bookingsTotal)} · Album orders: ${fmt(h.ordersTotal)} · Voucher orders: ${fmt(h.voucherOrdersTotal)}`);
  return L.join('\n');
}

// ---------------------------------------------------------------- email fields

// FormSubmit builds the email from posted fields (it can't render custom HTML),
// so the report is sent as an ordered set of label→value rows that FormSubmit's
// `table` template renders. Empty-value keys act as section headers.
function buildFields(h, g, s, a, dateLabel) {
  const td = (n) => (n == null ? 'n/a today' : `+${fmt(n)} today`);
  const f = {};
  f['Date'] = dateLabel;
  f['▾ APP HEALTH'] = ' ';
  f['Families'] = `${fmt(h.familiesTotal)}  (+${fmt(h.familiesNew24)} today · +${fmt(h.familiesNew7)} in 7 days)`;
  f['Active devices'] = `${fmt(h.withFcm)}  (push-registered)`;
  if (a?.primary) f['App Store (iOS)'] = `Kuwait ${a.primary.avg != null ? a.primary.avg.toFixed(2) : '—'}★ (${fmt(a.primary.count)} ratings) · all stores ${fmt(a.totalCount)}`;
  else if (a?.error) f['App Store (iOS)'] = `error: ${a.error}`;
  f['▾ ENGAGEMENT'] = ' ';
  f['Plans built'] = `${fmt(h.plansTotal)}  (${td(h.plansNew24)})`;
  f['Memories saved'] = `${fmt(h.memoriesTotal)}  (${td(h.memoriesNew24)})`;
  f['Bookings'] = `${fmt(h.bookingsTotal)}  (${td(h.bookingsNew24)})`;
  f['▾ CATALOG & AI SCREENING'] = ' ';
  f['Curated places'] = fmt(h.placesTotal);
  f['AI-vetted (kept)'] = `${fmt(h.screenedKept)} of ${fmt(h.screenedTotal)} screened  (keep rate ${pct(h.keptRatio)})`;
  const wow = (cur, prev) => (prev == null || cur == null) ? '' : `  (${cur - prev >= 0 ? '+' : ''}${fmt(cur - prev)} vs prior 7d)`;
  f['▾ TRAFFIC — ORGANIC SEARCH'] = '(meetspotly.com · 7d vs prior 7d)';
  if (s.configured && !s.error) {
    f['Clicks (7d)'] = `${fmt(s.totals.clicks)}${wow(s.totals.clicks, s.prev?.clicks)}`;
    f['Impressions (7d)'] = `${fmt(s.totals.impressions)}${wow(s.totals.impressions, s.prev?.impressions)}`;
    f['Avg position'] = s.totals.position ? `${s.totals.position.toFixed(1)}${s.prev?.position ? `  (was ${s.prev.position.toFixed(1)})` : ''}` : '—';
    f['CTR'] = pct(s.totals.ctr);
    if (s.coverage) f['Pages indexed'] = `${fmt(s.coverage.indexed)} of ${fmt(s.coverage.submitted)} submitted${s.coverage.errors ? `  · ${fmt(s.coverage.errors)} errors` : ''}`;
    if (s.queries?.length) f['Top query'] = `"${s.queries[0].q}" — ${fmt(s.queries[0].clicks)} clk / ${fmt(s.queries[0].impressions)} imp`;
    if (s.rising?.length && s.rising[0].impDelta > 0) f['Rising query'] = `"${s.rising[0].q}" — +${fmt(s.rising[0].impDelta)} impressions vs prior`;
  } else f['Search Console'] = s.error ? `error: ${s.error}` : 'not connected';
  f['▾ TRAFFIC — APP & SITE (GA4)'] = '(7d vs prior 7d)';
  if (g.configured && !g.error) {
    f['Users (yesterday)'] = `${fmt(g.yesterday.activeUsers)} active · ${fmt(g.yesterday.newUsers)} new · ${fmt(g.yesterday.sessions)} sessions · ${fmt(g.yesterday.views)} views`;
    f['Active users (7d)'] = `${fmt(g.last7.activeUsers)}${wow(g.last7.activeUsers, g.last7prev?.activeUsers)}`;
    f['Sessions (7d)'] = `${fmt(g.last7.sessions)}${wow(g.last7.sessions, g.last7prev?.sessions)}`;
    if (g.channels?.length) f['Top channel (7d)'] = `${g.channels[0].name} — ${fmt(g.channels[0].sessions)} sessions`;
  } else f['GA4'] = g.error ? `error: ${g.error}` : 'not connected';

  // Acquisition / conversion funnel — what paid & organic traffic actually did.
  f['▾ ACQUISITION — CONVERSIONS'] = '(yesterday · last 7d)';
  if (g.configured && !g.error && g.conversions) {
    const c = g.conversions;
    const cv = (k) => `${fmt(c[k]?.yesterday || 0)}  ·  ${fmt(c[k]?.last7 || 0)} in 7d`;
    f['Install intent (store tap)'] = cv('store_click');
    f['Get-app CTA'] = cv('get_app_click');
    f['Waitlist signups'] = cv('notify_signup');
    f['Family invites opened'] = cv('join_open');
    if (g.campaigns?.length) {
      const paid = g.campaigns.filter((x) => x.campaign && !['(none)', '(not set)', '(organic)', '(direct)'].includes(x.campaign));
      const top = (paid.length ? paid : g.campaigns).slice(0, 3);
      top.forEach((x, i) => { f[`Campaign ${i + 1} (7d)`] = `${x.campaign} · ${x.sourceMedium} — ${fmt(x.sessions)} sessions`; });
    }
  } else f['Conversions'] = 'GA4 not connected';
  f['▾ REVENUE (proxy)'] = 'orders & bookings — commerce fully on after registration';
  f['Bookings / Album / Voucher'] = `${fmt(h.bookingsTotal)}  /  ${fmt(h.ordersTotal)}  /  ${fmt(h.voucherOrdersTotal)}`;
  return f;
}

// ---------------------------------------------------------------- send (FormSubmit)

async function send(subject, fields) {
  if (process.env.REPORT_DRYRUN) {
    console.log('\n[dry-run] REPORT_DRYRUN set — not sending. Fields:\n');
    console.log(JSON.stringify(fields, null, 2));
    return;
  }
  // Sender priority: Resend (works from any server, incl. EC2) → Web3Forms →
  // FormSubmit (the last two only deliver from a residential IP, e.g. the Mac).
  if (process.env.RESEND_API_KEY) return sendResend(subject, fields);
  if (process.env.WEB3FORMS_KEY) return sendWeb3Forms(subject, fields);
  return sendFormSubmit(subject, fields);
}

async function sendResend(subject, fields) {
  const FROM = process.env.REPORT_FROM || 'Spotly Reports <onboarding@resend.dev>';
  const rows = Object.entries(fields).map(([k, v]) => {
    if (/^▾/.test(k)) return `<tr><td colspan="2" style="padding:14px 0 4px;font:700 12px/1.2 -apple-system,sans-serif;color:#fa7959;text-transform:uppercase;letter-spacing:.05em;">${k.replace(/^▾\s*/, '')}${v && v.trim() ? ` <span style="color:#9a9088;font-weight:500;text-transform:none;">${v}</span>` : ''}</td></tr>`;
    return `<tr><td style="padding:5px 14px 5px 0;color:#6f675f;font:500 14px/1.3 -apple-system,sans-serif;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:5px 0;color:#2b2622;font:600 14px/1.3 -apple-system,sans-serif;">${v}</td></tr>`;
  }).join('');
  const html = `<div style="background:#fcfaf6;padding:24px;"><div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #ece7df;border-radius:16px;padding:22px 24px;"><div style="font:800 20px/1.1 -apple-system,Segoe UI,Roboto,sans-serif;color:#2b2622;"><span style="color:#fa7959;">●</span> Spotly — daily report</div><table style="width:100%;border-collapse:collapse;margin-top:12px;">${rows}</table></div></div>`;
  const text = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: TO_LIST, subject, html, text }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.id) { console.log('Sent via Resend →', TO_LIST.join(', '), body.id); return; }
  console.error('Resend error', res.status, JSON.stringify(body));
  process.exit(1);
}

async function sendWeb3Forms(subject, fields) {
  const res = await fetch('https://api.web3forms.com/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ access_key: process.env.WEB3FORMS_KEY, subject, from_name: 'Spotly Reports', ...fields }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.ok && body.success) { console.log('Sent via Web3Forms →', TO); return; }
  console.error('Web3Forms error', res.status, JSON.stringify(body));
  process.exit(1);
}

async function sendFormSubmit(subject, fields) {
  // FormSubmit AJAX endpoint — no API key. A browser-like User-Agent + Origin/
  // Referer are required: FormSubmit (behind Cloudflare) 403s server-side posts
  // that look like a bot — e.g. GitHub Actions' datacenter IP with a "node" UA.
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Origin: 'https://meetspotly.com',
    Referer: 'https://meetspotly.com/',
  };
  const payload = JSON.stringify({ _subject: subject, _template: 'table', _captcha: 'false', ...fields });
  let body = {};
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(TO)}`, { method: 'POST', headers, body: payload });
    body = await res.json().catch(() => ({}));
    if (body.success === true || body.success === 'true') { console.log('Sent via FormSubmit →', TO); return; }
    // First-time use: FormSubmit emails an "Activate Form" link that must be
    // clicked once. Treat that as a healthy run (delivery resumes after activation).
    if (/activat/i.test(body.message || '')) {
      console.log(`FormSubmit pending activation: ${body.message}\n→ Click the "Activate Form" link emailed to ${TO}, then re-run.`);
      return;
    }
    console.error(`FormSubmit attempt ${attempt} failed (${res.status}):`, JSON.stringify(body));
    if (attempt < 3) await new Promise((r) => setTimeout(r, 2000));
  }
  process.exit(1);
}

// ---------------------------------------------------------------- main

// Optional Telegram push — reuses the TikTok approve-bot channel (same env as
// the KHD SEO pipeline: TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID). Best-effort:
// a missing token or a failed call never breaks the email run.
async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
    console.log(res.ok ? 'Sent via Telegram ✓' : `Telegram error ${res.status}`);
  } catch (e) { console.error('Telegram failed (non-fatal):', e.message); }
}

(async () => {
  const dateLabel = new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuwait' });
  const [h, g, s, a] = await Promise.all([firestoreHealth(), ga4(), searchConsole(), appStore()]);

  // Growth scorecard — leads the report. WoW is live today; DoD + Index deltas
  // populate from tomorrow once yesterday's snapshot exists.
  const today = scorecardMetrics(h, g, s);
  const ySnap = loadSnap(kwDate(now - DAY));
  const wSnap = loadSnap(kwDate(now - 7 * DAY));
  const baseline = earliestSnap();                 // earliest saved day (before we save today)
  const sc = buildScorecard(today, ySnap, wSnap, baseline, dateLabel);

  const text = `${sc.textLines.join('\n')}\n\n${buildText(h, g, s, a)}`;
  console.log(text); // always log to the Actions run for visibility/debugging
  const fields = { ...sc.fields, ...buildFields(h, g, s, a, dateLabel) };
  await send(`Spotly daily report — ${dateLabel}`, fields);
  await sendTelegram(`📊 Spotly — ${dateLabel}\n\n${text}`); // no-op unless TELEGRAM_* set

  // Persist today's snapshot so tomorrow's DoD/Index deltas are real. Skipped on
  // dry-runs so testing never pollutes the real baseline history.
  if (!process.env.REPORT_DRYRUN) {
    saveSnap(kwDate(now), {
      date: kwDate(now), impr7: today.impr7, clicks7: today.clicks7, sess7: today.sess7,
      installs7: today.installs7, conv7: today.conv7, families: today.families,
      plans: today.plans, bookings: today.bookings, raw: today.raw, level: sc.level,
    });
  }
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

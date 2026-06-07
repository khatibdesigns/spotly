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

const TO = process.env.REPORT_TO || 'nader@khatibdesigns.com';
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
const firestoreSA = saFirebase || saGac || saGa4; // prefer a dedicated Firestore SA
const analyticsSA = saGa4 || saGac || saFirebase; // prefer the GA4/GSC SA
if (!firestoreSA) { console.error('FATAL: no service-account credential. Set GA4_KEY (or FIREBASE_SA_JSON / GOOGLE_APPLICATION_CREDENTIALS).'); process.exit(1); }
// Pin the Firestore project so app-health reads Spotly even if the SA's own project differs.
admin.initializeApp({ credential: admin.credential.cert(firestoreSA), projectId: 'spotly-6ca9a' });
const db = admin.firestore();
const Timestamp = admin.firestore.Timestamp;
const ts24 = Timestamp.fromMillis(cut24);

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const pct = (n) => (n == null ? '—' : (n * 100).toFixed(1) + '%');

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

    const [totals] = await client.runReport({
      property,
      dateRanges: [
        { startDate: 'yesterday', endDate: 'yesterday' },
        { startDate: '7daysAgo', endDate: 'yesterday' },
      ],
      metrics: [
        { name: 'activeUsers' }, { name: 'newUsers' },
        { name: 'sessions' }, { name: 'screenPageViews' },
      ],
    });
    const row1 = totals.rows?.find((r) => r.dimensionValues == null) || totals.rows?.[0];
    // With multiple date ranges, GA4 returns a dateRange dimension; map by it.
    const byRange = {};
    for (const r of totals.rows || []) {
      const rng = r.dimensionValues?.[0]?.value || 'date_range_0';
      byRange[rng] = r.metricValues.map((m) => Number(m.value || 0));
    }
    const d1 = byRange['date_range_0'] || (row1 ? row1.metricValues.map((m) => Number(m.value || 0)) : [0, 0, 0, 0]);
    const d7 = byRange['date_range_1'] || [null, null, null, null];

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

    return {
      configured: true,
      yesterday: { activeUsers: d1[0], newUsers: d1[1], sessions: d1[2], views: d1[3] },
      last7: { activeUsers: d7[0], newUsers: d7[1], sessions: d7[2], views: d7[3] },
      channels,
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
      credentials: { client_email: analyticsSA.client_email, private_key: analyticsSA.private_key },
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });
    const sc = google.searchconsole({ version: 'v1', auth });
    // GSC data lags ~2 days. Window: last 7 complete days ending 2 days ago.
    const endDate = ymd(now - 2 * DAY);
    const startDate = ymd(now - 9 * DAY);

    const q = (body) => sc.searchanalytics.query({ siteUrl: GSC_SITE, requestBody: { startDate, endDate, ...body } });

    const [totalsR, queriesR, pagesR, daysR] = await Promise.all([
      q({}),
      q({ dimensions: ['query'], rowLimit: 8 }),
      q({ dimensions: ['page'], rowLimit: 5 }),
      q({ dimensions: ['date'] }),
    ]);

    const tot = totalsR.data.rows?.[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const days = (daysR.data.rows || []).map((r) => ({ date: r.keys[0], clicks: r.clicks, impressions: r.impressions }));
    const latest = days[days.length - 1] || null;

    return {
      configured: true,
      window: { startDate, endDate },
      totals: { clicks: tot.clicks, impressions: tot.impressions, ctr: tot.ctr, position: tot.position },
      latestDay: latest,
      queries: (queriesR.data.rows || []).map((r) => ({ q: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position })),
      pages: (pagesR.data.rows || []).map((r) => ({ url: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
    };
  } catch (e) {
    console.error('Search Console failed:', e.message);
    return { configured: true, error: e.message };
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
      { label: 'Active users (yest.)', value: fmt(g.yesterday.activeUsers), sub: `${fmt(g.last7.activeUsers)} in 7d` },
      { label: 'New users (yest.)', value: fmt(g.yesterday.newUsers) },
      { label: 'Sessions (yest.)', value: fmt(g.yesterday.sessions), sub: `${fmt(g.yesterday.views)} views` },
    ]);
    if (g.channels?.length) usage += listTable('Acquisition channels (7d)', g.channels.map((c) => ({ left: c.name, right: `${fmt(c.sessions)} sessions` })));
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

function buildText(h, g, s) {
  const L = [];
  L.push('SPOTLY — DAILY REPORT');
  L.push('');
  L.push('APP HEALTH');
  L.push(`  Families: ${fmt(h.familiesTotal)} (+${fmt(h.familiesNew24)} today, +${fmt(h.familiesNew7)} in 7d)`);
  L.push(`  Active (push-registered) devices: ${fmt(h.withFcm)}`);
  const td = (n) => (n == null ? 'today n/a' : `+${fmt(n)} today`);
  L.push('ENGAGEMENT');
  L.push(`  Plans built: ${fmt(h.plansTotal)} (${td(h.plansNew24)})`);
  L.push(`  Memories saved: ${fmt(h.memoriesTotal)} (${td(h.memoriesNew24)})`);
  L.push(`  Bookings: ${fmt(h.bookingsTotal)} (${td(h.bookingsNew24)})`);
  L.push('CATALOG & AI SCREENING');
  L.push(`  Curated places: ${fmt(h.placesTotal)}`);
  L.push(`  AI-vetted kept: ${fmt(h.screenedKept)} of ${fmt(h.screenedTotal)} (keep rate ${pct(h.keptRatio)})`);
  L.push(`  Album orders: ${fmt(h.ordersTotal)} (+${fmt(h.ordersNew24)} today) · Voucher orders: ${fmt(h.voucherOrdersTotal)} (+${fmt(h.voucherOrdersNew24)} today)`);
  L.push('TRAFFIC — SEARCH CONSOLE');
  if (!s.configured) L.push('  (not connected — set GSC_SITE + grant access)');
  else if (s.error) L.push('  error: ' + s.error);
  else {
    L.push(`  7d: ${fmt(s.totals.clicks)} clicks, ${fmt(s.totals.impressions)} impressions, avg pos ${s.totals.position?.toFixed(1)}, CTR ${pct(s.totals.ctr)}`);
    s.queries.slice(0, 5).forEach((q) => L.push(`    "${q.q}" — ${fmt(q.clicks)} clk / ${fmt(q.impressions)} imp / #${q.position.toFixed(0)}`));
  }
  L.push('TRAFFIC — GA4');
  if (!g.configured) L.push('  (not connected — set GA4_PROPERTY_ID + grant access)');
  else if (g.error) L.push('  error: ' + g.error);
  else L.push(`  yesterday: ${fmt(g.yesterday.activeUsers)} active, ${fmt(g.yesterday.newUsers)} new, ${fmt(g.yesterday.sessions)} sessions`);
  return L.join('\n');
}

// ---------------------------------------------------------------- email fields

// FormSubmit builds the email from posted fields (it can't render custom HTML),
// so the report is sent as an ordered set of label→value rows that FormSubmit's
// `table` template renders. Empty-value keys act as section headers.
function buildFields(h, g, s, dateLabel) {
  const td = (n) => (n == null ? 'n/a today' : `+${fmt(n)} today`);
  const f = {};
  f['Date'] = dateLabel;
  f['▾ APP HEALTH'] = ' ';
  f['Families'] = `${fmt(h.familiesTotal)}  (+${fmt(h.familiesNew24)} today · +${fmt(h.familiesNew7)} in 7 days)`;
  f['Active devices'] = `${fmt(h.withFcm)}  (push-registered)`;
  f['▾ ENGAGEMENT'] = ' ';
  f['Plans built'] = `${fmt(h.plansTotal)}  (${td(h.plansNew24)})`;
  f['Memories saved'] = `${fmt(h.memoriesTotal)}  (${td(h.memoriesNew24)})`;
  f['Bookings'] = `${fmt(h.bookingsTotal)}  (${td(h.bookingsNew24)})`;
  f['▾ CATALOG & AI SCREENING'] = ' ';
  f['Curated places'] = fmt(h.placesTotal);
  f['AI-vetted (kept)'] = `${fmt(h.screenedKept)} of ${fmt(h.screenedTotal)} screened  (keep rate ${pct(h.keptRatio)})`;
  f['▾ TRAFFIC — ORGANIC SEARCH'] = '(meetspotly.com)';
  if (s.configured && !s.error) {
    f['Search (7d)'] = `${fmt(s.totals.clicks)} clicks · ${fmt(s.totals.impressions)} impressions · avg pos ${s.totals.position ? s.totals.position.toFixed(1) : '—'} · CTR ${pct(s.totals.ctr)}`;
    if (s.queries?.length) f['Top query'] = `"${s.queries[0].q}" — ${fmt(s.queries[0].clicks)} clk / ${fmt(s.queries[0].impressions)} imp`;
  } else f['Search Console'] = s.error ? `error: ${s.error}` : 'not connected';
  f['▾ TRAFFIC — APP & SITE (GA4)'] = ' ';
  if (g.configured && !g.error) {
    f['Users (yesterday)'] = `${fmt(g.yesterday.activeUsers)} active · ${fmt(g.yesterday.newUsers)} new · ${fmt(g.yesterday.sessions)} sessions · ${fmt(g.yesterday.views)} views`;
    f['Active users (7d)'] = fmt(g.last7.activeUsers);
    if (g.channels?.length) f['Top channel (7d)'] = `${g.channels[0].name} — ${fmt(g.channels[0].sessions)} sessions`;
  } else f['GA4'] = g.error ? `error: ${g.error}` : 'not connected';
  return f;
}

// ---------------------------------------------------------------- send (FormSubmit)

async function send(subject, fields) {
  if (process.env.REPORT_DRYRUN) {
    console.log('\n[dry-run] REPORT_DRYRUN set — not sending. Fields:\n');
    console.log(JSON.stringify(fields, null, 2));
    return;
  }
  // FormSubmit AJAX endpoint — no API key. Origin/Referer are required or
  // FormSubmit rejects server-side posts ("open this page through a web server").
  const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(TO)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json',
      Origin: 'https://meetspotly.com', Referer: 'https://meetspotly.com/',
    },
    body: JSON.stringify({ _subject: subject, _template: 'table', _captcha: 'false', ...fields }),
  });
  const body = await res.json().catch(() => ({}));
  if (body.success === true || body.success === 'true') { console.log('Sent via FormSubmit →', TO); return; }
  // First-time use: FormSubmit emails an "Activate Form" link that must be
  // clicked once. Treat that as a healthy run (delivery resumes after activation).
  if (/activat/i.test(body.message || '')) {
    console.log(`FormSubmit pending activation: ${body.message}\n→ Click the "Activate Form" link emailed to ${TO}, then re-run.`);
    return;
  }
  console.error('FormSubmit error', res.status, JSON.stringify(body));
  process.exit(1);
}

// ---------------------------------------------------------------- main

(async () => {
  const dateLabel = new Date(now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kuwait' });
  const [h, g, s] = await Promise.all([firestoreHealth(), ga4(), searchConsole()]);
  console.log(buildText(h, g, s)); // always log to the Actions run for visibility/debugging
  await send(`Spotly daily report — ${dateLabel}`, buildFields(h, g, s, dateLabel));
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });

// Seed a FunZone demo brand so the merchant hierarchy can be tested end-to-end.
// Creates real email/password logins (owner, country manager, branch managers),
// their merchants/{uid} docs, branches (places), sales (voucherOrders) + a
// booking, and ONE pending branch claim to approve.
//
// Idempotent: re-running reuses the same users + overwrites the same docs.
// Uses the app's Firebase web key (Identity Toolkit signUp) + the firebase-tools
// login (Firestore REST, project-owner → bypasses rules).
//
//   node scripts/seed-demo-merchants.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';

const PROJECT = 'spotly-6ca9a';
const CFG = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const PASSWORD = 'Spotly123!';

function webKey() {
  const env = fs.readFileSync(path.join(os.homedir(), 'spotly/.env'), 'utf8');
  const m = env.match(/^EXPO_PUBLIC_FIREBASE_API_KEY=(.*)$/m);
  if (!m) throw new Error('EXPO_PUBLIC_FIREBASE_API_KEY not found in ~/spotly/.env');
  return m[1].trim().replace(/^['"]|['"]$/g, '');
}
async function accessToken() {
  const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: cfg.tokens.refresh_token, grant_type: 'refresh_token' }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('firebase-tools token refresh failed: ' + JSON.stringify(j));
  return j.access_token;
}

// Create (or reuse) an email/password user; returns its uid (localId).
async function ensureUser(key, email, password) {
  let r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: false }),
  });
  let j = await r.json();
  if (j.localId) return j.localId;
  if (j.error && j.error.message === 'EMAIL_EXISTS') {
    r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    j = await r.json();
    if (j.localId) return j.localId;
  }
  throw new Error(`user ${email}: ${JSON.stringify(j.error || j)}`);
}

// JS → Firestore REST value encoding.
function fsVal(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(fsVal) } };
  if (typeof v === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fsVal(x)])) } };
  return { stringValue: String(v) };
}
let TOK;
async function setDocFs(coll, id, obj) {
  const url = `${BASE}/${coll}/${encodeURIComponent(id)}`;
  const r = await fetch(url, {
    method: 'PATCH', headers: { Authorization: `Bearer ${TOK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fsVal(v)])) }),
  });
  if (!r.ok) throw new Error(`${coll}/${id}: ${r.status} ${await r.text()}`);
}
async function delDocFs(coll, id) {
  await fetch(`${BASE}/${coll}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TOK}` } });
}

const EMAILS = ['funzone.owner@spotly.test', 'funzone.kw@spotly.test', 'funzone.avenues@spotly.test', 'funzone.360@spotly.test', 'funzone.marina@spotly.test'];

// `node scripts/seed-demo-merchants.mjs --remove` deletes the demo Firestore docs
// (branches/sales/bookings/team). Auth logins remain — delete them in the
// Firebase console if you want them gone.
async function teardown(key) {
  TOK = await accessToken();
  console.log('Removing demo Firestore data…');
  for (const id of ['demo_funzone_avenues', 'demo_funzone_360', 'demo_funzone_marina']) await delDocFs('places', id);
  for (const id of ['demo_vo_av_1', 'demo_vo_av_2', 'demo_vo_360_1', 'demo_vo_360_2']) await delDocFs('voucherOrders', id);
  for (const id of ['demo_bk_av', 'demo_bk_360']) await delDocFs('bookings', id);
  for (const email of EMAILS) {
    try { const uid = await ensureUser(key, email, PASSWORD); await delDocFs('merchants', uid); } catch (e) {}
  }
  console.log('✅ Demo data removed (branches, sales, bookings, team docs). Auth logins left in place.');
}

async function main() {
  const key = webKey();
  if (process.argv.includes('--remove')) return teardown(key);
  TOK = await accessToken();
  const now = new Date();

  console.log('Creating demo logins…');
  const owner = await ensureUser(key, 'funzone.owner@spotly.test', PASSWORD);
  const cmKW  = await ensureUser(key, 'funzone.kw@spotly.test', PASSWORD);
  const bmAv  = await ensureUser(key, 'funzone.avenues@spotly.test', PASSWORD);
  const bm360 = await ensureUser(key, 'funzone.360@spotly.test', PASSWORD);
  const bmMar = await ensureUser(key, 'funzone.marina@spotly.test', PASSWORD);
  const ORG = owner; // orgId == owner uid

  console.log('Writing team (merchants/{uid})…');
  await setDocFs('merchants', owner, { businessName: 'FunZone', name: 'FunZone HQ',           email: 'funzone.owner@spotly.test',   role: 'owner',           orgId: ORG, scope: {}, createdAt: now });
  await setDocFs('merchants', cmKW,  { businessName: 'FunZone', name: 'Kuwait Manager',        email: 'funzone.kw@spotly.test',      role: 'country_manager', orgId: ORG, scope: { countries: ['KW'] }, createdAt: now });
  await setDocFs('merchants', bmAv,  { businessName: 'FunZone', name: 'Avenues Manager',       email: 'funzone.avenues@spotly.test', role: 'branch_manager',  orgId: ORG, scope: {}, createdAt: now });
  await setDocFs('merchants', bm360, { businessName: 'FunZone', name: '360 Mall Manager',      email: 'funzone.360@spotly.test',     role: 'branch_manager',  orgId: ORG, scope: {}, createdAt: now });
  await setDocFs('merchants', bmMar, { businessName: 'FunZone', name: 'Marina Manager',        email: 'funzone.marina@spotly.test',  role: 'branch_manager',  orgId: ORG, scope: {}, createdAt: now });

  const vouchers = [
    { id: 'v_day', label: 'Day pass', price: 5, value: 7, active: true },
    { id: 'v_value', label: 'Value card', price: 10, value: 15, active: true },
  ];
  const branch = (label, lat, lng, mgr) => ({
    name: `FunZone — ${label}`, branchLabel: label, category: 'Family entertainment center',
    country: 'KW', orgId: ORG, ownerUid: ORG, status: 'approved',
    branchManagerUids: mgr ? [mgr] : [], pendingManagerUids: [],
    lat, lng, photoUrl: `https://picsum.photos/seed/funzone-${label.replace(/\W+/g, '')}/400/300`,
    price: '$$', ages: '0–12', currency: 'KWD', vouchers, promoted: false, promotionRequested: false,
    bookable: true, tone: 'plum', amenities: ['playArea', 'foodOnSite', 'indoor'], createdAt: now,
  });

  console.log('Writing branches (places)…');
  const AV = 'demo_funzone_avenues', M360 = 'demo_funzone_360', MAR = 'demo_funzone_marina';
  await setDocFs('places', AV,   branch('The Avenues', 29.3028, 47.9388, bmAv));
  await setDocFs('places', M360, branch('360 Mall', 29.2647, 48.0130, bm360));
  // A branch the Marina manager self-claimed — PENDING owner/country approval.
  await setDocFs('places', MAR, {
    name: 'FunZone — Marina', branchLabel: 'Marina', category: 'Family entertainment center',
    country: 'KW', orgId: ORG, ownerUid: ORG, status: 'pending',
    branchManagerUids: [], pendingManagerUids: [bmMar],
    lat: 29.3419, lng: 48.0934, photoUrl: 'https://picsum.photos/seed/funzone-marina/400/300',
    price: '$$', currency: 'KWD', vouchers, promoted: false, promotionRequested: false,
    bookable: true, tone: 'plum', amenities: ['playArea'], createdAt: now,
  });

  console.log('Writing sales (voucherOrders) + bookings…');
  const sale = (placeId, placeName, label, price, value, code, status) => ({
    uid: 'demo_customer_1', familyId: 'demo_customer_1', placeId, placeOwnerUid: ORG, placeName,
    currencyCode: 'KWD', price, value, label, code, status, createdAt: now,
  });
  await setDocFs('voucherOrders', 'demo_vo_av_1',  sale(AV,   'FunZone — The Avenues', 'Value card', 10, 15, 'SPOT-AV01', 'paid'));
  await setDocFs('voucherOrders', 'demo_vo_av_2',  sale(AV,   'FunZone — The Avenues', 'Day pass',    5,  7, 'SPOT-AV02', 'redeemed'));
  await setDocFs('voucherOrders', 'demo_vo_360_1', sale(M360, 'FunZone — 360 Mall',    'Value card', 10, 15, 'SPOT-3601', 'paid'));
  await setDocFs('voucherOrders', 'demo_vo_360_2', sale(M360, 'FunZone — 360 Mall',    'Day pass',    5,  7, 'SPOT-3602', 'paid'));
  const booking = (placeId, placeName, code) => ({
    uid: 'demo_customer_1', familyId: 'demo_customer_1', placeId, placeOwnerUid: ORG, placeName,
    familyName: 'Al-Sabah Family', date: '2026-06-05', time: '16:00', adults: 2, kids: 3,
    note: 'Birthday party', status: 'requested', code, createdAt: now,
  });
  await setDocFs('bookings', 'demo_bk_av',  booking(AV,   'FunZone — The Avenues', 'SPOT-BKAV'));
  await setDocFs('bookings', 'demo_bk_360', booking(M360, 'FunZone — 360 Mall',    'SPOT-BK360'));

  console.log('\n✅ Demo seeded. Logins (password for all: ' + PASSWORD + '):');
  console.log('  Owner            funzone.owner@spotly.test');
  console.log('  Country manager  funzone.kw@spotly.test        (Kuwait)');
  console.log('  Branch manager   funzone.avenues@spotly.test   (The Avenues)');
  console.log('  Branch manager   funzone.360@spotly.test       (360 Mall)');
  console.log('  Branch manager   funzone.marina@spotly.test    (Marina — PENDING approval)');
  console.log('\nSign in at https://meetspotly.com/partners');
}
main().catch((e) => { console.error('Seed failed:', e.message); process.exit(1); });

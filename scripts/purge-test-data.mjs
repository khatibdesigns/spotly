// Spotly — purge TEST commerce/seeded data before the Phase-1 store launch.
//
// What it does (idempotent, safe to re-run):
//   1. Strips `vouchers` + `currency` from EVERY `places` doc (all vouchers are
//      test-only right now). Real merchant claims keep their doc — just no offers.
//   2. DELETES seeded claim place docs (the `scripts/seed-claims.mjs` ones):
//      a place doc with `googlePlaceId` but NO real owner/pending-owner/managers
//      → pure test data. Real merchant claims (have ownerUid / pendingOwnerUid /
//      manager arrays) are NEVER deleted.
//   3. DELETES all `voucherOrders` (test purchases) and `orders` (test album orders).
//
// It does NOT touch: families, users, bookings, screenedPlaces (the AI cache),
// events, or any real merchant-owned place doc.
//
// FunZone demo merchants are removed separately:  node scripts/seed-demo-merchants.mjs --remove
//
// Uses the firebase-tools login (project-owner OAuth → Firestore REST, bypasses
// rules). Run:  node scripts/purge-test-data.mjs            (dry run — lists only)
//               node scripts/purge-test-data.mjs --apply    (actually purge)
import fs from 'fs';
import os from 'os';
import path from 'path';

const PROJECT = 'spotly-6ca9a';
const CFG = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const APPLY = process.argv.includes('--apply');

async function accessToken() {
  const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: cfg.tokens.refresh_token, grant_type: 'refresh_token' }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
  return j.access_token;
}

async function listAll(H, coll) {
  const out = [];
  let pageToken;
  do {
    const url = `${BASE}/${coll}?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const r = await fetch(url, { headers: H });
    const j = await r.json();
    if (j.error) throw new Error(`list ${coll}: ${JSON.stringify(j.error)}`);
    (j.documents || []).forEach((d) => out.push(d));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return out;
}

const has = (d, f) => d.fields && d.fields[f] !== undefined;
const arrLen = (d, f) => (has(d, f) && d.fields[f].arrayValue?.values?.length) || 0;

async function main() {
  const tok = await accessToken();
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
  console.log(APPLY ? '⚠️  APPLY MODE — changes WILL be written.\n' : 'DRY RUN — nothing will be changed. Re-run with --apply.\n');

  // 1 + 2) Places
  const places = await listAll(H, 'places');
  let stripped = 0, deleted = 0, kept = 0;
  for (const d of places) {
    const id = d.name.split('/').pop();
    const name = d.fields?.name?.stringValue || id;
    const owned = has(d, 'ownerUid') || has(d, 'pendingOwnerUid') || arrLen(d, 'branchManagerUids') > 0 || arrLen(d, 'pendingManagerUids') > 0;
    const isSeededClaim = has(d, 'googlePlaceId') && !owned;
    if (isSeededClaim) {
      console.log(`  DELETE seeded claim: ${name}`);
      if (APPLY) {
        const r = await fetch(`${BASE}/places/${encodeURIComponent(id)}`, { method: 'DELETE', headers: H });
        if (!r.ok) console.log(`    ✗ ${r.status} ${await r.text()}`);
      }
      deleted++;
      continue;
    }
    if (has(d, 'vouchers') || has(d, 'currency')) {
      console.log(`  STRIP vouchers: ${name}`);
      if (APPLY) {
        const url = `${BASE}/places/${encodeURIComponent(id)}?updateMask.fieldPaths=vouchers&updateMask.fieldPaths=currency`;
        const r = await fetch(url, { method: 'PATCH', headers: H, body: JSON.stringify({ fields: {} }) });
        if (!r.ok) console.log(`    ✗ ${r.status} ${await r.text()}`);
      }
      stripped++;
    } else {
      kept++;
    }
  }

  // 3) voucherOrders + orders (test purchases / album orders)
  let delColl = {};
  for (const coll of ['voucherOrders', 'orders']) {
    const docs = await listAll(H, coll);
    delColl[coll] = docs.length;
    for (const d of docs) {
      const id = d.name.split('/').pop();
      if (APPLY) {
        const r = await fetch(`${BASE}/${coll}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: H });
        if (!r.ok) console.log(`    ✗ delete ${coll}/${id}: ${r.status}`);
      }
    }
  }

  console.log('\n— Summary —');
  console.log(`places: ${places.length} total → ${deleted} seeded-claims deleted, ${stripped} vouchers stripped, ${kept} untouched`);
  console.log(`voucherOrders deleted: ${delColl.voucherOrders}`);
  console.log(`orders deleted: ${delColl.orders}`);
  console.log(APPLY ? '\n✅ Done.' : '\n(DRY RUN — re-run with --apply to perform the purge.)');
  console.log('Also run:  node scripts/seed-demo-merchants.mjs --remove   (to clear FunZone demo)');
}
main().catch((e) => { console.error(e.message); process.exit(1); });

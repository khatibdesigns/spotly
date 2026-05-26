// Seed sample vouchers onto every curated place in Firestore so they show in
// the app. Uses the firebase-tools login token (project-owner OAuth → bypasses
// security rules via the Firestore REST API). Idempotent: re-running overwrites.
import fs from 'fs';
import os from 'os';
import path from 'path';

const PROJECT = 'spotly-6ca9a';
const CFG = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
// Public firebase-tools OAuth client (same one the CLI uses).
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

const SAMPLE = [
  { id: 'v_day',    label: 'Day pass',      price: 5,  value: 7 },
  { id: 'v_arcade', label: 'Arcade card',   price: 10, value: 15 },
  { id: 'v_family', label: 'Family bundle',  price: 20, value: 30 },
];

async function accessToken() {
  const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  const rt = cfg.tokens.refresh_token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: rt, grant_type: 'refresh_token' }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
  return j.access_token;
}

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function voucherValue(v) {
  return { mapValue: { fields: {
    id: { stringValue: v.id },
    label: { stringValue: v.label },
    price: { integerValue: String(v.price) },
    value: { integerValue: String(v.value) },
    active: { booleanValue: true },
  } } };
}

async function main() {
  const tok = await accessToken();
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };

  // List all places (paginated).
  let places = [], pageToken;
  do {
    const url = `${BASE}/places?pageSize=300${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const r = await fetch(url, { headers: H });
    const j = await r.json();
    if (j.error) throw new Error('list failed: ' + JSON.stringify(j.error));
    (j.documents || []).forEach((d) => places.push(d));
    pageToken = j.nextPageToken;
  } while (pageToken);

  console.log(`Found ${places.length} curated places.`);
  let done = 0;
  for (const d of places) {
    const id = d.name.split('/').pop();
    const name = d.fields?.name?.stringValue || id;
    const body = {
      fields: {
        currency: { stringValue: 'KWD' },
        vouchers: { arrayValue: { values: SAMPLE.map(voucherValue) } },
      },
    };
    const url = `${BASE}/places/${id}?updateMask.fieldPaths=currency&updateMask.fieldPaths=vouchers`;
    const r = await fetch(url, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
    if (r.ok) { done++; console.log(`✓ ${name}`); }
    else console.log(`✗ ${name}: ${r.status} ${await r.text()}`);
  }
  console.log(`\nSeeded vouchers on ${done}/${places.length} places.`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });

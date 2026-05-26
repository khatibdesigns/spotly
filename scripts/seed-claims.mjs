// Claim the kid-friendly Google places near Kuwait City (the ones the app shows)
// and attach sample vouchers — so they appear with "View offers" in the app.
// Each place becomes a Firestore claim record whose DOC ID = the Google
// place_id (idempotent) with a googlePlaceId field the app matches on.
// Uses the app's Places key (search) + the firebase-tools login (Firestore REST,
// project-owner → bypasses rules). Re-running is safe (overwrites the same docs).
import fs from 'fs';
import os from 'os';
import path from 'path';

const PROJECT = 'spotly-6ca9a';
const CFG = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
const CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';
const KUWAIT = { latitude: 29.3759, longitude: 47.9774 };
const KID_TYPES = ['park', 'zoo', 'aquarium', 'amusement_park', 'amusement_center', 'museum', 'tourist_attraction'];

// A couple of voucher options per place (KWD): pay → balance on the card.
const VOUCHERS = [
  { id: 'v_day',    label: 'Day pass',      price: 5,  value: 7 },
  { id: 'v_value',  label: 'Value card',    price: 10, value: 15 },
  { id: 'v_family', label: 'Family bundle',  price: 20, value: 30 },
];

function mapsKey() {
  const env = fs.readFileSync(path.join(os.homedir(), 'spotly/.env'), 'utf8');
  const m = env.match(/^EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=(.*)$/m);
  return m[1].trim().replace(/^['"]|['"]$/g, '');
}

async function accessToken() {
  const cfg = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: cfg.tokens.refresh_token, grant_type: 'refresh_token' }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error('token refresh failed: ' + JSON.stringify(j));
  return j.access_token;
}

async function searchNearby(key) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.primaryTypeDisplayName' },
    body: JSON.stringify({ includedTypes: KID_TYPES, maxResultCount: 20, rankPreference: 'POPULARITY',
      locationRestriction: { circle: { center: { latitude: KUWAIT.latitude, longitude: KUWAIT.longitude }, radius: 15000 } } }),
  });
  const j = await res.json();
  if (j.error) throw new Error('places search: ' + j.error.message);
  return j.places || [];
}

const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const voucherValue = (v) => ({ mapValue: { fields: {
  id: { stringValue: v.id }, label: { stringValue: v.label },
  price: { integerValue: String(v.price) }, value: { integerValue: String(v.value) }, active: { booleanValue: true },
} } });

async function main() {
  const key = mapsKey();
  const [tok, places] = await Promise.all([accessToken(), searchNearby(key)]);
  const H = { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
  const top = places.slice(0, 12);
  console.log(`Claiming ${top.length} Google places near Kuwait City…`);
  let done = 0;
  for (const p of top) {
    const id = p.id; // doc id = place_id (idempotent)
    const name = p.displayName?.text || 'Place';
    const body = { fields: {
      name: { stringValue: name },
      category: { stringValue: p.primaryTypeDisplayName?.text || 'Family spot' },
      lat: { doubleValue: p.location?.latitude ?? 0 },
      lng: { doubleValue: p.location?.longitude ?? 0 },
      googlePlaceId: { stringValue: id },
      status: { stringValue: 'approved' },
      promoted: { booleanValue: false },
      promotionRequested: { booleanValue: false },
      bookable: { booleanValue: false },
      tone: { stringValue: 'sun' },
      currency: { stringValue: 'KWD' },
      vouchers: { arrayValue: { values: VOUCHERS.map(voucherValue) } },
      createdAt: { timestampValue: new Date().toISOString() },
    } };
    const url = `${BASE}/places/${encodeURIComponent(id)}`;
    const r = await fetch(url, { method: 'PATCH', headers: H, body: JSON.stringify(body) });
    if (r.ok) { done++; console.log(`✓ ${name}`); }
    else console.log(`✗ ${name}: ${r.status} ${await r.text()}`);
  }
  console.log(`\nClaimed + added vouchers to ${done}/${top.length} places.`);
}
main().catch((e) => { console.error(e.message); process.exit(1); });

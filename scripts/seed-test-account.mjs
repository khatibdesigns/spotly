// Seed a test family (kids + a weekend AI plan + memories) so the Discover/Plan/
// Gallery/Profile screens look populated for App Store screenshots.
//   node scripts/seed-test-account.mjs            (defaults to john.doe@gmail.com)
//   SEED_EMAIL=other@x.com node scripts/seed-test-account.mjs
import fs from 'node:fs';
import admin from 'firebase-admin';

const SA = '/Users/naderalkhatib/spotly/certs/spotly-6ca9a-firebase-adminsdk-fbsvc-32cd52b547.json';
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(SA, 'utf8'))) });
const db = admin.firestore();
const FV = admin.firestore.FieldValue;
const TS = (daysAgo) => admin.firestore.Timestamp.fromMillis(Date.now() - daysAgo * 86400000);

const EMAIL = process.env.SEED_EMAIL || 'john.doe@gmail.com';

const u = await admin.auth().getUserByEmail(EMAIL);
const uid = u.uid;
let familyId = uid;
try { const us = await db.doc(`users/${uid}`).get(); familyId = us.data()?.familyId || uid; } catch {}
console.log(`Seeding ${EMAIL} → uid ${uid} → family ${familyId}`);

// 1) Family profile + kids -----------------------------------------------------
await db.doc(`families/${familyId}`).set({
  homeCity: 'Kuwait City',
  interests: ['Outdoors', 'Animals', 'Arts', 'Water play'],
  kids: [
    { id: 'k1', name: 'Lila', age: 6, dob: '2019-03-14', favFoods: ['Pasta', 'Strawberries'] },
    { id: 'k2', name: 'Sami', age: 3, dob: '2022-05-02', favFoods: ['Bananas', 'Yogurt'] },
  ],
}, { merge: true });
console.log('  ✓ kids + interests + homeCity');

// 2) A weekend AI plan ---------------------------------------------------------
const plansCol = db.collection(`families/${familyId}/plans`);
// clear any existing seed plan first (idempotent)
const existing = await plansCol.where('title', '==', 'This weekend').get();
await Promise.all(existing.docs.map((d) => d.ref.delete()));
await plansCol.add({
  title: 'This weekend',
  dateLabel: 'Saturday · Kuwait',
  status: 'upcoming',
  summary: 'A cool-morning-out, AC-at-midday, sunset-by-the-sea day — built for Lila (6) & Sami (3).',
  tips: ['Bring water + hats for the morning', 'Midday is indoors — it hits 38°'],
  stops: [
    { placeId: 'p1', name: 'Green Family Park', category: 'Park & playground', time: '9:00 AM', tone: 'sage', note: 'Cool morning, before the heat', day: 1, dayLabel: 'Saturday' },
    { placeId: 'p2', name: 'Little Explorers Play', category: 'Indoor soft play', time: '11:30 AM', tone: 'sky', note: 'AC at midday — it’s 38°', day: 1, dayLabel: 'Saturday' },
    { placeId: 'p3', name: 'Olive & Thyme', category: 'Family lunch · kids’ menu', time: '1:30 PM', tone: 'coral', day: 1, dayLabel: 'Saturday' },
    { placeId: 'p4', name: 'Marina Seafront', category: 'Sunset walk by the sea', time: '4:30 PM', tone: 'sun', day: 1, dayLabel: 'Saturday' },
  ],
  createdAt: FV.serverTimestamp(),
});
console.log('  ✓ weekend plan (4 stops)');

// 3) Memories (need real image URLs — Picsum, free/Unsplash-licensed) ----------
const memCol = db.collection(`families/${familyId}/memories`);
const old = await memCol.where('seed', '==', true).get();
await Promise.all(old.docs.map((d) => d.ref.delete()));
const MEM = [
  { placeName: 'Green Family Park', category: 'Park', note: 'Picnic + playground morning', tone: 'sage', s: 'spotlypark9', d: 3, lat: 29.34, lng: 47.94 },
  { placeName: 'Marina Seafront', category: 'Beach', note: 'First swim of spring', tone: 'sky', s: 'spotlybeach4', d: 9, lat: 29.33, lng: 48.05 },
  { placeName: 'Little Explorers', category: 'Indoor play', note: 'Rainy-day soft play', tone: 'plum', s: 'spotlyplay2', d: 16, lat: 29.30, lng: 47.97 },
  { placeName: 'The Aquarium', category: 'Animals', note: 'Sami loved the sharks', tone: 'sky', s: 'spotlyaqua7', d: 24, lat: 29.38, lng: 47.99 },
  { placeName: 'Art Studio', category: 'Arts', note: 'Pottery afternoon', tone: 'plum', s: 'spotlyart1', d: 33, lat: 29.31, lng: 48.02 },
  { placeName: 'Family Farm', category: 'Outdoors', note: 'Feeding the goats', tone: 'sun', s: 'spotlyfarm5', d: 41, lat: 29.28, lng: 47.88 },
];
for (const m of MEM) {
  const url = `https://picsum.photos/seed/${m.s}/900/1100`;
  await memCol.add({
    placeName: m.placeName, category: m.category, note: m.note, tone: m.tone,
    photoUrl: url, photoUrls: [url], city: 'Kuwait City', country: 'Kuwait',
    lat: m.lat, lng: m.lng, seed: true, createdAt: TS(m.d),
  });
}
console.log(`  ✓ ${MEM.length} memories`);
console.log('Done. Open the app on the test account and re-capture Plan + Gallery.');
process.exit(0);

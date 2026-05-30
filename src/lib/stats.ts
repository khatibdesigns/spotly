// Spotly — lightweight place analytics. Customers increment counters on a
// place (profile views, directions clicks); merchants read them in their
// dashboard. Stored at placeStats/{placeId} as a running total PLUS a per-day
// bucket (daily.{YYYY-MM-DD}.{views|clicks}) so the dashboard can chart trends.
// Best-effort — never throws.
import { doc, setDoc, getDoc, increment } from 'firebase/firestore';
import { firestore } from './firebase';

export type DayStat = { views?: number; clicks?: number };
export type PlaceStat = { views?: number; clicks?: number; daily?: Record<string, DayStat> };

function today(): string {
  // Local YYYY-MM-DD (good enough for daily trend buckets).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function bumpPlaceStat(placeId: string | undefined, field: 'views' | 'clicks') {
  if (!firestore || !placeId) return;
  try {
    await setDoc(
      doc(firestore, 'placeStats', placeId),
      { [field]: increment(1), daily: { [today()]: { [field]: increment(1) } } },
      { merge: true }
    );
  } catch {}
}

export async function getPlaceStat(placeId: string): Promise<PlaceStat> {
  if (!firestore || !placeId) return {};
  try {
    const snap = await getDoc(doc(firestore, 'placeStats', placeId));
    return snap.exists() ? (snap.data() as PlaceStat) : {};
  } catch {
    return {};
  }
}

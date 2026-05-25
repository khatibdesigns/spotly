// Spotly — lightweight place analytics. Customers increment counters on a
// place (profile views, directions clicks); merchants read them in their
// dashboard. Stored at placeStats/{placeId}. Best-effort — never throws.
import { doc, setDoc, getDoc, increment } from 'firebase/firestore';
import { firestore } from './firebase';

export type PlaceStat = { views?: number; clicks?: number };

export async function bumpPlaceStat(placeId: string | undefined, field: 'views' | 'clicks') {
  if (!firestore || !placeId) return;
  try {
    await setDoc(doc(firestore, 'placeStats', placeId), { [field]: increment(1) }, { merge: true });
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

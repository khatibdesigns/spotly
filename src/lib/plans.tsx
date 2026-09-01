// Spotly — plans. Stored at families/{uid}/plans/{id} in Firestore, kept live.
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, arrayUnion, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { firestore } from './firebase';
import { useAuth } from './auth';
import { useFamily } from './family';
import { Spot } from './places';
import { Itinerary } from './aiPlan';
import { logEvent } from './analytics';

export type Stop = {
  placeId: string;
  name: string;
  category?: string;
  photoUrl?: string | null;
  tone?: string;
  day?: number;
  dayLabel?: string;
  time?: string | null;
  note?: string | null;
  estCost?: string | null; // approx cost per family (from the AI plan)
  lat?: number | null;
  lng?: number | null;
  rating?: number | null;
  reviews?: number | null;
};
export type Plan = {
  id: string;
  title: string;
  dateLabel: string;
  stops: Stop[];
  status: 'upcoming' | 'done';
  summary?: string;
  tips?: string[];
  multiDay?: boolean;
  startDate?: string; // ISO yyyy-mm-dd of day 1 (AI itineraries)
  createdAt?: any;
};

type PlansState = {
  plans: Plan[];
  loading: boolean;
  addSpotToPlan: (spot: Spot) => Promise<void>;
  saveItinerary: (it: Itinerary) => Promise<void>;
  markDone: (planId: string) => Promise<void>;
  deletePlan: (planId: string) => Promise<void>;
  removeStop: (planId: string, index: number) => Promise<void>;
  moveStop: (planId: string, index: number, dir: 'up' | 'down') => Promise<void>;
  // "I've arrived": shift the rest of a day's stops by how late you reached one.
  // Returns the applied delta in minutes (0 if nothing changed).
  retimeDay: (planId: string, index: number, arrivalMinutes: number) => Promise<number>;
};

const Ctx = createContext<PlansState | null>(null);

// "10:00" / "10:00 AM" / "9 PM" → minutes since midnight, or null if unparseable.
export function parseTimeToMinutes(t?: string | null): number | null {
  if (!t) return null;
  const m = String(t).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

// Format minutes back to a time string, matching whether the source used AM/PM,
// clamped within the same day so a late shift never wraps past midnight.
export function minutesToTime(orig: string | null | undefined, total: number): string {
  total = Math.max(0, Math.min(23 * 60 + 59, total));
  const h = Math.floor(total / 60);
  const min = total % 60;
  if (/am|pm/i.test(String(orig || ''))) {
    const ap = h >= 12 ? 'PM' : 'AM';
    let h12 = h % 12; if (h12 === 0) h12 = 12;
    return `${h12}:${String(min).padStart(2, '0')} ${ap}`;
  }
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function spotToStop(s: Spot): Stop {
  return { placeId: s.id, name: s.name, category: s.category, photoUrl: s.photoUrl || '', tone: s.tone, rating: s.rating ?? null, reviews: s.reviews ?? null, lat: s.lat ?? null, lng: s.lng ?? null };
}

export function PlansProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { familyId } = useFamily();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !firestore || !familyId) {
      setPlans([]);
      setLoading(false);
      return;
    }
    const col = collection(firestore, 'families', familyId, 'plans');
    const unsub = onSnapshot(
      query(col, orderBy('createdAt', 'desc')),
      (snap) => {
        setPlans(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user, familyId]);

  const addSpotToPlan = useCallback(
    async (spot: Spot) => {
      if (!user || !firestore || !familyId) throw new Error('Not signed in');
      const col = collection(firestore, 'families', familyId, 'plans');
      const upcoming = plans.find((p) => p.status === 'upcoming');
      const stop = spotToStop(spot);
      if (upcoming) {
        await updateDoc(doc(firestore, 'families', familyId, 'plans', upcoming.id), { stops: arrayUnion(stop) });
      } else {
        await addDoc(col, { title: 'This weekend', dateLabel: 'This weekend', status: 'upcoming', stops: [stop], createdAt: serverTimestamp() });
      }
    },
    [user, familyId, plans]
  );

  const saveItinerary = useCallback(
    async (it: Itinerary) => {
      if (!user || !firestore || !familyId) throw new Error('Not signed in');
      const stops: Stop[] = [];
      (it.days || []).forEach((d) =>
        (d.stops || []).forEach((s) =>
          stops.push({
            placeId: s.placeId || s.name,
            name: s.name,
            category: s.category || '',
            photoUrl: s.photoUrl ?? null,
            tone: s.tone || 'sun',
            day: d.day,
            dayLabel: d.label,
            time: s.time ?? null,
            note: s.note ?? null,
            estCost: s.estCost ?? null,
            lat: s.lat ?? null,
            lng: s.lng ?? null,
            rating: s.rating ?? null,
            reviews: s.reviews ?? null,
          })
        )
      );
      await addDoc(collection(firestore, 'families', familyId, 'plans'), {
        title: it.title,
        dateLabel: it.destination,
        summary: it.summary || null,
        tips: it.tips || [],
        multiDay: true,
        startDate: it.startDate || null,
        stops,
        status: 'upcoming',
        createdAt: serverTimestamp(),
      });
      logEvent('plan_saved', { title: it.title, stops: stops.length });
    },
    [user, familyId]
  );

  const markDone = useCallback(
    async (planId: string) => {
      if (!user || !firestore || !familyId) return;
      await updateDoc(doc(firestore, 'families', familyId, 'plans', planId), { status: 'done' });
    },
    [user, familyId]
  );

  const deletePlan = useCallback(
    async (planId: string) => {
      if (!user || !firestore || !familyId) return;
      await deleteDoc(doc(firestore, 'families', familyId, 'plans', planId));
    },
    [user, familyId]
  );

  // Remove a single stop by its position in the plan's flat stops array.
  const removeStop = useCallback(
    async (planId: string, index: number) => {
      if (!user || !firestore || !familyId) return;
      const plan = plans.find((p) => p.id === planId);
      if (!plan) return;
      const stops = (plan.stops || []).filter((_, i) => i !== index);
      await updateDoc(doc(firestore, 'families', familyId, 'plans', planId), { stops });
    },
    [user, familyId, plans]
  );

  // Swap a stop with its neighbour. For multi-day plans we only reorder within
  // the same day so the day grouping stays intact.
  const moveStop = useCallback(
    async (planId: string, index: number, dir: 'up' | 'down') => {
      if (!user || !firestore || !familyId) return;
      const plan = plans.find((p) => p.id === planId);
      if (!plan) return;
      const stops = [...(plan.stops || [])];
      const j = dir === 'up' ? index - 1 : index + 1;
      if (j < 0 || j >= stops.length) return;
      if ((stops[j].day ?? 0) !== (stops[index].day ?? 0)) return; // don't cross days
      [stops[index], stops[j]] = [stops[j], stops[index]];
      await updateDoc(doc(firestore, 'families', familyId, 'plans', planId), { stops });
    },
    [user, familyId, plans]
  );

  // "I've arrived" — you reached the stop at `index` at `arrivalMinutes`. Compute how
  // far off its planned time that is and add that delta to every later stop IN THE SAME
  // DAY (so the rest of the day slides to match). Stops with no/unparseable time are left
  // alone. Returns the applied delta in minutes (0 if you were on time).
  const retimeDay = useCallback(
    async (planId: string, index: number, arrivalMinutes: number): Promise<number> => {
      if (!user || !firestore || !familyId) return 0;
      const plan = plans.find((p) => p.id === planId);
      if (!plan) return 0;
      const stops = [...(plan.stops || [])];
      const target = stops[index];
      if (!target) return 0;
      const planned = parseTimeToMinutes(target.time);
      if (planned == null) return 0;
      const delta = arrivalMinutes - planned;
      if (delta === 0) return 0;
      const day = target.day ?? 0;
      for (let i = index; i < stops.length; i++) {
        if ((stops[i].day ?? 0) !== day) continue;
        const m = parseTimeToMinutes(stops[i].time);
        if (m == null) continue;
        stops[i] = { ...stops[i], time: minutesToTime(stops[i].time, m + delta) };
      }
      await updateDoc(doc(firestore, 'families', familyId, 'plans', planId), { stops });
      return delta;
    },
    [user, familyId, plans]
  );

  return <Ctx.Provider value={{ plans, loading, addSpotToPlan, saveItinerary, markDone, deletePlan, removeStop, moveStop, retimeDay }}>{children}</Ctx.Provider>;
}

export function usePlans(): PlansState {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlans must be used within PlansProvider');
  return v;
}

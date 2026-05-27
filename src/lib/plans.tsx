// Spotly — plans. Stored at families/{uid}/plans/{id} in Firestore, kept live.
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, arrayUnion, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { firestore } from './firebase';
import { useAuth } from './auth';
import { useFamily } from './family';
import { Spot } from './places';
import { Itinerary } from './aiPlan';

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
};

const Ctx = createContext<PlansState | null>(null);

function spotToStop(s: Spot): Stop {
  return { placeId: s.id, name: s.name, category: s.category, photoUrl: s.photoUrl || '', tone: s.tone };
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
            placeId: s.name,
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

  return <Ctx.Provider value={{ plans, loading, addSpotToPlan, saveItinerary, markDone, deletePlan, removeStop, moveStop }}>{children}</Ctx.Provider>;
}

export function usePlans(): PlansState {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlans must be used within PlansProvider');
  return v;
}

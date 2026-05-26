// Spotly — saved/bookmarked places. Stored at families/{uid}/saved/{placeId}.
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from './firebase';
import { useAuth } from './auth';
import { useFamily } from './family';
import { Spot } from './places';

export type SavedSpot = {
  id: string;
  name: string;
  category?: string;
  photoUrl?: string;
  lat?: number;
  lng?: number;
  tone?: string;
  city?: string;
};

type SavesState = {
  saved: SavedSpot[];
  savedIds: Set<string>;
  isSaved: (id: string) => boolean;
  toggleSave: (spot: Spot) => Promise<void>;
};

const Ctx = createContext<SavesState | null>(null);

export function SavesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { familyId } = useFamily();
  const [saved, setSaved] = useState<SavedSpot[]>([]);

  useEffect(() => {
    if (!user || !firestore || !familyId) {
      setSaved([]);
      return;
    }
    const col = collection(firestore, 'families', familyId, 'saved');
    const unsub = onSnapshot(col, (snap) => setSaved(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => {});
    return unsub;
  }, [user, familyId]);

  const savedIds = new Set(saved.map((s) => s.id));

  const toggleSave = useCallback(
    async (spot: Spot) => {
      if (!user || !firestore || !familyId) throw new Error('Not signed in');
      const ref = doc(firestore, 'families', familyId, 'saved', spot.id);
      if (savedIds.has(spot.id)) {
        await deleteDoc(ref);
      } else {
        await setDoc(ref, {
          name: spot.name,
          category: spot.category || null,
          photoUrl: spot.photoUrl || null,
          lat: spot.lat ?? null,
          lng: spot.lng ?? null,
          tone: spot.tone || 'sun',
          city: (spot as any).city || null,
          savedAt: serverTimestamp(),
        });
      }
    },
    [user, familyId, savedIds]
  );

  return (
    <Ctx.Provider value={{ saved, savedIds, isSaved: (id) => savedIds.has(id), toggleSave }}>{children}</Ctx.Provider>
  );
}

export function useSaves(): SavesState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSaves must be used within SavesProvider');
  return v;
}

// Spotly — family memories. Photos in Firebase Storage, metadata in Firestore
// (families/{uid}/memories). Drives the Gallery, the Map "places we've been",
// and the passport stats.
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { collection, onSnapshot, addDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { firestore, storage } from './firebase';
import { useAuth } from './auth';
import { useFamily } from './family';

export type Memory = {
  id: string;
  placeId?: string;
  placeName: string;
  category?: string;
  city?: string;
  country?: string;
  note?: string;
  photoUrl: string; // cover / first photo (back-compat — every consumer can use this)
  photoUrls?: string[]; // all photos in this memory (one outing can have several)
  lat?: number;
  lng?: number;
  tone?: string;
  createdAt?: any;
};

// Every photo in a memory (falls back to the single cover for older memories).
export function memoryPhotos(m: Memory | null | undefined): string[] {
  if (!m) return [];
  if (m.photoUrls?.length) return m.photoUrls;
  return m.photoUrl ? [m.photoUrl] : [];
}

export type VisitedPlace = {
  key: string;
  name: string;
  city?: string;
  lat?: number;
  lng?: number;
  tone?: string;
  photoUrl?: string;
  visits: number;
};

export type AddMemoryInput = {
  photoUris: string[];
  placeName: string;
  note?: string;
  city?: string;
  country?: string;
  placeId?: string;
  category?: string;
  lat?: number;
  lng?: number;
  tone?: string;
};

type MemoriesState = {
  memories: Memory[];
  loading: boolean;
  uploading: boolean;
  addMemory: (input: AddMemoryInput) => Promise<void>;
  visited: VisitedPlace[];
  stats: { spots: number; countries: number; weekends: number };
};

const Ctx = createContext<MemoriesState | null>(null);

function isoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((+date - +yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-${week}`;
}

export function MemoriesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { familyId } = useFamily();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!user || !firestore || !familyId) {
      setMemories([]);
      setLoading(false);
      return;
    }
    const col = collection(firestore, 'families', familyId, 'memories');
    const unsub = onSnapshot(
      query(col, orderBy('createdAt', 'desc')),
      (snap) => {
        setMemories(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user, familyId]);

  const addMemory = useCallback(
    async (input: AddMemoryInput) => {
      if (!user || !firestore || !storage || !familyId) throw new Error('Not signed in');
      const uris = (input.photoUris || []).filter(Boolean);
      if (!uris.length) throw new Error('Pick at least one photo.');
      setUploading(true);
      try {
        // RN-reliable local-file → Blob (fetch().blob() is flaky in Hermes).
        const toBlob = (uri: string): Promise<Blob> =>
          new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.onload = () => resolve(xhr.response);
            xhr.onerror = () => reject(new Error('Could not read the selected photo.'));
            xhr.responseType = 'blob';
            xhr.open('GET', uri, true);
            xhr.send(null);
          });
        const stamp = Date.now();
        const photoUrls: string[] = [];
        for (let i = 0; i < uris.length; i++) {
          const blob = await toBlob(uris[i]);
          const r = ref(storage, `families/${familyId}/memories/${stamp}-${i}.jpg`);
          await uploadBytes(r, blob, { contentType: 'image/jpeg' });
          try { (blob as any).close?.(); } catch {}
          photoUrls.push(await getDownloadURL(r));
        }
        await addDoc(collection(firestore, 'families', familyId, 'memories'), {
          placeId: input.placeId || null,
          placeName: input.placeName,
          category: input.category || null,
          city: input.city || null,
          country: input.country || null,
          note: input.note || null,
          lat: input.lat ?? null,
          lng: input.lng ?? null,
          tone: input.tone || 'sun',
          photoUrl: photoUrls[0],
          photoUrls,
          createdAt: serverTimestamp(),
        });
      } finally {
        setUploading(false);
      }
    },
    [user, familyId]
  );

  const visited = useMemo<VisitedPlace[]>(() => {
    const map = new Map<string, VisitedPlace>();
    for (const m of memories) {
      const key = (m.placeId || m.placeName || '').toLowerCase();
      if (!key) continue;
      const existing = map.get(key);
      if (existing) existing.visits += 1;
      else map.set(key, { key, name: m.placeName, city: m.city, lat: m.lat, lng: m.lng, tone: m.tone, photoUrl: m.photoUrl, visits: 1 });
    }
    return [...map.values()];
  }, [memories]);

  const stats = useMemo(() => {
    const countries = new Set(memories.map((m) => m.country).filter(Boolean));
    const weeks = new Set(memories.filter((m) => m.createdAt?.toDate).map((m) => isoWeek(m.createdAt.toDate())));
    return { spots: visited.length, countries: countries.size, weekends: weeks.size };
  }, [memories, visited]);

  return (
    <Ctx.Provider value={{ memories, loading, uploading, addMemory, visited, stats }}>{children}</Ctx.Provider>
  );
}

export function useMemories(): MemoriesState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMemories must be used within MemoriesProvider');
  return v;
}

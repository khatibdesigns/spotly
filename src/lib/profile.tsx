// Spotly — family profile, stored at families/{uid} in Firestore and kept live.
// Replaces all the static "Maya / The Khalils / Léa & Sami" placeholder data.
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { firestore } from './firebase';
import { useAuth } from './auth';

export type Kid = {
  id: string;
  name: string;
  age: number;
  favFoods?: string[]; // foods this child loves
  avoidFoods?: string[]; // foods to avoid (allergies / not allowed)
};

export type Profile = {
  familyName: string;
  parentName: string;
  homeCity: string;
  kids: Kid[];
  interests: string[];
  locationEnabled: boolean;
  plus: boolean;
  stats: { spots: number; countries: number; weekends: number };
  createdAt: number;
};

export const EMPTY_STATS = { spots: 0, countries: 0, weekends: 0 };

type ProfileState = {
  profile: Profile | null;
  loading: boolean;
  hasProfile: boolean;
  saveProfile: (data: Partial<Profile>) => Promise<void>;
};

const Ctx = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !firestore) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = doc(firestore, 'families', user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as Profile) : null);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user]);

  const saveProfile = useCallback(
    async (data: Partial<Profile>) => {
      if (!user || !firestore) throw new Error('Not signed in');
      const ref = doc(firestore, 'families', user.uid);
      await setDoc(ref, { ...data, createdAt: profile?.createdAt ?? Date.now() }, { merge: true });
    },
    [user, profile]
  );

  const value: ProfileState = {
    profile,
    loading,
    hasProfile: !!profile && !!profile.familyName,
    saveProfile,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfile(): ProfileState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useProfile must be used within ProfileProvider');
  return v;
}

// Convenience: the signed-in parent's first name, for greetings.
export function firstName(p: Profile | null, fallback = 'there'): string {
  const n = p?.parentName?.trim();
  if (!n) return fallback;
  return n.split(/\s+/)[0];
}

// Aggregate every child's food likes + foods to avoid across the family,
// de-duplicated (case-insensitive). Drives restaurant recommendations and the
// AI planner prompt.
export function familyFood(p: Profile | null): { likes: string[]; avoid: string[] } {
  const dedup = (xs: string[]) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const x of xs) {
      const t = x.trim();
      const k = t.toLowerCase();
      if (t && !seen.has(k)) { seen.add(k); out.push(t); }
    }
    return out;
  };
  const likes: string[] = [];
  const avoid: string[] = [];
  for (const k of p?.kids || []) {
    (k.favFoods || []).forEach((f) => likes.push(f));
    (k.avoidFoods || []).forEach((f) => avoid.push(f));
  }
  return { likes: dedup(likes), avoid: dedup(avoid) };
}

// "Léa & Sami" from the kids list.
export function kidNames(p: Profile | null): string {
  const names = (p?.kids || []).map((k) => k.name).filter(Boolean);
  if (names.length === 0) return 'your family';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

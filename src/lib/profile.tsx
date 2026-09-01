// Spotly — family profile, stored at families/{uid} in Firestore and kept live.
// Replaces all the static "Maya / The Khalils / Léa & Sami" placeholder data.
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot, setDoc, updateDoc, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { firestore, storage } from './firebase';
import { useAuth } from './auth';
import { useFamily } from './family';

export type Kid = {
  id: string;
  name: string;
  age: number; // kept for back-compat; when `dob` is set, prefer kidAge(dob)
  dob?: string; // ISO yyyy-mm-dd — drives live age + birthday-offer targeting
  favFoods?: string[]; // foods this child loves
  avoidFoods?: string[]; // foods to avoid (allergies / not allowed)
  photoUrl?: string; // this child's photo
};

// Where printed albums ship to (entered at album checkout, reused next time).
export type ShippingAddress = {
  name?: string;
  line1?: string;
  city?: string;
  country?: string;
  phone?: string;
};

// An adult member of the family (the parents). Each signed-in adult who is in
// the family appears here, so a joined partner shows as themselves — not as you.
export type FamilyMember = { uid: string; name: string; photoUrl?: string };

export type Profile = {
  familyName: string;
  parentName: string;
  homeCity: string;
  kids: Kid[];
  members?: FamilyMember[]; // adults in the family (you + anyone who joined)
  interests: string[];
  locationEnabled: boolean;
  plus: boolean;
  photoUrl?: string; // family profile photo (header avatar)
  shippingAddress?: ShippingAddress; // for printed-album delivery
  stats: { spots: number; countries: number; weekends: number };
  createdAt: number;
};

export const EMPTY_STATS = { spots: 0, countries: 0, weekends: 0 };

type ProfileState = {
  profile: Profile | null;
  loading: boolean;
  hasProfile: boolean;
  saveProfile: (data: Partial<Profile>) => Promise<void>;
  uploadAvatar: (uri: string) => Promise<void>; // family header photo
  uploadImage: (uri: string) => Promise<string>; // generic upload → returns URL
};

const Ctx = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { familyId } = useFamily();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Read the SHARED family doc (families/{familyId}); familyId defaults to the
  // user's own uid unless they've joined another family.
  useEffect(() => {
    if (!user || !firestore || !familyId) {
      setProfile(null);
      setLoading(!!user); // keep loading until familyId resolves
      return;
    }
    setLoading(true);
    const ref = doc(firestore, 'families', familyId);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as Profile) : null);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user, familyId]);

  // Make sure the signed-in adult is listed as a family member (with THEIR own
  // name, not the founder's). Runs for the founder and for anyone who joins, so
  // the family shows every adult + the kids. Writes once when missing.
  useEffect(() => {
    if (!user || !firestore || !familyId || !profile) return;
    const members = profile.members || [];
    if (members.some((m) => m.uid === user.uid)) return;
    const name =
      (user.displayName && user.displayName.trim()) ||
      (user.uid === familyId ? (profile.parentName || '').trim() : '') ||
      'Parent';
    updateDoc(doc(firestore, 'families', familyId), {
      members: arrayUnion({ uid: user.uid, name }),
    }).catch(() => {});
  }, [user, familyId, profile]);

  const saveProfile = useCallback(
    async (data: Partial<Profile>) => {
      if (!user || !firestore || !familyId) throw new Error('Not signed in');
      const ref = doc(firestore, 'families', familyId);
      await setDoc(ref, { ...data, createdAt: profile?.createdAt ?? Date.now() }, { merge: true });
    },
    [user, familyId, profile]
  );

  // Upload a picked image to the family's storage and return its URL.
  const uploadImage = useCallback(
    async (uri: string): Promise<string> => {
      if (!user || !firestore || !storage || !familyId) throw new Error('Not signed in');
      // RN-reliable local-file → Blob (fetch().blob() is flaky in Hermes).
      const blob: Blob = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => resolve(xhr.response);
        xhr.onerror = () => reject(new Error('Could not read the selected photo.'));
        xhr.responseType = 'blob';
        xhr.open('GET', uri, true);
        xhr.send(null);
      });
      const r = ref(storage, `families/${familyId}/avatar-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`);
      await uploadBytes(r, blob, { contentType: 'image/jpeg' });
      try { (blob as any).close?.(); } catch {}
      return getDownloadURL(r);
    },
    [user, familyId]
  );

  // Family header photo.
  const uploadAvatar = useCallback(
    async (uri: string) => {
      const url = await uploadImage(uri);
      await saveProfile({ photoUrl: url });
    },
    [uploadImage, saveProfile]
  );

  const value: ProfileState = {
    profile,
    loading,
    hasProfile: !!profile && !!profile.familyName,
    saveProfile,
    uploadAvatar,
    uploadImage,
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

// The CURRENT signed-in adult's first name (from the members list), so a joined
// partner is greeted as themselves rather than the family's founder.
export function myFirstName(p: Profile | null, uid?: string, displayName?: string | null, fallback = 'there'): string {
  const m = (p?.members || []).find((x) => x.uid === uid);
  const n = (m?.name || displayName || p?.parentName || '').trim();
  return n ? n.split(/\s+/)[0] : fallback;
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

// Spotly — shared family membership. All family data lives under
// families/{familyId}; by default familyId == the user's own uid (a solo
// family). Accepting an invite repoints the user's familyId to the inviter's
// family, so both members read/write the same plans, memories, saved & profile.
//
// users/{uid}.familyId  → which family this account belongs to
// familyInvites/{code}  → { familyId, createdBy, status: pending|accepted }
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Linking, Alert } from 'react-native';
import { doc, onSnapshot, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from './firebase';
import { useAuth } from './auth';

function makeInviteCode(): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  let s = '';
  for (let i = 0; i < 8; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

// The shareable invite link. Opens the web /join page, which deep-links into
// the app (spotly://join?code=…) when installed, or shows install info.
export const INVITE_WEB_BASE = 'https://meetspotly.com/join';
export function buildInviteUrl(code: string): string {
  return `${INVITE_WEB_BASE}?code=${encodeURIComponent(code)}`;
}

// Pull an invite code out of any incoming link, whether it's the custom scheme
// (spotly://join?code=ABC) or the universal/web link (https://…/join?code=ABC).
export function extractInviteCode(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/[?&]code=([^&#]+)/i);
  if (m) return decodeURIComponent(m[1]).trim().toUpperCase();
  return null;
}

type FamilyState = {
  familyId: string | null; // the family whose data we read/write
  loading: boolean;
  isOwnFamily: boolean; // familyId === my own uid (I founded / am solo)
  inviteToFamily: () => Promise<string>; // returns the invite code
  joinFamily: (code: string) => Promise<void>;
  leaveFamily: () => Promise<void>;
};

const Ctx = createContext<FamilyState | null>(null);

export function FamilyProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const handledCode = useRef<string | null>(null);

  // Resolve which family this user belongs to (defaults to their own uid).
  useEffect(() => {
    if (!user || !firestore) {
      setFamilyId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      doc(firestore, 'users', user.uid),
      (snap) => {
        const fid = snap.exists() && (snap.data() as any).familyId ? (snap.data() as any).familyId : user.uid;
        setFamilyId(fid);
        setLoading(false);
      },
      () => { setFamilyId(user.uid); setLoading(false); }
    );
    return unsub;
  }, [user]);

  const inviteToFamily = useCallback(async () => {
    if (!user || !firestore || !familyId) throw new Error('Not signed in');
    const code = makeInviteCode();
    await setDoc(doc(firestore, 'familyInvites', code), {
      familyId,
      createdBy: user.uid,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    return code;
  }, [user, familyId]);

  const joinFamily = useCallback(
    async (raw: string) => {
      if (!user || !firestore) throw new Error('Not signed in');
      const code = raw.trim().toUpperCase();
      if (!code) throw new Error('Enter an invite code.');
      const snap = await getDoc(doc(firestore, 'familyInvites', code));
      if (!snap.exists()) throw new Error('That invite code wasn’t found.');
      const d = snap.data() as any;
      if (d.status !== 'pending') throw new Error('That invite has already been used.');
      if (d.familyId === user.uid) throw new Error('That’s already your family.');
      await setDoc(doc(firestore, 'users', user.uid), { familyId: d.familyId }, { merge: true });
      await updateDoc(doc(firestore, 'familyInvites', code), { status: 'accepted', acceptedBy: user.uid, acceptedAt: serverTimestamp() });
      // familyId updates via the users/{uid} snapshot above.
    },
    [user]
  );

  const leaveFamily = useCallback(async () => {
    if (!user || !firestore) return;
    await setDoc(doc(firestore, 'users', user.uid), { familyId: user.uid }, { merge: true });
  }, [user]);

  // Capture an invite code from a deep link (cold start + while running).
  useEffect(() => {
    Linking.getInitialURL().then((u) => {
      const c = extractInviteCode(u);
      if (c) setPendingCode(c);
    }).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => {
      const c = extractInviteCode(url);
      if (c) setPendingCode(c);
    });
    return () => sub.remove();
  }, []);

  // Once signed in, act on a captured invite code: confirm, then join. We wait
  // for familyId so we don't prompt someone to join the family they founded.
  useEffect(() => {
    if (!pendingCode || !user || !familyId) return;
    if (handledCode.current === pendingCode) return;
    handledCode.current = pendingCode;
    const code = pendingCode;
    Alert.alert('Join this family?', 'You were invited to share plans, memories and bookings on Spotly.', [
      { text: 'Not now', style: 'cancel', onPress: () => setPendingCode(null) },
      {
        text: 'Join',
        onPress: () => {
          joinFamily(code)
            .then(() => Alert.alert('Joined', 'You’re now part of the family.'))
            .catch((e) => Alert.alert('Couldn’t join', e?.message || 'That invite didn’t work.'))
            .finally(() => setPendingCode(null));
        },
      },
    ]);
  }, [pendingCode, user, familyId, joinFamily]);

  return (
    <Ctx.Provider value={{ familyId, loading, isOwnFamily: !!user && familyId === user.uid, inviteToFamily, joinFamily, leaveFamily }}>
      {children}
    </Ctx.Provider>
  );
}

export function useFamily(): FamilyState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFamily must be used within FamilyProvider');
  return v;
}

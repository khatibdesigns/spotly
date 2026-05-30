// Spotly — merchant account layer with the org → country → branch hierarchy.
// Same Firebase login as customers; a `merchants/{uid}` doc marks the account as
// a business and carries:
//   role:  'owner' | 'country_manager' | 'branch_manager'
//   orgId: the brand they belong to (the owner's uid)
//   scope: { countries: [...] }   for a country manager
// The BRAND always owns every branch (places.ownerUid == orgId). Branch managers
// are assigned ON the place via branchManagerUids; self-claims land in
// pendingManagerUids until an owner/country manager approves. Mirrors the CRM +
// firestore.rules exactly.
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  doc, onSnapshot, setDoc, updateDoc, addDoc, getDoc, getDocs, collection, query, where, serverTimestamp,
} from 'firebase/firestore';
import { firestore } from './firebase';
import { useAuth } from './auth';
import { SpotKind } from './places';
import { getPlaceStat, PlaceStat } from './stats';
import { Voucher } from './currency';

export type MerchantRole = 'owner' | 'country_manager' | 'branch_manager';
export type Merchant = { businessName: string; role?: MerchantRole; orgId?: string; scope?: any; name?: string; email?: string; createdAt?: any };

export type MerchantPlace = {
  id: string;
  name: string;
  category: string;
  kind?: SpotKind;
  lat?: number;
  lng?: number;
  photoUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  promoted?: boolean;
  promotionRequested?: boolean;
  promotedUntil?: any;
  country?: string;
  branchLabel?: string;
  orgId?: string;
  ownerUid?: string;
  branchManagerUids?: string[];
  pendingManagerUids?: string[];
  live?: boolean; // false → branch taken offline (hidden from customers)
  currency?: string;
  vouchers?: Voucher[];
};

export type MerchantVoucherSale = {
  id: string; uid?: string; placeId?: string; placeName: string;
  currencyCode: string; price: number; value: number; label?: string; code?: string; status: string; createdAt?: any;
};
export type MerchantBooking = {
  id: string; uid?: string; placeId?: string; placeName: string; familyName?: string;
  date: string; time: string; adults: number; kids: number; note?: string; status: string; code?: string; createdAt?: any;
};
export type TeamMember = { id: string; name?: string; email?: string; role?: MerchantRole; scope?: any };
export type TeamInvite = { id: string; role?: MerchantRole; scope?: any; status?: string };

export type NewPlaceInput = {
  name: string; category: string; kind?: SpotKind; lat?: number; lng?: number;
  photoUrl?: string; address?: string; googlePlaceId?: string; country?: string; branchLabel?: string;
};
export type MerchantVerification = { phone?: string; civilIdUrl?: string; docs?: { name: string; url: string }[] };

type MerchantState = {
  merchant: Merchant | null;
  isMerchant: boolean;
  loading: boolean;
  role: MerchantRole | '';
  orgId: string;
  scope: any;
  places: MerchantPlace[];           // approved branches I manage
  pendingPlaces: MerchantPlace[];    // (branch mgr) branches I claimed, awaiting approval
  pendingApprovals: MerchantPlace[]; // (owner/country) branch claims awaiting MY approval
  bookings: MerchantBooking[];
  voucherSales: MerchantVoucherSale[];
  stats: Record<string, PlaceStat>;
  members: TeamMember[];
  invites: TeamInvite[];
  createMerchant: (businessName: string, place: NewPlaceInput, verification?: MerchantVerification) => Promise<void>;
  claimBranch: (place: NewPlaceInput) => Promise<void>; // role-aware: owner/country → live, branch → pending
  requestPromotion: (placeId: string) => Promise<void>;
  markRedeemed: (bookingId: string) => Promise<void>;
  confirmBooking: (bookingId: string) => Promise<void>;
  setPlaceVouchers: (placeId: string, currency: string, vouchers: Voucher[]) => Promise<void>;
  markVoucherRedeemed: (orderId: string) => Promise<void>;
  setLive: (placeId: string, live: boolean) => Promise<void>;
  approveClaim: (placeId: string) => Promise<void>;
  rejectClaim: (placeId: string) => Promise<void>;
  inviteManager: (email: string, role: MerchantRole, scope: any) => Promise<void>;
  removeMember: (uid: string) => Promise<void>;
};

const Ctx = createContext<MerchantState | null>(null);
const effOrg = (p: any) => p.orgId || p.ownerUid || '';

export function MerchantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(true);
  const [allPlaces, setAllPlaces] = useState<MerchantPlace[]>([]);
  const [bookings, setBookings] = useState<MerchantBooking[]>([]);
  const [voucherSales, setVoucherSales] = useState<MerchantVoucherSale[]>([]);
  const [stats, setStats] = useState<Record<string, PlaceStat>>({});
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);

  const role = (merchant?.role || (merchant ? 'owner' : '')) as MerchantRole | '';
  const orgId = merchant?.orgId || user?.uid || '';
  const scope = merchant?.scope || {};
  const myCountries: string[] = scope?.countries || [];

  // merchants/{uid} — accept a pending email invite if there's no doc yet.
  useEffect(() => {
    if (!user || !firestore) { setMerchant(null); setLoading(false); return; }
    setLoading(true);
    const db = firestore; // capture non-null for the async closure below
    const email = (user.email || '').toLowerCase();
    const unsub = onSnapshot(
      doc(db, 'merchants', user.uid),
      async (snap) => {
        if (snap.exists()) { setMerchant(snap.data() as Merchant); setLoading(false); return; }
        // No merchant doc — provision from an invite for this email, if any.
        if (email) {
          try {
            const inv = await getDoc(doc(db, 'merchantInvites', email));
            if (inv.exists()) {
              const d = inv.data() as any;
              await setDoc(doc(db, 'merchants', user.uid), {
                businessName: d.businessName || '', name: user.displayName || '', email,
                role: d.role, orgId: d.orgId, scope: d.scope || {}, createdAt: serverTimestamp(),
              }, { merge: true });
              try { await updateDoc(doc(db, 'merchantInvites', email), { status: 'accepted', acceptedUid: user.uid, acceptedAt: serverTimestamp() }); } catch {}
              return; // snapshot will refire with the new doc
            }
          } catch {}
        }
        setMerchant(null); setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user]);

  // All curated/claimed places (small collection; the app filters by role). The
  // customer screening cache lives in a different collection, not here.
  useEffect(() => {
    if (!user || !firestore || !merchant) { setAllPlaces([]); return; }
    const unsub = onSnapshot(collection(firestore, 'places'),
      (snap) => setAllPlaces(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
      () => {});
    return unsub;
  }, [user, merchant]);

  // Split places by role (mirrors firestore.rules scopesPlace()).
  const { places, pendingPlaces, pendingApprovals } = useMemo(() => {
    const uid = user?.uid || '';
    const inMyOrg = (p: any) => effOrg(p) === orgId && orgId !== '';
    const isOrgMgr = (p: any) => role === 'owner' ? inMyOrg(p)
      : role === 'country_manager' ? (inMyOrg(p) && myCountries.includes(p.country || ''))
      : false;
    const isBranchMgr = (p: any) => (p.branchManagerUids || []).includes(uid);
    let managed: MerchantPlace[] = [];
    let mine_pending: MerchantPlace[] = [];
    let approvals: MerchantPlace[] = [];
    for (const p of allPlaces) {
      const orgMgr = isOrgMgr(p), branchMgr = isBranchMgr(p);
      if (orgMgr || branchMgr) {
        if (p.status === 'pending' && (p.pendingManagerUids || []).includes(uid)) mine_pending.push(p);
        else managed.push(p);
      } else if ((p.pendingManagerUids || []).includes(uid)) {
        mine_pending.push(p); // branch I self-claimed, not yet approved (not in my org-managed set)
      }
      if (orgMgr && (p.pendingManagerUids || []).length) approvals.push(p);
    }
    return { places: managed, pendingPlaces: mine_pending, pendingApprovals: approvals };
  }, [allPlaces, role, orgId, user, JSON.stringify(myCountries)]);

  const managedIds = useMemo(() => places.map((p) => p.id), [places]);

  // Bookings + voucher sales. Owner = everything routed to the brand
  // (placeOwnerUid); managers = scoped to the branches they manage (placeId).
  useEffect(() => {
    if (!user || !firestore || !merchant) { setBookings([]); return; }
    if (role === 'owner') {
      const q = query(collection(firestore, 'bookings'), where('placeOwnerUid', '==', user.uid));
      return onSnapshot(q, (snap) => setBookings(sortByCreated(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))), () => {});
    }
    let cancelled = false;
    fetchByPlaceIds('bookings', managedIds).then((rows) => { if (!cancelled) setBookings(sortByCreated(rows)); });
    return () => { cancelled = true; };
  }, [user, merchant, role, JSON.stringify(managedIds)]);

  useEffect(() => {
    if (!user || !firestore || !merchant) { setVoucherSales([]); return; }
    if (role === 'owner') {
      const q = query(collection(firestore, 'voucherOrders'), where('placeOwnerUid', '==', user.uid));
      return onSnapshot(q, (snap) => setVoucherSales(sortByCreated(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))), () => {});
    }
    let cancelled = false;
    fetchByPlaceIds('voucherOrders', managedIds).then((rows) => { if (!cancelled) setVoucherSales(sortByCreated(rows)); });
    return () => { cancelled = true; };
  }, [user, merchant, role, JSON.stringify(managedIds)]);

  // Team (owner/country see their org's members + pending invites).
  useEffect(() => {
    if (!user || !firestore || !merchant || (role !== 'owner' && role !== 'country_manager')) { setMembers([]); setInvites([]); return; }
    const um = onSnapshot(query(collection(firestore, 'merchants'), where('orgId', '==', orgId)),
      (snap) => setMembers(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => {});
    const ui = onSnapshot(query(collection(firestore, 'merchantInvites'), where('orgId', '==', orgId)),
      (snap) => setInvites(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).filter((i: any) => i.status !== 'accepted')), () => {});
    return () => { um(); ui(); };
  }, [user, merchant, role, orgId]);

  // View/click counters for managed places.
  useEffect(() => {
    let cancelled = false;
    if (!places.length) { setStats({}); return; }
    Promise.all(places.map((p) => getPlaceStat(p.id).then((s) => [p.id, s] as const)))
      .then((entries) => { if (!cancelled) setStats(Object.fromEntries(entries)); }).catch(() => {});
    return () => { cancelled = true; };
  }, [JSON.stringify(managedIds)]);

  // ---- Actions ----
  const createMerchant = useCallback(async (businessName: string, place: NewPlaceInput, verification?: MerchantVerification) => {
    if (!user || !firestore) throw new Error('Not signed in');
    await setDoc(doc(firestore, 'merchants', user.uid),
      { businessName: businessName.trim(), role: 'owner', orgId: user.uid, scope: {}, email: (user.email || '').toLowerCase(), verification: verification || null, createdAt: serverTimestamp() },
      { merge: true });
    await claimInto(place, 'owner', user.uid, user.uid, verification);
  }, [user]);

  // Claim a branch INTO the brand org. Owner/country → live; branch mgr → pending.
  const claimInto = useCallback(async (place: NewPlaceInput, r: MerchantRole | '', myOrg: string, uid: string, verification?: MerchantVerification) => {
    if (!firestore) throw new Error('Not configured');
    const branchMgr = r === 'branch_manager';
    const base: any = {
      name: place.name, category: place.category, kind: place.kind || 'activity',
      lat: place.lat ?? null, lng: place.lng ?? null, photoUrl: place.photoUrl || null, address: place.address || null,
      country: place.country || (myCountries[0] || ''), branchLabel: place.branchLabel || null,
      orgId: myOrg, ownerUid: myOrg,
      status: branchMgr ? 'pending' : 'approved',
      branchManagerUids: branchMgr ? [] : [], pendingManagerUids: branchMgr ? [uid] : [],
      promoted: false, promotionRequested: false, bookable: false, tone: 'plum', currency: 'KWD', vouchers: [],
      createdAt: serverTimestamp(),
    };
    if (verification) {
      base.ownerPhone = verification.phone || null; base.ownerCivilIdUrl = verification.civilIdUrl || null; base.ownerDocs = verification.docs || [];
    }
    const gid = place.googlePlaceId;
    if (gid) {
      const ref = doc(firestore, 'places', gid);
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const d = snap.data() as any;
        if (effOrg(d) === myOrg) throw new Error('That branch is already in your brand.');
        throw new Error('That place is already claimed by another business.');
      }
      await setDoc(ref, { ...base, googlePlaceId: gid });
      return;
    }
    await addDoc(collection(firestore, 'places'), base);
  }, [JSON.stringify(myCountries)]);

  const claimBranch = useCallback((place: NewPlaceInput) => claimInto(place, role, orgId, user?.uid || ''), [claimInto, role, orgId, user]);

  const requestPromotion = useCallback(async (placeId: string) => {
    if (!user || !firestore) throw new Error('Not signed in');
    const place = places.find((p) => p.id === placeId);
    await updateDoc(doc(firestore, 'places', placeId), { promotionRequested: true });
    await addDoc(collection(firestore, 'promotionRequests'), { placeId, ownerUid: user.uid, placeName: place?.name || '', status: 'requested', createdAt: serverTimestamp() });
  }, [user, places]);

  const markRedeemed = useCallback(async (bookingId: string) => { if (firestore) await updateDoc(doc(firestore, 'bookings', bookingId), { status: 'redeemed', redeemedAt: serverTimestamp() }); }, []);
  const confirmBooking = useCallback(async (bookingId: string) => { if (firestore) await updateDoc(doc(firestore, 'bookings', bookingId), { status: 'confirmed' }); }, []);
  const markVoucherRedeemed = useCallback(async (orderId: string) => { if (firestore) await updateDoc(doc(firestore, 'voucherOrders', orderId), { status: 'redeemed', redeemedAt: serverTimestamp() }); }, []);
  const setLive = useCallback(async (placeId: string, live: boolean) => { if (firestore) await updateDoc(doc(firestore, 'places', placeId), { live }); }, []);

  const setPlaceVouchers = useCallback(async (placeId: string, currency: string, vouchers: Voucher[]) => {
    if (!firestore) return;
    const clean = vouchers.map((v) => ({ id: v.id, price: Number(v.price) || 0, value: Number(v.value) || 0, label: v.label?.trim() || '', active: v.active !== false }));
    await updateDoc(doc(firestore, 'places', placeId), { currency, vouchers: clean });
  }, []);

  // Owner/country manager approves a self-claimed branch → live + assigns the manager.
  const approveClaim = useCallback(async (placeId: string) => {
    if (!firestore) return;
    const p = allPlaces.find((x) => x.id === placeId); if (!p) return;
    const approved = Array.from(new Set([...(p.branchManagerUids || []), ...(p.pendingManagerUids || [])]));
    await updateDoc(doc(firestore, 'places', placeId), { branchManagerUids: approved, pendingManagerUids: [], status: 'approved' });
  }, [allPlaces]);

  const rejectClaim = useCallback(async (placeId: string) => {
    if (!firestore) return;
    const p = allPlaces.find((x) => x.id === placeId); if (!p) return;
    await updateDoc(doc(firestore, 'places', placeId), { pendingManagerUids: [] });
  }, [allPlaces]);

  const inviteManager = useCallback(async (email: string, r: MerchantRole, sc: any) => {
    if (!user || !firestore) throw new Error('Not signed in');
    const id = email.trim().toLowerCase();
    await setDoc(doc(firestore, 'merchantInvites', id),
      { orgId, role: r, scope: sc || {}, businessName: merchant?.businessName || '', invitedBy: user.uid, invitedByEmail: (user.email || '').toLowerCase(), status: 'pending', createdAt: serverTimestamp() },
      { merge: true });
  }, [user, orgId, merchant]);

  const removeMember = useCallback(async (uid: string) => { if (firestore) await import('firebase/firestore').then(({ deleteDoc, doc: d }) => deleteDoc(d(firestore!, 'merchants', uid))); }, []);

  const value = useMemo<MerchantState>(() => ({
    merchant, isMerchant: !!merchant, loading, role, orgId, scope,
    places, pendingPlaces, pendingApprovals, bookings, voucherSales, stats, members, invites,
    createMerchant, claimBranch, requestPromotion, markRedeemed, confirmBooking, setPlaceVouchers, markVoucherRedeemed, setLive, approveClaim, rejectClaim, inviteManager, removeMember,
  }), [merchant, loading, role, orgId, scope, places, pendingPlaces, pendingApprovals, bookings, voucherSales, stats, members, invites, createMerchant, claimBranch, requestPromotion, markRedeemed, confirmBooking, setPlaceVouchers, markVoucherRedeemed, setLive, approveClaim, rejectClaim, inviteManager, removeMember]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function sortByCreated<T extends { createdAt?: any }>(rows: T[]): T[] {
  return rows.sort((a, b) => ((b.createdAt as any)?.toMillis?.() || 0) - ((a.createdAt as any)?.toMillis?.() || 0));
}
// Fetch docs whose placeId is in the given ids (chunked — `in` caps at 30).
async function fetchByPlaceIds(name: string, placeIds: string[]): Promise<any[]> {
  if (!firestore || !placeIds.length) return [];
  const out: any[] = [];
  for (let i = 0; i < placeIds.length; i += 30) {
    const chunk = placeIds.slice(i, i + 30);
    try {
      const snap = await getDocs(query(collection(firestore, name), where('placeId', 'in', chunk)));
      snap.forEach((d) => out.push({ id: d.id, ...(d.data() as any) }));
    } catch {}
  }
  return out;
}

export function useMerchant(): MerchantState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMerchant must be used within MerchantProvider');
  return v;
}

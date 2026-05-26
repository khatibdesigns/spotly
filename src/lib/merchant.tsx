// Spotly — merchant account layer. Same Firebase login as customers; a
// `merchants/{uid}` doc marks the account as a business. Merchants own places
// (places/{id}.ownerUid == uid), see bookings for those places, and can request
// paid promotion (an admin flips it live from the CRM).
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  doc, onSnapshot, setDoc, updateDoc, addDoc, getDocs, collection, query, where, serverTimestamp,
} from 'firebase/firestore';
import { firestore } from './firebase';
import { useAuth } from './auth';
import { SpotKind } from './places';
import { getPlaceStat, PlaceStat } from './stats';
import { Voucher } from './currency';

export type Merchant = { businessName: string; createdAt?: any };

export type MerchantPlace = {
  id: string;
  name: string;
  category: string;
  kind: SpotKind;
  lat?: number;
  lng?: number;
  photoUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  promoted?: boolean;
  promotionRequested?: boolean;
  promotedUntil?: any;
  currency?: string; // ISO code the place sells vouchers in
  vouchers?: Voucher[]; // prepaid offers sold on the place page
};

// A purchased voucher (one redeemable card) for a place this merchant owns.
export type MerchantVoucherSale = {
  id: string;
  uid?: string;
  placeId?: string;
  placeName: string;
  currencyCode: string;
  price: number;
  value: number;
  label?: string;
  code?: string;
  status: string; // paid | redeemed
  createdAt?: any;
};

export type MerchantBooking = {
  id: string;
  uid?: string; // the customer who booked (for unique-client counts)
  placeId?: string;
  placeName: string;
  familyName?: string;
  date: string;
  time: string;
  adults: number;
  kids: number;
  note?: string;
  status: string; // requested | confirmed | redeemed
  code?: string;
  createdAt?: any;
};

export type NewPlaceInput = {
  name: string;
  category: string;
  kind: SpotKind;
  lat?: number;
  lng?: number;
  photoUrl?: string;
  address?: string;
  googlePlaceId?: string; // links the claim to the real Google listing
};

export type MerchantVerification = {
  phone?: string;
  civilIdUrl?: string;
  docs?: { name: string; url: string }[]; // registration / supporting PDFs or images
};

type MerchantState = {
  merchant: Merchant | null;
  isMerchant: boolean;
  loading: boolean;
  places: MerchantPlace[]; // approved ownership (ownerUid == me)
  pendingPlaces: MerchantPlace[]; // claimed, awaiting admin approval
  bookings: MerchantBooking[];
  voucherSales: MerchantVoucherSale[];
  stats: Record<string, PlaceStat>; // placeId → { views, clicks }
  createMerchant: (businessName: string, place: NewPlaceInput, verification?: MerchantVerification) => Promise<void>;
  addPlace: (place: NewPlaceInput) => Promise<void>;
  requestPromotion: (placeId: string) => Promise<void>;
  markRedeemed: (bookingId: string) => Promise<void>;
  confirmBooking: (bookingId: string) => Promise<void>;
  // Save the currency + voucher list for a place this merchant owns.
  setPlaceVouchers: (placeId: string, currency: string, vouchers: Voucher[]) => Promise<void>;
  markVoucherRedeemed: (orderId: string) => Promise<void>;
};

const Ctx = createContext<MerchantState | null>(null);

export function MerchantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(true);
  const [places, setPlaces] = useState<MerchantPlace[]>([]);
  const [pendingPlaces, setPendingPlaces] = useState<MerchantPlace[]>([]);
  const [bookings, setBookings] = useState<MerchantBooking[]>([]);
  const [voucherSales, setVoucherSales] = useState<MerchantVoucherSale[]>([]);
  const [stats, setStats] = useState<Record<string, PlaceStat>>({});

  // merchants/{uid}
  useEffect(() => {
    if (!user || !firestore) {
      setMerchant(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      doc(firestore, 'merchants', user.uid),
      (snap) => {
        setMerchant(snap.exists() ? (snap.data() as Merchant) : null);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return unsub;
  }, [user]);

  // My places (places/{id} where ownerUid == me) — approved ownership.
  useEffect(() => {
    if (!user || !firestore || !merchant) {
      setPlaces([]);
      return;
    }
    const q = query(collection(firestore, 'places'), where('ownerUid', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => setPlaces(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => {});
    return unsub;
  }, [user, merchant]);

  // Places I've claimed that are awaiting admin approval (pendingOwnerUid == me).
  useEffect(() => {
    if (!user || !firestore || !merchant) {
      setPendingPlaces([]);
      return;
    }
    const q = query(collection(firestore, 'places'), where('pendingOwnerUid', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => setPendingPlaces(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => {});
    return unsub;
  }, [user, merchant]);

  // Bookings for my places (bookings where placeOwnerUid == me)
  useEffect(() => {
    if (!user || !firestore || !merchant) {
      setBookings([]);
      return;
    }
    // No orderBy (avoids a composite index requirement); sort client-side.
    const q = query(collection(firestore, 'bookings'), where('placeOwnerUid', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        rows.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setBookings(rows);
      },
      (e) => console.warn('merchant bookings query', e?.message)
    );
    return unsub;
  }, [user, merchant]);

  // Voucher sales for my places (voucherOrders where placeOwnerUid == me).
  useEffect(() => {
    if (!user || !firestore || !merchant) {
      setVoucherSales([]);
      return;
    }
    const q = query(collection(firestore, 'voucherOrders'), where('placeOwnerUid', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as MerchantVoucherSale[];
        rows.sort((a, b) => ((b.createdAt as any)?.toMillis?.() || 0) - ((a.createdAt as any)?.toMillis?.() || 0));
        setVoucherSales(rows);
      },
      (e) => console.warn('merchant voucherOrders query', e?.message)
    );
    return unsub;
  }, [user, merchant]);

  // Pull view/click counters for each owned place (refreshes when places change).
  useEffect(() => {
    let cancelled = false;
    if (!places.length) { setStats({}); return; }
    Promise.all(places.map((p) => getPlaceStat(p.id).then((s) => [p.id, s] as const)))
      .then((entries) => { if (!cancelled) setStats(Object.fromEntries(entries)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [places]);

  // Claim a place as a PENDING ownership request (no duplicates). If a doc
  // already exists for this Google place_id, attach pendingOwnerUid to it (the
  // admin approves ownership in the CRM); else create a fresh doc keyed by the
  // place_id. The merchant only becomes the real owner once an admin approves,
  // at which point orders for the place route to them automatically.
  const claimOrCreatePlace = useCallback(
    async (place: NewPlaceInput, verification?: MerchantVerification) => {
      if (!user || !firestore) throw new Error('Not signed in');
      const pending = {
        pendingOwnerUid: user.uid,
        pendingOwnerPhone: verification?.phone || null,
        pendingOwnerDocs: verification?.docs || [],
        pendingOwnerCivilIdUrl: verification?.civilIdUrl || null,
      };
      const gid = place.googlePlaceId;
      if (gid) {
        const snap = await getDocs(query(collection(firestore, 'places'), where('googlePlaceId', '==', gid)));
        const existing = snap.docs[0];
        if (existing) {
          const d = existing.data() as any;
          if (d.ownerUid === user.uid) return; // already mine
          if (d.ownerUid) throw new Error('That place has already been claimed by another business.');
          if (d.pendingOwnerUid && d.pendingOwnerUid !== user.uid) throw new Error('A claim for this place is already under review.');
          await updateDoc(existing.ref, pending); // request ownership (admin approves)
          return;
        }
        await setDoc(doc(firestore, 'places', gid), {
          ...place, ownerUid: null, status: 'pending', promoted: false, promotionRequested: false,
          ...pending, createdAt: serverTimestamp(),
        });
        return;
      }
      await addDoc(collection(firestore, 'places'), {
        ...place, ownerUid: null, status: 'pending', promoted: false, promotionRequested: false,
        ...pending, createdAt: serverTimestamp(),
      });
    },
    [user]
  );

  const createMerchant = useCallback(
    async (businessName: string, place: NewPlaceInput, verification?: MerchantVerification) => {
      if (!user || !firestore) throw new Error('Not signed in');
      await setDoc(
        doc(firestore, 'merchants', user.uid),
        { businessName: businessName.trim(), verification: verification || null, createdAt: serverTimestamp() },
        { merge: true }
      );
      await claimOrCreatePlace(place, verification);
    },
    [user, claimOrCreatePlace]
  );

  const addPlace = useCallback((place: NewPlaceInput) => claimOrCreatePlace(place), [claimOrCreatePlace]);

  const requestPromotion = useCallback(
    async (placeId: string) => {
      if (!user || !firestore) throw new Error('Not signed in');
      const place = places.find((p) => p.id === placeId);
      await updateDoc(doc(firestore, 'places', placeId), { promotionRequested: true });
      await addDoc(collection(firestore, 'promotionRequests'), {
        placeId,
        ownerUid: user.uid,
        placeName: place?.name || '',
        status: 'requested',
        createdAt: serverTimestamp(),
      });
    },
    [user, places]
  );

  const markRedeemed = useCallback(async (bookingId: string) => {
    if (!firestore) return;
    await updateDoc(doc(firestore, 'bookings', bookingId), { status: 'redeemed', redeemedAt: serverTimestamp() });
  }, []);

  const confirmBooking = useCallback(async (bookingId: string) => {
    if (!firestore) return;
    await updateDoc(doc(firestore, 'bookings', bookingId), { status: 'confirmed' });
  }, []);

  const setPlaceVouchers = useCallback(async (placeId: string, currency: string, vouchers: Voucher[]) => {
    if (!firestore) return;
    // Strip undefined optional fields so Firestore stays clean.
    const clean = vouchers.map((v) => ({
      id: v.id,
      price: Number(v.price) || 0,
      value: Number(v.value) || 0,
      label: v.label?.trim() || '',
      active: v.active !== false,
    }));
    await updateDoc(doc(firestore, 'places', placeId), { currency, vouchers: clean });
  }, []);

  const markVoucherRedeemed = useCallback(async (orderId: string) => {
    if (!firestore) return;
    await updateDoc(doc(firestore, 'voucherOrders', orderId), { status: 'redeemed', redeemedAt: serverTimestamp() });
  }, []);

  return (
    <Ctx.Provider value={{ merchant, isMerchant: !!merchant, loading, places, pendingPlaces, bookings, voucherSales, stats, createMerchant, addPlace, requestPromotion, markRedeemed, confirmBooking, setPlaceVouchers, markVoucherRedeemed }}>
      {children}
    </Ctx.Provider>
  );
}

export function useMerchant(): MerchantState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMerchant must be used within MerchantProvider');
  return v;
}

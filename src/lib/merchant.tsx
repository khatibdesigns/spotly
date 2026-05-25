// Spotly — merchant account layer. Same Firebase login as customers; a
// `merchants/{uid}` doc marks the account as a business. Merchants own places
// (places/{id}.ownerUid == uid), see bookings for those places, and can request
// paid promotion (an admin flips it live from the CRM).
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  doc, onSnapshot, setDoc, updateDoc, addDoc, collection, query, where, orderBy, serverTimestamp,
} from 'firebase/firestore';
import { firestore } from './firebase';
import { useAuth } from './auth';
import { SpotKind } from './places';
import { getPlaceStat, PlaceStat } from './stats';

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
  places: MerchantPlace[];
  bookings: MerchantBooking[];
  stats: Record<string, PlaceStat>; // placeId → { views, clicks }
  createMerchant: (businessName: string, place: NewPlaceInput, verification?: MerchantVerification) => Promise<void>;
  addPlace: (place: NewPlaceInput) => Promise<void>;
  requestPromotion: (placeId: string) => Promise<void>;
  markRedeemed: (bookingId: string) => Promise<void>;
  confirmBooking: (bookingId: string) => Promise<void>;
};

const Ctx = createContext<MerchantState | null>(null);

export function MerchantProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [loading, setLoading] = useState(true);
  const [places, setPlaces] = useState<MerchantPlace[]>([]);
  const [bookings, setBookings] = useState<MerchantBooking[]>([]);
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

  // My places (places/{id} where ownerUid == me)
  useEffect(() => {
    if (!user || !firestore || !merchant) {
      setPlaces([]);
      return;
    }
    const q = query(collection(firestore, 'places'), where('ownerUid', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => setPlaces(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => {});
    return unsub;
  }, [user, merchant]);

  // Bookings for my places (bookings where placeOwnerUid == me)
  useEffect(() => {
    if (!user || !firestore || !merchant) {
      setBookings([]);
      return;
    }
    const q = query(collection(firestore, 'bookings'), where('placeOwnerUid', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => setBookings(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => {});
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

  const createMerchant = useCallback(
    async (businessName: string, place: NewPlaceInput, verification?: MerchantVerification) => {
      if (!user || !firestore) throw new Error('Not signed in');
      await setDoc(
        doc(firestore, 'merchants', user.uid),
        { businessName: businessName.trim(), verification: verification || null, createdAt: serverTimestamp() },
        { merge: true }
      );
      await addDoc(collection(firestore, 'places'), {
        ...place,
        ownerUid: user.uid,
        status: 'pending',
        promoted: false,
        promotionRequested: false,
        // Copied onto the place so the CRM can vet the claim before approving.
        ownerPhone: verification?.phone || null,
        ownerDocs: verification?.docs || [],
        ownerCivilIdUrl: verification?.civilIdUrl || null,
        createdAt: serverTimestamp(),
      });
    },
    [user]
  );

  const addPlace = useCallback(
    async (place: NewPlaceInput) => {
      if (!user || !firestore) throw new Error('Not signed in');
      await addDoc(collection(firestore, 'places'), {
        ...place,
        ownerUid: user.uid,
        status: 'pending',
        promoted: false,
        promotionRequested: false,
        createdAt: serverTimestamp(),
      });
    },
    [user]
  );

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

  return (
    <Ctx.Provider value={{ merchant, isMerchant: !!merchant, loading, places, bookings, stats, createMerchant, addPlace, requestPromotion, markRedeemed, confirmBooking }}>
      {children}
    </Ctx.Provider>
  );
}

export function useMerchant(): MerchantState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMerchant must be used within MerchantProvider');
  return v;
}

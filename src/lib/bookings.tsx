// Spotly — bookings + album orders, logged to Firestore so the CRM can see them.
// Stored top-level (bookings/{id}, orders/{id}) with a uid field; partner/print
// integrations come later.
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, addDoc, query, where, orderBy, serverTimestamp } from 'firebase/firestore';
import { firestore } from './firebase';
import { useAuth } from './auth';

export type BookingInput = {
  placeId?: string;
  placeName: string;
  photoUrl?: string;
  date: string;
  time: string;
  adults: number;
  kids: number;
  note?: string;
  familyName?: string;
};

export type Booking = BookingInput & { id: string; status: string; createdAt?: any };

type BookingsState = {
  bookings: Booking[];
  last: Booking | null;
  addBooking: (input: BookingInput) => Promise<void>;
};

const Ctx = createContext<BookingsState | null>(null);

export function BookingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [last, setLast] = useState<Booking | null>(null);

  useEffect(() => {
    if (!user || !firestore) {
      setBookings([]);
      return;
    }
    const q = query(collection(firestore, 'bookings'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => setBookings(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))), () => {});
    return unsub;
  }, [user]);

  const addBooking = useCallback(
    async (input: BookingInput) => {
      if (!user || !firestore) throw new Error('Not signed in');
      const payload = { ...input, uid: user.uid, status: 'requested', createdAt: serverTimestamp() };
      await addDoc(collection(firestore, 'bookings'), payload);
      setLast({ id: 'local', status: 'requested', ...input });
    },
    [user]
  );

  return <Ctx.Provider value={{ bookings, last, addBooking }}>{children}</Ctx.Provider>;
}

export function useBookings(): BookingsState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useBookings must be used within BookingsProvider');
  return v;
}

// Album orders — no in-app list needed yet; the CRM reads the `orders` collection.
export async function createAlbumOrder(uid: string, data: { title: string; size: string; cover: string; total: string; pages?: number }) {
  if (!firestore) throw new Error('Not configured');
  await addDoc(collection(firestore, 'orders'), { ...data, uid, type: 'album', status: 'received', createdAt: serverTimestamp() });
}

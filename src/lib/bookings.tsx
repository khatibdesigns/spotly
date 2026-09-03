// Spotly — bookings + album orders, logged to Firestore so the CRM can see them.
// Stored top-level (bookings/{id}, orders/{id}) with a uid field; partner/print
// integrations come later.
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, addDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { firestore } from './firebase';
import { useAuth } from './auth';
import { useFamily } from './family';
import { sendBookingEmail } from './email';
import { logEvent } from './analytics';

export type BookingInput = {
  placeId?: string;
  placeOwnerUid?: string; // merchant who owns the place (for merchant dashboard)
  placeName: string;
  photoUrl?: string;
  date: string;
  time: string;
  adults: number;
  kids: number;
  note?: string;
  familyName?: string;
};

export type Booking = BookingInput & { id: string; status: string; code?: string; createdAt?: any };

// Short, human-readable redemption code shown as a QR + presented in person.
function makeCode(): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  let s = '';
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return `SPOT-${s}`;
}

type BookingsState = {
  bookings: Booking[];
  last: Booking | null;
  addBooking: (input: BookingInput) => Promise<void>;
};

const Ctx = createContext<BookingsState | null>(null);

export function BookingsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { familyId } = useFamily();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [last, setLast] = useState<Booking | null>(null);

  useEffect(() => {
    if (!user || !firestore || !familyId) {
      setBookings([]);
      return;
    }
    // Bookings shared across the family (query by familyId). No orderBy →
    // sort client-side (equality + orderBy on another field needs an index).
    const q = query(collection(firestore, 'bookings'), where('familyId', '==', familyId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
        rows.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setBookings(rows);
      },
      (e) => console.warn('bookings query', e?.message)
    );
    return unsub;
  }, [user, familyId]);

  const addBooking = useCallback(
    async (input: BookingInput) => {
      if (!user || !firestore || !familyId) throw new Error('Not signed in');
      const code = makeCode();
      const payload = { ...input, uid: user.uid, familyId, status: 'requested', code, createdAt: serverTimestamp() };
      const ref = await addDoc(collection(firestore, 'bookings'), payload);
      logEvent('booking_request', { place: input.placeName, booking_id: ref.id });
      setLast({ id: ref.id, status: 'requested', code, ...input });
      // Branded confirmation email (sends once the EC2 /email endpoint is live).
      if (user.email) {
        sendBookingEmail({ to: user.email, placeName: input.placeName, date: input.date, time: input.time, adults: input.adults, kids: input.kids, code, bookingId: ref.id });
      }
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

// Album orders — the CRM reads the `orders` collection. Now carries the real
// album contents (title, cover photo, selected photo URLs) + the delivery
// address so a printing partner has everything needed to fulfil. Payment is not
// collected yet (no gateway chosen) — orders land as 'pending_payment'.
export type AlbumOrderInput = {
  title: string;
  subtitle?: string;
  size: string;
  cover: string;
  total: string;
  currency?: string;
  pages?: number;
  photoCount?: number;
  coverUrl?: string;
  photoUrls?: string[];
  shipTo?: { name?: string; line1?: string; city?: string; country?: string; phone?: string };
};
export async function createAlbumOrder(uid: string, data: AlbumOrderInput) {
  if (!firestore) throw new Error('Not configured');
  // Cap embedded photo URLs so the order doc never bloats past Firestore limits.
  const photoUrls = (data.photoUrls || []).slice(0, 60);
  await addDoc(collection(firestore, 'orders'), {
    ...data,
    photoUrls,
    uid,
    type: 'album',
    status: 'pending_payment',
    createdAt: serverTimestamp(),
  });
}

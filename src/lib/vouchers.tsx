// Spotly — voucher cart + purchases. Customers add place vouchers to a cart,
// then "purchase" (no real charge yet — Stripe is the next step; this records
// the order like album orders). Each purchased voucher becomes its own
// redeemable card: a `voucherOrders/{id}` doc with a QR code, surfaced in the
// customer's profile and the owning merchant's dashboard, and emailed.
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { collection, onSnapshot, addDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { firestore } from './firebase';
import { useAuth } from './auth';
import { useFamily } from './family';
import { Voucher } from './currency';
import { sendVoucherEmail } from './email';

export type CartItem = {
  key: string; // unique per add (placeId + voucherId + nonce)
  placeId?: string;
  placeOwnerUid?: string;
  placeName: string;
  photoUrl?: string;
  currencyCode: string;
  voucher: Voucher;
};

export type VoucherOrder = {
  id: string;
  placeId?: string;
  placeOwnerUid?: string;
  placeName: string;
  photoUrl?: string;
  currencyCode: string;
  price: number;
  value: number;
  label?: string;
  code: string;
  status: string; // 'paid' | 'redeemed'
  createdAt?: any;
};

function makeCode(): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  let s = '';
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return `SPOT-${s}`;
}

type AddArg = {
  placeId?: string;
  placeOwnerUid?: string;
  placeName: string;
  photoUrl?: string;
  currencyCode: string;
  voucher: Voucher;
};

type VouchersState = {
  cart: CartItem[];
  cartCount: number;
  addToCart: (arg: AddArg) => void;
  removeFromCart: (key: string) => void;
  clearCart: () => void;
  orders: VoucherOrder[];
  lastOrderId: string | null;
  // Records the cart as paid orders (one per item). Returns the created ids.
  checkout: () => Promise<string[]>;
};

const Ctx = createContext<VouchersState | null>(null);

export function VouchersProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { familyId } = useFamily();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<VoucherOrder[]>([]);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);

  // Voucher orders shared across the family (query by familyId, client-sorted).
  useEffect(() => {
    if (!user || !firestore || !familyId) {
      setOrders([]);
      return;
    }
    const q = query(collection(firestore, 'voucherOrders'), where('familyId', '==', familyId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as VoucherOrder[];
        rows.sort((a, b) => ((b.createdAt as any)?.toMillis?.() || 0) - ((a.createdAt as any)?.toMillis?.() || 0));
        setOrders(rows);
      },
      (e) => console.warn('voucherOrders query', e?.message)
    );
    return unsub;
  }, [user, familyId]);

  const addToCart = useCallback((arg: AddArg) => {
    setCart((c) => [
      ...c,
      { key: `${arg.placeId || 'p'}-${arg.voucher.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...arg },
    ]);
  }, []);
  const removeFromCart = useCallback((key: string) => setCart((c) => c.filter((x) => x.key !== key)), []);
  const clearCart = useCallback(() => setCart([]), []);

  const checkout = useCallback(async () => {
    if (!user || !firestore || !familyId) throw new Error('Not signed in');
    if (cart.length === 0) return [];
    const ids: string[] = [];
    for (const item of cart) {
      const code = makeCode();
      const payload: any = {
        uid: user.uid,
        familyId,
        placeId: item.placeId || null,
        placeOwnerUid: item.placeOwnerUid || null,
        placeName: item.placeName,
        photoUrl: item.photoUrl || null,
        currencyCode: item.currencyCode,
        price: item.voucher.price,
        value: item.voucher.value,
        label: item.voucher.label || null,
        code,
        status: 'paid',
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(firestore, 'voucherOrders'), payload);
      ids.push(ref.id);
      if (user.email) {
        sendVoucherEmail({
          to: user.email,
          placeName: item.placeName,
          label: item.voucher.label,
          price: item.voucher.price,
          value: item.voucher.value,
          currencyCode: item.currencyCode,
          code,
          orderId: ref.id,
        });
      }
    }
    setLastOrderId(ids[0] || null);
    setCart([]);
    return ids;
  }, [user, familyId, cart]);

  const value = useMemo<VouchersState>(
    () => ({ cart, cartCount: cart.length, addToCart, removeFromCart, clearCart, orders, lastOrderId, checkout }),
    [cart, addToCart, removeFromCart, clearCart, orders, lastOrderId, checkout]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVouchers(): VouchersState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useVouchers must be used within VouchersProvider');
  return v;
}

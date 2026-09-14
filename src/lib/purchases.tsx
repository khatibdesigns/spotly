// Spotly — RevenueCat (Spotly Plus subscription). The native module is
// lazy-required so the JS bundle still loads before a native rebuild.
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './auth';
import { logEvent } from './analytics';

function getRC(): any {
  try { return require('react-native-purchases').default; } catch { return null; }
}

const KEY = (Platform.OS === 'ios'
  ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY
  : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY) || '';

const ENTITLEMENT = 'plus';

type Pkg = any;
type PurchasesState = {
  available: boolean;
  isPlus: boolean;
  packages: Pkg[];
  purchase: (pkg: Pkg) => Promise<void>;
  restore: () => Promise<void>;
};

const Ctx = createContext<PurchasesState | null>(null);

function hasPlus(ci: any): boolean {
  return !!ci?.entitlements?.active?.[ENTITLEMENT];
}

// GA4 ecommerce item for the subscription. `price` is the store's localised
// number for the package (the string form lives in the paywall).
export function gaSubItem(pkg: Pkg) {
  return {
    item_id: pkg?.product?.identifier || pkg?.identifier,
    item_name: 'Spotly Plus',
    item_category: 'subscription',
    item_variant: pkg?.packageType || pkg?.identifier,
    price: pkg?.product?.price,
    quantity: 1,
  };
}

// Money fields for a package. A GA4 value without a currency is unusable, so
// when the store gives us no currency code we send neither and flag it instead.
export function pkgMoney(pkg: Pkg) {
  const currency = pkg?.product?.currencyCode;
  if (typeof currency !== 'string' || !currency) return { currency_missing: true };
  return { value: pkg?.product?.price, currency };
}

export function PurchasesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isPlus, setIsPlus] = useState(false);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const P = getRC();
  const available = !!P && !!KEY;

  useEffect(() => {
    if (!available) return;
    try { P.configure({ apiKey: KEY }); } catch {}
    const listener = (ci: any) => setIsPlus(hasPlus(ci));
    try { P.addCustomerInfoUpdateListener(listener); } catch {}
    P.getCustomerInfo?.().then((ci: any) => setIsPlus(hasPlus(ci))).catch(() => {});
    P.getOfferings?.().then((o: any) => setPackages(o?.current?.availablePackages || [])).catch(() => {});
    return () => { try { P.removeCustomerInfoUpdateListener?.(listener); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  // Tie purchases to the signed-in user.
  useEffect(() => {
    if (!available || !user) return;
    P.logIn?.(user.uid).then((res: any) => setIsPlus(hasPlus(res?.customerInfo))).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, user]);

  const purchase = useCallback(async (pkg: Pkg) => {
    if (!available) {
      logEvent('purchase_failed', { step: 'purchases_unavailable' });
      throw new Error('Purchases unavailable');
    }
    let res: any;
    try {
      res = await P.purchasePackage(pkg);
    } catch (e: any) {
      logEvent('purchase_failed', {
        step: e?.userCancelled ? 'cancelled' : 'store_error',
        reason: String(e?.code || e?.message || e),
        item_id: pkg?.product?.identifier || pkg?.identifier,
        plan: pkg?.packageType || pkg?.identifier,
      });
      throw e; // the paywall reads e.userCancelled / e.message
    }
    setIsPlus(hasPlus(res?.customerInfo));
    logEvent('purchase', {
      transaction_id: res?.transaction?.transactionIdentifier || res?.productIdentifier || pkg?.product?.identifier,
      ...pkgMoney(pkg),
      items: [gaSubItem(pkg)],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  const restore = useCallback(async () => {
    if (!available) throw new Error('Purchases unavailable');
    const ci = await P.restorePurchases();
    setIsPlus(hasPlus(ci));
    logEvent('restore_purchases', { restored: hasPlus(ci) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  return <Ctx.Provider value={{ available, isPlus, packages, purchase, restore }}>{children}</Ctx.Provider>;
}

export function usePurchases(): PurchasesState {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePurchases must be used within PurchasesProvider');
  return v;
}

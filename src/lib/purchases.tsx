// Spotly — RevenueCat (Spotly Plus subscription). The native module is
// lazy-required so the JS bundle still loads before a native rebuild.
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './auth';

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
    if (!available) throw new Error('Purchases unavailable');
    const res = await P.purchasePackage(pkg);
    setIsPlus(hasPlus(res?.customerInfo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  const restore = useCallback(async () => {
    if (!available) throw new Error('Purchases unavailable');
    const ci = await P.restorePurchases();
    setIsPlus(hasPlus(ci));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  return <Ctx.Provider value={{ available, isPlus, packages, purchase, restore }}>{children}</Ctx.Provider>;
}

export function usePurchases(): PurchasesState {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePurchases must be used within PurchasesProvider');
  return v;
}

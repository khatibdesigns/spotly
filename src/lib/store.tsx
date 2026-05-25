// Spotly — navigation store (state-based, no nav lib), mirroring the SoulFlight
// pattern. Holds the onboarding flow, the active bottom tab, and an overlay
// stack for pushed/modal screens (place, booking, filters, album, paywall…).
import React, { createContext, useContext, useState, useCallback } from 'react';

export type TabId = 'discover' | 'plan' | 'map' | 'gallery' | 'profile';

export type RouteName =
  | 'place'
  | 'booking'
  | 'bookingConfirmed'
  | 'filters'
  | 'albumEditor'
  | 'albumCheckout'
  | 'paywall'
  | 'aiPlan'
  | 'saved'
  | 'kidFood';

export type Route = { name: RouteName; params?: any };

export type AuthIntent = 'customer' | 'merchant';

type Store = {
  onboarded: boolean;
  finishOnboarding: () => void;
  tab: TabId;
  setTab: (t: TabId) => void;
  stack: Route[];
  push: (name: RouteName, params?: any) => void;
  pop: () => void;
  popToRoot: () => void;
  // Which kind of account a brand-new sign-up intends to create. Drives which
  // setup screen Shell shows before any merchants/families doc exists.
  authIntent: AuthIntent;
  setAuthIntent: (i: AuthIntent) => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [onboarded, setOnboarded] = useState(false);
  const [tab, setTab] = useState<TabId>('discover');
  const [stack, setStack] = useState<Route[]>([]);
  const [authIntent, setAuthIntent] = useState<AuthIntent>('customer');

  const push = useCallback((name: RouteName, params?: any) => setStack((s) => [...s, { name, params }]), []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const popToRoot = useCallback(() => setStack([]), []);
  const finishOnboarding = useCallback(() => setOnboarded(true), []);

  return (
    <Ctx.Provider value={{ onboarded, finishOnboarding, tab, setTab, stack, push, pop, popToRoot, authIntent, setAuthIntent }}>
      {children}
    </Ctx.Provider>
  );
}

export function useStore() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used within StoreProvider');
  return v;
}

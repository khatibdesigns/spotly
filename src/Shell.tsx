// Spotly — app shell. Auth + profile gating → tabs + tab bar + overlay stack.
import React, { useRef, useEffect } from 'react';
import { View, ActivityIndicator, Animated, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from './lib/theme';
import { useStore, RouteName } from './lib/store';
import { useAuth } from './lib/auth';
import { useProfile } from './lib/profile';
import { useMerchant } from './lib/merchant';
import { PlacesProvider } from './lib/placesStore';
import { PlansProvider } from './lib/plans';
import { MemoriesProvider } from './lib/memories';
import { BookingsProvider } from './lib/bookings';
import { SavesProvider } from './lib/saves';
import { PlannerProvider } from './lib/planner';
import { TabBar } from './components/TabBar';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { SetupScreen } from './screens/SetupScreen';
import { DiscoverScreen } from './screens/DiscoverScreen';
import { PlanScreen } from './screens/PlanScreen';
import { MapScreen } from './screens/MapScreen';
import { GalleryScreen } from './screens/GalleryScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { PlaceScreen } from './screens/PlaceScreen';
import { BookingScreen, BookingConfirmedScreen } from './screens/BookingScreen';
import { FiltersSheet } from './screens/FiltersSheet';
import { AlbumEditorScreen, AlbumCheckoutScreen } from './screens/AlbumScreens';
import { PaywallScreen } from './screens/PaywallScreen';
import { AiPlanScreen } from './screens/AiPlanScreen';
import { SavedScreen } from './screens/SavedScreen';
import { KidFoodScreen } from './screens/KidFoodScreen';
import { MerchantSetupScreen } from './screens/MerchantSetupScreen';
import { MerchantHomeScreen } from './screens/MerchantHomeScreen';

const OVERLAYS: Record<RouteName, React.ComponentType> = {
  place: PlaceScreen,
  booking: BookingScreen,
  bookingConfirmed: BookingConfirmedScreen,
  filters: FiltersSheet,
  albumEditor: AlbumEditorScreen,
  albumCheckout: AlbumCheckoutScreen,
  paywall: PaywallScreen,
  aiPlan: AiPlanScreen,
  saved: SavedScreen,
  kidFood: KidFoodScreen,
};

function AnimatedOverlay({ children }: { children: React.ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [a]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        opacity: a,
        transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

function Splash() {
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={C.coral} />
    </View>
  );
}

export function Shell() {
  const { user, loading: authLoading } = useAuth();
  const { hasProfile, loading: profileLoading } = useProfile();
  const { isMerchant, loading: merchantLoading } = useMerchant();
  const { tab, stack, push, authIntent } = useStore();
  const insets = useSafeAreaInsets();

  // Tapping a planner notification opens the AI planner.
  useEffect(() => {
    let sub: any;
    try {
      const N = require('expo-notifications');
      sub = N.addNotificationResponseReceivedListener((resp: any) => {
        if (resp?.notification?.request?.content?.data?.type === 'aiPlan') push('aiPlan');
      });
    } catch {}
    return () => { try { sub?.remove?.(); } catch {} };
  }, [push]);

  if (authLoading) return <Splash />;
  if (!user) return <OnboardingScreen />;
  if (merchantLoading || profileLoading) return <Splash />;
  // Merchant account → the business dashboard (separate from the customer app).
  if (isMerchant) return <MerchantHomeScreen />;
  // A new sign-up that chose "business" but hasn't created their merchant doc yet.
  if (!hasProfile && authIntent === 'merchant') return <MerchantSetupScreen />;
  if (!hasProfile) return <SetupScreen />;

  return (
    <PlacesProvider>
    <PlansProvider>
    <MemoriesProvider>
    <BookingsProvider>
    <SavesProvider>
    <PlannerProvider>
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {tab === 'discover' && <DiscoverScreen />}
      {tab === 'plan' && <PlanScreen />}
      {tab === 'map' && <MapScreen />}
      {tab === 'gallery' && <GalleryScreen />}
      {tab === 'profile' && <ProfileScreen />}

      {stack.length === 0 && <TabBar bottomInset={insets.bottom} />}

      {stack.map((route, i) => {
        const Cmp = OVERLAYS[route.name];
        return (
          <AnimatedOverlay key={`${route.name}-${i}`}>
            <Cmp />
          </AnimatedOverlay>
        );
      })}
    </View>
    </PlannerProvider>
    </SavesProvider>
    </BookingsProvider>
    </MemoriesProvider>
    </PlansProvider>
    </PlacesProvider>
  );
}

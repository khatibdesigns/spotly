import React, { useEffect } from 'react';
import { View, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Fraunces_400Regular, Fraunces_500Medium, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { C } from './src/lib/theme';

// Show planner notifications (with sound) even when the app is in the foreground.
try {
  const Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
} catch {}
import { StoreProvider } from './src/lib/store';
import { I18nManager } from 'react-native';
import { AuthProvider } from './src/lib/auth';
import { ProfileProvider } from './src/lib/profile';
import { PurchasesProvider } from './src/lib/purchases';
import { I18nProvider } from './src/lib/i18n';
import { MerchantProvider } from './src/lib/merchant';
import { FamilyProvider } from './src/lib/family';
import { VouchersProvider } from './src/lib/vouchers';
import { Shell } from './src/Shell';

// Allow RTL so Arabic can flip layout direction (forceRTL persists natively).
try { I18nManager.allowRTL(true); } catch {}

export default function App() {
  const [loaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    Fraunces_400Regular,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
  });

  // Clear the iOS app-icon badge whenever the app comes to the foreground (and
  // on launch). Push notifications can bump the badge while the app is closed;
  // without this it stays stuck on 1, 2, 3… even after the user opens the app.
  useEffect(() => {
    let N: any;
    try { N = require('expo-notifications'); } catch { return; }
    const clear = () => {
      try { N.setBadgeCountAsync(0); } catch {}
      try { N.dismissAllNotificationsAsync(); } catch {}
    };
    clear();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') clear(); });
    return () => { try { sub.remove(); } catch {} };
  }, []);

  if (!loaded) {
    return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
      <I18nProvider>
        <AuthProvider>
          <FamilyProvider>
            <PurchasesProvider>
              <ProfileProvider>
                <MerchantProvider>
                  <VouchersProvider>
                    <StoreProvider>
                      <Shell />
                      <StatusBar style="dark" />
                    </StoreProvider>
                  </VouchersProvider>
                </MerchantProvider>
              </ProfileProvider>
            </PurchasesProvider>
          </FamilyProvider>
        </AuthProvider>
      </I18nProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

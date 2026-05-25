import React from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
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
import { AuthProvider } from './src/lib/auth';
import { ProfileProvider } from './src/lib/profile';
import { PurchasesProvider } from './src/lib/purchases';
import { Shell } from './src/Shell';

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

  if (!loaded) {
    return <View style={{ flex: 1, backgroundColor: C.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PurchasesProvider>
          <ProfileProvider>
            <StoreProvider>
              <Shell />
              <StatusBar style="dark" />
            </StoreProvider>
          </ProfileProvider>
        </PurchasesProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

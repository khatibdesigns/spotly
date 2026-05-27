// Spotly — push notifications via Firebase Cloud Messaging
// (@react-native-firebase/messaging). DEFENSIVE: every call lazy-requires the
// native module and no-ops if it isn't present (e.g. on the JS-only sim before
// the native rebuild), so the bundle never crashes.
//
// Registers the device's FCM token in Firestore (users/{uid}) so the CRM/EC2
// can target a specific user, and subscribes to the 'all' topic so broadcast
// campaigns (Firebase Console or CRM) reach everyone.
import { Platform, NativeModules } from 'react-native';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from './firebase';

function messaging(): any | null {
  // Only touch RNFirebase when its native module is actually linked — avoids a
  // throw (and dev redbox) on the JS-only sim before the native rebuild.
  if (!NativeModules.RNFBAppModule) return null;
  try {
    return require('@react-native-firebase/messaging').default();
  } catch {
    return null;
  }
}

// Ask permission, get the FCM token, store it, subscribe to broadcasts.
export async function registerPush(uid: string, familyId?: string): Promise<void> {
  const m = messaging();
  if (!m || !firestore || !uid) return;
  try {
    const status = await m.requestPermission();
    const ok = status === 1 || status === 2; // AUTHORIZED | PROVISIONAL
    if (!ok) return;
    if (Platform.OS === 'ios') {
      try { await m.registerDeviceForRemoteMessages(); } catch {}
    }
    const token = await m.getToken();
    if (!token) return;
    await setDoc(
      doc(firestore, 'users', uid),
      { fcmToken: token, platform: Platform.OS, familyId: familyId || uid, pushUpdatedAt: serverTimestamp() },
      { merge: true }
    );
    try { await m.subscribeToTopic('all'); } catch {}
  } catch {}
}

// Foreground messages don't show a system banner by default — surface them via
// the handler (the app already shows local notifications for the AI planner).
export function onPushForeground(handler: (title?: string, body?: string) => void): () => void {
  const m = messaging();
  if (!m) return () => {};
  try {
    return m.onMessage(async (msg: any) => handler(msg?.notification?.title, msg?.notification?.body));
  } catch {
    return () => {};
  }
}

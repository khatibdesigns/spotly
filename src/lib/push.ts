// Spotly — push notifications via Firebase Cloud Messaging
// (@react-native-firebase/messaging). DEFENSIVE: every call lazy-requires the
// native module and no-ops if it isn't present (e.g. on the JS-only sim before
// the native rebuild), so the bundle never crashes.
//
// Registers the device's FCM token in Firestore (users/{uid}) so the CRM/EC2
// can target a specific user, and subscribes to the 'all' topic so broadcast
// campaigns (Firebase Console or CRM) reach everyone.
import { Platform, NativeModules, PermissionsAndroid } from 'react-native';
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

// Android 13+ (API 33) requires POST_NOTIFICATIONS as a runtime permission AND
// in the manifest. messaging().requestPermission() does request it on recent
// RNFB versions, but doing it explicitly via PermissionsAndroid first makes the
// flow deterministic and works on every RNFB version.
async function requestAndroidPostNotifications(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  // Android <13 grants automatically.
  if ((Platform.Version as number) < 33) return true;
  try {
    const r = await PermissionsAndroid.request(
      (PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS ||
        ('android.permission.POST_NOTIFICATIONS' as any),
    );
    return r === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

// Ask permission, get the FCM token, store it, subscribe to broadcasts.
export async function registerPush(uid: string, familyId?: string): Promise<void> {
  const m = messaging();
  if (!m || !firestore || !uid) {
    console.log('[push] skipped — native:', !!m, 'firestore:', !!firestore, 'uid:', !!uid);
    return;
  }
  try {
    const androidOk = await requestAndroidPostNotifications();
    if (!androidOk) {
      console.log('[push] Android POST_NOTIFICATIONS denied');
      return;
    }
    const status = await m.requestPermission();
    const ok = status === 1 || status === 2; // AUTHORIZED | PROVISIONAL
    console.log('[push] requestPermission status:', status, 'ok:', ok);
    if (!ok) return;
    if (Platform.OS === 'ios') {
      try { await m.registerDeviceForRemoteMessages(); } catch (e) { console.log('[push] registerDeviceForRemoteMessages threw:', String(e).slice(0, 200)); }
    }
    const token = await m.getToken();
    if (!token) {
      console.log('[push] getToken returned empty');
      return;
    }
    console.log('[push] token acquired:', token.slice(0, 24) + '…');
    await setDoc(
      doc(firestore, 'users', uid),
      { fcmToken: token, platform: Platform.OS, familyId: familyId || uid, pushUpdatedAt: serverTimestamp() },
      { merge: true },
    );
    try { await m.subscribeToTopic('all'); } catch (e) { console.log('[push] subscribeToTopic threw:', String(e).slice(0, 200)); }
  } catch (e) {
    console.log('[push] registerPush threw:', String(e).slice(0, 200));
  }
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

// Diagnostics for the Profile "Notifications" debug entry — gives the user (and
// us) a one-tap view of what's actually working on this device.
export type PushDiagnostics = {
  nativeLinked: boolean;
  permissionStatus: 'authorized' | 'provisional' | 'denied' | 'notDetermined' | 'unknown' | 'unavailable';
  apnsToken?: string | null;
  fcmToken?: string | null;
  error?: string;
};

export async function getPushDiagnostics(): Promise<PushDiagnostics> {
  const m = messaging();
  if (!m) return { nativeLinked: false, permissionStatus: 'unavailable' };
  const out: PushDiagnostics = { nativeLinked: true, permissionStatus: 'unknown' };
  try {
    const status = await m.hasPermission();
    out.permissionStatus =
      status === 1 ? 'authorized'
      : status === 2 ? 'provisional'
      : status === -1 ? 'notDetermined'
      : status === 0 ? 'denied'
      : 'unknown';
  } catch (e) { out.error = `hasPermission: ${String(e).slice(0, 120)}`; }
  if (Platform.OS === 'ios') {
    try { out.apnsToken = await m.getAPNSToken(); } catch (e) { out.error = (out.error || '') + ` apns: ${String(e).slice(0, 120)}`; }
  }
  try { out.fcmToken = await m.getToken(); } catch (e) { out.error = (out.error || '') + ` fcm: ${String(e).slice(0, 120)}`; }
  return out;
}

// Spotly — push notifications via Firebase Cloud Messaging
// (@react-native-firebase/messaging). DEFENSIVE: every call lazy-requires the
// native module and no-ops if it isn't present (e.g. on the JS-only sim before
// the native rebuild), so the bundle never crashes.
//
// Registers the device's FCM token in Firestore (users/{uid}) so the CRM/EC2
// can target a specific user, and subscribes to the 'all' topic so broadcast
// campaigns (Firebase Console or CRM) reach everyone.
import { Platform, NativeModules, PermissionsAndroid, TurboModuleRegistry } from 'react-native';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from './firebase';

// Memoised messaging() handle. Lazy-resolves through TurboModuleRegistry (New
// Architecture / Bridgeless) AND the legacy NativeModules bridge, then falls
// back to a try/catch require so we never throw at import time.
//
// History (#37): the check used only `NativeModules.RNFBAppModule`, which is
// undefined under Bridgeless mode even though the TurboModule IS linked, so
// every device on New Arch saw "native FCM module is not linked" and no push
// ever fired.
let _messaging: any = null;
let _messagingChecked = false;

function nativeFcmLinked(): boolean {
  // 1) TurboModuleRegistry first (New Architecture path).
  try { if (TurboModuleRegistry?.get?.('RNFBAppModule')) return true; } catch {}
  // 2) Legacy NativeModules bridge.
  if (NativeModules?.RNFBAppModule) return true;
  // 3) Last resort: try to require + instantiate; if that works, native is up.
  try {
    require('@react-native-firebase/messaging').default();
    return true;
  } catch { return false; }
}

function messaging(): any | null {
  if (_messagingChecked) return _messaging;
  _messagingChecked = true;
  try {
    _messaging = require('@react-native-firebase/messaging').default();
  } catch {
    _messaging = null;
  }
  return _messaging;
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
  const linked = nativeFcmLinked();
  const m = messaging();
  if (!m) return { nativeLinked: linked, permissionStatus: 'unavailable', error: linked ? 'messaging() returned null despite native module being present' : undefined };
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

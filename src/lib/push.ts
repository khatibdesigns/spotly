// Spotly — push notifications via Firebase Cloud Messaging
// (@react-native-firebase/messaging v24, **modular API**).
//
// The legacy/namespaced API (`messaging()` factory) misbehaves under React
// Native New Architecture / Bridgeless: the default factory throws/returns
// null even when the native module is properly linked. RNFB v22+ ships a
// modular API (mirrors Firebase JS v9+) that is the supported path on New
// Arch — we use that here.
//
// Registers the device's FCM token in Firestore (users/{uid}) so the CRM/EC2
// can target a specific user, and subscribes to the 'all' topic so broadcast
// campaigns (Firebase Console or CRM) reach everyone.
import { Platform, NativeModules, PermissionsAndroid, TurboModuleRegistry } from 'react-native';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from './firebase';

// ---- lazy native + modular handles --------------------------------------

let _msg: any = null;
let _msgResolved = false;

// Pull the modular messaging instance for the default app. Lazy so the bundle
// never throws at import time on a build that lacks the native module.
function getMessagingInstance(): any | null {
  if (_msgResolved) return _msg;
  _msgResolved = true;
  try {
    const { getApp } = require('@react-native-firebase/app');
    const { getMessaging } = require('@react-native-firebase/messaging');
    _msg = getMessaging(getApp());
  } catch (e) {
    console.log('[push] getMessaging threw:', String(e).slice(0, 200));
    _msg = null;
  }
  return _msg;
}

// Is the firebase native side actually linked into this build? We probe both
// the New Arch TurboModuleRegistry (Bridgeless) and the legacy NativeModules
// bridge so the answer is correct in all RN modes.
function nativeFcmLinked(): boolean {
  try { if (TurboModuleRegistry?.get?.('RNFBAppModule')) return true; } catch {}
  if (NativeModules?.RNFBAppModule) return true;
  try { if (TurboModuleRegistry?.get?.('RNFBMessagingModule')) return true; } catch {}
  if (NativeModules?.RNFBMessagingModule) return true;
  return false;
}

// Android 13+ (API 33) requires POST_NOTIFICATIONS as a runtime permission
// AND in the manifest. RNFB v24 still relies on the manifest-declared perm,
// so we ask explicitly to get the system prompt every time.
async function requestAndroidPostNotifications(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
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

// ---- public API ----------------------------------------------------------

// Ask permission, get the FCM token, store it, subscribe to broadcasts.
export async function registerPush(uid: string, familyId?: string): Promise<void> {
  if (!firestore || !uid) {
    console.log('[push] skipped — firestore:', !!firestore, 'uid:', !!uid);
    return;
  }
  const m = getMessagingInstance();
  if (!m) {
    console.log('[push] skipped — native messaging not available');
    return;
  }
  try {
    const androidOk = await requestAndroidPostNotifications();
    if (!androidOk) {
      console.log('[push] Android POST_NOTIFICATIONS denied');
      return;
    }
    const { requestPermission, registerDeviceForRemoteMessages, getToken, subscribeToTopic } = require('@react-native-firebase/messaging');
    const status = await requestPermission(m);
    const ok = status === 1 || status === 2; // AUTHORIZED | PROVISIONAL
    console.log('[push] requestPermission status:', status, 'ok:', ok);
    if (!ok) return;
    if (Platform.OS === 'ios') {
      try { await registerDeviceForRemoteMessages(m); } catch (e) { console.log('[push] registerDeviceForRemoteMessages threw:', String(e).slice(0, 200)); }
    }
    const token = await getToken(m);
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
    try { await subscribeToTopic(m, 'all'); } catch (e) { console.log('[push] subscribeToTopic threw:', String(e).slice(0, 200)); }
  } catch (e) {
    console.log('[push] registerPush threw:', String(e).slice(0, 200));
  }
}

// Foreground messages don't show a system banner by default — surface them via
// the handler (the app already shows local notifications for the AI planner).
export function onPushForeground(handler: (title?: string, body?: string) => void): () => void {
  const m = getMessagingInstance();
  if (!m) return () => {};
  try {
    const { onMessage } = require('@react-native-firebase/messaging');
    return onMessage(m, async (msg: any) => handler(msg?.notification?.title, msg?.notification?.body));
  } catch {
    return () => {};
  }
}

// Diagnostics for the Profile "Notifications" debug entry — a one-tap view of
// what's actually working on this device.
export type PushDiagnostics = {
  nativeLinked: boolean;
  permissionStatus: 'authorized' | 'provisional' | 'denied' | 'notDetermined' | 'unknown' | 'unavailable';
  apnsToken?: string | null;
  fcmToken?: string | null;
  error?: string;
};

export async function getPushDiagnostics(): Promise<PushDiagnostics> {
  const linked = nativeFcmLinked();
  const m = getMessagingInstance();
  if (!m) {
    return {
      nativeLinked: linked,
      permissionStatus: 'unavailable',
      error: linked
        ? 'native module present but getMessaging() failed — check the dev console for [push] logs'
        : '@react-native-firebase native side is not linked into this build',
    };
  }
  const out: PushDiagnostics = { nativeLinked: true, permissionStatus: 'unknown' };
  try {
    const { hasPermission, getAPNSToken, getToken } = require('@react-native-firebase/messaging');
    try {
      const status = await hasPermission(m);
      out.permissionStatus =
        status === 1 ? 'authorized'
        : status === 2 ? 'provisional'
        : status === -1 ? 'notDetermined'
        : status === 0 ? 'denied'
        : 'unknown';
    } catch (e) { out.error = `hasPermission: ${String(e).slice(0, 120)}`; }
    if (Platform.OS === 'ios') {
      try { out.apnsToken = await getAPNSToken(m); } catch (e) { out.error = (out.error || '') + ` apns: ${String(e).slice(0, 120)}`; }
    }
    try { out.fcmToken = await getToken(m); } catch (e) { out.error = (out.error || '') + ` fcm: ${String(e).slice(0, 120)}`; }
  } catch (e) {
    out.error = `modular import failed: ${String(e).slice(0, 200)}`;
  }
  return out;
}

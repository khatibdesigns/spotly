// Spotly — push notifications via Firebase Cloud Messaging.
// Minimal: ask permission, get the FCM token, save it to Firestore.
import { Platform, PermissionsAndroid } from 'react-native';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firestore } from './firebase';
import { getApp } from '@react-native-firebase/app';
import {
  getMessaging,
  requestPermission,
  registerDeviceForRemoteMessages,
  getToken,
  getAPNSToken,
  hasPermission,
  onMessage,
  subscribeToTopic,
} from '@react-native-firebase/messaging';

// Android 13+ (API 33) needs POST_NOTIFICATIONS at runtime.
async function askAndroidPostNotifications(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if ((Platform.Version as number) < 33) return true;
  const r = await PermissionsAndroid.request(
    (PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS ||
      ('android.permission.POST_NOTIFICATIONS' as any),
  );
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

// Permission → APNs registration (iOS) → FCM token → store in Firestore.
export async function registerPush(uid: string, familyId?: string): Promise<void> {
  if (!firestore || !uid) return;
  try {
    if (!(await askAndroidPostNotifications())) {
      console.log('[push] Android POST_NOTIFICATIONS denied');
      return;
    }
    const m = getMessaging(getApp());
    const status = await requestPermission(m);
    console.log('[push] permission status:', status);
    if (status !== 1 && status !== 2) return; // not AUTHORIZED/PROVISIONAL
    if (Platform.OS === 'ios') {
      await registerDeviceForRemoteMessages(m);
    }
    const token = await getToken(m);
    if (!token) {
      console.log('[push] getToken returned empty');
      return;
    }
    console.log('[push] FCM token:', token.slice(0, 24), '…');
    await setDoc(
      doc(firestore, 'users', uid),
      {
        fcmToken: token,
        platform: Platform.OS,
        familyId: familyId || uid,
        pushUpdatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    try { await subscribeToTopic(m, 'all'); } catch {}
  } catch (e) {
    console.log('[push] registerPush failed:', String(e).slice(0, 200));
  }
}

export function onPushForeground(
  handler: (title?: string, body?: string) => void,
): () => void {
  try {
    const m = getMessaging(getApp());
    return onMessage(m, async (msg: any) =>
      handler(msg?.notification?.title, msg?.notification?.body),
    );
  } catch {
    return () => {};
  }
}

// Diagnostics — runs the same calls registerPush() runs and surfaces the EXACT
// error string so we stop guessing. No defensive wrapping; if Firebase isn't
// initialized, the error message says so verbatim.
export type PushDiagnostics = {
  permissionStatus: number | string;
  apnsToken?: string | null;
  fcmToken?: string | null;
  error?: string;
};

export async function getPushDiagnostics(): Promise<PushDiagnostics> {
  const out: PushDiagnostics = { permissionStatus: 'unknown' };
  try {
    const m = getMessaging(getApp());
    try { out.permissionStatus = await hasPermission(m); }
    catch (e) { out.error = `hasPermission: ${String(e).slice(0, 160)}`; }
    if (Platform.OS === 'ios') {
      try { out.apnsToken = await getAPNSToken(m); }
      catch (e) { out.error = (out.error || '') + `\nAPNs: ${String(e).slice(0, 160)}`; }
    }
    try { out.fcmToken = await getToken(m); }
    catch (e) { out.error = (out.error || '') + `\nFCM: ${String(e).slice(0, 160)}`; }
  } catch (e) {
    out.error = `getMessaging(getApp()) threw: ${String(e).slice(0, 200)}`;
  }
  return out;
}

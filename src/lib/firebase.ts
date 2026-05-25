// Spotly — Firebase init. Reads EXPO_PUBLIC_FIREBASE_* from .env.
// The app still loads if config is missing; auth/cloud features simply stay off.
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, initializeFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { initializeAuth, getAuth, Auth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const cfg = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const isConfigured = !!(cfg.apiKey && cfg.projectId && cfg.appId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (isConfigured) {
  app = getApps().length ? getApps()[0] : initializeApp(cfg as any);
  try {
    // getReactNativePersistence ships in the RN build but is absent from web types.
    auth = initializeAuth(app, {
      persistence: (require('firebase/auth') as any).getReactNativePersistence(AsyncStorage),
    });
  } catch {
    auth = getAuth(app);
  }
  // ignoreUndefinedProperties: writes silently drop `undefined` fields instead
  // of throwing (e.g. a booking for a place with no owner/photo, an empty note).
  try {
    firestore = initializeFirestore(app, { ignoreUndefinedProperties: true });
  } catch {
    firestore = getFirestore(app);
  }
  storage = getStorage(app);
}

export { app, auth, firestore, storage };

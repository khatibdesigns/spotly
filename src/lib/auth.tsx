// Spotly — auth context. Email/password + Google + Apple via Firebase.
// Native modules are lazy-required so the JS bundle still loads without a rebuild.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut as fbSignOut,
  signInWithCredential,
  deleteUser,
  OAuthProvider,
  GoogleAuthProvider,
  User,
} from 'firebase/auth';
import { doc, deleteDoc, getDoc, getDocs, collection } from 'firebase/firestore';
import { auth, firestore, isConfigured } from './firebase';

function getApple() {
  try { return require('expo-apple-authentication'); } catch { return null; }
}
function getCrypto() {
  try { return require('expo-crypto'); } catch { return null; }
}
function getGoogle() {
  try { return require('@react-native-google-signin/google-signin'); } catch { return null; }
}

const GOOGLE_WEB = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

let googleConfigured = false;
function configureGoogle() {
  const G = getGoogle();
  if (!G || googleConfigured || !GOOGLE_WEB) return G;
  G.GoogleSignin.configure({ webClientId: GOOGLE_WEB, iosClientId: GOOGLE_IOS });
  googleConfigured = true;
  return G;
}

type AuthState = {
  user: User | null;
  loading: boolean;
  configured: boolean;
  appleAvailable: boolean;
  googleAvailable: boolean;
  signIn: (email: string, pw: string) => Promise<void>;
  signUp: (email: string, pw: string, name?: string) => Promise<void>;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  // Permanently delete the account + the user's data. Required by Apple
  // (guideline 5.1.1(v)) and Google Play for any app that supports sign-up.
  deleteAccount: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isConfigured);
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (!isConfigured || !auth) {
      setLoading(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const A = getApple();
    if (Platform.OS === 'ios' && A?.isAvailableAsync) {
      A.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
    }
  }, []);

  async function signInWithApple() {
    if (!auth) throw new Error('Auth not configured');
    const A = getApple();
    const Cr = getCrypto();
    if (!A || !Cr) throw new Error('Apple sign-in unavailable');
    const bytes: Uint8Array = Cr.getRandomValues(new Uint8Array(16));
    let rawNonce = '';
    for (let i = 0; i < bytes.length; i++) rawNonce += bytes[i].toString(16).padStart(2, '0');
    const hashedNonce = await Cr.digestStringAsync(Cr.CryptoDigestAlgorithm.SHA256, rawNonce);
    const credential = await A.signInAsync({
      requestedScopes: [A.AppleAuthenticationScope.FULL_NAME, A.AppleAuthenticationScope.EMAIL],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) throw new Error('No identity token from Apple');
    const provider = new OAuthProvider('apple.com');
    const firebaseCred = provider.credential({ idToken: credential.identityToken, rawNonce });
    const res = await signInWithCredential(auth, firebaseCred);
    // Apple only returns the name on first sign-in — capture it onto the user.
    const full = credential.fullName;
    if (full?.givenName && res.user && !res.user.displayName) {
      const name = [full.givenName, full.familyName].filter(Boolean).join(' ');
      try { await updateProfile(res.user, { displayName: name }); } catch {}
    }
  }

  async function signInWithGoogle() {
    if (!auth) throw new Error('Auth not configured');
    const G = configureGoogle();
    if (!G || !GOOGLE_WEB) throw new Error('Google sign-in not configured');
    await G.GoogleSignin.hasPlayServices();
    const res = await G.GoogleSignin.signIn();
    const idToken = res?.idToken || res?.data?.idToken;
    if (!idToken) throw new Error('No ID token from Google');
    const cred = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, cred);
  }

  const value: AuthState = {
    user,
    loading,
    configured: isConfigured,
    appleAvailable,
    googleAvailable: !!GOOGLE_WEB,
    signIn: async (email, pw) => {
      if (!auth) throw new Error('Auth not configured');
      await signInWithEmailAndPassword(auth, email.trim(), pw);
    },
    signUp: async (email, pw, name) => {
      if (!auth) throw new Error('Auth not configured');
      const res = await createUserWithEmailAndPassword(auth, email.trim(), pw);
      if (name && res.user) {
        try { await updateProfile(res.user, { displayName: name }); } catch {}
      }
    },
    signInWithApple,
    signInWithGoogle,
    signOut: async () => {
      const G = getGoogle();
      try { if (G && googleConfigured) await G.GoogleSignin.signOut(); } catch {}
      if (auth) await fbSignOut(auth);
    },
    deleteAccount: async () => {
      const u = auth?.currentUser;
      if (!u) throw new Error('Not signed in');
      const uid = u.uid;
      // 1) Best-effort delete the user's stored data. (The auth-user deletion
      //    below is the compliance-critical step; data cleanup is wrapped so a
      //    partial failure never blocks account removal.)
      if (firestore) {
        let familyId = uid;
        try { const us = await getDoc(doc(firestore, 'users', uid)); familyId = (us.data() as any)?.familyId || uid; } catch {}
        try { await deleteDoc(doc(firestore, 'users', uid)); } catch {}
        // Only purge the family + its content when it's this user's OWN family
        // (familyId === uid) — never nuke a shared family they merely joined.
        if (familyId === uid) {
          for (const sub of ['plans', 'memories', 'mealPlans']) {
            try {
              const snap = await getDocs(collection(firestore, 'families', uid, sub));
              await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
            } catch {}
          }
          try { await deleteDoc(doc(firestore, 'families', uid)); } catch {}
        }
      }
      // 2) Delete the Firebase Auth account. Throws 'auth/requires-recent-login'
      //    if the session is stale — the UI catches that and asks the user to
      //    sign in again before retrying.
      const G = getGoogle();
      try { if (G && googleConfigured) await G.GoogleSignin.signOut(); } catch {}
      await deleteUser(u);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used within AuthProvider');
  return v;
}

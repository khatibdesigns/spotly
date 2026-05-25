// Spotly — sign in / sign up (email, Google, Apple).
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn } from '../components/ui';
import { useAuth } from '../lib/auth';

export function AuthScreen({ onBack, initialMode = 'signup' }: { onBack?: () => void; initialMode?: 'signin' | 'signup' }) {
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInWithApple, signInWithGoogle, appleAvailable, googleAvailable, configured } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<void>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      setErr(prettyError(e?.code || e?.message || 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  const submitEmail = () => {
    if (!email || !pw) return setErr('Enter your email and password.');
    run(() => (mode === 'signup' ? signUp(email, pw, name || undefined) : signIn(email, pw)));
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 28, paddingBottom: insets.bottom + 60 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
          {onBack ? (
            <Pressable onPress={onBack} style={[{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }, SH.pill]}>
              {Icons.arrowL({ size: 18, color: C.ink })}
            </Pressable>
          ) : null}

          <View style={{ alignItems: 'center', marginTop: 24 }}>
            <Icons.Mark size={44} />
          </View>
          <Text style={{ fontFamily: F.serif, fontSize: 32, letterSpacing: -0.8, color: C.ink, textAlign: 'center', marginTop: 14 }}>
            {mode === 'signup' ? 'Create your family account' : 'Welcome back'}
          </Text>
          <Text style={{ fontSize: 14.5, color: C.ink2, fontFamily: F.regular, textAlign: 'center', marginTop: 6, lineHeight: 21 }}>
            {mode === 'signup' ? 'Save your spots, plans, and memories across devices.' : 'Sign in to pick up where you left off.'}
          </Text>

          {!configured ? (
            <View style={{ marginTop: 18, padding: 14, borderRadius: R.lg, backgroundColor: C.coralLt }}>
              <Text style={{ color: C.coralDk, fontFamily: F.semibold, fontSize: 13 }}>Auth isn't configured yet — add your Firebase keys to .env.</Text>
            </View>
          ) : null}

          <View style={{ marginTop: 26, gap: 12 }}>
            {mode === 'signup' ? (
              <Field icon={Icons.user} placeholder="Your name (optional)" value={name} onChangeText={setName} autoCapitalize="words" />
            ) : null}
            <Field icon={Icons.globe} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
            <Field icon={Icons.lock} placeholder="Password" value={pw} onChangeText={setPw} secureTextEntry />
          </View>

          {err ? <Text style={{ color: C.coralDk, fontFamily: F.semibold, fontSize: 13, marginTop: 12 }}>{err}</Text> : null}

          <Btn kind="primary" size="lg" full style={{ marginTop: 18 }} onPress={submitEmail}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </Btn>

          {(appleAvailable || googleAvailable) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 18 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
              <Text style={{ color: C.ink3, fontFamily: F.semibold, fontSize: 12 }}>or continue with</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: C.line }} />
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            {appleAvailable ? (
              <SocialBtn label="Continue with Apple" dark onPress={() => run(signInWithApple)} glyph={<AppleGlyph />} />
            ) : null}
            {googleAvailable ? (
              <SocialBtn label="Continue with Google" onPress={() => run(signInWithGoogle)} glyph={<GoogleGlyph />} />
            ) : null}
          </View>

          {busy ? <ActivityIndicator color={C.coral} style={{ marginTop: 18 }} /> : null}

          <Pressable onPress={() => { setErr(null); setMode(mode === 'signup' ? 'signin' : 'signup'); }} style={{ marginTop: 24 }}>
            <Text style={{ textAlign: 'center', color: C.ink2, fontFamily: F.regular, fontSize: 14 }}>
              {mode === 'signup' ? 'Already have an account? ' : "New to Spotly? "}
              <Text style={{ color: C.coralDk, fontFamily: F.bold }}>{mode === 'signup' ? 'Sign in' : 'Create one'}</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function Field({ icon, ...props }: any) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: R.lg, paddingHorizontal: 14, height: 52, borderWidth: 1, borderColor: C.line }]}>
      {icon({ size: 18, color: C.ink3 })}
      <TextInput
        style={{ flex: 1, fontFamily: F.medium, fontSize: 15, color: C.ink }}
        placeholderTextColor={C.ink3}
        autoCorrect={false}
        {...props}
      />
    </View>
  );
}

function SocialBtn({ label, onPress, glyph, dark }: { label: string; onPress: () => void; glyph: React.ReactNode; dark?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={[{ height: 52, borderRadius: R.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: dark ? C.ink : C.surface, borderWidth: dark ? 0 : 1.5, borderColor: C.line }]}
    >
      {glyph}
      <Text style={{ fontFamily: F.bold, fontSize: 15, color: dark ? '#fff' : C.ink }}>{label}</Text>
    </Pressable>
  );
}

function AppleGlyph() {
  return (
    <Svg width={18} height={20} viewBox="0 0 384 512">
      <Path fill="#fff" d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </Svg>
  );
}
function GoogleGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 48 48">
      <Path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <Path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <Path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <Path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </Svg>
  );
}

function prettyError(code: string): string {
  const map: Record<string, string> = {
    'auth/invalid-email': 'That email looks invalid.',
    'auth/email-already-in-use': 'That email already has an account — try signing in.',
    'auth/weak-password': 'Password should be at least 6 characters.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'No account found for that email.',
    'auth/network-request-failed': 'Network error — check your connection.',
  };
  return map[code] || code.replace('auth/', '').replace(/-/g, ' ');
}

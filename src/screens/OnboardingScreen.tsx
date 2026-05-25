// Spotly — pre-auth flow: marketing (welcome + pillars) → auth.
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn } from '../components/ui';
import { useI18n } from '../lib/i18n';
import { AuthScreen } from './AuthScreen';

function Dots({ active, count }: { active: number; count: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={{ width: i === active ? 22 : 6, height: 6, borderRadius: 3, backgroundColor: i === active ? C.coral : C.line }} />
      ))}
    </View>
  );
}

export function OnboardingScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const [view, setView] = useState<'welcome' | 'pillars' | 'auth'>('welcome');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');

  if (view === 'auth') {
    return <AuthScreen initialMode={authMode} onBack={() => setView('welcome')} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {view === 'welcome' ? (
        <Welcome
          insetsTop={insets.top}
          insetsBottom={insets.bottom}
          onStart={() => setView('pillars')}
          onSignIn={() => { setAuthMode('signin'); setView('auth'); }}
        />
      ) : (
        <Pillars insetsTop={insets.top} />
      )}

      {view === 'pillars' ? (
        <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 24 }}>
          <Btn kind="primary" size="lg" full onPress={() => { setAuthMode('signup'); setView('auth'); }}>
            {t('common.continue')}
          </Btn>
        </View>
      ) : null}
    </View>
  );
}

function Welcome({ insetsTop, insetsBottom, onStart, onSignIn }: { insetsTop: number; insetsBottom: number; onStart: () => void; onSignIn: () => void }) {
  const { t } = useI18n();
  const pins = [
    { top: 90, left: 50, rot: '-12deg', size: 36, color: C.sage },
    { top: 150, right: 60, rot: '8deg', size: 48, color: C.coral },
    { top: 220, left: 90, rot: '-4deg', size: 28, color: C.sun },
    { top: 290, right: 110, rot: '14deg', size: 32, color: C.plum },
  ];
  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={['#fbe4d8', C.bg]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 420 }} />
      {pins.map((p, i) => (
        <View key={i} style={{ position: 'absolute', top: insetsTop + p.top, left: p.left, right: p.right, transform: [{ rotate: p.rot }] }}>
          <Icons.Mark size={p.size} color={p.color} />
        </View>
      ))}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 200, paddingHorizontal: 28, alignItems: 'center' }}>
        <Icons.Mark size={52} />
        <Text style={{ fontFamily: F.serif, fontSize: 44, lineHeight: 46, letterSpacing: -1.4, color: C.ink, textAlign: 'center', marginTop: 16 }}>
          {t('onb.heroTitle')}
        </Text>
        <Text style={{ fontSize: 16, lineHeight: 23, color: C.ink2, fontFamily: F.regular, textAlign: 'center', marginTop: 16, maxWidth: 290 }}>
          {t('onb.heroSub')}
        </Text>
      </View>
      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insetsBottom + 24, gap: 10 }}>
        <Btn kind="primary" size="lg" full onPress={onStart}>{t('onb.getStarted')}</Btn>
        <Btn kind="ghost" size="lg" full onPress={onSignIn}>{t('onb.haveAccount')}</Btn>
      </View>
    </View>
  );
}

function Pillars({ insetsTop }: { insetsTop: number }) {
  const { t } = useI18n();
  const pillars = [
    { ic: Icons.compass, c: C.coral, t: t('onb.p1t'), d: t('onb.p1d') },
    { ic: Icons.calendar, c: C.sky, t: t('onb.p2t'), d: t('onb.p2d') },
    { ic: Icons.album, c: C.sage, t: t('onb.p3t'), d: t('onb.p3d') },
  ];
  return (
    <ScrollView contentContainerStyle={{ paddingTop: insetsTop + 30, paddingHorizontal: 28, paddingBottom: 160 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>{t('onb.howItWorks')}</Text>
      <Text style={{ fontFamily: F.serif, fontSize: 36, lineHeight: 38, marginTop: 8, letterSpacing: -1, color: C.ink, maxWidth: 280 }}>
        {t('onb.threeThings')}
      </Text>
      <View style={{ marginTop: 38, gap: 14 }}>
        {pillars.map((p, i) => (
          <View key={i} style={[{ backgroundColor: C.surface, borderRadius: R.xl, padding: 18, flexDirection: 'row', gap: 16, alignItems: 'flex-start' }, SH.card]}>
            <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: p.c, alignItems: 'center', justifyContent: 'center' }}>
              {p.ic({ size: 26, color: '#fff', filled: true })}
            </View>
            <View style={{ flex: 1, paddingTop: 2 }}>
              <Text style={{ fontSize: 16, fontFamily: F.bold, color: C.ink }}>{p.t}</Text>
              <Text style={{ fontSize: 13.5, color: C.ink2, fontFamily: F.regular, marginTop: 3, lineHeight: 19 }}>{p.d}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={{ alignItems: 'center', marginTop: 28 }}>
        <Dots active={1} count={3} />
      </View>
    </ScrollView>
  );
}

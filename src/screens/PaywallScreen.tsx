// Spotly — Paywall (Spotly Plus) backed by RevenueCat.
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, CircBtn } from '../components/ui';
import { useStore } from '../lib/store';
import { usePurchases } from '../lib/purchases';

function PlanCard({ t, p, sub, badge, sel, onPress }: { t: string; p: string; sub: string; badge?: string; sel?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[{ flex: 1, paddingVertical: 16, paddingHorizontal: 14, borderRadius: R.xl, backgroundColor: sel ? '#fff' : 'transparent', borderWidth: 2, borderColor: sel ? C.premium : C.line }, sel && SH.card]}>
      {badge ? (
        <View style={{ position: 'absolute', top: -10, right: 12, backgroundColor: C.premium, borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ color: '#fff', fontSize: 9, fontFamily: F.extrabold, letterSpacing: 0.6 }}>{badge}</Text>
        </View>
      ) : null}
      <Text style={{ fontSize: 11, color: C.ink3, fontFamily: F.extrabold, letterSpacing: 0.4, textTransform: 'uppercase' }}>{t}</Text>
      <Text style={{ fontFamily: F.serif, fontSize: 26, marginTop: 6, letterSpacing: -0.5, color: C.ink }}>{p}</Text>
      <Text style={{ fontSize: 11, color: C.ink3, fontFamily: F.semibold, marginTop: 2 }}>{sub}</Text>
    </Pressable>
  );
}

export function PaywallScreen() {
  const insets = useSafeAreaInsets();
  const { pop } = useStore();
  const { packages, purchase, restore, isPlus } = usePurchases();
  const [sel, setSel] = useState<'annual' | 'monthly'>('annual');
  const [busy, setBusy] = useState(false);

  const monthly = packages.find((p: any) => p.packageType === 'MONTHLY');
  const annual = packages.find((p: any) => p.packageType === 'ANNUAL');
  const selPkg = sel === 'annual' ? annual : monthly;
  const monthlyPrice = monthly?.product?.priceString || '€4.99';
  const annualPrice = annual?.product?.priceString || '€39.99';

  const feats = [
    { ic: Icons.album, t: 'Unlimited photo storage', d: 'Save every memory in original quality.' },
    { ic: Icons.sparkle, t: 'Personalized weekly picks', d: 'Tuned to your kids, weather, and season.' },
    { ic: Icons.pin, t: 'Full memory map & passport stats', d: 'Countries, cities, streaks.' },
    { ic: Icons.calendar, t: 'Multiple named plans', d: 'Build the spring break and the Saturday — both.' },
    { ic: Icons.globe, t: 'City guides & themed collections', d: 'Editor-curated lists for every trip.' },
  ];

  const onBuy = async () => {
    if (isPlus) { pop(); return; }
    if (!selPkg) { Alert.alert('Spotly Plus is almost ready', 'Subscriptions are being finalized in the store — check back soon.'); return; }
    setBusy(true);
    try {
      await purchase(selPkg);
      Alert.alert('Welcome to Spotly Plus! 🎉', 'Your subscription is active.', [{ text: 'Done', onPress: pop }]);
    } catch (e: any) {
      if (!e?.userCancelled) Alert.alert('Purchase failed', e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    try { await restore(); Alert.alert('Restored', 'Your purchases have been restored.'); }
    catch (e: any) { Alert.alert('Nothing to restore', e?.message || ''); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <LinearGradient colors={['#4a3b7e', C.ink]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 360 }} />

      <View style={{ position: 'absolute', top: insets.top + 6, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', zIndex: 5 }}>
        <CircBtn onPress={pop}>{Icons.close({ size: 18, color: C.ink })}</CircBtn>
        <Pressable onPress={onRestore} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: R.pill, backgroundColor: 'rgba(255,255,255,0.12)', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 12, fontFamily: F.bold }}>Restore purchases</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: insets.top + 64 }}>
          <View style={{ width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.premium }}>
            {Icons.sparkle({ size: 28, color: '#fff' })}
          </View>
          <Text style={{ fontFamily: F.serif, fontSize: 36, lineHeight: 36, letterSpacing: -1, color: '#fff', marginTop: 18 }}>Spotly Plus</Text>
          <Text style={{ marginTop: 8, color: 'rgba(255,255,255,0.8)', fontSize: 14, fontFamily: F.regular, maxWidth: 280, textAlign: 'center', lineHeight: 20 }}>
            {isPlus ? "You're a Plus member — thank you!" : 'The whole family, every weekend, every memory — without limits.'}
          </Text>
        </View>

        <View style={[{ marginTop: 28, marginHorizontal: 14, backgroundColor: C.bg, borderRadius: 28, paddingVertical: 24, paddingHorizontal: 22 }, SH.pop]}>
          <View style={{ gap: 14 }}>
            {feats.map((f, i) => (
              <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#ecebf7', alignItems: 'center', justifyContent: 'center' }}>
                  {f.ic({ size: 17, color: C.premium })}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.extrabold, fontSize: 14.5, color: C.ink }}>{f.t}</Text>
                  <Text style={{ fontSize: 12.5, color: C.ink2, fontFamily: F.regular, marginTop: 2, lineHeight: 17 }}>{f.d}</Text>
                </View>
              </View>
            ))}
          </View>

          {!isPlus ? (
            <View style={{ marginTop: 22, flexDirection: 'row', gap: 10 }}>
              <PlanCard t="Monthly" p={monthlyPrice} sub="per month" sel={sel === 'monthly'} onPress={() => setSel('monthly')} />
              <PlanCard t="Yearly" p={annualPrice} sub="7-day free trial" badge="BEST" sel={sel === 'annual'} onPress={() => setSel('annual')} />
            </View>
          ) : null}

          <Text style={{ marginTop: 14, textAlign: 'center', fontSize: 11, color: C.ink3, fontFamily: F.regular, lineHeight: 16 }}>
            Auto-renews until cancelled. Cancel anytime in your App Store settings. Booking and printed albums are available on every plan.{'\n'}
            <Text onPress={() => {}}>Terms</Text> · <Text>Privacy</Text>
          </Text>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 14 }}>
        <Btn kind="premium" size="lg" full onPress={onBuy}>
          {busy ? 'Please wait…' : isPlus ? 'You’re on Plus — Done' : sel === 'annual' ? 'Start 7-day free trial' : 'Subscribe monthly'}
        </Btn>
        {busy ? <ActivityIndicator color="#fff" style={{ marginTop: 10 }} /> : null}
      </View>
    </View>
  );
}

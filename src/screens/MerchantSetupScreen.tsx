// Spotly — merchant onboarding. Creates the merchants/{uid} doc + claims a first
// place (pending admin approval). Shown when an authed user intends to be a
// business but has no merchant doc yet.
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, Chip } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useMerchant } from '../lib/merchant';
import { useI18n } from '../lib/i18n';
import { getUserLocation } from '../lib/places';
import type { SpotKind } from '../lib/places';

const KINDS: { id: SpotKind; key: string }[] = [
  { id: 'activity', key: 'kind.activity' },
  { id: 'dining', key: 'kind.dining' },
  { id: 'shop', key: 'kind.shop' },
];

function Field({ label, ...props }: any) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{label}</Text>
      <View style={{ backgroundColor: C.surface, borderRadius: R.lg, paddingHorizontal: 14, minHeight: 50, justifyContent: 'center', borderWidth: 1, borderColor: C.line }}>
        <TextInput style={{ fontFamily: F.medium, fontSize: 15, color: C.ink, paddingVertical: 12 }} placeholderTextColor={C.ink3} autoCorrect={false} {...props} />
      </View>
    </View>
  );
}

export function MerchantSetupScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { createMerchant } = useMerchant();
  const { t } = useI18n();

  const [bizName, setBizName] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [category, setCategory] = useState('');
  const [kind, setKind] = useState<SpotKind>('activity');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);

  const pinLocation = async () => {
    setLocating(true);
    try {
      const loc = await getUserLocation();
      setCoords({ lat: loc.latitude, lng: loc.longitude });
    } finally {
      setLocating(false);
    }
  };

  const submit = async () => {
    if (!bizName.trim() || !placeName.trim()) {
      Alert.alert(t('mset.needName'));
      return;
    }
    setBusy(true);
    try {
      await createMerchant(bizName, {
        name: placeName.trim(),
        category: category.trim() || 'Family spot',
        kind,
        lat: coords?.lat,
        lng: coords?.lng,
      });
      // merchants/{uid} snapshot flips Shell to the merchant home.
    } catch (e: any) {
      Alert.alert(t('mset.couldNotSave'), e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: 24, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Pressable onPress={signOut} hitSlop={8}><Text style={{ color: C.ink3, fontFamily: F.bold, fontSize: 13 }}>{t('profile.signOut')}</Text></Pressable>
        </View>
        <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', marginTop: 8 }}>
          {Icons.shop({ size: 28, color: '#fff' })}
        </View>
        <Text style={{ fontFamily: F.serif, fontSize: 30, lineHeight: 33, marginTop: 16, letterSpacing: -0.8, color: C.ink }}>{t('mset.title')}</Text>
        <Text style={{ marginTop: 8, fontSize: 14.5, color: C.ink2, fontFamily: F.regular, lineHeight: 21 }}>{t('mset.sub')}</Text>

        <Field label={t('mset.bizName')} placeholder={t('mset.bizHint')} value={bizName} onChangeText={setBizName} autoCapitalize="words" />
        <Field label={t('mset.placeName')} placeholder={t('mset.placeHint')} value={placeName} onChangeText={setPlaceName} autoCapitalize="words" />
        <Field label={t('mset.category')} placeholder={t('mset.catHint')} value={category} onChangeText={setCategory} autoCapitalize="words" />

        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase', marginTop: 20, marginBottom: 10 }}>{t('mset.kind')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {KINDS.map((k) => (
            <Chip key={k.id} active={kind === k.id} onPress={() => setKind(k.id)}>{t(k.key)}</Chip>
          ))}
        </View>

        <Pressable onPress={pinLocation} style={{ marginTop: 20, padding: 16, borderRadius: R.lg, backgroundColor: coords ? C.sageLt : C.coralLt, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {Icons.pin({ size: 22, color: coords ? C.sage : C.coralDk, filled: true })}
          <Text style={{ flex: 1, fontSize: 13.5, color: coords ? C.sage : C.coralDk, fontFamily: F.semibold }}>
            {coords ? t('mset.locationSet') : t('mset.useLocation')}
          </Text>
          {locating ? <ActivityIndicator color={C.coralDk} /> : null}
        </Pressable>
      </ScrollView>

      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 20 }}>
        <Btn kind="dark" size="lg" full onPress={submit}>{busy ? t('mset.submitting') : t('mset.submit')}</Btn>
      </View>
    </View>
  );
}

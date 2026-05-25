// Spotly — merchant onboarding. Creates merchants/{uid} + claims a place by
// searching Google Places (no manual data entry). The claim is saved as
// pending; an admin approves it and the merchant is linked to the place.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useMerchant } from '../lib/merchant';
import { useI18n } from '../lib/i18n';
import { getUserLocation, searchPlaces, PlaceSearchResult } from '../lib/places';

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
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<PlaceSearchResult | null>(null);
  const [near, setNear] = useState<{ latitude: number; longitude: number } | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  // Bias the search to the merchant's area when location is available.
  useEffect(() => {
    getUserLocation().then((l) => { if (l.granted) setNear({ latitude: l.latitude, longitude: l.longitude }); }).catch(() => {});
  }, []);

  const runSearch = async () => {
    if (!queryText.trim()) return;
    setSearching(true);
    setSearched(true);
    try {
      setResults(await searchPlaces(queryText, near));
    } finally {
      setSearching(false);
    }
  };

  const submit = async () => {
    if (!selected) { Alert.alert(t('mset.needPlace')); return; }
    setBusy(true);
    try {
      await createMerchant(bizName.trim() || selected.name, {
        name: selected.name,
        category: selected.category || 'Family spot',
        kind: selected.kind,
        lat: selected.lat,
        lng: selected.lng,
        photoUrl: selected.photoUrl,
        address: selected.address,
        googlePlaceId: selected.placeId,
      });
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

        {/* Find your place via Google */}
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 8 }}>{t('mset.findPlace')}</Text>

        {selected ? (
          <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 2, borderColor: C.sage }, SH.card]}>
            {selected.photoUrl ? <Image source={{ uri: selected.photoUrl }} style={{ width: 52, height: 52, borderRadius: 10 }} /> : <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: C.surface2 }} />}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{selected.name}</Text>
              <Text numberOfLines={1} style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{selected.address || selected.category}</Text>
            </View>
            <Pressable onPress={() => { setSelected(null); }} hitSlop={8}><Text style={{ color: C.coralDk, fontFamily: F.bold, fontSize: 13 }}>{t('mset.changePlace')}</Text></Pressable>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: R.lg, paddingHorizontal: 14, height: 50, borderWidth: 1, borderColor: C.line }}>
                {Icons.search({ size: 18, color: C.ink3 })}
                <TextInput
                  style={{ flex: 1, fontFamily: F.medium, fontSize: 15, color: C.ink }}
                  placeholder={t('mset.searchHint')}
                  placeholderTextColor={C.ink3}
                  value={queryText}
                  onChangeText={setQueryText}
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={runSearch}
                />
              </View>
              <Btn kind="dark" onPress={runSearch}>{t('mset.searchBtn')}</Btn>
            </View>

            {searching ? (
              <ActivityIndicator color={C.coral} style={{ marginTop: 18 }} />
            ) : results.length ? (
              <View style={{ marginTop: 12, gap: 8 }}>
                {results.map((r) => (
                  <Pressable key={r.placeId} onPress={() => setSelected(r)} style={[{ backgroundColor: C.surface, borderRadius: R.lg, padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center' }, SH.card]}>
                    {r.photoUrl ? <Image source={{ uri: r.photoUrl }} style={{ width: 48, height: 48, borderRadius: 10 }} /> : <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>{Icons.pin({ size: 18, color: C.ink3 })}</View>}
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 14.5, color: C.ink }}>{r.name}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{r.address || r.category}</Text>
                    </View>
                    {Icons.chevR({ size: 16, color: C.ink3 })}
                  </Pressable>
                ))}
              </View>
            ) : searched ? (
              <Text style={{ marginTop: 14, color: C.ink3, fontFamily: F.regular, fontSize: 14 }}>{t('mset.noResults')}</Text>
            ) : null}
          </>
        )}
      </ScrollView>

      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 20 }}>
        <Btn kind="dark" size="lg" full onPress={submit}>{busy ? t('mset.submitting') : t('mset.submit')}</Btn>
      </View>
    </View>
  );
}

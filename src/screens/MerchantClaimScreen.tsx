// Spotly — claim a branch (merchant). Search the real Google listing, pick a
// country, and claim it INTO the brand. Owner/country managers go live; a branch
// manager's claim is submitted as pending for approval. Mirrors the CRM.
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, TextInput, Alert, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn } from '../components/ui';
import { useStore } from '../lib/store';
import { useI18n } from '../lib/i18n';
import { useMerchant } from '../lib/merchant';
import { getUserLocation, searchPlaces, PlaceSearchResult } from '../lib/places';

const COUNTRIES: [string, string][] = [
  ['KW', 'Kuwait'], ['SA', 'Saudi Arabia'], ['AE', 'UAE'], ['QA', 'Qatar'], ['BH', 'Bahrain'], ['OM', 'Oman'],
];

export function MerchantClaimScreen() {
  const insets = useSafeAreaInsets();
  const { pop } = useStore();
  const { t } = useI18n();
  const { role, scope, claimBranch } = useMerchant();
  const branchMgr = role === 'branch_manager';

  const [country, setCountry] = useState<string>((scope?.countries || [])[0] || 'KW');
  const [branchLabel, setBranchLabel] = useState('');
  const [queryText, setQueryText] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<PlaceSearchResult | null>(null);
  const [near, setNear] = useState<{ latitude: number; longitude: number } | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => { getUserLocation().then((l) => { if (l.granted) setNear({ latitude: l.latitude, longitude: l.longitude }); }).catch(() => {}); }, []);

  const runSearch = async () => {
    if (!queryText.trim()) return;
    setSearching(true); setSearched(true);
    try { setResults(await searchPlaces(queryText, near)); } finally { setSearching(false); }
  };

  const submit = async () => {
    if (!selected) { Alert.alert(t('mset.needPlace')); return; }
    setBusy(true);
    try {
      await claimBranch({
        name: selected.name, category: selected.category || 'Family spot', kind: selected.kind,
        lat: selected.lat, lng: selected.lng, photoUrl: selected.photoUrl, address: selected.address,
        googlePlaceId: selected.placeId, country, branchLabel: branchLabel.trim() || undefined,
      });
      Alert.alert(branchMgr ? t('mclaim.submittedTitle') : t('mclaim.addedTitle'), branchMgr ? t('mclaim.submittedMsg') : t('mclaim.addedMsg'));
      pop();
    } catch (e: any) {
      Alert.alert(t('mset.couldNotSave'), e?.message || 'Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAwareScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 22, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={pop} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {Icons.arrowL({ size: 16, color: C.ink2 })}
            <Text style={{ color: C.ink2, fontFamily: F.bold, fontSize: 14 }}>{t('common.back')}</Text>
          </Pressable>
        </View>
        <Text style={{ fontFamily: F.serif, fontSize: 26, lineHeight: 30, marginTop: 14, letterSpacing: -0.6, color: C.ink }}>{branchMgr ? t('mclaim.titleBranch') : t('mclaim.title')}</Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: C.ink2, fontFamily: F.regular, lineHeight: 21 }}>{branchMgr ? t('mclaim.subBranch') : t('mclaim.sub')}</Text>

        {/* Country */}
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 8 }}>{t('mclaim.country')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {COUNTRIES.map(([code, name]) => {
            const on = country === code;
            return (
              <Pressable key={code} onPress={() => setCountry(code)} style={{ paddingHorizontal: 13, paddingVertical: 8, borderRadius: R.pill, backgroundColor: on ? C.ink : C.surface, borderWidth: 1, borderColor: on ? C.ink : C.line }}>
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: on ? '#fff' : C.ink2 }}>{name}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Branch label */}
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 8 }}>{t('mclaim.branchLabel')}</Text>
        <View style={{ backgroundColor: C.surface, borderRadius: R.lg, paddingHorizontal: 14, height: 50, justifyContent: 'center', borderWidth: 1, borderColor: C.line }}>
          <TextInput style={{ fontFamily: F.medium, fontSize: 15, color: C.ink }} placeholder={t('mclaim.branchHint')} placeholderTextColor={C.ink3} value={branchLabel} onChangeText={setBranchLabel} autoCapitalize="words" />
        </View>

        {/* Find the place */}
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase', marginTop: 22, marginBottom: 8 }}>{t('mset.findPlace')}</Text>
        {selected ? (
          <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 2, borderColor: C.sage }, SH.card]}>
            {selected.photoUrl ? <Image source={{ uri: selected.photoUrl }} style={{ width: 52, height: 52, borderRadius: 10 }} /> : <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: C.surface2 }} />}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{selected.name}</Text>
              <Text numberOfLines={1} style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{selected.address || selected.category}</Text>
            </View>
            <Pressable onPress={() => setSelected(null)} hitSlop={8}><Text style={{ color: C.coralDk, fontFamily: F.bold, fontSize: 13 }}>{t('mset.changePlace')}</Text></Pressable>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: R.lg, paddingHorizontal: 14, height: 50, borderWidth: 1, borderColor: C.line }}>
                {Icons.search({ size: 18, color: C.ink3 })}
                <TextInput style={{ flex: 1, fontFamily: F.medium, fontSize: 15, color: C.ink }} placeholder={t('mset.searchHint')} placeholderTextColor={C.ink3} value={queryText} onChangeText={setQueryText} autoCorrect={false} returnKeyType="search" onSubmitEditing={runSearch} />
              </View>
              <Btn kind="dark" onPress={runSearch}>{t('mset.searchBtn')}</Btn>
            </View>
            {searching ? <ActivityIndicator color={C.coral} style={{ marginTop: 18 }} /> : results.length ? (
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
            ) : searched ? <Text style={{ marginTop: 14, color: C.ink3, fontFamily: F.regular, fontSize: 14 }}>{t('mset.noResults')}</Text> : null}
          </>
        )}
      </KeyboardAwareScrollView>
      <View style={{ position: 'absolute', left: 22, right: 22, bottom: insets.bottom + 18 }}>
        <Btn kind="dark" size="lg" full onPress={submit}>{busy ? t('mset.submitting') : (branchMgr ? t('mclaim.submit') : t('mclaim.add'))}</Btn>
      </View>
    </View>
  );
}

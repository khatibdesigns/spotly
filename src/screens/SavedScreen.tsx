// Spotly — Saved spots (bookmarks). Tap a saved spot to open its detail.
import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { SpotImage, CircBtn } from '../components/ui';
import { useStore } from '../lib/store';
import { useSaves } from '../lib/saves';
import { usePlaces } from '../lib/placesStore';
import { useI18n } from '../lib/i18n';
import { Spot } from '../lib/places';

export function SavedScreen() {
  const insets = useSafeAreaInsets();
  const { pop, push } = useStore();
  const { saved, toggleSave } = useSaves();
  const { setSelected } = usePlaces();
  const { t } = useI18n();

  const open = (s: any) => {
    const spot: Spot = {
      id: s.id, source: 'curated', name: s.name, category: s.category || 'Saved', lat: s.lat, lng: s.lng,
      amenities: [], photoUrl: s.photoUrl, tone: s.tone || 'sun', city: s.city,
    } as any;
    setSelected(spot);
    push('place');
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CircBtn onPress={pop}>{Icons.arrowL({ size: 18, color: C.ink })}</CircBtn>
        <Text style={{ fontFamily: F.serif, fontSize: 26, letterSpacing: -0.6, color: C.ink }}>{t('profile.savedSpots')}</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        {saved.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 50 }}>
            <View style={{ width: 110, height: 110, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.coralLt, borderRadius: 55 }} />
              {Icons.bookmark({ size: 46, color: C.coral })}
            </View>
            <Text style={{ fontFamily: F.serif, fontSize: 24, marginTop: 20, color: C.ink, textAlign: 'center' }}>{t('saved.empty')}</Text>
            <Text style={{ marginTop: 8, color: C.ink2, fontFamily: F.regular, fontSize: 14.5, textAlign: 'center', maxWidth: 260 }}>
              {t('saved.emptySub')}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12, marginTop: 4 }}>
            {saved.map((s) => (
              <Pressable key={s.id} onPress={() => open(s)} style={[{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: C.surface, borderRadius: R.lg, padding: 12 }, SH.card]}>
                <SpotImage photoUrl={s.photoUrl} tone={s.tone || 'sun'} height={56} radius={12} style={{ width: 56 }} />
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{s.name}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12.5, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{s.category || t('saved.saved')}{s.city ? ` · ${s.city}` : ''}</Text>
                </View>
                <Pressable onPress={() => toggleSave({ id: s.id, name: s.name, photoUrl: s.photoUrl, lat: s.lat, lng: s.lng, tone: s.tone } as any)} hitSlop={8}>
                  {Icons.bookmark({ size: 20, color: C.coral, filled: true })}
                </Pressable>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

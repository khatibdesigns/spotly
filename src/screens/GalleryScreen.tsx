// Spotly — Gallery. Real family memories (photos in Storage + Firestore).
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ScrollView, Pressable, Image, Modal, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, CircBtn, TitleHeader } from '../components/ui';
import { useStore } from '../lib/store';
import { useMemories, Memory } from '../lib/memories';
import { usePlaces } from '../lib/placesStore';
import { searchPlaces, PlaceSearchResult } from '../lib/places';
import { choosePhoto } from '../lib/pickImage';
import { useI18n } from '../lib/i18n';
import { useAndroidKeyboardPad } from '../lib/useKeyboard';

export function GalleryScreen() {
  const insets = useSafeAreaInsets();
  const kbPad = useAndroidKeyboardPad();
  const { push } = useStore();
  const { memories, visited, addMemory, uploading } = useMemories();
  const { loc } = usePlaces();
  const { t } = useI18n();
  const [picked, setPicked] = useState<string | null>(null);
  const [placeName, setPlaceName] = useState('');
  const [city, setCity] = useState('');
  const [note, setNote] = useState('');
  const [viewing, setViewing] = useState<Memory | null>(null);
  // Google Places search for "Where was this?" — picking a result captures the
  // place's coords so the memory lands on the map too.
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const chosen = useRef<{ placeId?: string; lat?: number; lng?: number; category?: string } | null>(null);

  // Debounced search as the user types (skips the change made by picking).
  useEffect(() => {
    if (!picked) return; // only while the add-memory modal is open
    const q = placeName.trim();
    if (chosen.current || q.length < 2) { setResults([]); setSearching(false); return; }
    setSearching(true);
    const id = setTimeout(async () => {
      const near = loc?.latitude != null ? { latitude: loc.latitude, longitude: loc.longitude } : undefined;
      const r = await searchPlaces(q, near);
      setResults(r.slice(0, 6));
      setSearching(false);
    }, 350);
    return () => clearTimeout(id);
  }, [placeName, picked, loc?.latitude, loc?.longitude]);

  const onPlaceChange = (text: string) => { chosen.current = null; setPlaceName(text); };
  const pickPlace = (r: PlaceSearchResult) => {
    chosen.current = { placeId: r.placeId, lat: r.lat, lng: r.lng, category: r.category };
    setPlaceName(r.name);
    // Best-effort city from the address (token before the country).
    if (!city && r.address) {
      const parts = r.address.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) setCity(parts[parts.length - 2]);
    }
    setResults([]);
    setSearching(false);
  };

  // Open the most recent memory captured at a given visited place.
  const openPlace = (key: string) => {
    const m = memories.find((mm) => (mm.placeId || mm.placeName || '').toLowerCase() === key);
    if (m) setViewing(m);
  };

  const pick = async () => {
    const uri = await choosePhoto({ labels: { title: t('photo.title'), camera: t('photo.take'), library: t('photo.library'), cancel: t('common.cancel'), permTitle: t('gallery.permTitle'), permMsg: t('gallery.permMsg') } });
    if (!uri) return;
    setPicked(uri);
    setPlaceName('');
    setCity('');
    setNote('');
    setResults([]);
    chosen.current = null;
  };

  const save = async () => {
    if (!picked || !placeName.trim()) return;
    try {
      await addMemory({
        photoUri: picked,
        placeName: placeName.trim(),
        city: city.trim() || undefined,
        note: note.trim() || undefined,
        placeId: chosen.current?.placeId,
        category: chosen.current?.category,
        lat: chosen.current?.lat,
        lng: chosen.current?.lng,
      });
      setPicked(null);
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TitleHeader
        title={t('gallery.title')}
        eyebrow={t('gallery.memoryCount', { m: memories.length, p: visited.length })}
        topInset={insets.top}
        right={<CircBtn onPress={pick}>{Icons.camera({ size: 18, color: C.ink })}</CircBtn>}
      />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}>
        {memories.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 40 }}>
            <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.sageLt, borderRadius: 60 }} />
              {Icons.album({ size: 58, color: C.sage, filled: true })}
            </View>
            <Text style={{ fontFamily: F.serif, fontSize: 26, marginTop: 22, letterSpacing: -0.5, color: C.ink, textAlign: 'center' }}>{t('gallery.startAlbum')}</Text>
            <Text style={{ marginTop: 8, color: C.ink2, fontFamily: F.regular, fontSize: 14.5, lineHeight: 21, textAlign: 'center', maxWidth: 290 }}>
              {t('gallery.startSub')}
            </Text>
            <View style={{ marginTop: 22, width: '100%' }}>
              <Btn kind="sage" full onPress={pick} icon={Icons.camera({ size: 16, color: '#fff' })}>{t('gallery.addMemory')}</Btn>
            </View>
          </View>
        ) : (
          <>
            {/* Album CTA */}
            <LinearGradient colors={[C.sage, '#2a6b5b']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ marginTop: 8, borderRadius: R.xxl, padding: 20, overflow: 'hidden' }, SH.card]}>
              <View style={{ position: 'absolute', right: -10, top: -10, opacity: 0.18, transform: [{ rotate: '8deg' }] }}>
                {Icons.album({ size: 160, color: '#fff', filled: true })}
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>{t('gallery.keepsake')}</Text>
              <Text style={{ fontFamily: F.serif, fontSize: 24, color: '#fff', marginTop: 6, lineHeight: 27, letterSpacing: -0.5 }}>{t('gallery.turnInto', { n: memories.length })}</Text>
              <View style={{ marginTop: 14, flexDirection: 'row', gap: 8 }}>
                <Btn kind="dark" size="sm" style={{ backgroundColor: '#fff' }} onPress={() => push('albumEditor')} icon={Icons.album({ size: 14, color: C.sage, filled: true })}>
                  <Text style={{ color: C.sage, fontFamily: F.bold, fontSize: 13.5 }}>{t('gallery.makeAlbum')}</Text>
                </Btn>
                <Btn kind="ghost" size="sm" style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderColor: 'transparent' }} onPress={pick}>
                  <Text style={{ color: '#fff', fontFamily: F.bold, fontSize: 13.5 }}>{t('gallery.addMore')}</Text>
                </Btn>
              </View>
            </LinearGradient>

            {/* Timeline grid */}
            <Text style={{ fontFamily: F.serif, fontSize: 22, letterSpacing: -0.4, color: C.ink, marginTop: 26 }}>{t('gallery.recent')}</Text>
            <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {memories.map((m) => (
                <Pressable key={m.id} onPress={() => setViewing(m)} style={{ width: '32%', aspectRatio: 1, borderRadius: R.md, overflow: 'hidden', backgroundColor: C.surface2 }}>
                  <Image source={{ uri: m.photoUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                </Pressable>
              ))}
            </View>

            {/* By place */}
            {visited.length ? (
              <>
                <Text style={{ fontFamily: F.serif, fontSize: 22, letterSpacing: -0.4, color: C.ink, marginTop: 26 }}>{t('gallery.placesBeen')}</Text>
                <View style={{ marginTop: 12, gap: 10 }}>
                  {visited.map((p) => (
                    <Pressable key={p.key} onPress={() => openPlace(p.key)} style={[{ flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: C.surface, borderRadius: R.lg, padding: 12 }, SH.card]}>
                      {p.photoUrl ? <Image source={{ uri: p.photoUrl }} style={{ width: 56, height: 56, borderRadius: 12 }} /> : <View style={{ width: 56, height: 56, borderRadius: 12, backgroundColor: C.surface2 }} />}
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 14, color: C.ink }}>{p.name}</Text>
                        <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{p.city ? `${p.city} · ` : ''}{t(p.visits === 1 ? 'gallery.visit' : 'gallery.visits', { n: p.visits })}</Text>
                      </View>
                      {Icons.chevR({ size: 16, color: C.ink3 })}
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </>
        )}
      </ScrollView>

      {/* Add memory modal */}
      <Modal visible={!!picked} transparent animationType="slide" onRequestClose={() => setPicked(null)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.45)', justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: insets.bottom + 22 + kbPad }}>
            <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 16 }} />
            <Text style={{ fontFamily: F.serif, fontSize: 24, letterSpacing: -0.5, color: C.ink }}>{t('gallery.addMemory')}</Text>
            {picked ? <Image source={{ uri: picked }} style={{ width: '100%', height: 180, borderRadius: R.lg, marginTop: 14, backgroundColor: C.surface2 }} resizeMode="cover" /> : null}
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase', marginTop: 16, marginBottom: 6 }}>{t('gallery.place')} *</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: R.md, paddingHorizontal: 12, borderWidth: 1, borderColor: C.line }}>
              {Icons.search({ size: 16, color: C.ink3 })}
              <TextInput value={placeName} onChangeText={onPlaceChange} placeholder={t('gallery.placeHint')} placeholderTextColor={C.ink3} style={{ flex: 1, fontFamily: F.regular, fontSize: 15, color: C.ink, paddingVertical: 12 }} autoCorrect={false} />
              {searching ? <ActivityIndicator size="small" color={C.ink3} /> : placeName.length ? <Pressable onPress={() => onPlaceChange('')} hitSlop={8}>{Icons.close({ size: 15, color: C.ink3 })}</Pressable> : null}
            </View>
            {results.length > 0 ? (
              <View style={[{ backgroundColor: C.surface, borderRadius: R.md, marginTop: 6, overflow: 'hidden' }, SH.card]}>
                {results.map((r, i) => (
                  <Pressable key={r.placeId || i} onPress={() => pickPlace(r)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                    {Icons.pin({ size: 15, color: C.coral })}
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontFamily: F.semibold, fontSize: 14, color: C.ink }}>{r.name}</Text>
                      {r.address ? <Text numberOfLines={1} style={{ fontFamily: F.regular, fontSize: 12, color: C.ink3, marginTop: 1 }}>{r.address}</Text> : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase', marginTop: 12, marginBottom: 6 }}>{t('gallery.city')}</Text>
            <TextInput value={city} onChangeText={setCity} placeholder={t('gallery.cityHint')} placeholderTextColor={C.ink3} style={inputStyle} />
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase', marginTop: 12, marginBottom: 6 }}>{t('gallery.note')}</Text>
            <TextInput value={note} onChangeText={setNote} placeholder={t('gallery.noteHint')} placeholderTextColor={C.ink3} style={[inputStyle, { height: 70 }]} multiline />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <Btn kind="ghost" style={{ flex: 1 }} onPress={() => setPicked(null)}>{t('common.cancel')}</Btn>
              <Btn kind="sage" style={{ flex: 1.6 }} onPress={save}>{uploading ? t('gallery.saving') : t('gallery.saveMemory')}</Btn>
            </View>
            {uploading ? <ActivityIndicator color={C.sage} style={{ marginTop: 12 }} /> : null}
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* Memory viewer */}
      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(12,10,8,0.92)' }}>
          <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={() => setViewing(null)} />
          <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 18 }}>
            {viewing ? (
              <>
                <Image source={{ uri: viewing.photoUrl }} style={{ width: '100%', height: '62%', borderRadius: R.xl, backgroundColor: C.surface2 }} resizeMode="cover" />
                <View style={{ marginTop: 16 }}>
                  <Text style={{ fontFamily: F.serif, fontSize: 24, color: '#fff', letterSpacing: -0.4 }}>{viewing.placeName}</Text>
                  {viewing.city || viewing.createdAt?.toDate ? (
                    <Text style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', fontFamily: F.regular, marginTop: 3 }}>
                      {viewing.city ? viewing.city : ''}{viewing.city && viewing.createdAt?.toDate ? ' · ' : ''}{viewing.createdAt?.toDate ? viewing.createdAt.toDate().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                    </Text>
                  ) : null}
                  {viewing.note ? <Text style={{ fontSize: 15, color: 'rgba(255,255,255,0.92)', fontFamily: F.regular, marginTop: 12, lineHeight: 22 }}>{viewing.note}</Text> : null}
                  {viewing.lat != null && viewing.lng != null ? (
                    <View style={{ marginTop: 16 }}>
                      <Btn kind="ghost" size="sm" style={{ alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'transparent' }} icon={Icons.directions({ size: 14, color: '#fff' })} onPress={() => {
                        const url = Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${viewing.lat},${viewing.lng}` : `https://www.google.com/maps/dir/?api=1&destination=${viewing.lat},${viewing.lng}`;
                        Linking.openURL(url).catch(() => {});
                      }}>
                        <Text style={{ color: '#fff', fontFamily: F.bold, fontSize: 13 }}>Directions</Text>
                      </Btn>
                    </View>
                  ) : null}
                </View>
              </>
            ) : null}
          </View>
          <Pressable onPress={() => setViewing(null)} hitSlop={10} style={{ position: 'absolute', top: insets.top + 8, right: 18, width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
            {Icons.close({ size: 18, color: '#fff' })}
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const inputStyle = {
  backgroundColor: C.surface,
  borderRadius: R.lg,
  paddingHorizontal: 14,
  paddingVertical: 12,
  fontFamily: F.medium,
  fontSize: 15,
  color: C.ink,
  borderWidth: 1,
  borderColor: C.line,
} as const;

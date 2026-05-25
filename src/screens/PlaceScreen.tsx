// Spotly — Place detail for a real selected place (Google/curated).
import React from 'react';
import { View, Text, ScrollView, Alert, Linking, Share, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker } from 'react-native-maps';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, SpotImage, Stars, CircBtn } from '../components/ui';
import { useStore } from '../lib/store';
import { usePlaces } from '../lib/placesStore';
import { usePlans } from '../lib/plans';
import { useSaves } from '../lib/saves';
import { formatDistance } from '../lib/places';

const AMENITY_META: Record<string, { ic: (p: any) => React.ReactNode; c: string; label: string }> = {
  playArea: { ic: Icons.playArea, c: C.coral, label: 'Play area' },
  foodOnSite: { ic: Icons.foodOnSite, c: C.coral, label: 'Food' },
  parking: { ic: Icons.parking, c: C.ink2, label: 'Parking' },
  animals: { ic: Icons.animals, c: C.sun, label: 'Animals' },
  indoor: { ic: Icons.indoor, c: C.ink2, label: 'Indoor' },
  outdoor: { ic: Icons.outdoor, c: C.sage, label: 'Outdoor' },
  water: { ic: Icons.water, c: C.sky, label: 'Water' },
  arts: { ic: Icons.arts, c: C.plum, label: 'Arts' },
  restroom: { ic: Icons.restroom, c: C.ink2, label: 'Restrooms' },
  changing: { ic: Icons.changing, c: C.ink2, label: 'Changing' },
  shade: { ic: Icons.shade, c: C.sage, label: 'Shade' },
  museum: { ic: Icons.museum, c: C.ink2, label: 'Museum' },
  shop: { ic: Icons.shop, c: C.plum, label: 'Kids shop' },
  stroller: { ic: Icons.stroller, c: C.ink2, label: 'Stroller ok' },
};

export function PlaceScreen() {
  const insets = useSafeAreaInsets();
  const { pop, push, setTab, popToRoot } = useStore();
  const { selected } = usePlaces();
  const { addSpotToPlan } = usePlans();
  const { isSaved, toggleSave } = useSaves();

  const spot = selected;
  const saved = spot ? isSaved(spot.id) : false;

  const addToPlan = async () => {
    if (!spot) return;
    try {
      await addSpotToPlan(spot);
      popToRoot();
      setTab('plan');
    } catch (e: any) {
      Alert.alert('Could not add to plan', e?.message || 'Please try again.');
    }
  };

  const openDirections = () => {
    if (!spot || spot.lat == null) return;
    const q = encodeURIComponent(spot.name || '');
    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${spot.lat},${spot.lng}&q=${q}`
      : `https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`;
    Linking.openURL(url).catch(() => {});
  };

  const onShare = () => {
    if (!spot) return;
    Share.share({ message: `${spot.name}${spot.address ? ' — ' + spot.address : ''} · found on Spotly` }).catch(() => {});
  };
  const region = spot && spot.lat != null
    ? { latitude: spot.lat, longitude: spot.lng, latitudeDelta: 0.012, longitudeDelta: 0.012 }
    : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Hero */}
        <View style={{ height: 360 }}>
          <SpotImage photoUrl={spot?.photoUrl} tone={spot?.tone || 'sun'} height={360} radius={0} label={spot?.name} />
          <LinearGradient colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.45)']} locations={[0, 0.4, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        </View>

        {/* Content card */}
        <View style={{ marginTop: -32, backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingTop: 18, paddingBottom: 8 }}>
          <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 18 }} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.serif, fontSize: 28, lineHeight: 31, letterSpacing: -0.6, color: C.ink }}>{spot?.name || 'Place'}</Text>
              <Text style={{ marginTop: 8, fontSize: 13, color: C.ink2, fontFamily: F.regular }}>
                {spot?.category}{spot?.distanceKm != null ? ` · ${formatDistance(spot.distanceKm)} away` : ''}
              </Text>
            </View>
            {spot?.openNow != null ? (
              <Text style={{ backgroundColor: spot.openNow ? C.good : C.ink3, color: '#fff', fontSize: 10, fontFamily: F.extrabold, paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, letterSpacing: 0.6, overflow: 'hidden' }}>
                {spot.openNow ? 'OPEN NOW' : 'CLOSED'}
              </Text>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 }}>
            {spot?.rating ? <Stars value={spot.rating.toFixed(1)} /> : null}
            {spot?.reviews ? <Text style={{ color: C.ink3, fontSize: 12, fontFamily: F.regular }}>· {spot.reviews} reviews</Text> : null}
            {spot?.price ? <Text style={{ color: C.ink3, fontSize: 12, fontFamily: F.regular }}>· {spot.price}</Text> : null}
            {spot?.ages ? <Text style={{ marginLeft: 'auto', backgroundColor: C.sageLt, color: C.sage, fontSize: 10.5, fontFamily: F.extrabold, paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.pill, overflow: 'hidden' }}>AGE {spot.ages}</Text> : null}
          </View>

          {spot?.address ? (
            <Text style={{ marginTop: 18, fontSize: 14, color: C.ink2, fontFamily: F.regular, lineHeight: 21 }}>{spot.address}</Text>
          ) : null}

          {/* Amenities */}
          {spot?.amenities?.length ? (
            <>
              <Text style={{ marginTop: 22, fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>What you’ll find</Text>
              <View style={{ marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {spot.amenities.map((a) => {
                  const m = AMENITY_META[a];
                  if (!m) return null;
                  return (
                    <View key={a} style={[{ width: '23%', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 4, backgroundColor: C.surface, borderRadius: R.md }, SH.card]}>
                      {m.ic({ size: 24, color: m.c })}
                      <Text style={{ fontSize: 10.5, fontFamily: F.bold, color: C.ink2, textAlign: 'center', lineHeight: 13 }}>{m.label}</Text>
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* Map */}
          {region ? (
            <View style={[{ marginTop: 18, borderRadius: R.xl, overflow: 'hidden', height: 170 }, SH.card]}>
              <MapView style={{ flex: 1 }} initialRegion={region} pointerEvents="none" scrollEnabled={false} zoomEnabled={false}>
                <Marker coordinate={{ latitude: spot!.lat, longitude: spot!.lng }} />
              </MapView>
              <View style={{ position: 'absolute', bottom: 12, left: 12, right: 12, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: R.lg, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontSize: 12, fontFamily: F.bold, color: C.ink }}>{spot?.name}</Text>
                  <Text numberOfLines={1} style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular }}>{spot?.address || 'Tap Go for directions'}</Text>
                </View>
                <Btn kind="dark" size="sm" icon={Icons.directions({ size: 14, color: '#fff' })} onPress={openDirections}>Go</Btn>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Top nav */}
      <View style={{ position: 'absolute', top: insets.top + 6, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
        <CircBtn onPress={pop}>{Icons.arrowL({ size: 18, color: C.ink })}</CircBtn>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <CircBtn onPress={onShare}>{Icons.share({ size: 18, color: C.ink })}</CircBtn>
          <CircBtn onPress={() => spot && toggleSave(spot)}>{Icons.bookmark({ size: 18, color: saved ? C.coral : C.ink, filled: saved })}</CircBtn>
        </View>
      </View>

      {/* Sticky CTA */}
      <View style={[{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12, height: 72, backgroundColor: C.surface, borderRadius: 24, flexDirection: 'row', alignItems: 'center', padding: 10, gap: 10 }, SH.pop]}>
        <Btn kind="ghost" style={{ flex: 1, height: 52 }} icon={Icons.calendar({ size: 15, color: C.ink })} onPress={addToPlan}>Add to plan</Btn>
        <Btn kind="primary" style={{ flex: 1.3, height: 52 }} onPress={() => push('booking')}>Request to book →</Btn>
      </View>
    </View>
  );
}

// Spotly — Map. Real Apple map; toggle between nearby discovery and the
// family's "places we've been" (from memories). Passport stats are real.
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Linking, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker } from 'react-native-maps';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, SpotImage, CircBtn } from '../components/ui';
import { useStore } from '../lib/store';
import { usePlaces } from '../lib/placesStore';
import { useMemories } from '../lib/memories';
import { Spot, formatDistance } from '../lib/places';

type Pin = { id: string; name: string; lat: number; lng: number; photoUrl?: string; tone?: string; sub: string; spot?: Spot };

function StatPill({ icon, v, l }: { icon: React.ReactNode; v: string; l: string }) {
  return (
    <View style={[{ flex: 1, backgroundColor: 'rgba(255,255,255,0.96)', borderRadius: 14, paddingVertical: 10, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }, SH.pill]}>
      {icon}
      <View>
        <Text style={{ fontSize: 16, fontFamily: F.extrabold, color: C.ink, lineHeight: 17 }}>{v}</Text>
        <Text style={{ fontSize: 10, color: C.ink3, fontFamily: F.semibold, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 1 }}>{l}</Text>
      </View>
    </View>
  );
}

function Toggle({ mode, onChange }: { mode: 'nearby' | 'been'; onChange: (m: 'nearby' | 'been') => void }) {
  const Seg = ({ id, label, icon }: { id: 'nearby' | 'been'; label: string; icon?: React.ReactNode }) => {
    const on = mode === id;
    return (
      <Pressable onPress={() => onChange(id)} style={{ flex: 1, height: '100%', borderRadius: 999, backgroundColor: on ? C.ink : 'transparent', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {on ? icon : null}
        <Text style={{ color: on ? '#fff' : C.ink2, fontFamily: F.bold, fontSize: 12 }}>{label}</Text>
      </Pressable>
    );
  };
  return (
    <View style={[{ flex: 1, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.96)', flexDirection: 'row', alignItems: 'center', padding: 4 }, SH.pill]}>
      <Seg id="nearby" label="Discover nearby" icon={Icons.compass({ size: 13, color: '#fff', filled: true })} />
      <Seg id="been" label="Places we’ve been" icon={Icons.pin({ size: 13, color: '#fff', filled: true })} />
    </View>
  );
}

export function MapScreen() {
  const insets = useSafeAreaInsets();
  const { push } = useStore();
  const { loc, filtered, setSelected } = usePlaces();
  const { visited, stats } = useMemories();
  const [mode, setMode] = useState<'nearby' | 'been'>('nearby');
  const [active, setActive] = useState<Pin | null>(null);

  const region = useMemo(
    () => ({ latitude: loc.latitude, longitude: loc.longitude, latitudeDelta: 0.25, longitudeDelta: 0.25 }),
    [loc.latitude, loc.longitude]
  );

  const pins: Pin[] = useMemo(() => {
    if (mode === 'nearby') {
      return filtered
        .filter((s) => s.lat != null)
        .map((s) => ({ id: s.id, name: s.name, lat: s.lat, lng: s.lng, photoUrl: s.photoUrl, tone: s.tone, sub: `${s.category}${s.distanceKm != null ? ` · ${formatDistance(s.distanceKm)}` : ''}`, spot: s }));
    }
    return visited
      .filter((v) => v.lat != null)
      .map((v) => ({ id: v.key, name: v.name, lat: v.lat as number, lng: v.lng as number, photoUrl: v.photoUrl, tone: v.tone, sub: `${v.city ? v.city + ' · ' : ''}${v.visits} ${v.visits === 1 ? 'visit' : 'visits'}` }));
  }, [mode, filtered, visited]);

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <MapView
        style={{ flex: 1 }}
        initialRegion={region}
        showsUserLocation
        showsMyLocationButton={false}
        scrollEnabled
        zoomEnabled
        rotateEnabled
        pitchEnabled
        onPress={(e) => {
          // A marker tap also bubbles a map onPress; ignore it so the detail
          // sheet isn't opened then instantly closed.
          if ((e.nativeEvent as any)?.action === 'marker-press') return;
          setActive(null);
        }}
      >
        {pins.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            onPress={(e) => { (e as any)?.stopPropagation?.(); setActive(p); }}
          >
            <View style={{ padding: 6 }}>
              <Icons.Mark size={30} color={mode === 'been' ? C.coral : C.sage} />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Top toggle */}
      <View style={{ position: 'absolute', top: insets.top + 6, left: 16, right: 16, flexDirection: 'row', gap: 10 }}>
        <Toggle mode={mode} onChange={(m) => { setMode(m); setActive(null); }} />
        <CircBtn onPress={() => push('filters')}>{Icons.filter({ size: 16, color: C.ink })}</CircBtn>
      </View>

      {/* Passport stats */}
      <View style={{ position: 'absolute', top: insets.top + 52, left: 16, right: 16, flexDirection: 'row', gap: 8 }}>
        <StatPill icon={Icons.globe({ size: 14, color: C.coralDk })} v={String(stats.countries)} l="countries" />
        <StatPill icon={Icons.pin({ size: 14, color: C.sage, filled: true })} v={String(mode === 'been' ? stats.spots : pins.length)} l={mode === 'been' ? 'spots' : 'nearby'} />
        <StatPill icon={Icons.sparkle({ size: 14, color: C.sun })} v={String(stats.weekends)} l="weekends" />
      </View>

      {/* Empty hint for "been" */}
      {mode === 'been' && pins.length === 0 ? (
        <View style={[{ position: 'absolute', left: 24, right: 24, top: '45%', backgroundColor: C.surface, borderRadius: R.xl, padding: 18, alignItems: 'center' }, SH.pop]}>
          <Icons.Mark size={40} color={C.coral} />
          <Text style={{ fontFamily: F.serif, fontSize: 19, color: C.ink, marginTop: 10, textAlign: 'center' }}>No memories pinned yet.</Text>
          <Text style={{ fontSize: 13, color: C.ink2, fontFamily: F.regular, textAlign: 'center', marginTop: 4 }}>Add photos with a city in Gallery and they’ll appear here.</Text>
        </View>
      ) : null}

      {/* Detail sheet */}
      {active ? (
        <View style={[{ position: 'absolute', left: 12, right: 12, bottom: 110, backgroundColor: C.surface, borderRadius: 24, padding: 16 }, SH.pop]}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <SpotImage photoUrl={active.photoUrl} tone={active.tone || 'sun'} height={64} radius={14} style={{ width: 64 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, color: C.ink3, fontFamily: F.bold, textTransform: 'uppercase', letterSpacing: 0.5 }}>{active.sub}</Text>
              <Text numberOfLines={1} style={{ fontFamily: F.extrabold, fontSize: 16, color: C.ink, marginTop: 2 }}>{active.name}</Text>
            </View>
          </View>
          <View style={{ marginTop: 12, flexDirection: 'row', gap: 8 }}>
            {active.spot ? (
              <Btn kind="ghost" size="sm" style={{ flex: 1 }} onPress={() => { setSelected(active.spot!); push('place'); }}>See details</Btn>
            ) : null}
            <Btn kind="dark" size="sm" style={{ flex: 1 }} icon={Icons.directions({ size: 14, color: '#fff' })} onPress={() => {
              const url = Platform.OS === 'ios' ? `http://maps.apple.com/?daddr=${active.lat},${active.lng}` : `https://www.google.com/maps/dir/?api=1&destination=${active.lat},${active.lng}`;
              Linking.openURL(url).catch(() => {});
            }}>Directions</Btn>
          </View>
        </View>
      ) : null}
    </View>
  );
}

// Spotly — Discover filters bottom sheet. Drives the shared filter state.
import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R } from '../lib/theme';
import { Icons } from '../components/icons';
import { Chip, Btn } from '../components/ui';
import { useStore } from '../lib/store';
import { usePlaces } from '../lib/placesStore';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 22 }}>
      <Text style={{ fontSize: 11, fontFamily: F.mono, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>{title}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

const KINDS = [
  { id: 'activity', label: 'Activities', ic: Icons.compass },
  { id: 'dining', label: 'Dining', ic: Icons.dining },
  { id: 'shop', label: 'Kids & baby shops', ic: Icons.shop },
];
const AMENITIES = [
  { id: 'playArea', label: 'Play area', ic: Icons.playArea },
  { id: 'indoor', label: 'Indoor', ic: Icons.indoor },
  { id: 'outdoor', label: 'Outdoor', ic: Icons.outdoor },
  { id: 'foodOnSite', label: 'Food on site', ic: Icons.foodOnSite },
  { id: 'animals', label: 'Animals', ic: Icons.animals },
  { id: 'water', label: 'Water', ic: Icons.water },
  { id: 'museum', label: 'Museum', ic: Icons.museum },
  { id: 'arts', label: 'Arts', ic: Icons.arts },
];
const PRICES = ['Free', '$', '$$', '$$$'];
const PRICE_ID: Record<string, string> = { Free: 'free', $: '$', $$: '$$', $$$: '$$$' };

export function FiltersSheet() {
  const insets = useSafeAreaInsets();
  const { pop } = useStore();
  const { filters, toggleFilter, clearFilters, filtered } = usePlaces();

  return (
    <View style={{ flex: 1 }}>
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,15,10,0.42)' }} onPress={pop} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: insets.top + 60, backgroundColor: C.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24 }}>
        <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginTop: 10, marginBottom: 14 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontFamily: F.serif, fontSize: 26, letterSpacing: -0.6, color: C.ink }}>Filters</Text>
          <Pressable onPress={clearFilters}><Text style={{ fontSize: 13, color: C.coralDk, fontFamily: F.bold }}>Reset</Text></Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
          <Section title="Looking for">
            {KINDS.map((k) => {
              const on = filters.has(k.id);
              return (
                <Chip key={k.id} active={on} onPress={() => toggleFilter(k.id)} icon={k.ic({ size: 14, color: on ? '#fff' : C.ink })}>{k.label}</Chip>
              );
            })}
          </Section>

          <Section title="Amenities">
            {AMENITIES.map((a) => {
              const on = filters.has(a.id);
              return (
                <Chip key={a.id} active={on} onPress={() => toggleFilter(a.id)} icon={a.ic({ size: 14, color: on ? '#fff' : C.ink })}>{a.label}</Chip>
              );
            })}
          </Section>

          <Section title="Price">
            {PRICES.map((p) => (
              <Chip key={p} active={filters.has(PRICE_ID[p])} onPress={() => toggleFilter(PRICE_ID[p])}>{p}</Chip>
            ))}
          </Section>

          <Section title="More">
            <Chip active={filters.has('openNow')} onPress={() => toggleFilter('openNow')}>Open now</Chip>
          </Section>
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 10, paddingBottom: insets.bottom + 12, paddingTop: 6 }}>
          <Btn kind="ghost" style={{ flex: 1 }} onPress={() => { clearFilters(); }}>Clear</Btn>
          <Btn kind="primary" style={{ flex: 2 }} onPress={pop}>Show {filtered.length} {filtered.length === 1 ? 'place' : 'places'}</Btn>
        </View>
      </View>
    </View>
  );
}

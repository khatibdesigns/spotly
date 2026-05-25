// Spotly — floating bottom tab bar.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { C, F, SH } from '../lib/theme';
import { Icons } from './icons';
import { TabId, useStore } from '../lib/store';

const TABS: { id: TabId; label: string; icon: (p: any) => React.ReactNode }[] = [
  { id: 'discover', label: 'Discover', icon: Icons.compass },
  { id: 'plan', label: 'Plan', icon: Icons.calendar },
  { id: 'map', label: 'Map', icon: Icons.pin },
  { id: 'gallery', label: 'Gallery', icon: Icons.album },
  { id: 'profile', label: 'Profile', icon: Icons.user },
];

export function TabBar({ bottomInset = 0 }: { bottomInset?: number }) {
  const { tab, setTab } = useStore();
  return (
    <View
      style={[
        {
          position: 'absolute',
          left: 12,
          right: 12,
          bottom: Math.max(bottomInset, 14),
          height: 70,
          borderRadius: 28,
          backgroundColor: 'rgba(255,255,255,0.96)',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          paddingHorizontal: 6,
        },
        SH.pop,
      ]}
    >
      {TABS.map((t) => {
        const on = t.id === tab;
        const tint = on ? C.coral : C.ink3;
        return (
          <Pressable
            key={t.id}
            onPress={() => setTab(t.id)}
            style={{ alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4 }}
          >
            <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
              {t.icon({ size: 22, filled: on, color: tint })}
            </View>
            <Text style={{ fontFamily: on ? F.bold : F.semibold, fontSize: 10.5, color: tint }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

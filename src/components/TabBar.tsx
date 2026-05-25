// Spotly — floating bottom tab bar.
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { C, F, SH } from '../lib/theme';
import { Icons } from './icons';
import { TabId, useStore } from '../lib/store';
import { useI18n } from '../lib/i18n';

const TABS: { id: TabId; key: string; icon: (p: any) => React.ReactNode }[] = [
  { id: 'discover', key: 'tab.discover', icon: Icons.compass },
  { id: 'plan', key: 'tab.plan', icon: Icons.calendar },
  { id: 'map', key: 'tab.map', icon: Icons.pin },
  { id: 'gallery', key: 'tab.gallery', icon: Icons.album },
  { id: 'profile', key: 'tab.profile', icon: Icons.user },
];

export function TabBar({ bottomInset = 0 }: { bottomInset?: number }) {
  const { tab, setTab } = useStore();
  const { t } = useI18n();
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
      {TABS.map((tab_) => {
        const on = tab_.id === tab;
        const tint = on ? C.coral : C.ink3;
        return (
          <Pressable
            key={tab_.id}
            onPress={() => setTab(tab_.id)}
            style={{ alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4 }}
          >
            <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
              {tab_.icon({ size: 22, filled: on, color: tint })}
            </View>
            <Text style={{ fontFamily: on ? F.bold : F.semibold, fontSize: 10.5, color: tint }}>{t(tab_.key)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

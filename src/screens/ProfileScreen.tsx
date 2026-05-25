// Spotly — Profile, backed by the live family profile + auth.
import React from 'react';
import { View, Text, ScrollView, Pressable, Linking, Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { CircBtn, SectionLabel } from '../components/ui';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { useProfile } from '../lib/profile';
import { useMemories } from '../lib/memories';
import { useBookings } from '../lib/bookings';
import { useSaves } from '../lib/saves';
import { usePurchases } from '../lib/purchases';

const KID_COLORS = [C.sky, C.plum, C.sun, C.sage];

function initial(s?: string, fallback = '?') {
  const c = (s || '').trim()[0];
  return c ? c.toUpperCase() : fallback;
}

function Avatar({ letter, color, size = 36 }: { letter: string; color: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontFamily: F.extrabold, fontSize: size * 0.42 }}>{letter}</Text>
    </View>
  );
}

function IconBox({ ic, c }: { ic: (p: any) => React.ReactNode; c: string }) {
  return (
    <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: '#f1ece4', alignItems: 'center', justifyContent: 'center' }}>
      {ic({ size: 16, color: c })}
    </View>
  );
}

function Row({ icon, title, sub, det, last, onPress, danger }: { icon: React.ReactNode; title: string; sub?: string; det?: string; last?: boolean; onPress?: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line, gap: 12 }}>
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.bold, fontSize: 14.5, color: danger ? C.coralDk : C.ink }}>{title}</Text>
        {sub ? <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{sub}</Text> : null}
      </View>
      {det ? <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.semibold }}>{det}</Text> : null}
      {!danger ? Icons.chevR({ size: 14, color: C.ink3 }) : null}
    </Pressable>
  );
}

function StatCard({ n, l, c }: { n: number; l: string; c: string }) {
  return (
    <View style={[{ flex: 1, backgroundColor: C.surface, borderRadius: R.lg, paddingVertical: 14, paddingHorizontal: 12, overflow: 'hidden' }, SH.card]}>
      <View style={{ position: 'absolute', top: -6, right: -6, opacity: 0.18 }}>
        <Icons.Mark size={36} color={c} />
      </View>
      <Text style={{ fontFamily: F.serif, fontSize: 32, lineHeight: 33, letterSpacing: -1, color: C.ink }}>{n}</Text>
      <Text style={{ fontSize: 11, color: C.ink3, fontFamily: F.bold, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 }}>{l}</Text>
    </View>
  );
}

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { push, setTab } = useStore();
  const { user, signOut } = useAuth();
  const { profile, saveProfile } = useProfile();
  const { stats, memories, visited } = useMemories();

  const editHome = () => {
    if (Platform.OS === 'ios' && (Alert as any).prompt) {
      (Alert as any).prompt('Home city', 'Where are you based?', (t: string) => { if (t?.trim()) saveProfile({ homeCity: t.trim() }); }, 'plain-text', profile?.homeCity || '');
    } else {
      Alert.alert('Home city', profile?.homeCity || 'Not set');
    }
  };
  const openURL = (u: string) => Linking.openURL(u).catch(() => {});
  const { bookings } = useBookings();
  const { saved } = useSaves();
  const { isPlus } = usePurchases();

  const kids = profile?.kids || [];
  const since = profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingBottom: 8, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'flex-end' }}>
        <CircBtn onPress={() => openURL('https://meetspotly.com/support.html')}>{Icons.more({ size: 18, color: C.ink })}</CircBtn>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}>
        {/* Family header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar letter={initial(profile?.familyName || profile?.parentName, 'S')} color={C.coral} size={70} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.serif, fontSize: 26, letterSpacing: -0.6, lineHeight: 28, color: C.ink }}>{profile?.familyName || 'My family'}</Text>
            <Text style={{ fontSize: 13, color: C.ink3, fontFamily: F.regular, marginTop: 3 }}>
              {profile?.homeCity || 'Set your city'}{since ? ` · since ${since}` : ''}
            </Text>
          </View>
        </View>

        {/* Plus badge */}
        <Pressable onPress={() => push('paywall')}>
          <LinearGradient colors={[C.premium, '#363a82']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ marginTop: 18, paddingVertical: 14, paddingHorizontal: 16, borderRadius: R.xl, flexDirection: 'row', alignItems: 'center', gap: 12 }, SH.card]}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              {Icons.sparkle({ size: 18, color: '#fff' })}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.extrabold, fontSize: 14, color: '#fff' }}>Spotly Plus</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.88)', fontFamily: F.regular, marginTop: 1 }}>
                {isPlus ? 'Unlimited memories · active' : 'Unlock unlimited memories & more'}
              </Text>
            </View>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ fontSize: 12, color: '#fff', fontFamily: F.bold }}>{isPlus ? 'Manage' : 'Upgrade'}</Text>
            </View>
          </LinearGradient>
        </Pressable>

        {/* Family members */}
        <SectionLabel>Family</SectionLabel>
        <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, overflow: 'hidden' }, SH.card]}>
          <Row icon={<Avatar letter={initial(profile?.parentName, 'Y')} color={C.coral} />} title={profile?.parentName || 'You'} sub="Parent · you" last={kids.length === 0} />
          {kids.map((k, i) => {
            const fav = (k.favFoods || []).length;
            const avoid = (k.avoidFoods || []).length;
            const foodSub = fav || avoid
              ? [fav ? `loves ${fav}` : '', avoid ? `avoids ${avoid}` : ''].filter(Boolean).join(' · ')
              : 'Add food preferences';
            return (
              <Row
                key={k.id}
                icon={<Avatar letter={initial(k.name, '?')} color={KID_COLORS[i % KID_COLORS.length]} />}
                title={k.name || `Child ${i + 1}`}
                sub={`Age ${k.age} · ${foodSub}`}
                last={i === kids.length - 1}
                onPress={() => push('kidFood', { kidId: k.id })}
              />
            );
          })}
        </View>

        {/* Passport */}
        <SectionLabel>Your passport</SectionLabel>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatCard n={stats.spots} l="spots" c={C.sage} />
          <StatCard n={stats.countries} l="countries" c={C.coral} />
          <StatCard n={stats.weekends} l="weekends" c={C.sun} />
        </View>

        {/* Activity */}
        <SectionLabel>Activity</SectionLabel>
        <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, overflow: 'hidden' }, SH.card]}>
          <Row icon={<IconBox ic={Icons.bookmark} c={C.coral} />} title="Saved spots" det={String(saved.length)} onPress={() => push('saved')} />
          <Row icon={<IconBox ic={Icons.clock} c={C.sage} />} title="Places visited" det={String(visited.length)} onPress={() => setTab('gallery')} />
          <Row icon={<IconBox ic={Icons.album} c={C.plum} />} title="Memories" det={String(memories.length)} onPress={() => setTab('gallery')} />
          <Row icon={<IconBox ic={Icons.calendar} c={C.sky} />} title="Bookings" det={String(bookings.length)} onPress={() => setTab('plan')} last />
        </View>

        {/* Settings */}
        <SectionLabel>Settings</SectionLabel>
        <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, overflow: 'hidden' }, SH.card]}>
          <Row icon={<IconBox ic={Icons.pin} c={C.ink2} />} title="Home & location" det={profile?.homeCity || 'Set'} onPress={editHome} />
          <Row icon={<IconBox ic={Icons.globe} c={C.ink2} />} title="Language" det="English" onPress={() => Alert.alert('Language', 'English is the only language for now — more coming soon.')} />
          <Row icon={<IconBox ic={Icons.lock} c={C.ink2} />} title="Privacy" sub={user?.email || 'Photos are private by default'} onPress={() => openURL('https://meetspotly.com/privacy.html')} />
          <Row icon={<IconBox ic={Icons.sparkle} c={C.ink2} />} title="Notifications" onPress={() => Linking.openSettings().catch(() => {})} last />
        </View>

        {/* Sign out */}
        <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, overflow: 'hidden', marginTop: 16 }, SH.card]}>
          <Row icon={<IconBox ic={Icons.arrowL} c={C.coralDk} />} title="Sign out" onPress={() => signOut()} danger last />
        </View>
      </ScrollView>
    </View>
  );
}

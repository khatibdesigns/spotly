// Spotly — Profile, backed by the live family profile + auth.
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Linking, Alert, Platform, Share, Modal, TextInput, ActivityIndicator, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { choosePhoto } from '../lib/pickImage';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { CircBtn, SectionLabel, Btn } from '../components/ui';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { useProfile } from '../lib/profile';
import { useFamily, buildInviteUrl } from '../lib/family';
import { getPushDiagnostics, registerPush } from '../lib/push';
import { useI18n } from '../lib/i18n';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useMemories } from '../lib/memories';
import { useVouchers } from '../lib/vouchers';
import { useSaves } from '../lib/saves';
import { usePurchases } from '../lib/purchases';

const KID_COLORS = [C.sky, C.plum, C.sun, C.sage];

function initial(s?: string, fallback = '?') {
  const c = (s || '').trim()[0];
  return c ? c.toUpperCase() : fallback;
}

function Avatar({ letter, color, size = 36, photoUrl }: { letter: string; color: string; size?: number; photoUrl?: string }) {
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontFamily: F.extrabold, fontSize: size * 0.42 }}>{letter}</Text>
    </View>
  );
}

// Tappable avatar with a camera badge — set a photo for a person/kid.
function EditableAvatar({ letter, color, photoUrl, busy, onPress, size = 36 }: { letter: string; color: string; photoUrl?: string; busy?: boolean; onPress: () => void; size?: number }) {
  const badge = Math.max(16, Math.round(size * 0.34));
  return (
    <Pressable onPress={onPress} hitSlop={4} style={{ opacity: busy ? 0.5 : 1 }}>
      <Avatar letter={letter} color={color} photoUrl={photoUrl} size={size} />
      <View style={{ position: 'absolute', right: -2, bottom: -2, width: badge, height: badge, borderRadius: badge / 2, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.surface }}>
        {Icons.camera({ size: Math.round(badge * 0.55), color: '#fff' })}
      </View>
    </Pressable>
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
  const { profile, saveProfile, uploadAvatar, uploadImage } = useProfile();
  const { stats, memories, visited } = useMemories();
  const { t, lang, setLang } = useI18n();
  const { isOwnFamily, inviteToFamily, joinFamily, leaveFamily } = useFamily();
  const [joinOpen, setJoinOpen] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);
  // Add-a-child sheet (also available at sign-up).
  const [addKidOpen, setAddKidOpen] = useState(false);
  const [kidName, setKidName] = useState('');
  const [kidAge, setKidAge] = useState(4);
  const [savingKid, setSavingKid] = useState(false);
  // Which avatar is mid-upload: 'family', a member uid, or a kid id.
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);

  const pickImage = (): Promise<string | null> =>
    choosePhoto({ square: true, labels: { title: t('photo.title'), camera: t('photo.take'), library: t('photo.library'), cancel: t('common.cancel'), permTitle: t('gallery.permTitle'), permMsg: t('gallery.permMsg') } });

  const onChangePhoto = async () => {
    if (photoBusy) return;
    const uri = await pickImage(); if (!uri) return;
    setPhotoBusy('family');
    try { await uploadAvatar(uri); }
    catch (e: any) { Alert.alert(t('common.error'), e?.message || t('common.tryAgain')); }
    finally { setPhotoBusy(null); }
  };

  const setMemberPhoto = async (uid: string) => {
    if (photoBusy) return;
    const uri = await pickImage(); if (!uri) return;
    setPhotoBusy(uid);
    try {
      const url = await uploadImage(uri);
      const base = profile?.members?.length ? profile.members : [{ uid: user?.uid || 'me', name: profile?.parentName || 'Parent' }];
      await saveProfile({ members: base.map((m) => (m.uid === uid ? { ...m, photoUrl: url } : m)) });
    } catch (e: any) { Alert.alert(t('common.error'), e?.message || t('common.tryAgain')); }
    finally { setPhotoBusy(null); }
  };

  const setKidPhoto = async (kidId: string) => {
    if (photoBusy) return;
    const uri = await pickImage(); if (!uri) return;
    setPhotoBusy(kidId);
    try {
      const url = await uploadImage(uri);
      await saveProfile({ kids: (profile?.kids || []).map((k) => (k.id === kidId ? { ...k, photoUrl: url } : k)) });
    } catch (e: any) { Alert.alert(t('common.error'), e?.message || t('common.tryAgain')); }
    finally { setPhotoBusy(null); }
  };

  const onAddKid = async () => {
    const name = kidName.trim();
    if (!name) return;
    setSavingKid(true);
    try {
      await saveProfile({ kids: [...(profile?.kids || []), { id: `k${Date.now()}`, name, age: kidAge }] });
      setAddKidOpen(false);
      setKidName('');
      setKidAge(4);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('common.tryAgain'));
    } finally {
      setSavingKid(false);
    }
  };

  // Notifications diagnostics — calls the same APIs registerPush calls and
  // surfaces the EXACT error string verbatim, so we stop guessing.
  const onNotificationsDiag = async () => {
    const d = await getPushDiagnostics();
    const permLabel =
      d.permissionStatus === 1 ? 'authorized'
      : d.permissionStatus === 2 ? 'provisional'
      : d.permissionStatus === 0 ? 'denied'
      : d.permissionStatus === -1 ? 'notDetermined'
      : String(d.permissionStatus);
    const fcmPrev = d.fcmToken ? `${d.fcmToken.slice(0, 16)}…${d.fcmToken.slice(-6)}` : 'none';
    const apnsPrev = d.apnsToken ? `${d.apnsToken.slice(0, 16)}…${d.apnsToken.slice(-6)}` : (Platform.OS === 'ios' ? 'NOT REGISTERED' : '—');
    const lines = [
      `Permission: ${permLabel}`,
      Platform.OS === 'ios' ? `APNs: ${apnsPrev}` : null,
      `FCM: ${fcmPrev}`,
      d.error ? `\nError:\n${d.error}` : null,
    ].filter(Boolean);
    Alert.alert(
      'Notifications',
      lines.join('\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Re-register', onPress: () => { if (user?.uid) registerPush(user.uid).catch(() => {}); } },
        d.fcmToken ? { text: 'Share token', onPress: () => Share.share({ message: d.fcmToken! }).catch(() => {}) } : null,
        d.error ? { text: 'Share error', onPress: () => Share.share({ message: d.error! }).catch(() => {}) } : null,
        { text: 'Open Settings', onPress: () => Linking.openSettings().catch(() => {}) },
      ].filter(Boolean) as any,
    );
  };

  const onInvite = async () => {
    try {
      const code = await inviteToFamily();
      const url = buildInviteUrl(code);
      await Share.share({ message: t('family.shareMsg', { code, url }), url }).catch(() => {});
    } catch (e: any) {
      Alert.alert(t('family.couldNotJoin'), e?.message || '');
    }
  };
  const onJoin = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    try {
      await joinFamily(joinCode);
      setJoinOpen(false);
      setJoinCode('');
      Alert.alert(t('family.joined'), t('family.joinedMsg'));
    } catch (e: any) {
      Alert.alert(t('family.couldNotJoin'), e?.message || 'Please try again.');
    } finally {
      setJoining(false);
    }
  };
  const onLeave = () => {
    Alert.alert(t('family.leaveTitle'), t('family.leaveMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('family.leave'), style: 'destructive', onPress: () => leaveFamily() },
    ]);
  };

  const pickLanguage = () => {
    Alert.alert(t('profile.langTitle'), t('profile.langChoose'), [
      { text: 'English', onPress: () => setLang('en') },
      { text: 'العربية', onPress: () => setLang('ar') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  const editHome = () => {
    if (Platform.OS === 'ios' && (Alert as any).prompt) {
      (Alert as any).prompt('Home city', 'Where are you based?', (t: string) => { if (t?.trim()) saveProfile({ homeCity: t.trim() }); }, 'plain-text', profile?.homeCity || '');
    } else {
      Alert.alert('Home city', profile?.homeCity || 'Not set');
    }
  };
  const openURL = (u: string) => Linking.openURL(u).catch(() => {});
  const { orders: voucherOrders } = useVouchers();
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
          <EditableAvatar letter={initial(profile?.familyName || profile?.parentName, 'S')} color={C.coral} size={70} photoUrl={profile?.photoUrl} busy={photoBusy === 'family'} onPress={onChangePhoto} />
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
              <Text style={{ fontFamily: F.extrabold, fontSize: 14, color: '#fff' }}>{t('profile.plusTitle')}</Text>
              <Text style={{ fontSize: 12, color: 'rgba(255,255,255,0.88)', fontFamily: F.regular, marginTop: 1 }}>
                {isPlus ? t('profile.plusActive') : t('profile.plusUnlock')}
              </Text>
            </View>
            <View style={{ backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: R.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ fontSize: 12, color: '#fff', fontFamily: F.bold }}>{isPlus ? t('profile.manage') : t('profile.upgrade')}</Text>
            </View>
          </LinearGradient>
        </Pressable>

        {/* Family members — every adult + the kids */}
        <SectionLabel>{t('profile.family')}</SectionLabel>
        <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, overflow: 'hidden' }, SH.card]}>
          {(profile?.members && profile.members.length
            ? profile.members
            : [{ uid: user?.uid || 'me', name: profile?.parentName || 'You' }]
          ).map((m, i, arr) => (
            <Row
              key={m.uid}
              icon={<EditableAvatar letter={initial(m.name, '?')} color={i === 0 ? C.coral : C.sky} photoUrl={m.photoUrl} busy={photoBusy === m.uid} onPress={() => setMemberPhoto(m.uid)} />}
              title={m.name || 'Parent'}
              sub={m.uid === user?.uid ? t('profile.parentYou') : t('profile.parent')}
              last={arr.length - 1 === i && kids.length === 0}
            />
          ))}
          {kids.map((k, i) => {
            const fav = (k.favFoods || []).length;
            const avoid = (k.avoidFoods || []).length;
            const foodSub = fav || avoid
              ? [fav ? t('profile.lovesAvoids', { fav }) : '', avoid ? t('profile.avoids', { n: avoid }) : ''].filter(Boolean).join(' · ')
              : t('profile.addFood');
            return (
              <Row
                key={k.id}
                icon={<EditableAvatar letter={initial(k.name, '?')} color={KID_COLORS[i % KID_COLORS.length]} photoUrl={k.photoUrl} busy={photoBusy === k.id} onPress={() => setKidPhoto(k.id)} />}
                title={k.name || `Child ${i + 1}`}
                sub={`${t('profile.ageFmt', { age: k.age })} · ${foodSub}`}
                onPress={() => push('kidFood', { kidId: k.id })}
              />
            );
          })}
          <Row icon={<IconBox ic={Icons.plus} c={C.sage} />} title={t('setup.addChild')} sub={t('profile.addChildSub')} onPress={() => setAddKidOpen(true)} last />
        </View>

        {/* Invite / join family */}
        <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, overflow: 'hidden', marginTop: 10 }, SH.card]}>
          <Row icon={<IconBox ic={Icons.user} c={C.coral} />} title={t('family.invite')} sub={t('family.inviteSub')} onPress={onInvite} />
          {isOwnFamily ? (
            <Row icon={<IconBox ic={Icons.plus} c={C.sage} />} title={t('family.join')} sub={t('family.joinSub')} onPress={() => setJoinOpen(true)} last />
          ) : (
            <Row icon={<IconBox ic={Icons.arrowL} c={C.coralDk} />} title={t('family.leave')} sub={t('family.shared')} onPress={onLeave} danger last />
          )}
        </View>

        {/* Passport */}
        <SectionLabel>{t('profile.passport')}</SectionLabel>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <StatCard n={stats.spots} l={t('map.spots')} c={C.sage} />
          <StatCard n={stats.countries} l={t('map.countries')} c={C.coral} />
          <StatCard n={stats.weekends} l={t('map.weekends')} c={C.sun} />
        </View>

        {/* Activity */}
        <SectionLabel>{t('profile.activity')}</SectionLabel>
        <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, overflow: 'hidden' }, SH.card]}>
          <Row icon={<IconBox ic={Icons.bag} c={C.coral} />} title={t('profile.myPurchases')} det={String(voucherOrders.length)} onPress={() => push('purchases')} />
          <Row icon={<IconBox ic={Icons.bookmark} c={C.coral} />} title={t('profile.savedSpots')} det={String(saved.length)} onPress={() => push('saved')} />
          <Row icon={<IconBox ic={Icons.clock} c={C.sage} />} title={t('profile.placesVisited')} det={String(visited.length)} onPress={() => setTab('gallery')} />
          <Row icon={<IconBox ic={Icons.album} c={C.plum} />} title={t('profile.memories')} det={String(memories.length)} onPress={() => setTab('gallery')} last />
        </View>

        {/* Settings */}
        <SectionLabel>{t('profile.settings')}</SectionLabel>
        <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, overflow: 'hidden' }, SH.card]}>
          <Row icon={<IconBox ic={Icons.pin} c={C.ink2} />} title={t('profile.homeLoc')} det={profile?.homeCity || t('common.set')} onPress={editHome} />
          <Row icon={<IconBox ic={Icons.globe} c={C.ink2} />} title={t('profile.language')} det={lang === 'ar' ? 'العربية' : 'English'} onPress={pickLanguage} />
          <Row icon={<IconBox ic={Icons.lock} c={C.ink2} />} title={t('profile.privacy')} sub={user?.email || 'Photos are private by default'} onPress={() => openURL('https://meetspotly.com/privacy.html')} />
          <Row icon={<IconBox ic={Icons.sparkle} c={C.ink2} />} title={t('profile.notifications')} onPress={onNotificationsDiag} last />
        </View>

        {/* Sign out */}
        <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, overflow: 'hidden', marginTop: 16 }, SH.card]}>
          <Row icon={<IconBox ic={Icons.arrowL} c={C.coralDk} />} title={t('profile.signOut')} onPress={() => signOut()} danger last />
        </View>
      </ScrollView>

      {/* Join a family — enter invite code */}
      <Modal visible={joinOpen} transparent animationType="slide" onRequestClose={() => setJoinOpen(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: insets.bottom + 22 }}>
            <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 16 }} />
            <Text style={{ fontFamily: F.serif, fontSize: 24, letterSpacing: -0.5, color: C.ink }}>{t('family.join')}</Text>
            <Text style={{ fontSize: 13, color: C.ink2, fontFamily: F.regular, marginTop: 4 }}>{t('family.joinSub')}</Text>
            <TextInput
              value={joinCode}
              onChangeText={(v) => setJoinCode(v.toUpperCase())}
              placeholder={t('family.enterCode')}
              placeholderTextColor={C.ink3}
              autoCapitalize="characters"
              autoCorrect={false}
              style={{ marginTop: 16, backgroundColor: C.surface, borderRadius: R.lg, paddingHorizontal: 16, height: 54, fontFamily: F.mono, fontSize: 20, letterSpacing: 3, color: C.ink, borderWidth: 1, borderColor: C.line, textAlign: 'center' }}
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Btn kind="ghost" style={{ flex: 1 }} onPress={() => setJoinOpen(false)}>{t('common.cancel')}</Btn>
              <Btn kind="primary" style={{ flex: 1.6 }} onPress={onJoin}>{joining ? t('family.joining') : t('family.joinBtn')}</Btn>
            </View>
            {joining ? <ActivityIndicator color={C.coral} style={{ marginTop: 12 }} /> : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Add a child — name + age */}
      <Modal visible={addKidOpen} transparent animationType="slide" onRequestClose={() => setAddKidOpen(false)}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 22, paddingBottom: insets.bottom + 22 }}>
            <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 16 }} />
            <Text style={{ fontFamily: F.serif, fontSize: 24, letterSpacing: -0.5, color: C.ink }}>{t('setup.addChild')}</Text>
            <TextInput
              value={kidName}
              onChangeText={setKidName}
              placeholder={t('setup.childNameHint')}
              placeholderTextColor={C.ink3}
              autoCorrect={false}
              autoFocus
              style={{ marginTop: 16, backgroundColor: C.surface, borderRadius: R.lg, paddingHorizontal: 16, height: 54, fontFamily: F.medium, fontSize: 17, color: C.ink, borderWidth: 1, borderColor: C.line }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16 }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 14, color: C.ink2, flex: 1 }}>{t('setup.age')}</Text>
              <Pressable onPress={() => setKidAge((a) => Math.max(0, a - 1))} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: F.extrabold, fontSize: 20, color: C.ink }}>−</Text>
              </Pressable>
              <Text style={{ fontFamily: F.extrabold, fontSize: 18, color: C.ink, minWidth: 28, textAlign: 'center' }}>{kidAge}</Text>
              <Pressable onPress={() => setKidAge((a) => Math.min(17, a + 1))} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: F.extrabold, fontSize: 20, color: '#fff' }}>+</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Btn kind="ghost" style={{ flex: 1 }} onPress={() => setAddKidOpen(false)}>{t('common.cancel')}</Btn>
              <Btn kind="primary" style={{ flex: 1.6 }} onPress={onAddKid}>{savingKid ? t('gallery.saving') : t('setup.addChild')}</Btn>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

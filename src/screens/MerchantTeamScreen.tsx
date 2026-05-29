// Spotly — merchant team (owner / country manager). Invite managers by email,
// see members + pending invites, remove members. Mirrors the CRM Team tab.
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn } from '../components/ui';
import { useStore } from '../lib/store';
import { useI18n } from '../lib/i18n';
import { useAuth } from '../lib/auth';
import { useMerchant, MerchantRole } from '../lib/merchant';

const COUNTRIES: [string, string][] = [
  ['KW', 'Kuwait'], ['SA', 'Saudi Arabia'], ['AE', 'UAE'], ['QA', 'Qatar'], ['BH', 'Bahrain'], ['OM', 'Oman'],
];

export function MerchantTeamScreen() {
  const insets = useSafeAreaInsets();
  const { pop } = useStore();
  const { t } = useI18n();
  const { user } = useAuth();
  const { role, members, invites, inviteManager, removeMember } = useMerchant();
  const isOwner = role === 'owner';

  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<MerchantRole>(isOwner ? 'country_manager' : 'branch_manager');
  const [countries, setCountries] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const roleLabel = (r?: string) => r === 'owner' ? t('mh.roleOwner') : r === 'country_manager' ? t('mh.roleCountry') : t('mh.roleBranch');
  const toggleCountry = (c: string) => setCountries((cs) => cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]);

  const send = async () => {
    const e = email.trim().toLowerCase();
    if (!/.+@.+\..+/.test(e)) { Alert.alert(t('mteam.badEmail')); return; }
    const scope = inviteRole === 'country_manager' ? { countries } : {};
    if (inviteRole === 'country_manager' && !countries.length) { Alert.alert(t('mteam.pickCountry')); return; }
    setBusy(true);
    try {
      await inviteManager(e, inviteRole, scope);
      setEmail(''); setCountries([]);
      Alert.alert(t('mteam.invitedTitle'), t('mteam.invitedMsg', { email: e } as any));
    } catch (err: any) {
      Alert.alert(t('mset.couldNotSave'), err?.message || '');
    } finally { setBusy(false); }
  };

  const confirmRemove = (uid: string, name: string) => {
    Alert.alert(t('mteam.removeTitle'), name, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('mteam.remove'), style: 'destructive', onPress: () => removeMember(uid) },
    ]);
  };

  const scopeText = (m: any) => m.role === 'owner' ? t('mteam.allBranches')
    : m.role === 'country_manager' ? (m.scope?.countries || []).map((c: string) => (COUNTRIES.find(([k]) => k === c) || [, c])[1]).join(', ')
    : t('mteam.byBranch');

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAwareScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 22, paddingBottom: insets.bottom + 60 }} keyboardShouldPersistTaps="handled" bottomOffset={24}>
        <Pressable onPress={pop} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {Icons.arrowL({ size: 16, color: C.ink2 })}
          <Text style={{ color: C.ink2, fontFamily: F.bold, fontSize: 14 }}>{t('common.back')}</Text>
        </Pressable>
        <Text style={{ fontFamily: F.serif, fontSize: 26, marginTop: 14, letterSpacing: -0.6, color: C.ink }}>{t('mteam.title')}</Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: C.ink2, fontFamily: F.regular, lineHeight: 21 }}>{isOwner ? t('mteam.subOwner') : t('mteam.subCountry')}</Text>

        {/* Invite */}
        <View style={[{ backgroundColor: C.surface, borderRadius: R.xl, padding: 16, marginTop: 18 }, SH.card]}>
          <Text style={{ fontFamily: F.extrabold, fontSize: 15, color: C.ink }}>{t('mteam.invite')}</Text>
          <View style={{ marginTop: 12, backgroundColor: C.bg, borderRadius: R.lg, paddingHorizontal: 14, height: 48, justifyContent: 'center', borderWidth: 1, borderColor: C.line }}>
            <TextInput style={{ fontFamily: F.medium, fontSize: 15, color: C.ink }} placeholder={t('mteam.emailHint')} placeholderTextColor={C.ink3} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" />
          </View>
          {/* Role */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {(isOwner ? (['country_manager', 'branch_manager'] as MerchantRole[]) : (['branch_manager'] as MerchantRole[])).map((r) => {
              const on = inviteRole === r;
              return (
                <Pressable key={r} onPress={() => setInviteRole(r)} style={{ paddingHorizontal: 13, paddingVertical: 9, borderRadius: R.pill, backgroundColor: on ? C.coral : C.bg, borderWidth: 1, borderColor: on ? C.coral : C.line }}>
                  <Text style={{ fontFamily: F.bold, fontSize: 13, color: on ? '#fff' : C.ink2 }}>{roleLabel(r)}</Text>
                </Pressable>
              );
            })}
          </View>
          {inviteRole === 'country_manager' ? (
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 10.5, color: C.ink3, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 }}>{t('mclaim.country')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {COUNTRIES.map(([code, name]) => {
                  const on = countries.includes(code);
                  return (
                    <Pressable key={code} onPress={() => toggleCountry(code)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.pill, backgroundColor: on ? C.ink : C.bg, borderWidth: 1, borderColor: on ? C.ink : C.line }}>
                      <Text style={{ fontFamily: F.bold, fontSize: 12.5, color: on ? '#fff' : C.ink2 }}>{name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <Text style={{ fontSize: 12.5, color: C.ink3, fontFamily: F.regular, marginTop: 10, lineHeight: 18 }}>{t('mteam.branchNote')}</Text>
          )}
          <View style={{ marginTop: 14 }}>
            <Btn kind="dark" full onPress={send}>{busy ? t('mset.submitting') : t('mteam.sendInvite')}</Btn>
          </View>
        </View>

        {/* Members */}
        <Text style={{ fontFamily: F.serif, fontSize: 20, color: C.ink, marginTop: 24, letterSpacing: -0.4 }}>{t('mteam.members')}</Text>
        <View style={{ gap: 10, marginTop: 12 }}>
          {members.length === 0 ? <Text style={{ color: C.ink3, fontFamily: F.regular, fontSize: 14 }}>{t('mteam.noMembers')}</Text> : members.map((m) => (
            <View key={m.id} style={[{ backgroundColor: C.surface, borderRadius: R.lg, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }, SH.card]}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 14.5, color: C.ink }}>{m.name || m.email || m.id}{m.id === user?.uid ? ` · ${t('mteam.you')}` : ''}</Text>
                <Text style={{ fontSize: 12.5, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{roleLabel(m.role)} · {scopeText(m)}</Text>
              </View>
              {isOwner && m.role !== 'owner' && m.id !== user?.uid ? (
                <Pressable onPress={() => confirmRemove(m.id, m.name || m.email || '')} hitSlop={8}><Text style={{ color: C.coralDk, fontFamily: F.bold, fontSize: 13 }}>{t('mteam.remove')}</Text></Pressable>
              ) : null}
            </View>
          ))}
        </View>

        {/* Pending invites */}
        {invites.length ? (
          <>
            <Text style={{ fontFamily: F.serif, fontSize: 20, color: C.ink, marginTop: 24, letterSpacing: -0.4 }}>{t('mteam.pending')}</Text>
            <View style={{ gap: 8, marginTop: 12 }}>
              {invites.map((i) => (
                <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 11 }}>
                  {Icons.clock({ size: 13, color: C.ink3 })}
                  <Text style={{ flex: 1, fontFamily: F.semibold, fontSize: 13, color: C.ink2 }}>{i.id}</Text>
                  <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.ink3 }}>{roleLabel(i.role)}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );
}

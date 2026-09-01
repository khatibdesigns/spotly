// Spotly — first-run profile setup (after auth, before tabs). Writes families/{uid}.
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, Switch } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useProfile, Kid, EMPTY_STATS } from '../lib/profile';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { DobPicker } from '../components/DobPicker';
import { ageFromDob, formatDob, kidAge } from '../lib/dob';

const KID_COLORS = [C.sky, C.plum, C.sun, C.sage, C.coral];
let _kidSeq = 0;

const INTERESTS = [
  { ic: Icons.outdoor, t: 'Outdoors', c: C.sage },
  { ic: Icons.playArea, t: 'Indoor play', c: C.coral },
  { ic: Icons.foodOnSite, t: 'Food w/ play area', c: C.coral },
  { ic: Icons.animals, t: 'Animals & farms', c: C.sun },
  { ic: Icons.museum, t: 'Museums', c: C.ink2 },
  { ic: Icons.water, t: 'Water & beach', c: C.sky },
  { ic: Icons.sport, t: 'Sport', c: C.sage },
  { ic: Icons.arts, t: 'Arts & crafts', c: C.plum },
];

export function SetupScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { saveProfile } = useProfile();
  const { t } = useI18n();
  const { setAuthIntent } = useStore();
  const [step, setStep] = useState<0 | 1>(0);
  const [busy, setBusy] = useState(false);
  const [dobKidId, setDobKidId] = useState<string | null>(null);

  const [familyName, setFamilyName] = useState('');
  const [parentName, setParentName] = useState(user?.displayName || '');
  const [homeCity, setHomeCity] = useState('');
  const [locationEnabled, setLocationEnabled] = useState(true);
  const [kids, setKids] = useState<Kid[]>([]);
  const [interests, setInterests] = useState<string[]>(['Outdoors', 'Indoor play', 'Animals & farms', 'Water & beach']);

  const addKid = () => setKids((k) => [...k, { id: `k${_kidSeq++}`, name: '', age: 4 }]);
  const setKid = (id: string, patch: Partial<Kid>) => setKids((k) => k.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const removeKid = (id: string) => setKids((k) => k.filter((x) => x.id !== id));
  const toggleInterest = (t: string) => setInterests((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  const finish = async () => {
    setBusy(true);
    try {
      await saveProfile({
        familyName: familyName.trim() || (parentName.trim() ? `${parentName.trim().split(/\s+/)[0]}'s family` : 'My family'),
        parentName: parentName.trim(),
        homeCity: homeCity.trim() || 'Set your city',
        kids: kids.map((k) => ({ ...k, name: k.name.trim() })),
        interests,
        locationEnabled,
        plus: false,
        stats: EMPTY_STATS,
      });
      // Once the doc exists, ProfileProvider's snapshot flips Shell to the tabs.
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAwareScrollView contentContainerStyle={{ paddingTop: insets.top + 24, paddingHorizontal: 28, paddingBottom: 200 }} keyboardShouldPersistTaps="handled" bottomOffset={24} keyboardDismissMode="interactive">
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[0, 1].map((i) => (
            <View key={i} style={{ width: i === step ? 22 : 6, height: 6, borderRadius: 3, backgroundColor: i === step ? C.coral : C.line }} />
          ))}
        </View>

        {step === 0 ? (
          <>
            <Text style={{ fontFamily: F.serif, fontSize: 32, lineHeight: 34, marginTop: 20, letterSpacing: -0.8, color: C.ink }}>{t('setup.tellUs')}</Text>
            <Text style={{ marginTop: 8, fontSize: 14.5, color: C.ink2, fontFamily: F.regular, lineHeight: 21 }}>{t('setup.tellUsSub')}</Text>

            <Field label={t('setup.familyName')} placeholder={t('setup.familyHint')} value={familyName} onChangeText={setFamilyName} autoCapitalize="words" />
            <Field label={t('setup.yourName')} placeholder={t('setup.yourNameHint')} value={parentName} onChangeText={setParentName} autoCapitalize="words" />
            <Field label={t('setup.homeCity')} placeholder={t('setup.homeCityHint')} value={homeCity} onChangeText={setHomeCity} autoCapitalize="words" />

            <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase', marginTop: 24, marginBottom: 10 }}>{t('setup.children')}</Text>
            <View style={{ gap: 12 }}>
              {kids.map((k, i) => (
                <View key={k.id} style={[{ backgroundColor: C.surface, borderRadius: R.xl, padding: 14, gap: 12 }, SH.card]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: KID_COLORS[i % KID_COLORS.length], alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontFamily: F.extrabold, fontSize: 16 }}>{(k.name.trim()[0] || '?').toUpperCase()}</Text>
                    </View>
                    <TextInput
                      style={{ flex: 1, fontFamily: F.bold, fontSize: 16, color: C.ink }}
                      placeholder={t('setup.childNameHint')}
                      placeholderTextColor={C.ink3}
                      value={k.name}
                      onChangeText={(t) => setKid(k.id, { name: t })}
                      autoCapitalize="words"
                    />
                    <Pressable onPress={() => removeKid(k.id)}>{Icons.close({ size: 18, color: C.ink3 })}</Pressable>
                  </View>
                  <Pressable onPress={() => setDobKidId(k.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface2, borderRadius: R.md, paddingVertical: 9, paddingHorizontal: 12 }}>
                    {Icons.calendar({ size: 15, color: C.coralDk })}
                    <Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: k.dob ? C.ink : C.ink3, flex: 1 }}>
                      {k.dob ? `${formatDob(k.dob)}  ·  ${t('profile.ageFmt', { age: kidAge(k) })}` : t('setup.setBirthday')}
                    </Text>
                    {Icons.chevR({ size: 14, color: C.ink3 })}
                  </Pressable>
                </View>
              ))}
              <Pressable onPress={addKid} style={{ borderWidth: 1.5, borderColor: C.line, borderStyle: 'dashed', borderRadius: R.xl, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.coralLt, alignItems: 'center', justifyContent: 'center' }}>
                  {Icons.plus({ size: 22, color: C.coralDk })}
                </View>
                <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{t('setup.addChild')}</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 20, padding: 16, borderRadius: R.lg, backgroundColor: C.coralLt, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {Icons.pin({ size: 22, color: C.coralDk, filled: true })}
              <Text style={{ flex: 1, fontSize: 13.5, color: C.coralDk, fontFamily: F.semibold }}>{t('setup.useLocation')}</Text>
              <Pressable onPress={() => setLocationEnabled((v) => !v)}><Switch on={locationEnabled} /></Pressable>
            </View>

            <Pressable onPress={() => setAuthIntent('merchant')} style={{ marginTop: 18, alignItems: 'center' }}>
              <Text style={{ color: C.ink3, fontFamily: F.bold, fontSize: 13 }}>{t('auth.businessLink')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={{ fontFamily: F.serif, fontSize: 32, lineHeight: 34, marginTop: 20, letterSpacing: -0.8, color: C.ink }}>{t('setup.pickInterests')}</Text>
            <Text style={{ marginTop: 8, fontSize: 14.5, color: C.ink2, fontFamily: F.regular, lineHeight: 21 }}>{t('setup.pickSub')}</Text>
            <View style={{ marginTop: 24, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 }}>
              {INTERESTS.map((it, i) => {
                const on = interests.includes(it.t);
                return (
                  <Pressable key={i} onPress={() => toggleInterest(it.t)} style={{ width: '48%', backgroundColor: on ? C.surface : C.surface2, borderWidth: 2, borderColor: on ? it.c : 'transparent', borderRadius: R.lg, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12, gap: 8 }}>
                    {on ? (
                      <View style={{ position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: 10, backgroundColor: it.c, alignItems: 'center', justifyContent: 'center' }}>
                        {Icons.check({ size: 12, color: '#fff', strokeWidth: 3 })}
                      </View>
                    ) : null}
                    {it.ic({ size: 26, color: it.c })}
                    <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.ink }}>{t(`int.${it.t}`)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </KeyboardAwareScrollView>

      <View style={{ position: 'absolute', left: 24, right: 24, bottom: insets.bottom + 20 }}>
        {step === 0 ? (
          <Btn kind="primary" size="lg" full onPress={() => setStep(1)}>{t('common.continue')}</Btn>
        ) : (
          <Btn kind="primary" size="lg" full onPress={finish}>{busy ? t('setup.settingUp') : t('setup.showPlaces')}</Btn>
        )}
      </View>

      <DobPicker
        visible={dobKidId != null}
        value={kids.find((k) => k.id === dobKidId)?.dob}
        onClose={() => setDobKidId(null)}
        onSelect={(iso) => { if (dobKidId) setKid(dobKidId, { dob: iso, age: ageFromDob(iso) ?? 0 }); }}
      />
    </View>
  );
}

const stepBtn = { width: 30, height: 30, borderRadius: 15, backgroundColor: C.surface2, alignItems: 'center' as const, justifyContent: 'center' as const };

function Field({ label, ...props }: any) {
  return (
    <View style={{ marginTop: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>{label}</Text>
      <View style={{ backgroundColor: C.surface, borderRadius: R.lg, paddingHorizontal: 14, height: 50, justifyContent: 'center', borderWidth: 1, borderColor: C.line }}>
        <TextInput style={{ fontFamily: F.medium, fontSize: 15, color: C.ink }} placeholderTextColor={C.ink3} autoCorrect={false} {...props} />
      </View>
    </View>
  );
}

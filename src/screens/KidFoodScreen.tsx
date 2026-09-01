// Spotly — per-child food preferences. Favourite foods bias restaurant
// recommendations + the AI planner; "avoid" foods (allergies / not allowed) are
// never suggested. Saved onto the child in families/{uid}.kids.
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, TextInput, Alert } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Chip, Btn, CircBtn } from '../components/ui';
import { useStore } from '../lib/store';
import { useProfile, Kid } from '../lib/profile';
import { DobPicker } from '../components/DobPicker';
import { ageFromDob, formatDob } from '../lib/dob';
import { useI18n } from '../lib/i18n';

const LIKE_PRESETS = ['Pizza', 'Pasta', 'Burgers', 'Chicken', 'Rice', 'Noodles', 'Sushi', 'Sandwiches', 'Fruit', 'Pancakes', 'Ice cream', 'Cheese'];
const AVOID_PRESETS = ['Nuts', 'Peanuts', 'Dairy', 'Gluten', 'Eggs', 'Shellfish', 'Pork', 'Soy', 'Spicy', 'Honey'];

function uniqMerge(presets: string[], picked: string[]): string[] {
  const seen = new Set(presets.map((p) => p.toLowerCase()));
  const extra = picked.filter((p) => !seen.has(p.toLowerCase()));
  return [...presets, ...extra];
}

export function KidFoodScreen() {
  const insets = useSafeAreaInsets();
  const { pop, stack } = useStore();
  const { profile, saveProfile } = useProfile();
  const { t } = useI18n();

  const kidId: string | undefined = stack[stack.length - 1]?.params?.kidId;
  const kid: Kid | undefined = (profile?.kids || []).find((k) => k.id === kidId);

  const [favs, setFavs] = useState<string[]>(kid?.favFoods || []);
  const [avoid, setAvoid] = useState<string[]>(kid?.avoidFoods || []);
  const [dob, setDob] = useState<string | undefined>(kid?.dob);
  const [dobOpen, setDobOpen] = useState(false);
  const [draftFav, setDraftFav] = useState('');
  const [draftAvoid, setDraftAvoid] = useState('');
  const [saving, setSaving] = useState(false);

  const favChips = useMemo(() => uniqMerge(LIKE_PRESETS, favs), [favs]);
  const avoidChips = useMemo(() => uniqMerge(AVOID_PRESETS, avoid), [avoid]);

  const has = (arr: string[], v: string) => arr.some((x) => x.toLowerCase() === v.toLowerCase());
  const toggle = (arr: string[], set: (x: string[]) => void, v: string) =>
    set(has(arr, v) ? arr.filter((x) => x.toLowerCase() !== v.toLowerCase()) : [...arr, v]);
  const addCustom = (draft: string, arr: string[], set: (x: string[]) => void, clear: () => void) => {
    const v = draft.trim();
    if (!v) return;
    if (!has(arr, v)) set([...arr, v]);
    clear();
  };

  const save = async () => {
    if (!profile || !kid) { pop(); return; }
    setSaving(true);
    try {
      const kids = (profile.kids || []).map((k) =>
        k.id === kid.id ? { ...k, dob, age: ageFromDob(dob) ?? k.age, favFoods: favs, avoidFoods: avoid } : k
      );
      await saveProfile({ kids });
      pop();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <>
        <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <CircBtn onPress={pop}>{Icons.arrowL({ size: 18, color: C.ink })}</CircBtn>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.serif, fontSize: 22, color: C.ink, letterSpacing: -0.5 }}>{kid?.name?.trim() || t('food.titleFallback')}</Text>
            <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular }}>{t('food.sub')}</Text>
          </View>
        </View>

        <KeyboardAwareScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" bottomOffset={24} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120 }}>
          {/* Birthday */}
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.coralDk, letterSpacing: 1, textTransform: 'uppercase', marginTop: 10, marginBottom: 10 }}>{t('setup.birthday')}</Text>
          <Pressable onPress={() => setDobOpen(true)} style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.surface, borderRadius: R.lg, paddingVertical: 13, paddingHorizontal: 13, borderWidth: 1, borderColor: C.line }, SH.card]}>
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.coralLt, alignItems: 'center', justifyContent: 'center' }}>{Icons.calendar({ size: 17, color: C.coralDk })}</View>
            <Text style={{ flex: 1, fontFamily: F.semibold, fontSize: 14.5, color: dob ? C.ink : C.ink3 }}>
              {dob ? `${formatDob(dob)}  ·  ${t('profile.ageFmt', { age: ageFromDob(dob) ?? 0 })}` : t('setup.setBirthday')}
            </Text>
            {Icons.chevR({ size: 16, color: C.ink3 })}
          </Pressable>

          {/* Loves */}
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.sage, letterSpacing: 1, textTransform: 'uppercase', marginTop: 26, marginBottom: 12 }}>{t('food.loves')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {favChips.map((f) => (
              <Chip key={f} active={has(favs, f)} onPress={() => toggle(favs, setFavs, f)}>{f}</Chip>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1, backgroundColor: C.surface, borderRadius: R.lg, paddingHorizontal: 14, height: 46, justifyContent: 'center', borderWidth: 1, borderColor: C.line }}>
              <TextInput value={draftFav} onChangeText={setDraftFav} placeholder={t('food.addFav')} placeholderTextColor={C.ink3} style={{ fontFamily: F.medium, fontSize: 15, color: C.ink }} returnKeyType="done" onSubmitEditing={() => addCustom(draftFav, favs, setFavs, () => setDraftFav(''))} />
            </View>
            <Btn kind="sage" size="sm" onPress={() => addCustom(draftFav, favs, setFavs, () => setDraftFav(''))}>{t('common.add')}</Btn>
          </View>

          {/* Avoid */}
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.coralDk, letterSpacing: 1, textTransform: 'uppercase', marginTop: 28, marginBottom: 6 }}>{t('food.cantHave')}</Text>
          <Text style={{ fontSize: 12.5, color: C.ink3, fontFamily: F.regular, marginBottom: 12 }}>{t('food.cantHaveSub')}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {avoidChips.map((f) => (
              <Chip key={f} active={has(avoid, f)} onPress={() => toggle(avoid, setAvoid, f)}>{f}</Chip>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <View style={{ flex: 1, backgroundColor: C.surface, borderRadius: R.lg, paddingHorizontal: 14, height: 46, justifyContent: 'center', borderWidth: 1, borderColor: C.line }}>
              <TextInput value={draftAvoid} onChangeText={setDraftAvoid} placeholder={t('food.addAllergy')} placeholderTextColor={C.ink3} style={{ fontFamily: F.medium, fontSize: 15, color: C.ink }} returnKeyType="done" onSubmitEditing={() => addCustom(draftAvoid, avoid, setAvoid, () => setDraftAvoid(''))} />
            </View>
            <Btn kind="ghost" size="sm" onPress={() => addCustom(draftAvoid, avoid, setAvoid, () => setDraftAvoid(''))}>{t('common.add')}</Btn>
          </View>
        </KeyboardAwareScrollView>

        <View style={[{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12 }, SH.pop]}>
          <Btn kind="primary" size="lg" full onPress={save}>{saving ? t('gallery.saving') : t('food.savePrefs')}</Btn>
        </View>

        <DobPicker visible={dobOpen} value={dob} onClose={() => setDobOpen(false)} onSelect={setDob} />
      </>
    </View>
  );
}

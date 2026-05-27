// Spotly — AI itinerary planner. Generation runs globally (PlannerProvider) so
// you can leave this screen; a sound notification fires when it's ready.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Modal, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, SpotImage, CircBtn } from '../components/ui';
import { useStore } from '../lib/store';
import { useProfile, familyFood } from '../lib/profile';
import { usePlans } from '../lib/plans';
import { usePlanner } from '../lib/planner';
import { useI18n } from '../lib/i18n';
import { Itinerary, ItStop, dayDateLabel } from '../lib/aiPlan';
import { searchPlaces, PlaceSearchResult, getUserLocation } from '../lib/places';

const SUGGESTION_KEYS = ['ai.s1', 'ai.s2', 'ai.s3', 'ai.s4'];

const PROGRESS_STEPS = [
  'Asking the planner…',
  'Picking kid-friendly places…',
  'Sequencing your days…',
  'Adding photos & map pins…',
  'Almost there…',
];

export function AiPlanScreen() {
  const insets = useSafeAreaInsets();
  const { pop, setTab, popToRoot } = useStore();
  const { profile } = useProfile();
  const { saveItinerary } = usePlans();
  const { status, result, error, startedAt, generate, retry, reset } = usePlanner();
  const { t } = useI18n();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(Date.now());
  // Editable working copy of the generated plan (remove / add stops before saving).
  const [edited, setEdited] = useState<Itinerary | null>(null);

  // tick the elapsed timer while generating
  useEffect(() => {
    if (status !== 'generating') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

  // When a fresh plan arrives, seed the editable copy; clear it otherwise.
  useEffect(() => {
    if (status === 'ready' && result) setEdited(JSON.parse(JSON.stringify(result)));
    else if (status !== 'ready') setEdited(null);
  }, [status, result]);

  // Add-a-place search (Google Places) for a specific day.
  const [addingDay, setAddingDay] = useState<number | null>(null);
  const [addQuery, setAddQuery] = useState('');
  const [addResults, setAddResults] = useState<PlaceSearchResult[]>([]);
  const [addSearching, setAddSearching] = useState(false);
  const [near, setNear] = useState<{ latitude: number; longitude: number } | undefined>(undefined);

  useEffect(() => {
    getUserLocation().then((l) => { if (l.granted) setNear({ latitude: l.latitude, longitude: l.longitude }); }).catch(() => {});
  }, []);

  const removeStop = (dayIdx: number, stopIdx: number) => {
    setEdited((it) => {
      if (!it) return it;
      const copy: Itinerary = JSON.parse(JSON.stringify(it));
      copy.days[dayIdx].stops.splice(stopIdx, 1);
      return copy;
    });
  };
  const addStop = (dayIdx: number, stop: ItStop) => {
    setEdited((it) => {
      if (!it) return it;
      const copy: Itinerary = JSON.parse(JSON.stringify(it));
      copy.days[dayIdx].stops.push(stop);
      return copy;
    });
  };

  const openAdder = (dayIdx: number) => { setAddingDay(dayIdx); setAddQuery(''); setAddResults([]); };
  const runAddSearch = async () => {
    if (!addQuery.trim()) return;
    setAddSearching(true);
    try { setAddResults(await searchPlaces(addQuery, near)); }
    finally { setAddSearching(false); }
  };
  const pickAddResult = (r: PlaceSearchResult) => {
    if (addingDay == null) return;
    addStop(addingDay, { name: r.name, category: r.category, photoUrl: r.photoUrl, lat: r.lat, lng: r.lng, tone: 'sage' });
    setAddingDay(null);
    setAddQuery('');
    setAddResults([]);
  };

  const elapsed = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const mmss = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
  const progressMsg = PROGRESS_STEPS[Math.min(PROGRESS_STEPS.length - 1, Math.floor(elapsed / 8))];

  // Parse a date range like "26 May till 31st May", "May 26–31", "30 May to 2 June",
  // or a bare "26-31" into an inclusive day count. Returns null if no range found.
  const parseDateRange = (s: string): number | null => {
    const MN = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
    const MI: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    // "26 May" / "26th May" / "May 26" / "May 26th"
    const re = new RegExp(`(?:(\\d{1,2})(?:st|nd|rd|th)?\\s*(${MN})[a-z]*)|(?:(${MN})[a-z]*\\s*(\\d{1,2})(?:st|nd|rd|th)?)`, 'gi');
    const dates: Date[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) && dates.length < 4) {
      const day = m[1] ? parseInt(m[1], 10) : parseInt(m[4], 10);
      const mon = MI[(m[2] || m[3]).slice(0, 3).toLowerCase()];
      if (day >= 1 && day <= 31) dates.push(new Date(2026, mon, day));
    }
    if (dates.length >= 2) {
      let diff = Math.round((dates[1].getTime() - dates[0].getTime()) / 86400000) + 1;
      if (diff < 1) diff += 365; // year-wrap safety
      return Math.min(14, Math.max(1, diff));
    }
    // Bare same-month range: "26-31", "26 to 31", "26 till 31st"
    const bare = s.match(/\b(\d{1,2})\s*(?:-|–|—|to|till|until|through|thru)\s*(\d{1,2})(?:st|nd|rd|th)?\b/i);
    if (bare) {
      const a = parseInt(bare[1], 10);
      const b = parseInt(bare[2], 10);
      if (a >= 1 && a <= 31 && b >= 1 && b <= 31 && b >= a) return Math.min(14, b - a + 1);
    }
    return null;
  };

  const parseDays = (s: string) => {
    const m = s.match(/(\d+)\s*(day|days|night|nights)/i);
    if (m) return Math.min(14, Math.max(1, parseInt(m[1], 10)));
    const range = parseDateRange(s);
    if (range) return range;
    return /weekend/i.test(s) ? 2 : 1;
  };
  const parseDest = (s: string) => {
    const m = s.match(/\b(?:in|to|around|near)\s+([A-Z][A-Za-zÀ-ſ'’\- ]+?)(?:[,.]|\s+with|\s+for|\s+\d|$)/);
    return (m ? m[1] : '').trim() || (profile?.homeCity || 'near me');
  };

  // Day-1 date for the plan: the first date in the prompt ("tomorrow", "26 May",
  // "May 26"), else this coming Saturday so days still show real dates.
  const nextSaturdayISO = () => {
    const d = new Date();
    d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7));
    return d.toISOString().slice(0, 10);
  };
  const parseStartDate = (s: string): string => {
    const lower = s.toLowerCase();
    if (/\btomorrow\b|غدًا|غدا|بكرة/.test(lower)) { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); }
    if (/\btoday\b|اليوم/.test(lower)) return new Date().toISOString().slice(0, 10);
    const MN = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';
    const MI: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
    const re = new RegExp(`(?:(\\d{1,2})(?:st|nd|rd|th)?\\s*(${MN})[a-z]*)|(?:(${MN})[a-z]*\\s*(\\d{1,2})(?:st|nd|rd|th)?)`, 'i');
    const m = s.match(re);
    if (m) {
      const day = m[1] ? parseInt(m[1], 10) : parseInt(m[4], 10);
      const mon = MI[(m[2] || m[3]).slice(0, 3).toLowerCase()];
      if (day >= 1 && day <= 31) return new Date(2026, mon, day).toISOString().slice(0, 10);
    }
    return nextSaturdayISO();
  };

  const onGenerate = () => {
    if (!text.trim()) return;
    const food = familyFood(profile);
    generate({
      destination: parseDest(text),
      days: parseDays(text),
      kids: profile?.kids,
      notes: text.trim(),
      favFoods: food.likes,
      avoidFoods: food.avoid,
      startDate: parseStartDate(text),
    });
  };

  const save = async () => {
    const plan = edited || result;
    if (!plan || !plan.days?.length) return;
    setSaving(true);
    try {
      await saveItinerary(plan);
      reset();
      popToRoot();
      setTab('plan');
    } catch (e: any) {
      Alert.alert(t('ai.couldNotSave'), e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <CircBtn onPress={pop}>{Icons.arrowL({ size: 18, color: C.ink })}</CircBtn>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {Icons.sparkle({ size: 16, color: C.premium })}
              <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.premium }}>{t('ai.planner')}</Text>
            </View>
            <View style={{ width: 38 }} />
          </View>

          {status === 'generating' ? (
            <Generating mmss={mmss} progressMsg={progressMsg} />
          ) : status === 'ready' && (edited || result) ? (
            <ItineraryPreview it={(edited || result)!} onRemoveStop={removeStop} onOpenAdder={openAdder} />
          ) : status === 'error' ? (
            <ErrorState message={error} />
          ) : (
            <Idle text={text} setText={setText} profile={profile} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 14 }}>
        {status === 'idle' ? (
          <Btn kind="premium" size="lg" full onPress={onGenerate} icon={Icons.sparkle({ size: 16, color: '#fff' })}>{t('ai.generate')}</Btn>
        ) : status === 'generating' ? (
          <Btn kind="ghost" size="lg" full onPress={pop}>{t('ai.closeNotify')}</Btn>
        ) : status === 'error' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn kind="ghost" style={[{ flex: 1, backgroundColor: C.surface }, SH.cta]} onPress={reset}>{t('common.edit')}</Btn>
            <Btn kind="premium" style={{ flex: 1.4 }} onPress={retry}>{t('common.retry')}</Btn>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn kind="ghost" style={[{ flex: 1, backgroundColor: C.surface }, SH.cta]} onPress={reset}>{t('ai.editPrompt')}</Btn>
            <Btn kind="primary" style={{ flex: 1.6 }} onPress={save}>{saving ? t('gallery.saving') : t('ai.saveToPlans')}</Btn>
          </View>
        )}
      </View>

      {/* Add-a-place search (Google Places) */}
      <Modal visible={addingDay != null} transparent animationType="slide" onRequestClose={() => setAddingDay(null)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.45)', justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 16, paddingBottom: insets.bottom + 20, maxHeight: '80%' }}>
            <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 14 }} />
            <Text style={{ fontFamily: F.serif, fontSize: 22, letterSpacing: -0.5, color: C.ink, marginBottom: 12 }}>{t('ai.addStop')}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderRadius: R.lg, paddingHorizontal: 14, height: 48, borderWidth: 1, borderColor: C.line }}>
                {Icons.search({ size: 18, color: C.ink3 })}
                <TextInput style={{ flex: 1, fontFamily: F.medium, fontSize: 15, color: C.ink }} placeholder={t('mset.searchHint')} placeholderTextColor={C.ink3} value={addQuery} onChangeText={setAddQuery} autoCorrect={false} returnKeyType="search" onSubmitEditing={runAddSearch} autoFocus />
              </View>
              <Btn kind="dark" onPress={runAddSearch}>{t('mset.searchBtn')}</Btn>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ marginTop: 12 }} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
              {addSearching ? (
                <ActivityIndicator color={C.coral} style={{ marginTop: 16 }} />
              ) : addResults.length ? (
                addResults.map((r) => (
                  <Pressable key={r.placeId} onPress={() => pickAddResult(r)} style={[{ backgroundColor: C.surface, borderRadius: R.lg, padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center' }, SH.card]}>
                    {r.photoUrl ? <Image source={{ uri: r.photoUrl }} style={{ width: 48, height: 48, borderRadius: 10 }} /> : <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>{Icons.pin({ size: 18, color: C.ink3 })}</View>}
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 14.5, color: C.ink }}>{r.name}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{r.address || r.category}</Text>
                    </View>
                    {Icons.plus({ size: 18, color: C.coralDk })}
                  </Pressable>
                ))
              ) : null}
            </ScrollView>
            <Btn kind="ghost" full style={{ marginTop: 4 }} onPress={() => setAddingDay(null)}>{t('common.cancel')}</Btn>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Idle({ text, setText, profile }: { text: string; setText: (s: string) => void; profile: any }) {
  const { t } = useI18n();
  const forKids = profile?.kids?.length ? t('ai.forKids', { names: profile.kids.map((k: any) => k.name || 'your child').join(' & ') }) : '';
  return (
    <>
      <Text style={{ fontFamily: F.serif, fontSize: 30, letterSpacing: -0.8, color: C.ink, marginTop: 18 }}>{t('ai.planOurTrip')}</Text>
      <Text style={{ fontSize: 15, color: C.ink2, fontFamily: F.regular, marginTop: 8, lineHeight: 22 }}>
        {t('ai.idleSub', { forKids })}
      </Text>
      <View style={{ marginTop: 18, backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.line, padding: 14 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('ai.inputPlaceholder')}
          placeholderTextColor={C.ink3}
          multiline
          style={{ fontFamily: F.medium, fontSize: 15.5, color: C.ink, minHeight: 96, textAlignVertical: 'top', lineHeight: 22 }}
        />
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase', marginTop: 18, marginBottom: 10 }}>{t('ai.try')}</Text>
      <View style={{ gap: 8 }}>
        {SUGGESTION_KEYS.map((key) => {
          const s = t(key);
          return (
            <Pressable key={key} onPress={() => setText(s)} style={{ backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {Icons.sparkle({ size: 14, color: C.coral })}
              <Text style={{ flex: 1, fontFamily: F.medium, fontSize: 14, color: C.ink2 }}>{s}</Text>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}

function Generating({ mmss, progressMsg }: { mmss: string; progressMsg: string }) {
  const { t } = useI18n();
  return (
    <View style={{ alignItems: 'center', paddingTop: 60 }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: '#ecebf7', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.premium} size="large" />
      </View>
      <Text style={{ fontFamily: F.serif, fontSize: 26, color: C.ink, marginTop: 24, letterSpacing: -0.5 }}>{t('ai.building')}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 28, color: C.premium, marginTop: 10, letterSpacing: 1 }}>{mmss}</Text>
      <Text style={{ fontSize: 14, color: C.ink2, fontFamily: F.semibold, marginTop: 6 }}>{progressMsg}</Text>
      <View style={{ marginTop: 26, backgroundColor: C.sageLt, borderRadius: R.xl, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ marginTop: 1 }}>{Icons.sparkle({ size: 18, color: C.sage })}</View>
        <Text style={{ flex: 1, fontSize: 13.5, color: C.sage, fontFamily: F.regular, lineHeight: 19 }}>
          <Text style={{ fontFamily: F.bold }}>{t('ai.youCanLeaveBold')}</Text>{t('ai.youCanLeaveRest')}
        </Text>
      </View>
    </View>
  );
}

function ErrorState({ message }: { message: string | null }) {
  const { t } = useI18n();
  return (
    <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 10 }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: C.coralLt, alignItems: 'center', justifyContent: 'center' }}>
        <Icons.Mark size={48} color={C.coral} />
      </View>
      <Text style={{ fontFamily: F.serif, fontSize: 24, color: C.ink, marginTop: 22, textAlign: 'center' }}>{t('ai.didntWork')}</Text>
      <Text style={{ fontSize: 14.5, color: C.ink2, fontFamily: F.regular, marginTop: 8, textAlign: 'center', lineHeight: 21 }}>{message || 'Please try again.'}</Text>
    </View>
  );
}

function ItineraryPreview({ it, onRemoveStop, onOpenAdder }: { it: Itinerary; onRemoveStop: (d: number, s: number) => void; onOpenAdder: (d: number) => void }) {
  const { t } = useI18n();
  return (
    <View style={{ marginTop: 16 }}>
      <LinearGradient colors={[C.premium, '#363a82']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: R.xxl, padding: 20 }, SH.card]}>
        <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>{t('ai.itinerary')}</Text>
        <Text style={{ fontFamily: F.serif, fontSize: 24, color: '#fff', marginTop: 6, letterSpacing: -0.5 }}>{it.title}</Text>
        {it.summary ? <Text style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.9)', fontFamily: F.regular, marginTop: 6, lineHeight: 19 }}>{it.summary}</Text> : null}
      </LinearGradient>

      {it.days.map((d, di) => {
        const date = dayDateLabel(it.startDate, d.day);
        return (
        <View key={d.day} style={{ marginTop: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{d.label}</Text>
            {date ? <Text style={{ fontFamily: F.semibold, fontSize: 12.5, color: C.coralDk }}>{date}</Text> : null}
          </View>
          <View style={{ gap: 10 }}>
            {d.stops.map((s, i) => (
              <View key={i} style={[{ backgroundColor: C.surface, borderRadius: R.lg, padding: 12, flexDirection: 'row', gap: 12, alignItems: 'center' }, SH.card]}>
                <SpotImage photoUrl={s.photoUrl || undefined} tone={s.tone || 'sun'} height={56} radius={12} style={{ width: 56 }} />
                <View style={{ flex: 1 }}>
                  {s.time ? <Text style={{ fontFamily: F.bold, fontSize: 11, color: C.coralDk, marginBottom: 1 }}>{s.time}</Text> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                    <Text numberOfLines={2} style={{ flex: 1, fontFamily: F.bold, fontSize: 14, color: C.ink, lineHeight: 18 }}>{s.name}</Text>
                    {s.estCost ? <Text style={{ fontSize: 11, color: C.ink3, fontFamily: F.semibold, marginTop: 1 }}>{s.estCost}</Text> : null}
                  </View>
                  {s.category ? <Text numberOfLines={1} style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{s.category}</Text> : null}
                  {s.note ? <Text numberOfLines={2} style={{ fontSize: 12.5, color: C.ink2, fontFamily: F.regular, marginTop: 3, lineHeight: 17 }}>{s.note}</Text> : null}
                </View>
                <Pressable onPress={() => onRemoveStop(di, i)} hitSlop={6} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.coralLt, alignItems: 'center', justifyContent: 'center' }}>
                  {Icons.close({ size: 14, color: C.coralDk })}
                </Pressable>
              </View>
            ))}
            <Pressable onPress={() => onOpenAdder(di)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 11, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, borderStyle: 'dashed' }}>
              {Icons.plus({ size: 16, color: C.coralDk })}
              <Text style={{ fontFamily: F.bold, fontSize: 13.5, color: C.coralDk }}>{t('ai.addStop')}</Text>
            </Pressable>
          </View>
        </View>
        );
      })}

      {it.tips?.length ? (
        <View style={{ marginTop: 18, backgroundColor: C.sageLt, borderRadius: R.xl, padding: 16 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.sage, marginBottom: 6 }}>{t('ai.goodToKnow')}</Text>
          {it.tips.map((t, i) => (
            <Text key={i} style={{ fontSize: 13, color: C.sage, fontFamily: F.regular, lineHeight: 19 }}>· {t}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

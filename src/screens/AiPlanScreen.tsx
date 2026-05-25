// Spotly — AI itinerary planner. Generation runs globally (PlannerProvider) so
// you can leave this screen; a sound notification fires when it's ready.
import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, SpotImage, CircBtn } from '../components/ui';
import { useStore } from '../lib/store';
import { useProfile } from '../lib/profile';
import { usePlans } from '../lib/plans';
import { usePlanner } from '../lib/planner';
import { Itinerary } from '../lib/aiPlan';

const SUGGESTIONS = [
  '4 days in France with the kids, mid budget',
  'A weekend out in Kuwait with a 5 & 8 year old',
  '3 days in London, rainy-day friendly, budget-conscious',
  'Day trip near me, outdoors + lunch',
];

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
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(Date.now());

  // tick the elapsed timer while generating
  useEffect(() => {
    if (status !== 'generating') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [status]);

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

  const onGenerate = () => {
    if (!text.trim()) return;
    generate({ destination: parseDest(text), days: parseDays(text), kids: profile?.kids, notes: text.trim() });
  };

  const save = async () => {
    if (!result) return;
    setSaving(true);
    try {
      await saveItinerary(result);
      reset();
      popToRoot();
      setTab('plan');
    } catch (e: any) {
      Alert.alert('Could not save', e?.message || 'Please try again.');
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
              <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.premium }}>AI Planner</Text>
            </View>
            <View style={{ width: 38 }} />
          </View>

          {status === 'generating' ? (
            <Generating mmss={mmss} progressMsg={progressMsg} />
          ) : status === 'ready' && result ? (
            <ItineraryPreview it={result} />
          ) : status === 'error' ? (
            <ErrorState message={error} />
          ) : (
            <Idle text={text} setText={setText} profile={profile} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 14 }}>
        {status === 'idle' ? (
          <Btn kind="premium" size="lg" full onPress={onGenerate} icon={Icons.sparkle({ size: 16, color: '#fff' })}>Generate plan</Btn>
        ) : status === 'generating' ? (
          <Btn kind="ghost" size="lg" full onPress={pop}>Close — I’ll get a notification</Btn>
        ) : status === 'error' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn kind="ghost" style={{ flex: 1 }} onPress={reset}>Edit</Btn>
            <Btn kind="premium" style={{ flex: 1.4 }} onPress={retry}>Try again</Btn>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn kind="ghost" style={{ flex: 1 }} onPress={reset}>New plan</Btn>
            <Btn kind="primary" style={{ flex: 1.6 }} onPress={save}>{saving ? 'Saving…' : 'Save to Plans'}</Btn>
          </View>
        )}
      </View>
    </View>
  );
}

function Idle({ text, setText, profile }: { text: string; setText: (s: string) => void; profile: any }) {
  return (
    <>
      <Text style={{ fontFamily: F.serif, fontSize: 30, letterSpacing: -0.8, color: C.ink, marginTop: 18 }}>Plan our trip.</Text>
      <Text style={{ fontSize: 15, color: C.ink2, fontFamily: F.regular, marginTop: 8, lineHeight: 22 }}>
        Tell me where you’re going, for how long, and your budget — I’ll build a kid-friendly day-by-day itinerary{profile?.kids?.length ? ` for ${profile.kids.map((k: any) => k.name || 'your child').join(' & ')}` : ''}.
      </Text>
      <View style={{ marginTop: 18, backgroundColor: C.surface, borderRadius: R.xl, borderWidth: 1, borderColor: C.line, padding: 14 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="e.g. We’re going to France for 4 days with the kids, budget around €150/day…"
          placeholderTextColor={C.ink3}
          multiline
          style={{ fontFamily: F.medium, fontSize: 15.5, color: C.ink, minHeight: 96, textAlignVertical: 'top', lineHeight: 22 }}
        />
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase', marginTop: 18, marginBottom: 10 }}>Try</Text>
      <View style={{ gap: 8 }}>
        {SUGGESTIONS.map((s) => (
          <Pressable key={s} onPress={() => setText(s)} style={{ backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {Icons.sparkle({ size: 14, color: C.coral })}
            <Text style={{ flex: 1, fontFamily: F.medium, fontSize: 14, color: C.ink2 }}>{s}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

function Generating({ mmss, progressMsg }: { mmss: string; progressMsg: string }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 60 }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: '#ecebf7', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.premium} size="large" />
      </View>
      <Text style={{ fontFamily: F.serif, fontSize: 26, color: C.ink, marginTop: 24, letterSpacing: -0.5 }}>Building your plan…</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 28, color: C.premium, marginTop: 10, letterSpacing: 1 }}>{mmss}</Text>
      <Text style={{ fontSize: 14, color: C.ink2, fontFamily: F.semibold, marginTop: 6 }}>{progressMsg}</Text>
      <View style={{ marginTop: 26, backgroundColor: C.sageLt, borderRadius: R.xl, padding: 16, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ marginTop: 1 }}>{Icons.sparkle({ size: 18, color: C.sage })}</View>
        <Text style={{ flex: 1, fontSize: 13.5, color: C.sage, fontFamily: F.regular, lineHeight: 19 }}>
          <Text style={{ fontFamily: F.bold }}>You can leave this screen.</Text> We’ll send you a notification with a sound the moment your plan is ready — it usually takes 20–60 seconds.
        </Text>
      </View>
    </View>
  );
}

function ErrorState({ message }: { message: string | null }) {
  return (
    <View style={{ alignItems: 'center', paddingTop: 60, paddingHorizontal: 10 }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: C.coralLt, alignItems: 'center', justifyContent: 'center' }}>
        <Icons.Mark size={48} color={C.coral} />
      </View>
      <Text style={{ fontFamily: F.serif, fontSize: 24, color: C.ink, marginTop: 22, textAlign: 'center' }}>That didn’t work.</Text>
      <Text style={{ fontSize: 14.5, color: C.ink2, fontFamily: F.regular, marginTop: 8, textAlign: 'center', lineHeight: 21 }}>{message || 'Please try again.'}</Text>
    </View>
  );
}

function ItineraryPreview({ it }: { it: Itinerary }) {
  return (
    <View style={{ marginTop: 16 }}>
      <LinearGradient colors={[C.premium, '#363a82']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: R.xxl, padding: 20 }, SH.card]}>
        <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>AI itinerary</Text>
        <Text style={{ fontFamily: F.serif, fontSize: 24, color: '#fff', marginTop: 6, letterSpacing: -0.5 }}>{it.title}</Text>
        {it.summary ? <Text style={{ fontSize: 13.5, color: 'rgba(255,255,255,0.9)', fontFamily: F.regular, marginTop: 6, lineHeight: 19 }}>{it.summary}</Text> : null}
      </LinearGradient>

      {it.days.map((d) => (
        <View key={d.day} style={{ marginTop: 18 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink, marginBottom: 10 }}>{d.label}</Text>
          <View style={{ gap: 10 }}>
            {d.stops.map((s, i) => (
              <View key={i} style={[{ backgroundColor: C.surface, borderRadius: R.lg, padding: 12, flexDirection: 'row', gap: 12 }, SH.card]}>
                <SpotImage photoUrl={s.photoUrl || undefined} tone={s.tone || 'sun'} height={56} radius={12} style={{ width: 56 }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                    {s.time ? <Text style={{ fontFamily: F.bold, fontSize: 11, color: C.coralDk }}>{s.time}</Text> : null}
                    <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 14, color: C.ink }}>{s.name}</Text>
                    {s.estCost ? <Text style={{ fontSize: 11, color: C.ink3, fontFamily: F.semibold }}>{s.estCost}</Text> : null}
                  </View>
                  {s.category ? <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{s.category}</Text> : null}
                  {s.note ? <Text style={{ fontSize: 12.5, color: C.ink2, fontFamily: F.regular, marginTop: 3, lineHeight: 17 }}>{s.note}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}

      {it.tips?.length ? (
        <View style={{ marginTop: 18, backgroundColor: C.sageLt, borderRadius: R.xl, padding: 16 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.sage, marginBottom: 6 }}>Good to know</Text>
          {it.tips.map((t, i) => (
            <Text key={i} style={{ fontSize: 13, color: C.sage, fontFamily: F.regular, lineHeight: 19 }}>· {t}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

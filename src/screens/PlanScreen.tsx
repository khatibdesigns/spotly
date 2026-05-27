// Spotly — Plan. Real plans from Firestore, incl. multi-day AI itineraries.
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, SpotImage, CircBtn, SectionLabel, TitleHeader } from '../components/ui';
import { useStore } from '../lib/store';
import { usePlaces } from '../lib/placesStore';
import { usePlans, Plan, Stop } from '../lib/plans';
import { Spot } from '../lib/places';
import { addPlanToCalendar } from '../lib/calendar';
import { dayDateLabel } from '../lib/aiPlan';
import { useI18n } from '../lib/i18n';

// Carry the stop's original index so edit actions map back to the flat array.
type IndexedStop = Stop & { _i: number };

function groupByDay(stops: Stop[]): { label: string | null; stops: IndexedStop[] }[] {
  const map = new Map<number, { label: string | null; stops: IndexedStop[] }>();
  stops.forEach((s, i) => {
    const key = s.day ?? 0;
    if (!map.has(key)) map.set(key, { label: s.dayLabel || null, stops: [] });
    map.get(key)!.stops.push({ ...s, _i: i });
  });
  return [...map.values()];
}

// Build a minimal Spot from a saved stop so the Place detail screen can show it.
function stopToSpot(s: Stop): Spot {
  return {
    id: s.placeId || s.name,
    source: 'curated',
    kind: 'activity',
    name: s.name,
    category: s.category || '',
    lat: s.lat ?? (undefined as any),
    lng: s.lng ?? (undefined as any),
    amenities: [],
    photoUrl: s.photoUrl || undefined,
    address: undefined,
    tone: s.tone || 'sun',
  };
}

function ReorderBtn({ icon, disabled, onPress }: { icon: React.ReactNode; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={disabled ? undefined : onPress} hitSlop={6} style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.35 : 1 }}>
      {icon}
    </Pressable>
  );
}

function StopRow({
  s,
  editing,
  canUp,
  canDown,
  onOpen,
  onRemove,
  onUp,
  onDown,
}: {
  s: Stop;
  editing: boolean;
  canUp: boolean;
  canDown: boolean;
  onOpen: () => void;
  onRemove: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const body = (
    <>
      <SpotImage photoUrl={s.photoUrl || undefined} tone={s.tone || 'sun'} height={48} radius={10} style={{ width: 48 }} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          {s.time ? <Text style={{ fontFamily: F.bold, fontSize: 11, color: C.coralDk }}>{s.time}</Text> : null}
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.bold, fontSize: 14, color: C.ink }}>{s.name}</Text>
          {s.estCost ? <Text style={{ fontFamily: F.semibold, fontSize: 11, color: C.ink3 }}>{s.estCost}</Text> : null}
        </View>
        {s.note ? <Text numberOfLines={2} style={{ fontSize: 12, color: C.ink2, fontFamily: F.regular, marginTop: 1, lineHeight: 16 }}>{s.note}</Text> : s.category ? <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{s.category}</Text> : null}
      </View>
    </>
  );

  if (editing) {
    return (
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <Pressable onPress={onRemove} hitSlop={6} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.coralLt, alignItems: 'center', justifyContent: 'center' }}>
          {Icons.close({ size: 14, color: C.coralDk })}
        </Pressable>
        {body}
        <View style={{ gap: 4 }}>
          <ReorderBtn disabled={!canUp} onPress={onUp} icon={<View style={{ transform: [{ rotate: '-90deg' }] }}>{Icons.chevR({ size: 15, color: C.ink2 })}</View>} />
          <ReorderBtn disabled={!canDown} onPress={onDown} icon={<View style={{ transform: [{ rotate: '90deg' }] }}>{Icons.chevR({ size: 15, color: C.ink2 })}</View>} />
        </View>
      </View>
    );
  }

  return (
    <Pressable onPress={onOpen} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      {body}
      {Icons.chevR({ size: 16, color: C.ink3 })}
    </Pressable>
  );
}

function PlanCard({
  plan,
  onDone,
  onAddPhotos,
  onDelete,
  onOpenStop,
  onRemoveStop,
  onMoveStop,
}: {
  plan: Plan;
  onDone?: () => void;
  onAddPhotos?: () => void;
  onDelete?: () => void;
  onOpenStop: (s: Stop) => void;
  onRemoveStop: (index: number) => void;
  onMoveStop: (index: number, dir: 'up' | 'down') => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const groups = plan.multiDay ? groupByDay(plan.stops || []) : [{ label: null, stops: groupByDay(plan.stops || []).flatMap((g) => g.stops) }];
  const addToCalendar = () => {
    addPlanToCalendar(plan)
      .then(() => Alert.alert(t('plan.calAdded'), t('plan.calAddedMsg')))
      .catch((e) => Alert.alert('Calendar', e?.message || t('plan.calErr')));
  };
  const confirmRemove = (index: number, name: string) => {
    Alert.alert(t('plan.removeStopTitle'), t('plan.removeStopMsg', { name }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('plan.remove'), style: 'destructive', onPress: () => onRemoveStop(index) },
    ]);
  };
  const confirmDelete = () => {
    Alert.alert(t('plan.deleteTitle'), t('plan.deleteMsg', { title: plan.title }), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('plan.deleteTitle'), style: 'destructive', onPress: onDelete },
    ]);
  };
  const hasStops = (plan.stops || []).length > 0;
  return (
    <View style={[{ backgroundColor: C.surface, borderRadius: R.xxl, padding: 20, borderTopWidth: plan.status === 'done' ? 4 : plan.multiDay ? 4 : 0, borderTopColor: plan.status === 'done' ? C.sage : C.premium }, SH.card]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {plan.multiDay ? Icons.sparkle({ size: 13, color: C.premium }) : null}
            <Text style={{ fontFamily: F.extrabold, fontSize: 17, color: C.ink }}>{plan.title}</Text>
          </View>
          <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 2 }}>
            {plan.multiDay ? `${t('plan.days', { n: groups.length })} · ${plan.dateLabel}` : `${t('plan.stops', { n: (plan.stops || []).length })} · ${plan.dateLabel}`}
          </Text>
        </View>
        {hasStops ? (
          <Pressable onPress={() => setEditing((e) => !e)} hitSlop={8}>
            <Text style={{ fontSize: 12, fontFamily: F.bold, color: C.coralDk }}>{editing ? t('common.done') : t('common.edit')}</Text>
          </Pressable>
        ) : null}
      </View>

      {plan.summary ? <Text style={{ fontSize: 13, color: C.ink2, fontFamily: F.regular, marginTop: 8, lineHeight: 18 }}>{plan.summary}</Text> : null}

      <View style={{ marginTop: 16, gap: 16 }}>
        {groups.map((g, gi) => {
          const dayNum = g.stops[0]?.day;
          const date = plan.startDate && dayNum ? dayDateLabel(plan.startDate, dayNum) : '';
          return (
          <View key={gi} style={{ gap: 12 }}>
            {g.label ? (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.premium }}>{g.label}</Text>
                {date ? <Text style={{ fontFamily: F.semibold, fontSize: 12, color: C.coralDk }}>{date}</Text> : null}
              </View>
            ) : null}
            {g.stops.map((s, i) => (
              <StopRow
                key={`${s.placeId}-${s._i}`}
                s={s}
                editing={editing}
                canUp={i > 0}
                canDown={i < g.stops.length - 1}
                onOpen={() => onOpenStop(s)}
                onRemove={() => confirmRemove(s._i, s.name)}
                onUp={() => onMoveStop(s._i, 'up')}
                onDown={() => onMoveStop(s._i, 'down')}
              />
            ))}
          </View>
          );
        })}
      </View>

      {editing ? (
        <View style={{ marginTop: 16 }}>
          <Btn kind="ghost" size="sm" full onPress={confirmDelete} icon={Icons.close({ size: 14, color: C.coralDk })}>
            <Text style={{ color: C.coralDk, fontFamily: F.bold, fontSize: 13.5 }}>{t('plan.deleteWhole')}</Text>
          </Btn>
        </View>
      ) : (
        <View style={{ marginTop: 16, flexDirection: 'row', gap: 8 }}>
          {plan.status === 'upcoming' ? (
            <>
              <Btn kind="dark" size="sm" style={{ flex: 1 }} icon={Icons.calendar({ size: 14, color: '#fff' })} onPress={addToCalendar}>{t('plan.addCalendar')}</Btn>
              <Btn kind="ghost" size="sm" onPress={onDone}>{t('plan.markDone')}</Btn>
            </>
          ) : (
            <Btn kind="sage" size="sm" style={{ flex: 1 }} icon={Icons.camera({ size: 14, color: '#fff' })} onPress={onAddPhotos}>{t('plan.addPhotos')}</Btn>
          )}
        </View>
      )}
    </View>
  );
}

function AiBanner({ onPress }: { onPress: () => void }) {
  const { t } = useI18n();
  return (
    <Pressable onPress={onPress}>
      <LinearGradient colors={[C.premium, '#363a82']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: R.xl, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, SH.card]}>
        <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
          {Icons.sparkle({ size: 20, color: '#fff' })}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.extrabold, fontSize: 15, color: '#fff' }}>{t('plan.aiTitle')}</Text>
          <Text style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.88)', fontFamily: F.regular, marginTop: 1 }}>{t('plan.aiSub')}</Text>
        </View>
        {Icons.chevR({ size: 18, color: '#fff' })}
      </LinearGradient>
    </Pressable>
  );
}

export function PlanScreen() {
  const insets = useSafeAreaInsets();
  const { setTab, push } = useStore();
  const { plans, markDone, deletePlan, removeStop, moveStop } = usePlans();
  const { setSelected } = usePlaces();
  const { t } = useI18n();
  const upcoming = plans.filter((p) => p.status === 'upcoming');
  const done = plans.filter((p) => p.status === 'done');

  const openStop = (s: Stop) => {
    setSelected(stopToSpot(s));
    push('place');
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <TitleHeader title={t('plan.title')} eyebrow={t('plan.eyebrow')} topInset={insets.top} right={<CircBtn onPress={() => push('aiPlan')}>{Icons.plus({ size: 18, color: C.ink })}</CircBtn>} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 140 }}>
        <View style={{ marginTop: 4 }}><AiBanner onPress={() => push('aiPlan')} /></View>

        {plans.length === 0 ? (
          <View style={{ alignItems: 'center', paddingTop: 40, paddingHorizontal: 20 }}>
            <View style={{ width: 110, height: 110, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.coralLt, borderRadius: 55 }} />
              {Icons.calendar({ size: 52, color: C.coral })}
            </View>
            <Text style={{ fontFamily: F.serif, fontSize: 26, marginTop: 22, letterSpacing: -0.5, color: C.ink, textAlign: 'center' }}>{t('plan.empty')}</Text>
            <Text style={{ marginTop: 8, color: C.ink2, fontFamily: F.regular, fontSize: 14.5, lineHeight: 21, textAlign: 'center', maxWidth: 280 }}>
              {t('plan.emptySub')}
            </Text>
            <View style={{ marginTop: 22, width: '100%' }}>
              <Btn kind="ghost" full onPress={() => setTab('discover')}>{t('plan.browse')}</Btn>
            </View>
          </View>
        ) : (
          <>
            {upcoming.length ? <SectionLabel>{t('plan.upcoming')}</SectionLabel> : null}
            <View style={{ gap: 14 }}>
              {upcoming.map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  onDone={() => markDone(p.id)}
                  onDelete={() => deletePlan(p.id)}
                  onOpenStop={openStop}
                  onRemoveStop={(i) => removeStop(p.id, i)}
                  onMoveStop={(i, dir) => moveStop(p.id, i, dir)}
                />
              ))}
            </View>
            {done.length ? <SectionLabel>{t('plan.afterDay')}</SectionLabel> : null}
            <View style={{ gap: 14 }}>
              {done.map((p) => (
                <PlanCard
                  key={p.id}
                  plan={p}
                  onAddPhotos={() => setTab('gallery')}
                  onDelete={() => deletePlan(p.id)}
                  onOpenStop={openStop}
                  onRemoveStop={(i) => removeStop(p.id, i)}
                  onMoveStop={(i, dir) => moveStop(p.id, i, dir)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

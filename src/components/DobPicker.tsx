// Spotly — dependency-free date-of-birth picker (Day / Month / Year columns).
// Avoids a native date-picker module so it stays JS-only across iOS/Android.
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R } from '../lib/theme';
import { Btn } from './ui';
import { useI18n } from '../lib/i18n';
import { isoFromYMD } from '../lib/dob';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const daysInMonth = (y: number, m0: number) => new Date(y, m0 + 1, 0).getDate();

function Column({ items, value, onPick, render }: { items: number[]; value: number; onPick: (v: number) => void; render: (v: number) => string }) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingVertical: 4 }}
    >
      {items.map((it) => {
        const sel = it === value;
        return (
          <Pressable
            key={it}
            onPress={() => onPick(it)}
            style={{
              paddingVertical: 9,
              marginHorizontal: 6,
              marginVertical: 2,
              borderRadius: 10,
              backgroundColor: sel ? C.coral : 'transparent',
              alignItems: 'center',
            }}
          >
            <Text style={{ fontFamily: sel ? F.extrabold : F.medium, fontSize: 15, color: sel ? '#fff' : C.ink2 }}>
              {render(it)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function DobPicker({
  visible,
  value,
  onClose,
  onSelect,
  title,
}: {
  visible: boolean;
  value?: string | null;
  onClose: () => void;
  onSelect: (iso: string) => void;
  title?: string;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const now = new Date();
  const [y, setY] = useState(now.getFullYear() - 4);
  const [m, setM] = useState(0); // 0-based month
  const [d, setD] = useState(1);

  // Re-seed from the current value (or a sensible default) each time it opens.
  useEffect(() => {
    if (!visible) return;
    const base = value ? new Date(`${value}T00:00:00`) : null;
    if (base && !isNaN(base.getTime())) {
      setY(base.getFullYear());
      setM(base.getMonth());
      setD(base.getDate());
    } else {
      setY(now.getFullYear() - 4);
      setM(0);
      setD(1);
    }
  }, [visible]);

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let yy = now.getFullYear(); yy >= now.getFullYear() - 18; yy--) arr.push(yy);
    return arr;
  }, []);
  const months = useMemo(() => MONTHS.map((_, i) => i), []);
  const days = useMemo(() => {
    const n = daysInMonth(y, m);
    const arr: number[] = [];
    for (let i = 1; i <= n; i++) arr.push(i);
    return arr;
  }, [y, m]);

  const dd = Math.min(d, days.length);
  const confirm = () => {
    // Never allow a future DOB.
    const chosen = new Date(y, m, dd);
    const safe = chosen.getTime() > now.getTime() ? now : chosen;
    onSelect(isoFromYMD(safe.getFullYear(), safe.getMonth() + 1, safe.getDate()));
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(20,15,10,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: insets.bottom + 18 }}>
          <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 14 }} />
          <Text style={{ fontFamily: F.serif, fontSize: 22, letterSpacing: -0.5, color: C.ink, marginBottom: 4 }}>{title || t('dob.title')}</Text>
          <Text style={{ fontFamily: F.regular, fontSize: 12.5, color: C.ink3, marginBottom: 12 }}>{t('dob.sub')}</Text>

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={colLbl}>{t('dob.day')}</Text>
              <View style={[colBox, { height: 168 }]}><Column items={days} value={dd} onPick={setD} render={(v) => String(v)} /></View>
            </View>
            <View style={{ flex: 1.6 }}>
              <Text style={colLbl}>{t('dob.month')}</Text>
              <View style={[colBox, { height: 168 }]}><Column items={months} value={m} onPick={setM} render={(v) => t(`dob.m${v}`)} /></View>
            </View>
            <View style={{ flex: 1.2 }}>
              <Text style={colLbl}>{t('dob.year')}</Text>
              <View style={[colBox, { height: 168 }]}><Column items={years} value={y} onPick={setY} render={(v) => String(v)} /></View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <Btn kind="ghost" style={{ flex: 1 }} onPress={onClose}>{t('common.cancel')}</Btn>
            <Btn kind="primary" style={{ flex: 1.6 }} onPress={confirm}>{t('dob.set')}</Btn>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const colLbl = { fontFamily: F.mono, fontSize: 10, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase' as const, marginBottom: 6, textAlign: 'center' as const };
const colBox = { backgroundColor: C.surface, borderRadius: R.lg, borderWidth: 1, borderColor: C.line, overflow: 'hidden' as const };

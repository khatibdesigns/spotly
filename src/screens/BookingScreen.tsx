// Spotly — Booking sheet + confirmation. Logs a request to Firestore (CRM-visible).
import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import { shareQr } from '../lib/shareQr';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, SpotImage } from '../components/ui';
import { useStore } from '../lib/store';
import { usePlaces } from '../lib/placesStore';
import { useProfile } from '../lib/profile';
import { useBookings } from '../lib/bookings';
import { addBookingToCalendar } from '../lib/calendar';
import { useI18n } from '../lib/i18n';
import { useAndroidKeyboardPad } from '../lib/useKeyboard';

function Label({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 10 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>{children}</Text>
      {right ? <View style={{ marginLeft: 'auto' }}>{right}</View> : null}
    </View>
  );
}

function Stepper({ label, sub, value, onChange }: { label: string; sub?: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, backgroundColor: C.surface, borderRadius: R.lg }, SH.card]}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.ink }}>{label}</Text>
        {sub ? <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{sub}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Pressable onPress={() => onChange(Math.max(0, value - 1))} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.ink2, fontSize: 18 }}>–</Text>
        </Pressable>
        <Text style={{ fontFamily: F.extrabold, fontSize: 16, color: C.ink, minWidth: 16, textAlign: 'center' }}>{value}</Text>
        <Pressable onPress={() => onChange(value + 1)} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: C.coral, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: '#fff', fontSize: 16 }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const SLOTS = ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '1:00', '1:30', '2:00'];

function nextDays(n: number) {
  const out: { key: string; d: string; n: number; label: string }[] = [];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (let i = 0; i < n; i++) {
    const dt = new Date();
    dt.setDate(dt.getDate() + i);
    out.push({ key: dt.toISOString().slice(0, 10), d: days[dt.getDay()], n: dt.getDate(), label: dt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) });
  }
  return out;
}

export function BookingScreen() {
  const insets = useSafeAreaInsets();
  const kbPad = useAndroidKeyboardPad();
  const { pop, push } = useStore();
  const { selected } = usePlaces();
  const { profile } = useProfile();
  const { addBooking } = useBookings();
  const { t } = useI18n();

  const days = nextDays(7);
  const [dayKey, setDayKey] = useState(days[1]?.key || days[0].key);
  const [slot, setSlot] = useState('11:00');
  const [adults, setAdults] = useState(2);
  const [kids, setKids] = useState(profile?.kids?.length || 2);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const place = selected;

  const confirm = async () => {
    setBusy(true);
    try {
      const day = days.find((d) => d.key === dayKey);
      await addBooking({
        placeId: place?.id,
        placeOwnerUid: place?.ownerUid,
        placeName: place?.name || 'Spot',
        photoUrl: place?.photoUrl,
        date: day?.label || dayKey,
        time: slot,
        adults,
        kids,
        note: note.trim() || undefined,
        familyName: profile?.familyName,
      });
      push('bookingConfirmed');
    } catch (e: any) {
      Alert.alert(t('bk.couldNotSend'), e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20,15,10,0.4)' }} onPress={pop} />
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, top: insets.top + 40, backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
        <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginTop: 10, marginBottom: 4 }} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: insets.bottom + 60 + kbPad }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
            <SpotImage photoUrl={place?.photoUrl} tone={place?.tone || 'sun'} height={54} radius={14} style={{ width: 54 }} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontFamily: F.extrabold, fontSize: 16, color: C.ink }}>{place?.name || t('bk.requestVisit')}</Text>
              <Text numberOfLines={1} style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular }}>{place?.category || t('bk.requestToBook')}</Text>
            </View>
          </View>

          <Label>{t('bk.date')}</Label>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
            {days.map((d) => {
              const sel = d.key === dayKey;
              return (
                <Pressable key={d.key} onPress={() => setDayKey(d.key)} style={[{ minWidth: 56, paddingVertical: 10, borderRadius: R.md, alignItems: 'center', backgroundColor: sel ? C.coral : C.surface }, sel ? SH.cta : SH.card]}>
                  <Text style={{ fontSize: 11, fontFamily: F.bold, color: sel ? '#fff' : C.ink }}>{d.d}</Text>
                  <Text style={{ fontSize: 19, fontFamily: F.extrabold, color: sel ? '#fff' : C.ink, marginTop: 2 }}>{d.n}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Label right={<Text style={{ fontSize: 11, color: C.warn, fontFamily: F.bold }}>{t('bk.requestedTime')}</Text>}>{t('bk.time')}</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SLOTS.map((s) => {
              const sel = s === slot;
              return (
                <Pressable key={s} onPress={() => setSlot(s)} style={[{ width: '31.5%', height: 44, borderRadius: R.md, alignItems: 'center', justifyContent: 'center', backgroundColor: sel ? C.coral : C.surface }, SH.card]}>
                  <Text style={{ fontSize: 14, fontFamily: F.bold, color: sel ? '#fff' : C.ink }}>{s}</Text>
                </Pressable>
              );
            })}
          </View>

          <Label>{t('bk.party')}</Label>
          <View style={{ gap: 10 }}>
            <Stepper label={t('bk.adults')} value={adults} onChange={setAdults} />
            <Stepper label={t('bk.kids')} sub={profile?.kids?.map((k) => `${k.name || 'Child'} ${k.age}`).join(', ') || undefined} value={kids} onChange={setKids} />
          </View>

          <Label>{t('bk.anything')}</Label>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={t('bk.notePlaceholder')}
            placeholderTextColor={C.ink3}
            multiline
            style={[{ backgroundColor: C.surface, borderRadius: R.lg, paddingHorizontal: 16, paddingVertical: 14, minHeight: 64, fontFamily: F.medium, fontSize: 14, color: C.ink, borderWidth: 1, borderColor: C.line }]}
          />

          <View style={{ marginTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, backgroundColor: C.coralLt, borderRadius: R.lg }}>
            <Text style={{ fontSize: 12.5, color: C.coralDk, fontFamily: F.semibold, flex: 1, lineHeight: 17 }}>
              {t('bk.disclaimer')}
            </Text>
          </View>

          <Btn kind="primary" size="lg" full style={{ marginTop: 16 }} onPress={confirm}>{busy ? t('bk.sending') : t('bk.requestBooking')}</Btn>
        </ScrollView>
      </View>
    </View>
  );
}

export function BookingConfirmedScreen() {
  const insets = useSafeAreaInsets();
  const { popToRoot, setTab } = useStore();
  const { last } = useBookings();
  const { t } = useI18n();
  const qrRef = useRef<any>(null);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <LinearGradient colors={['#fbe4d8', C.bg]} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 320 }} />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 30, paddingBottom: insets.bottom + 110 }}>
        <View style={{ alignItems: 'center', paddingHorizontal: 28 }}>
          <View style={[{ width: 88, height: 88, borderRadius: 44, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }, SH.pop]}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: C.good, alignItems: 'center', justifyContent: 'center' }}>
              {Icons.check({ size: 30, color: '#fff', strokeWidth: 3 })}
            </View>
          </View>
          <Text style={{ fontFamily: F.serif, fontSize: 30, textAlign: 'center', marginTop: 22, letterSpacing: -0.6, lineHeight: 33, color: C.ink }}>{t('bk.sentTitle')}</Text>
          <Text style={{ marginTop: 8, fontSize: 14, color: C.ink2, fontFamily: F.regular, textAlign: 'center' }}>
            {last ? `${last.date} · ${last.time}` : t('bk.logged')}
          </Text>
        </View>

        {/* Booking pass — QR code presented in person at the venue. */}
        {last?.code ? (
          <View style={[{ marginHorizontal: 22, marginTop: 28, padding: 20, backgroundColor: C.surface, borderRadius: R.xl, alignItems: 'center' }, SH.card]}>
            <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1.2, textTransform: 'uppercase', color: C.ink3 }}>{t('qr.title')}</Text>
            <View style={{ marginTop: 14, padding: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.line }}>
              <QRCode value={`SPOTLY:${last.id}:${last.code}`} size={150} color={C.ink} backgroundColor="#fff" getRef={(c) => (qrRef.current = c)} />
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 18, letterSpacing: 2, color: C.ink, marginTop: 14 }}>{last.code}</Text>
            <Text style={{ fontSize: 12.5, color: C.ink3, fontFamily: F.regular, marginTop: 6, textAlign: 'center', maxWidth: 240, lineHeight: 17 }}>{t('qr.keep')}</Text>
            <Btn
              kind="ghost"
              size="sm"
              style={{ marginTop: 14 }}
              icon={Icons.share({ size: 14, color: C.ink })}
              onPress={() => shareQr(qrRef.current, `${t('qr.title')} — ${last.placeName} · ${t('qr.code')}: ${last.code}`)}
            >
              {t('qr.share')}
            </Btn>
          </View>
        ) : null}

        <View style={[{ marginHorizontal: 22, marginTop: 14, padding: 18, backgroundColor: C.surface, borderRadius: R.xl }, SH.card]}>
          <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
            <SpotImage photoUrl={last?.photoUrl} tone="sun" height={64} radius={14} style={{ width: 64 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.extrabold, fontSize: 16, color: C.ink }}>{last?.placeName || t('bk.yourSpot')}</Text>
              <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 2 }}>
                {last ? t('bk.partyCount', { a: last.adults, k: last.kids }) : ''} · {t('bk.requested')}
              </Text>
            </View>
          </View>
          <Btn
            kind="ghost"
            size="sm"
            style={{ marginTop: 14 }}
            icon={Icons.calendar({ size: 14, color: C.ink })}
            onPress={() =>
              addBookingToCalendar({ placeName: last?.placeName || 'Spot', date: last?.date, time: last?.time })
                .then(() => Alert.alert(t('bk.calAdded'), t('bk.calAddedMsg')))
                .catch((e) => Alert.alert('Calendar', e?.message || t('bk.calErr')))
            }
          >
            {t('plan.addCalendar')}
          </Btn>
        </View>

        <View style={{ marginHorizontal: 22, marginTop: 14, padding: 16, backgroundColor: C.sageLt, borderRadius: R.xl, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
          <View style={{ marginTop: 2 }}>{Icons.sparkle({ size: 18, color: C.sage })}</View>
          <Text style={{ flex: 1, fontSize: 13, color: C.sage, fontFamily: F.regular, lineHeight: 19 }}>
            <Text style={{ fontFamily: F.bold }}>{t('bk.remindBold')}</Text>
            {t('bk.remindRest')}
          </Text>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', left: 22, right: 22, bottom: insets.bottom + 16, flexDirection: 'row', gap: 10 }}>
        <Btn kind="ghost" style={{ flex: 1 }} onPress={popToRoot}>{t('common.done')}</Btn>
        <Btn kind="primary" style={{ flex: 1.4 }} onPress={() => { popToRoot(); setTab('plan'); }}>{t('bk.viewPlans')}</Btn>
      </View>
    </View>
  );
}

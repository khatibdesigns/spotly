// Spotly — booking pass. The QR + redemption code the customer presents in
// person. Opened from Profile → a booking. Reads the booking from useBookings.
import React from 'react';
import { View, Text, ScrollView, Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, CircBtn, SpotImage } from '../components/ui';
import { useStore } from '../lib/store';
import { useBookings } from '../lib/bookings';
import { useI18n } from '../lib/i18n';

export function PassScreen() {
  const insets = useSafeAreaInsets();
  const { pop, stack } = useStore();
  const { bookings } = useBookings();
  const { t } = useI18n();

  const bookingId: string | undefined = stack[stack.length - 1]?.params?.bookingId;
  const b = bookings.find((x) => x.id === bookingId);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CircBtn onPress={pop}>{Icons.arrowL({ size: 18, color: C.ink })}</CircBtn>
        <Text style={{ fontFamily: F.serif, fontSize: 22, color: C.ink, letterSpacing: -0.5 }}>{t('qr.title')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' }}>
        {b ? (
          <>
            <View style={[{ width: '100%', marginTop: 8, padding: 18, backgroundColor: C.surface, borderRadius: R.xl, flexDirection: 'row', gap: 14, alignItems: 'center' }, SH.card]}>
              <SpotImage photoUrl={b.photoUrl} tone="sun" height={56} radius={12} style={{ width: 56 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.extrabold, fontSize: 16, color: C.ink }}>{b.placeName}</Text>
                <Text style={{ fontSize: 12.5, color: C.ink3, fontFamily: F.regular, marginTop: 2 }}>{b.date} · {b.time}</Text>
                <Text style={{ fontSize: 11, color: b.status === 'redeemed' ? C.sage : b.status === 'confirmed' ? C.sky : C.ink3, fontFamily: F.bold, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{b.status}</Text>
              </View>
            </View>

            {b.code ? (
              <View style={[{ marginTop: 18, padding: 22, backgroundColor: C.surface, borderRadius: R.xl, alignItems: 'center', width: '100%' }, SH.card]}>
                <View style={{ padding: 14, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: C.line }}>
                  <QRCode value={`SPOTLY:${b.id}:${b.code}`} size={190} color={C.ink} backgroundColor="#fff" />
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: 22, letterSpacing: 3, color: C.ink, marginTop: 18 }}>{b.code}</Text>
                <Text style={{ fontSize: 13, color: C.ink3, fontFamily: F.regular, marginTop: 8, textAlign: 'center', maxWidth: 260, lineHeight: 18 }}>{t('qr.keep')}</Text>
                <Btn kind="ghost" size="sm" style={{ marginTop: 16 }} icon={Icons.share({ size: 14, color: C.ink })} onPress={() => Share.share({ message: `${t('qr.title')} — ${b.placeName}\n${t('qr.code')}: ${b.code}` }).catch(() => {})}>
                  {t('qr.share')}
                </Btn>
              </View>
            ) : null}
          </>
        ) : (
          <Text style={{ marginTop: 40, color: C.ink3, fontFamily: F.regular }}>—</Text>
        )}
      </ScrollView>
    </View>
  );
}

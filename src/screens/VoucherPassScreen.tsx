// Spotly — voucher pass. The QR + code the customer presents at the venue to
// collect the physical card / redeem the balance. Opened after purchase and
// from Profile → Your vouchers. Reads the order from useVouchers().
import React, { useRef } from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, CircBtn, SpotImage } from '../components/ui';
import { useStore } from '../lib/store';
import { useVouchers } from '../lib/vouchers';
import { useI18n } from '../lib/i18n';
import { shareQr } from '../lib/shareQr';
import { formatMoney } from '../lib/currency';

export function VoucherPassScreen() {
  const insets = useSafeAreaInsets();
  const { pop, stack } = useStore();
  const { orders } = useVouchers();
  const { t } = useI18n();

  const params = stack[stack.length - 1]?.params || {};
  const orderId: string | undefined = params.orderId;
  const more: number = params.more || 0;
  const o = orders.find((x) => x.id === orderId);
  const qrRef = useRef<any>(null);
  const bonus = o && o.value > o.price ? o.value - o.price : 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CircBtn onPress={pop}>{Icons.arrowL({ size: 18, color: C.ink })}</CircBtn>
        <Text style={{ fontFamily: F.serif, fontSize: 22, color: C.ink, letterSpacing: -0.5 }}>{t('voucher.title')}</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, alignItems: 'center' }}>
        {o ? (
          <>
            <View style={[{ width: '100%', marginTop: 8, padding: 18, backgroundColor: C.surface, borderRadius: R.xl, flexDirection: 'row', gap: 14, alignItems: 'center' }, SH.card]}>
              <SpotImage photoUrl={o.photoUrl} tone="sun" height={56} radius={12} style={{ width: 56 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.extrabold, fontSize: 16, color: C.ink }}>{o.label || o.placeName}</Text>
                <Text style={{ fontSize: 12.5, color: C.ink3, fontFamily: F.regular, marginTop: 2 }}>{o.placeName}</Text>
                <Text style={{ fontSize: 11, color: o.status === 'redeemed' ? C.sage : C.sky, fontFamily: F.bold, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{o.status === 'redeemed' ? t('voucher.redeemed') : t('voucher.paid')}</Text>
              </View>
            </View>

            {/* Balance */}
            <View style={[{ width: '100%', marginTop: 14, padding: 18, backgroundColor: C.ink, borderRadius: R.xl }, SH.card]}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontFamily: F.bold, textTransform: 'uppercase', letterSpacing: 0.6 }}>{t('voucher.cardBalance')}</Text>
              <Text style={{ color: '#fff', fontFamily: F.extrabold, fontSize: 34, marginTop: 4 }}>{formatMoney(o.value, o.currencyCode)}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12.5, fontFamily: F.regular, marginTop: 2 }}>
                {t('voucher.paidLine', { pay: formatMoney(o.price, o.currencyCode) })}{bonus > 0 ? `  ·  +${formatMoney(bonus, o.currencyCode)} ${t('place.bonus')}` : ''}
              </Text>
            </View>

            {/* QR */}
            <View style={[{ marginTop: 14, padding: 22, backgroundColor: C.surface, borderRadius: R.xl, alignItems: 'center', width: '100%' }, SH.card]}>
              <View style={{ padding: 14, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: C.line }}>
                <QRCode value={`SPOTLY-V:${o.id}:${o.code}`} size={190} color={C.ink} backgroundColor="#fff" getRef={(c) => (qrRef.current = c)} />
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: 22, letterSpacing: 3, color: C.ink, marginTop: 18 }}>{o.code}</Text>
              <Text style={{ fontSize: 13, color: C.ink3, fontFamily: F.regular, marginTop: 8, textAlign: 'center', maxWidth: 280, lineHeight: 18 }}>{t('voucher.keep')}</Text>
              <Btn kind="ghost" size="sm" style={{ marginTop: 16 }} icon={Icons.share({ size: 14, color: C.ink })} onPress={() => shareQr(qrRef.current, `${t('voucher.title')} — ${o.placeName} · ${formatMoney(o.value, o.currencyCode)} · ${o.code}`)}>
                {t('qr.share')}
              </Btn>
            </View>

            {more > 0 ? (
              <Text style={{ marginTop: 16, fontSize: 13, color: C.ink3, fontFamily: F.regular, textAlign: 'center' }}>{t('voucher.morePassesInProfile', { n: more })}</Text>
            ) : null}
          </>
        ) : (
          <Text style={{ marginTop: 40, color: C.ink3, fontFamily: F.regular }}>—</Text>
        )}
      </ScrollView>
    </View>
  );
}

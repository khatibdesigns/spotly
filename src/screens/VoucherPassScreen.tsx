// Spotly — voucher pass(es). The QR + code the customer presents at the venue
// to collect the card / redeem the balance. Opened after purchase (one or many
// vouchers) and from Profile → My Purchases. Multiple vouchers show as a
// swipeable carousel (one full card per page) with page dots + a counter.
import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, CircBtn, SpotImage } from '../components/ui';
import { useStore } from '../lib/store';
import { useVouchers, VoucherOrder } from '../lib/vouchers';
import { useI18n } from '../lib/i18n';
import { shareQr } from '../lib/shareQr';
import { formatMoney } from '../lib/currency';

// One full voucher card (own QR ref so sharing works per card in a carousel).
function VoucherCard({ o, width }: { o: VoucherOrder; width: number }) {
  const { t } = useI18n();
  const qrRef = useRef<any>(null);
  const bonus = o.value > o.price ? o.value - o.price : 0;
  return (
    <View style={{ width }}>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
        <View style={[{ width: '100%', marginTop: 8, padding: 18, backgroundColor: C.surface, borderRadius: R.xl, flexDirection: 'row', gap: 14, alignItems: 'center' }, SH.card]}>
          <SpotImage photoUrl={o.photoUrl} tone="sun" height={56} radius={12} style={{ width: 56 }} />
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontFamily: F.extrabold, fontSize: 16, color: C.ink }}>{o.label || o.placeName}</Text>
            <Text numberOfLines={1} style={{ fontSize: 12.5, color: C.ink3, fontFamily: F.regular, marginTop: 2 }}>{o.placeName}</Text>
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
      </ScrollView>
    </View>
  );
}

export function VoucherPassScreen() {
  const insets = useSafeAreaInsets();
  const { pop, stack } = useStore();
  const { orders } = useVouchers();
  const { t } = useI18n();
  const width = Dimensions.get('window').width;

  const params = stack[stack.length - 1]?.params || {};
  const ids: string[] = params.orderIds || (params.orderId ? [params.orderId] : []);
  // Resolve in the given order, dropping any not-yet-synced ids.
  const list = ids.map((id) => orders.find((o) => o.id === id)).filter(Boolean) as VoucherOrder[];
  const [idx, setIdx] = useState(0);
  const multi = list.length > 1;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CircBtn onPress={pop}>{Icons.arrowL({ size: 18, color: C.ink })}</CircBtn>
        <Text style={{ flex: 1, fontFamily: F.serif, fontSize: 22, color: C.ink, letterSpacing: -0.5 }}>{multi ? t('voucher.titlePlural') : t('voucher.title')}</Text>
        {multi ? (
          <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.ink3 }}>{t('voucher.ofCount', { n: idx + 1, total: list.length })}</Text>
        ) : null}
      </View>

      {list.length === 0 ? (
        <Text style={{ marginTop: 40, textAlign: 'center', color: C.ink3, fontFamily: F.regular }}>—</Text>
      ) : multi ? (
        <View style={{ flex: 1 }}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / width))}
          >
            {list.map((o) => <VoucherCard key={o.id} o={o} width={width} />)}
          </ScrollView>
          {/* Page dots */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, paddingVertical: 14, paddingBottom: insets.bottom + 10 }}>
            {list.map((o, i) => (
              <View key={o.id} style={{ width: i === idx ? 22 : 7, height: 7, borderRadius: 4, backgroundColor: i === idx ? C.coral : C.line }} />
            ))}
          </View>
        </View>
      ) : (
        <VoucherCard o={list[0]} width={width} />
      )}
    </View>
  );
}

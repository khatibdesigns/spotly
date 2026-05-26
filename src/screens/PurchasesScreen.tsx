// Spotly — My Purchases. Every voucher the family has bought: place name, date
// of purchase, and the card value. Tap one to open its QR pass to redeem.
import React from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { CircBtn, SpotImage } from '../components/ui';
import { useStore } from '../lib/store';
import { useVouchers } from '../lib/vouchers';
import { useI18n } from '../lib/i18n';
import { formatMoney } from '../lib/currency';

function purchaseDate(createdAt: any): string {
  try {
    const d = createdAt?.toDate ? createdAt.toDate() : createdAt ? new Date(createdAt) : null;
    return d ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  } catch {
    return '';
  }
}

export function PurchasesScreen() {
  const insets = useSafeAreaInsets();
  const { pop, push } = useStore();
  const { orders } = useVouchers();
  const { t } = useI18n();

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CircBtn onPress={pop}>{Icons.arrowL({ size: 18, color: C.ink })}</CircBtn>
        <Text style={{ fontFamily: F.serif, fontSize: 22, color: C.ink, letterSpacing: -0.5 }}>{t('profile.myPurchases')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
        {orders.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 80, gap: 12 }}>
            {Icons.bag({ size: 34, color: C.ink3 })}
            <Text style={{ color: C.ink3, fontFamily: F.regular, fontSize: 15, textAlign: 'center', maxWidth: 260, lineHeight: 21 }}>{t('purchases.empty')}</Text>
          </View>
        ) : (
          <View style={{ gap: 12, marginTop: 8 }}>
            {orders.map((o) => {
              const redeemed = o.status === 'redeemed';
              return (
                <Pressable
                  key={o.id}
                  onPress={() => push('voucherPass', { orderId: o.id })}
                  style={[{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.surface, borderRadius: R.lg, padding: 14 }, SH.card]}
                >
                  <SpotImage photoUrl={o.photoUrl} tone="sun" height={54} radius={12} style={{ width: 54 }} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontFamily: F.extrabold, fontSize: 15.5, color: C.ink }}>{o.placeName}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 12.5, color: C.ink3, fontFamily: F.regular, marginTop: 2 }}>
                      {o.label || t('place.voucher')} · {purchaseDate(o.createdAt)}
                    </Text>
                    <Text style={{ fontSize: 11, color: redeemed ? C.sage : C.sky, fontFamily: F.bold, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {redeemed ? t('voucher.redeemed') : t('voucher.paid')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontFamily: F.extrabold, fontSize: 17, color: C.ink }}>{formatMoney(o.value, o.currencyCode)}</Text>
                    <Text style={{ fontSize: 11, color: C.coralDk, fontFamily: F.bold, marginTop: 4 }}>{t('profile.viewPass')}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

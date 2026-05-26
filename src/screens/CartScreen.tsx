// Spotly — voucher cart. Review chosen vouchers, then purchase. No real charge
// yet (Stripe is next); checkout records each voucher as a paid, redeemable
// order with its own QR, then jumps to the first pass.
import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, CircBtn, SpotImage } from '../components/ui';
import { useStore } from '../lib/store';
import { useVouchers } from '../lib/vouchers';
import { useI18n } from '../lib/i18n';
import { formatMoney } from '../lib/currency';

export function CartScreen() {
  const insets = useSafeAreaInsets();
  const { pop, push } = useStore();
  const { cart, removeFromCart, checkout } = useVouchers();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  // Total per currency (a cart usually has a single currency, but be safe).
  const totals: Record<string, number> = {};
  for (const item of cart) totals[item.currencyCode] = (totals[item.currencyCode] || 0) + item.voucher.price;

  const onPurchase = async () => {
    if (cart.length === 0 || busy) return;
    setBusy(true);
    try {
      const ids = await checkout();
      if (ids.length > 0) push('voucherPass', { orderId: ids[0], more: ids.length - 1 });
      else pop();
    } catch (e: any) {
      Alert.alert(t('cart.couldNotBuy'), e?.message || t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CircBtn onPress={pop}>{Icons.arrowL({ size: 18, color: C.ink })}</CircBtn>
        <Text style={{ fontFamily: F.serif, fontSize: 22, color: C.ink, letterSpacing: -0.5 }}>{t('cart.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 200 }}>
        {cart.length === 0 ? (
          <View style={{ alignItems: 'center', marginTop: 80, gap: 10 }}>
            {Icons.bag({ size: 34, color: C.ink3 })}
            <Text style={{ color: C.ink3, fontFamily: F.regular, fontSize: 15 }}>{t('cart.empty')}</Text>
          </View>
        ) : (
          <View style={{ gap: 12, marginTop: 8 }}>
            {cart.map((item) => {
              const bonus = item.voucher.value > item.voucher.price ? item.voucher.value - item.voucher.price : 0;
              return (
                <View key={item.key} style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: R.lg, padding: 14 }, SH.card]}>
                  <SpotImage photoUrl={item.photoUrl} tone="sun" height={50} radius={12} style={{ width: 50 }} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontFamily: F.extrabold, fontSize: 14.5, color: C.ink }}>{item.voucher.label || item.placeName}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{item.placeName}</Text>
                    <Text style={{ fontSize: 12.5, color: C.ink2, fontFamily: F.bold, marginTop: 3 }}>
                      {formatMoney(item.voucher.price, item.currencyCode)}
                      {bonus > 0 ? <Text style={{ color: C.sage }}>{`  ·  ${formatMoney(item.voucher.value, item.currencyCode)} ${t('place.balance')}`}</Text> : null}
                    </Text>
                  </View>
                  <Pressable onPress={() => removeFromCart(item.key)} hitSlop={10} style={{ padding: 6 }}>
                    {Icons.trash({ size: 18, color: C.ink3 })}
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {cart.length > 0 ? (
        <View style={[{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12, backgroundColor: C.surface, borderRadius: 24, padding: 16, gap: 12 }, SH.pop]}>
          {Object.entries(totals).map(([code, amt]) => (
            <View key={code} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.ink2 }}>{t('cart.total')}</Text>
              <Text style={{ fontFamily: F.extrabold, fontSize: 20, color: C.ink }}>{formatMoney(amt, code)}</Text>
            </View>
          ))}
          <Btn kind="primary" full style={{ height: 54 }} onPress={onPurchase}>
            {busy ? t('cart.purchasing') : t('cart.purchase')}
          </Btn>
          <Text style={{ fontSize: 11, color: C.ink3, fontFamily: F.regular, textAlign: 'center' }}>{t('cart.redeemNote')}</Text>
        </View>
      ) : null}
    </View>
  );
}

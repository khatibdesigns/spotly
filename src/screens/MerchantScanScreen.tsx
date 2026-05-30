// Spotly — scan a customer's QR (or type the code) to redeem at the branch.
// Booking pass = SPOTLY:{bookingId}:{code}; voucher pass = SPOTLY-V:{orderId}:{code}.
// Matches against the merchant's already-scoped bookings/voucher sales, so a code
// from another branch simply won't be found.
import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { C, F, R } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn } from '../components/ui';
import { useStore } from '../lib/store';
import { useI18n } from '../lib/i18n';
import { useMerchant } from '../lib/merchant';
import { formatMoney } from '../lib/currency';

function parseScan(raw: string) {
  const s = (raw || '').trim();
  const parts = s.split(':');
  if (s.startsWith('SPOTLY-V:')) return { kind: 'voucher' as const, id: parts[1] || '', code: parts[2] || '' };
  if (s.startsWith('SPOTLY:')) return { kind: 'booking' as const, id: parts[1] || '', code: parts[2] || '' };
  return { kind: 'code' as const, id: '', code: s.toUpperCase() };
}

export function MerchantScanScreen() {
  const insets = useSafeAreaInsets();
  const { pop } = useStore();
  const { t } = useI18n();
  const { bookings, voucherSales, markRedeemed, markVoucherRedeemed } = useMerchant();
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');

  const redeem = (raw: string) => {
    if (busy) return;
    const p = parseScan(raw);
    let v = p.kind === 'voucher' ? (voucherSales.find((x) => x.id === p.id) || voucherSales.find((x) => x.code === p.code))
          : p.kind === 'code' ? voucherSales.find((x) => x.code === p.code) : undefined;
    let b = p.kind === 'booking' ? (bookings.find((x) => x.id === p.id) || bookings.find((x) => x.code === p.code))
          : p.kind === 'code' ? bookings.find((x) => x.code === p.code) : undefined;
    if (!v && !b) { setBusy(true); Alert.alert(t('mscan.notFound'), t('mscan.notFoundMsg'), [{ text: t('common.ok'), onPress: () => setBusy(false) }]); return; }
    setBusy(true);
    if (v) {
      if (v.status === 'redeemed') { Alert.alert(t('mscan.already'), v.label || v.placeName, [{ text: t('common.ok'), onPress: () => setBusy(false) }]); return; }
      Alert.alert(t('mscan.confirmVoucher'), `${v.label || v.placeName}\n${formatMoney(v.value, v.currencyCode)} ${t('place.balance')}`, [
        { text: t('common.cancel'), style: 'cancel', onPress: () => setBusy(false) },
        { text: t('mh.redeem'), onPress: async () => { await markVoucherRedeemed(v!.id); Alert.alert(t('mscan.doneTitle'), t('mscan.doneMsg'), [{ text: t('common.ok'), onPress: () => setBusy(false) }]); } },
      ]);
    } else if (b) {
      if (b.status === 'redeemed') { Alert.alert(t('mscan.already'), b.familyName || b.placeName, [{ text: t('common.ok'), onPress: () => setBusy(false) }]); return; }
      Alert.alert(t('mscan.confirmBooking'), `${b.familyName || b.placeName}\n${b.date} · ${b.time}`, [
        { text: t('common.cancel'), style: 'cancel', onPress: () => setBusy(false) },
        { text: t('mh.redeem'), onPress: async () => { await markRedeemed(b!.id); Alert.alert(t('mscan.doneTitle'), t('mscan.doneMsg'), [{ text: t('common.ok'), onPress: () => setBusy(false) }]); } },
      ]);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <View style={{ paddingTop: insets.top + 12, paddingHorizontal: 20, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={pop} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {Icons.arrowL({ size: 18, color: '#fff' })}
          <Text style={{ color: '#fff', fontFamily: F.bold, fontSize: 15 }}>{t('common.back')}</Text>
        </Pressable>
        <Text style={{ color: '#fff', fontFamily: F.extrabold, fontSize: 16 }}>{t('mscan.title')}</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Camera */}
      <View style={{ flex: 1, margin: 20, borderRadius: 24, overflow: 'hidden', backgroundColor: '#000' }}>
        {permission?.granted ? (
          <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={busy ? undefined : ({ data }) => redeem(data)} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 30 }}>
            {Icons.camera ? Icons.camera({ size: 34, color: 'rgba(255,255,255,0.6)' }) : null}
            <Text style={{ color: 'rgba(255,255,255,0.8)', fontFamily: F.regular, fontSize: 14, textAlign: 'center', marginTop: 14, marginBottom: 16 }}>{t('mscan.camPerm')}</Text>
            <Btn kind="primary" onPress={requestPermission}>{t('mscan.enableCam')}</Btn>
          </View>
        )}
        {permission?.granted ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 220, height: 220, borderWidth: 3, borderColor: 'rgba(255,255,255,0.85)', borderRadius: 24 }} />
            <Text style={{ color: '#fff', fontFamily: F.bold, fontSize: 13, marginTop: 16, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: R.pill }}>{t('mscan.point')}</Text>
          </View>
        ) : null}
      </View>

      {/* Manual / USB-scanner entry */}
      <View style={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 18, gap: 10 }}>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontFamily: F.bold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t('mscan.orType')}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: R.lg, paddingHorizontal: 14, height: 50, justifyContent: 'center' }}>
            <TextInput
              style={{ color: '#fff', fontFamily: F.mono, fontSize: 15 }}
              placeholder="SPOT-XXXXXX"
              placeholderTextColor="rgba(255,255,255,0.4)"
              autoCapitalize="characters"
              autoCorrect={false}
              value={manual}
              onChangeText={setManual}
              returnKeyType="done"
              onSubmitEditing={() => { if (manual.trim()) { redeem(manual); setManual(''); } }}
            />
          </View>
          <Btn kind="primary" onPress={() => { if (manual.trim()) { redeem(manual); setManual(''); } }}>{t('mscan.redeemBtn')}</Btn>
        </View>
      </View>
    </View>
  );
}

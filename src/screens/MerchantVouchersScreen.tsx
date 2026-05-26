// Spotly — merchant voucher editor. A merchant sets the currency and the list
// of prepaid vouchers (pay X, get Y balance) sold on one of their place pages.
// Saved to places/{id}.{currency,vouchers}. Opened from the dashboard.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, CircBtn } from '../components/ui';
import { useStore } from '../lib/store';
import { useMerchant } from '../lib/merchant';
import { useI18n } from '../lib/i18n';
import { CURRENCIES, Voucher } from '../lib/currency';

type Draft = { id: string; label: string; price: string; value: string; active: boolean };

function newDraft(): Draft {
  return { id: Math.random().toString(36).slice(2, 9), label: '', price: '', value: '', active: true };
}

export function MerchantVouchersScreen() {
  const insets = useSafeAreaInsets();
  const { pop, stack } = useStore();
  const { places, setPlaceVouchers } = useMerchant();
  const { t } = useI18n();

  const placeId: string | undefined = stack[stack.length - 1]?.params?.placeId;
  const place = places.find((p) => p.id === placeId);

  const [currency, setCurrency] = useState(place?.currency || 'KWD');
  const [rows, setRows] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // Scroll a newly-focused input above the keyboard (works on iOS + Android;
  // adjustResize alone doesn't auto-scroll the focused field into view).
  const reveal = (e: any) => {
    const node = e?.target;
    if (node == null) return;
    setTimeout(() => {
      try {
        scrollRef.current?.getScrollResponder?.()?.scrollResponderScrollNativeHandleToKeyboard?.(node, 120, true);
      } catch {}
    }, 60);
  };

  useEffect(() => {
    if (!place) return;
    setCurrency(place.currency || 'KWD');
    const existing = (place.vouchers || []).map((v) => ({
      id: v.id || Math.random().toString(36).slice(2, 9),
      label: v.label || '',
      price: String(v.price ?? ''),
      value: String(v.value ?? ''),
      active: v.active !== false,
    }));
    setRows(existing.length ? existing : [newDraft()]);
  }, [place?.id]);

  const update = (id: string, patch: Partial<Draft>) => setRows((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const remove = (id: string) => setRows((r) => r.filter((x) => x.id !== id));
  const add = () => setRows((r) => [...r, newDraft()]);

  const onSave = async () => {
    if (!place || busy) return;
    const vouchers: Voucher[] = [];
    for (const r of rows) {
      const price = parseFloat(r.price);
      const value = parseFloat(r.value);
      if (!r.price && !r.value && !r.label) continue; // skip blank rows
      if (isNaN(price) || price <= 0) {
        Alert.alert(t('mv.invalid'), t('mv.invalidPrice'));
        return;
      }
      vouchers.push({ id: r.id, price, value: isNaN(value) ? price : value, label: r.label.trim(), active: r.active });
    }
    setBusy(true);
    try {
      await setPlaceVouchers(place.id, currency, vouchers);
      Alert.alert(t('mv.saved'), t('mv.savedMsg'));
      pop();
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('common.tryAgain'));
    } finally {
      setBusy(false);
    }
  };

  const currencyKeys = Object.keys(CURRENCIES);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={{ paddingTop: insets.top + 6, paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CircBtn onPress={pop}>{Icons.arrowL({ size: 18, color: C.ink })}</CircBtn>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.serif, fontSize: 21, color: C.ink, letterSpacing: -0.5 }}>{t('mv.title')}</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 50}>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" showsVerticalScrollIndicator={false}>
          {!place ? (
            <Text style={{ marginTop: 40, color: C.ink3, fontFamily: F.regular }}>—</Text>
          ) : (
            <>
              <Text style={{ fontSize: 13, color: C.ink2, fontFamily: F.regular, marginTop: 6, lineHeight: 19 }}>{t('mv.sub', { place: place.name })}</Text>

              {/* Currency */}
              <Text style={{ marginTop: 20, fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>{t('mv.currency')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 10 }}>
                {currencyKeys.map((k) => {
                  const on = currency === k;
                  return (
                    <Pressable key={k} onPress={() => setCurrency(k)} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: R.pill, backgroundColor: on ? C.ink : C.surface, borderWidth: 1, borderColor: on ? C.ink : C.line }}>
                      <Text style={{ fontFamily: F.bold, fontSize: 13, color: on ? '#fff' : C.ink2 }}>{k} · {CURRENCIES[k].symbol}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Voucher rows */}
              <Text style={{ marginTop: 12, fontFamily: F.mono, fontSize: 11, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase' }}>{t('mv.vouchers')}</Text>
              <View style={{ gap: 12, marginTop: 12 }}>
                {rows.map((r) => (
                  <View key={r.id} style={[{ backgroundColor: C.surface, borderRadius: R.lg, padding: 14, gap: 10 }, SH.card]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <TextInput
                        value={r.label}
                        onChangeText={(v) => update(r.id, { label: v })}
                        onFocus={reveal}
                        placeholder={t('mv.labelPh')}
                        placeholderTextColor={C.ink3}
                        style={{ flex: 1, fontFamily: F.semibold, fontSize: 15, color: C.ink, paddingVertical: 4 }}
                      />
                      <Pressable onPress={() => remove(r.id)} hitSlop={10} style={{ padding: 4 }}>{Icons.trash({ size: 18, color: C.ink3 })}</Pressable>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10.5, color: C.ink3, fontFamily: F.bold, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>{t('mv.price')}</Text>
                        <TextInput
                          value={r.price}
                          onChangeText={(v) => update(r.id, { price: v.replace(/[^0-9.]/g, '') })}
                          onFocus={reveal}
                          keyboardType="decimal-pad"
                          placeholder="10"
                          placeholderTextColor={C.ink3}
                          style={{ backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: F.bold, fontSize: 15, color: C.ink, borderWidth: 1, borderColor: C.line }}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 10.5, color: C.ink3, fontFamily: F.bold, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 }}>{t('mv.value')}</Text>
                        <TextInput
                          value={r.value}
                          onChangeText={(v) => update(r.id, { value: v.replace(/[^0-9.]/g, '') })}
                          onFocus={reveal}
                          keyboardType="decimal-pad"
                          placeholder="15"
                          placeholderTextColor={C.ink3}
                          style={{ backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontFamily: F.bold, fontSize: 15, color: C.ink, borderWidth: 1, borderColor: C.line }}
                        />
                      </View>
                    </View>
                    <Pressable onPress={() => update(r.id, { active: !r.active })} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: r.active ? C.sage : C.line, backgroundColor: r.active ? C.sage : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                        {r.active ? Icons.check({ size: 12, color: '#fff', strokeWidth: 3 }) : null}
                      </View>
                      <Text style={{ fontSize: 13, color: C.ink2, fontFamily: F.semibold }}>{t('mv.active')}</Text>
                    </Pressable>
                  </View>
                ))}
              </View>

              <Btn kind="ghost" full style={{ marginTop: 14 }} icon={Icons.plus({ size: 15, color: C.ink })} onPress={add}>{t('mv.addVoucher')}</Btn>
            </>
          )}
        </ScrollView>
        {/* Save bar lives inside the keyboard-avoiding view so it floats above
            the keyboard instead of being hidden behind it. */}
        {place ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.bg }}>
            <Btn kind="primary" full style={{ height: 54 }} onPress={onSave}>{busy ? t('common.saving') : t('mv.save')}</Btn>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

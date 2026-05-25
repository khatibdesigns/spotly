// Spotly — Album editor + checkout. Ported from screens-gallery.jsx.
import React, { useState } from 'react';
import { View, Text, ScrollView, Alert, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, Placeholder, CircBtn, SectionLabel } from '../components/ui';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { createAlbumOrder } from '../lib/bookings';
import { useI18n } from '../lib/i18n';

export function BookPreview({ size = 'md', title = 'Our France Trip', sub = 'Summer 2026', tone = 'sun' as const }: { size?: 'md' | 'lg'; title?: string; sub?: string; tone?: any }) {
  const w = size === 'lg' ? 220 : 180;
  const h = w * 1.12;
  return (
    <View style={{ width: w, height: h }}>
      <View style={[{ width: '100%', height: '100%', borderRadius: 6, backgroundColor: '#f4eee6', overflow: 'hidden' }, SH.pop]}>
        <View style={{ position: 'absolute', top: 18, left: 18, right: 18, height: '54%' }}>
          <Placeholder tone={tone} height={h * 0.54 - 18} radius={4} label="cover photo" />
        </View>
        <View style={{ position: 'absolute', left: 18, right: 18, bottom: 22 }}>
          <Text style={{ fontFamily: F.serif, fontSize: w * 0.105, lineHeight: w * 0.11, letterSpacing: -0.5, color: C.ink }}>{title}</Text>
          <Text style={{ fontSize: w * 0.052, color: C.ink3, fontFamily: F.bold, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.6 }}>{sub}</Text>
        </View>
        <View style={{ position: 'absolute', top: 10, right: 12 }}>
          <Icons.Mark size={w * 0.06} />
        </View>
      </View>
    </View>
  );
}

function SpreadCard({ idx, tones }: { idx: string; tones: [string, string] }) {
  return (
    <View style={[{ flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: C.surface, padding: 12, borderRadius: R.lg }, SH.card]}>
      <Text style={{ fontSize: 11, color: C.ink3, fontFamily: F.extrabold, letterSpacing: 0.5, textTransform: 'uppercase', minWidth: 32 }}>{idx}</Text>
      <View style={{ flexDirection: 'row', flex: 1, gap: 4, padding: 6, backgroundColor: '#f6f3ee', borderRadius: 6, borderWidth: 1, borderColor: C.line }}>
        <Placeholder tone={tones[0] as any} height={60} radius={3} style={{ flex: 1 }} />
        <Placeholder tone={tones[1] as any} height={60} radius={3} style={{ flex: 1 }} />
      </View>
      {Icons.more({ size: 16, color: C.ink3 })}
    </View>
  );
}

export function AlbumEditorScreen() {
  const insets = useSafeAreaInsets();
  const { pop, push } = useStore();
  const { t } = useI18n();
  return (
    <View style={{ flex: 1, backgroundColor: '#f4f1ec' }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 56, paddingHorizontal: 20, paddingBottom: 120 }}>
        {/* Title card */}
        <View style={[{ backgroundColor: C.surface, borderRadius: R.xl, paddingVertical: 14, paddingHorizontal: 16 }, SH.card]}>
          <Text style={{ fontSize: 10.5, color: C.ink3, fontFamily: F.extrabold, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t('al.albumTitle')}</Text>
          <Text style={{ fontFamily: F.serif, fontSize: 26, lineHeight: 29, marginTop: 4, letterSpacing: -0.5, color: C.ink }}>Our France Trip</Text>
          <Text style={{ fontSize: 13, color: C.ink3, fontFamily: F.regular, marginTop: 4 }}>Summer 2026 · 24 pages</Text>
        </View>

        <SectionLabel>{t('al.cover')}</SectionLabel>
        <View style={{ backgroundColor: '#efe6da', borderRadius: R.xl, padding: 22, alignItems: 'center', borderWidth: 1, borderColor: C.line }}>
          <BookPreview />
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <SectionLabel>{t('al.pages')}</SectionLabel>
          <Text style={{ marginLeft: 'auto', marginTop: 24, marginBottom: 10, fontSize: 11, color: C.coralDk, fontFamily: F.bold }}>{t('al.autoArrange')}</Text>
        </View>
        <View style={{ gap: 10 }}>
          <SpreadCard idx="1–2" tones={['sun', 'sage']} />
          <SpreadCard idx="3–4" tones={['sky', 'warm']} />
          <SpreadCard idx="5–6" tones={['plum', 'sun']} />
        </View>

        <SectionLabel>{t('al.layout')}</SectionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <View key={i} style={{ width: 70, height: 56, backgroundColor: C.surface, borderRadius: 10, borderWidth: i === 2 ? 2 : 1, borderColor: i === 2 ? C.sage : C.line, padding: 6, flexDirection: 'row', gap: 4 }}>
              {i === 2 ? (
                <>
                  <View style={{ flex: 1.5, backgroundColor: C.sageLt, borderRadius: 3 }} />
                  <View style={{ flex: 1, backgroundColor: C.sageLt, borderRadius: 3 }} />
                </>
              ) : (
                <View style={{ flex: 1, backgroundColor: C.line, borderRadius: 3 }} />
              )}
            </View>
          ))}
        </ScrollView>
      </ScrollView>

      {/* Top bar */}
      <View style={{ position: 'absolute', top: insets.top + 6, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <CircBtn onPress={pop}>{Icons.arrowL({ size: 18, color: C.ink })}</CircBtn>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: C.ink3, fontFamily: F.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>{t('al.step2')}</Text>
          <Text style={{ fontFamily: F.extrabold, fontSize: 15, color: C.ink }}>{t('al.editAlbum')}</Text>
        </View>
        <Btn kind="primary" size="sm">{t('al.preview')}</Btn>
      </View>

      {/* Sticky footer */}
      <View style={[{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12, height: 72, backgroundColor: C.surface, borderRadius: 24, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 }, SH.pop]}>
        <View style={{ paddingLeft: 6 }}>
          <Text style={{ fontSize: 10, color: C.ink3, fontFamily: F.extrabold, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t('al.hardcover')}</Text>
          <Text style={{ fontSize: 19, fontFamily: F.extrabold, color: C.ink }}>
            €49<Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular }}> · {t('al.shipsIn')}</Text>
          </Text>
        </View>
        <Btn kind="sage" style={{ marginLeft: 'auto', height: 50 }} onPress={() => push('albumCheckout')}>{t('al.orderAlbum')}</Btn>
      </View>
    </View>
  );
}

function SummaryRow({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
      <Text style={{ color: C.ink2, fontFamily: bold ? F.bold : F.regular, fontSize: bold ? 15 : 13.5 }}>{k}</Text>
      <Text style={{ color: C.ink, fontFamily: bold ? F.extrabold : F.semibold, fontSize: bold ? 17 : 13.5 }}>{v}</Text>
    </View>
  );
}

export function AlbumCheckoutScreen() {
  const insets = useSafeAreaInsets();
  const { pop, popToRoot } = useStore();
  const { user } = useAuth();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const sizes = [
    { n: 'Petite', d: '6×6 in', price: 29 },
    { n: 'Classic', d: '8×8 in', price: 49 },
    { n: 'Grand', d: '11×11 in', price: 89 },
  ];
  const covers = [
    { n: 'Linen', sw: '#f4eee6' },
    { n: 'Coral', sw: C.coral },
    { n: 'Sage', sw: C.sage },
    { n: 'Ink', sw: C.ink },
  ];
  const [sizeIdx, setSizeIdx] = useState(1);
  const [coverIdx, setCoverIdx] = useState(0);
  const SHIPPING = 4.9;
  const money = (n: number) => `€${n.toFixed(2)}`;
  const total = sizes[sizeIdx].price + SHIPPING;

  const placeOrder = async () => {
    setBusy(true);
    try {
      if (user)
        await createAlbumOrder(user.uid, {
          title: 'Our France Trip',
          size: `${sizes[sizeIdx].n} ${sizes[sizeIdx].d} hardcover`,
          cover: covers[coverIdx].n,
          total: money(total),
          pages: 24,
        });
      Alert.alert(
        t('al.thankYou'),
        t('al.thankYouMsg'),
        [{ text: t('common.done'), onPress: popToRoot }]
      );
    } catch (e: any) {
      Alert.alert(t('al.couldNotOrder'), e?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: '#f4f1ec' }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: insets.top + 56, paddingHorizontal: 20, paddingBottom: 130 }}>
        <View style={{ backgroundColor: '#efe6da', borderRadius: R.xl, paddingVertical: 26, alignItems: 'center' }}>
          <BookPreview size="lg" />
        </View>
        <Text style={{ marginTop: 18, fontFamily: F.serif, fontSize: 24, letterSpacing: -0.5, color: C.ink }}>Our France Trip</Text>
        <Text style={{ fontSize: 13, color: C.ink3, fontFamily: F.regular, marginTop: 2 }}>Summer 2026 · 24 pages · 12 spots</Text>

        <SectionLabel>{t('al.size')}</SectionLabel>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {sizes.map((s, i) => {
            const sel = i === sizeIdx;
            return (
              <Pressable key={s.n} onPress={() => setSizeIdx(i)} style={[{ flex: 1, paddingVertical: 14, paddingHorizontal: 12, borderRadius: R.lg, alignItems: 'center', backgroundColor: C.surface, borderWidth: 2, borderColor: sel ? C.sage : 'transparent' }, SH.card]}>
                <Text style={{ fontFamily: F.extrabold, fontSize: 14, color: C.ink }}>{s.n}</Text>
                <Text style={{ fontSize: 11, color: C.ink3, fontFamily: F.regular, marginTop: 2 }}>{s.d}</Text>
                <Text style={{ fontFamily: F.extrabold, fontSize: 14, marginTop: 6, color: sel ? C.sage : C.ink }}>€{s.price}</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionLabel>{t('al.cover')}</SectionLabel>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {covers.map((cv, i) => {
            const sel = i === coverIdx;
            return (
              <Pressable key={cv.n} onPress={() => setCoverIdx(i)} style={{ flex: 1, alignItems: 'center' }}>
                <View style={{ height: 56, width: '100%', borderRadius: R.lg, backgroundColor: cv.sw, borderWidth: sel ? 3 : 1, borderColor: sel ? C.sage : C.line }} />
                <Text style={{ fontSize: 11, fontFamily: sel ? F.extrabold : F.bold, marginTop: 6, color: sel ? C.sage : C.ink2 }}>{cv.n}</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionLabel>{t('al.shipTo')}</SectionLabel>
        <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, SH.card]}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.coralLt, alignItems: 'center', justifyContent: 'center' }}>
            {Icons.pin({ size: 18, color: C.coralDk, filled: true })}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.ink }}>Maya Khalil — Home</Text>
            <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>14 Rue de la Soie · 69005 Lyon</Text>
          </View>
          <Text style={{ fontSize: 12, color: C.coralDk, fontFamily: F.bold }}>{t('al.change')}</Text>
        </View>

        <SectionLabel>{t('al.summary')}</SectionLabel>
        <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, padding: 16 }, SH.card]}>
          <SummaryRow k={`${sizes[sizeIdx].n} ${sizes[sizeIdx].d} hardcover`} v={money(sizes[sizeIdx].price)} />
          <SummaryRow k={`${covers[coverIdx].n} ${t('al.coverWord')}`} v="—" />
          <SummaryRow k={t('al.shipping')} v={money(SHIPPING)} />
          <View style={{ borderTopWidth: 1, borderTopColor: C.line, borderStyle: 'dashed', marginTop: 10, paddingTop: 10 }}>
            <SummaryRow k={t('al.total')} v={money(total)} bold />
          </View>
        </View>
      </ScrollView>

      <View style={{ position: 'absolute', top: insets.top + 6, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <CircBtn onPress={pop}>{Icons.arrowL({ size: 18, color: C.ink })}</CircBtn>
        <Text style={{ flex: 1, textAlign: 'center', fontFamily: F.extrabold, fontSize: 15, color: C.ink }}>{t('al.reviewOrder')}</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={[{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12, backgroundColor: C.surface, borderRadius: 24, padding: 12 }, SH.pop]}>
        <Btn kind="sage" full style={{ height: 52 }} onPress={placeOrder} icon={Icons.lock({ size: 14, color: '#fff' })}>{busy ? t('al.placingOrder') : t('al.placeOrder')}</Btn>
      </View>
    </View>
  );
}

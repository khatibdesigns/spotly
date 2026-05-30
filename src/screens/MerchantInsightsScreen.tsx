// Spotly — merchant insights. Tap a stat → trend chart (last 30 days) + a short
// forecast + per-branch breakdown (owner/country) + the underlying list.
// All computed client-side from data already in MerchantProvider.
import React, { useMemo } from 'react';
import { View, Text, ScrollView, Pressable, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Polyline, Line, Circle } from 'react-native-svg';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { useStore } from '../lib/store';
import { useI18n } from '../lib/i18n';
import { useMerchant } from '../lib/merchant';
import { formatMoney } from '../lib/currency';
import { Metric, Point, buildSeries, forecast, sumSeries, trendPct, perBranch } from '../lib/insights';

const DAYS = 30;
const META: Record<Metric, { title: string; list: 'bookings' | 'vouchers' | null }> = {
  views: { title: 'Views', list: null },
  clicks: { title: 'Direction clicks', list: null },
  bookings: { title: 'Bookings', list: 'bookings' },
  vouchers: { title: 'Vouchers sold', list: 'vouchers' },
  revenue: { title: 'Voucher revenue', list: 'vouchers' },
};

function TrendChart({ history, fc }: { history: Point[]; fc: Point[] }) {
  const W = Dimensions.get('window').width - 40 - 32;
  const H = 150; const pad = 10;
  const all = [...history, ...fc];
  const max = Math.max(1, ...all.map((p) => p.value));
  const n = all.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v: number) => pad + (1 - v / max) * (H - pad * 2);
  const histPts = history.map((p, i) => `${x(i)},${y(p.value)}`).join(' ');
  const fcSeq = history.length ? [history[history.length - 1], ...fc] : fc;
  const base = history.length - 1;
  const fcPts = fcSeq.map((p, i) => `${x(base + i)},${y(p.value)}`).join(' ');
  return (
    <Svg width={W} height={H}>
      <Line x1={0} y1={H - pad} x2={W} y2={H - pad} stroke={C.line} strokeWidth={1} />
      {history.length ? <Polyline points={histPts} fill="none" stroke={C.coral} strokeWidth={2.5} strokeLinejoin="round" /> : null}
      {fc.length ? <Polyline points={fcPts} fill="none" stroke={C.ink3} strokeWidth={2} strokeDasharray="5,4" strokeLinejoin="round" /> : null}
      {history.length ? <Circle cx={x(history.length - 1)} cy={y(history[history.length - 1].value)} r={3.5} fill={C.coral} /> : null}
    </Svg>
  );
}

export function MerchantInsightsScreen() {
  const insets = useSafeAreaInsets();
  const { pop, stack } = useStore();
  const { t } = useI18n();
  const { role, places, bookings, voucherSales, stats } = useMerchant();
  const metric: Metric = (stack[stack.length - 1]?.params?.metric as Metric) || 'bookings';
  const meta = META[metric];
  const placeIds = useMemo(() => places.map((p) => p.id), [places]);
  const currency = voucherSales[0]?.currencyCode || 'KWD';

  const series = useMemo(() => buildSeries(metric, { days: DAYS, placeIds, bookings, vouchers: voucherSales, stats }), [metric, placeIds, bookings, voucherSales, stats]);
  const fc = useMemo(() => forecast(series, 7), [series]);
  const total = sumSeries(series);
  const pct = trendPct(series);
  const fcTotal = sumSeries(fc);
  const branches = useMemo(() => (places.length > 1 ? perBranch(metric, { days: DAYS, places, bookings, vouchers: voucherSales, stats }) : []), [metric, places, bookings, voucherSales, stats]);
  const fmt = (n: number) => (metric === 'revenue' ? formatMoney(Math.round(n), currency) : String(Math.round(n)));

  const listRows = meta.list === 'bookings'
    ? [...bookings].filter((b) => !b.placeId || placeIds.includes(b.placeId)).slice(0, 40)
    : meta.list === 'vouchers'
    ? [...voucherSales].filter((v) => !v.placeId || placeIds.includes(v.placeId)).slice(0, 40)
    : [];

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: 4 }}>
          <Pressable onPress={pop} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {Icons.arrowL({ size: 16, color: C.ink2 })}
            <Text style={{ color: C.ink2, fontFamily: F.bold, fontSize: 14 }}>{t('common.back')}</Text>
          </Pressable>
        </View>

        {/* Summary + chart */}
        <View style={{ paddingHorizontal: 20 }}>
          <View style={[{ backgroundColor: C.surface, borderRadius: R.xl, padding: 18 }, SH.card]}>
            <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.ink3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{meta.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 4 }}>
              <Text style={{ fontFamily: F.extrabold, fontSize: 34, color: C.ink, lineHeight: 38 }}>{fmt(total)}</Text>
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: pct >= 0 ? C.sage : C.coralDk, marginBottom: 6 }}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct)}%</Text>
            </View>
            <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 2 }}>{t('insights.last30')}</Text>
            <View style={{ marginTop: 14 }}>
              <TrendChart history={series} fc={fc} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: C.ink3, fontFamily: F.regular }}>{series[0]?.date?.slice(5)}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 14, height: 0, borderTopWidth: 2, borderColor: C.ink3, borderStyle: 'dashed' }} />
                <Text style={{ fontSize: 11, color: C.ink3, fontFamily: F.regular }}>{t('insights.forecast')}</Text>
              </View>
            </View>
            {fc.length ? (
              <View style={{ marginTop: 12, backgroundColor: C.surface2, borderRadius: R.md, padding: 12 }}>
                <Text style={{ fontSize: 12.5, color: C.ink2, fontFamily: F.regular }}>{t('insights.next7')}</Text>
                <Text style={{ fontFamily: F.extrabold, fontSize: 18, color: C.ink, marginTop: 2 }}>≈ {fmt(fcTotal)}</Text>
                <Text style={{ fontSize: 11, color: C.ink3, fontFamily: F.regular, marginTop: 2 }}>{t('insights.estimate')}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Per-branch breakdown (owner / country manager) */}
        {branches.length ? (
          <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
            <Text style={{ fontFamily: F.serif, fontSize: 19, color: C.ink, letterSpacing: -0.3 }}>{t('insights.byBranch')}</Text>
            <View style={{ gap: 8, marginTop: 12 }}>
              {(() => { const top = Math.max(1, ...branches.map((x) => x.total)); return branches.map(({ place, total: bt }) => (
                <View key={place.id} style={[{ backgroundColor: C.surface, borderRadius: R.lg, padding: 12 }, SH.card]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.bold, fontSize: 14, color: C.ink }}>{place.branchLabel || place.name}</Text>
                    <Text style={{ fontFamily: F.extrabold, fontSize: 14, color: C.ink }}>{fmt(bt)}</Text>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: C.surface2, marginTop: 8, overflow: 'hidden' }}>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: C.coral, width: `${Math.round((bt / top) * 100)}%` }} />
                  </View>
                </View>
              )); })()}
            </View>
          </View>
        ) : null}

        {/* Underlying list */}
        {meta.list && listRows.length ? (
          <View style={{ paddingHorizontal: 20, marginTop: 22 }}>
            <Text style={{ fontFamily: F.serif, fontSize: 19, color: C.ink, letterSpacing: -0.3 }}>{meta.list === 'bookings' ? t('mh.bookings') : t('mh.voucherSales')}</Text>
            <View style={{ gap: 8, marginTop: 12 }}>
              {meta.list === 'bookings'
                ? (listRows as any[]).map((b) => (
                    <View key={b.id} style={[{ backgroundColor: C.surface, borderRadius: R.lg, padding: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, SH.card]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.ink }}>{b.familyName || b.placeName}</Text>
                        <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{b.placeName} · {b.date} · {b.time}</Text>
                      </View>
                      <Text style={{ fontSize: 11, fontFamily: F.bold, color: b.status === 'redeemed' ? C.sage : b.status === 'confirmed' ? C.sky : C.ink3 }}>{b.status}</Text>
                    </View>
                  ))
                : (listRows as any[]).map((v) => (
                    <View key={v.id} style={[{ backgroundColor: C.surface, borderRadius: R.lg, padding: 13, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, SH.card]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.ink }}>{v.label || v.placeName}</Text>
                        <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{v.placeName} · {formatMoney(v.price, v.currencyCode)}</Text>
                      </View>
                      <Text style={{ fontSize: 11, fontFamily: F.bold, color: v.status === 'redeemed' ? C.sage : C.ink3 }}>{v.status}</Text>
                    </View>
                  ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

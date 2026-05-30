// Spotly — merchant dashboard. Their places (status + performance + promote),
// and incoming bookings (confirm / mark redeemed). One login, routed here when
// a merchants/{uid} doc exists.
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, Alert, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, SpotImage } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useMerchant, MerchantPlace, MerchantBooking, MerchantVoucherSale } from '../lib/merchant';
import { useI18n } from '../lib/i18n';
import { useStore } from '../lib/store';
import { formatMoney } from '../lib/currency';

function statusMeta(s: string, t: (k: string) => string) {
  if (s === 'approved') return { label: t('mh.approved'), c: C.sage, bg: C.sageLt };
  if (s === 'rejected') return { label: t('mh.rejected'), c: C.coralDk, bg: C.coralLt };
  return { label: t('mh.pending'), c: C.ink2, bg: C.surface2 };
}

function StatTile({ n, label, color, onPress }: { n: number; label: string; color: string; onPress?: () => void }) {
  const Cmp: any = onPress ? Pressable : View;
  return (
    <Cmp onPress={onPress} style={{ flex: 1, minWidth: 92, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: '#fff', fontFamily: F.extrabold, fontSize: 22, lineHeight: 24 }}>{n}</Text>
        {onPress ? <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>›</Text> : null}
      </View>
      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10.5, fontFamily: F.bold, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 3 }}>{label}</Text>
    </Cmp>
  );
}

function PlaceCard({ place, count, views, clicks, canPromote = true, onPromote, onManageOffers, onToggleLive }: { place: MerchantPlace; count: number; views: number; clicks: number; canPromote?: boolean; onPromote: () => void; onManageOffers: () => void; onToggleLive: () => void }) {
  const { t } = useI18n();
  const st = statusMeta(place.status, t);
  const promotedActive = place.promoted;
  const voucherCount = (place.vouchers || []).length;
  return (
    <View style={[{ backgroundColor: C.surface, borderRadius: R.xl, padding: 14 }, SH.card]}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <SpotImage photoUrl={place.photoUrl} tone="sun" height={54} radius={12} style={{ width: 54 }} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ fontFamily: F.extrabold, fontSize: 15, color: C.ink }}>{place.name}</Text>
          <Text numberOfLines={1} style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{place.category}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          <Text style={{ fontSize: 10, fontFamily: F.extrabold, color: st.c, backgroundColor: st.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.pill, overflow: 'hidden', letterSpacing: 0.4 }}>{st.label}</Text>
          {place.live === false ? <Text style={{ fontSize: 10, fontFamily: F.extrabold, color: C.coralDk, backgroundColor: C.coralLt, paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.pill, overflow: 'hidden', letterSpacing: 0.4 }}>{t('mh.notLive')}</Text> : null}
          {promotedActive ? <Text style={{ fontSize: 10, fontFamily: F.extrabold, color: '#fff', backgroundColor: C.premium, paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.pill, overflow: 'hidden', letterSpacing: 0.4 }}>{t('mh.promotedTag')}</Text> : null}
        </View>
      </View>
      {/* Stats — their own wrapping row so nothing overflows the card */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, columnGap: 22, rowGap: 10 }}>
        {[[views, t('mh.statViews')], [clicks, t('mh.statClicks')], [count, t('mh.statBookings')]].map(([n, l], i) => (
          <View key={i}>
            <Text style={{ fontFamily: F.extrabold, fontSize: 18, color: C.ink }}>{n}</Text>
            <Text style={{ fontSize: 10, color: C.ink3, fontFamily: F.bold, textTransform: 'uppercase', letterSpacing: 0.3 }}>{l}</Text>
          </View>
        ))}
      </View>
      {/* Actions row: manage offers + promote (only when approved) */}
      {place.status === 'approved' ? (
        <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12, flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Pressable onPress={onManageOffers} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {Icons.bag({ size: 16, color: C.coralDk })}
            <Text style={{ fontSize: 13, fontFamily: F.bold, color: C.ink }}>{t('mh.manageOffers')}</Text>
            {voucherCount > 0 ? (
              <View style={{ backgroundColor: C.coralLt, borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 11, fontFamily: F.extrabold, color: C.coralDk }}>{voucherCount}</Text>
              </View>
            ) : null}
          </Pressable>
          <View style={{ flex: 1 }} />
          {!promotedActive && canPromote ? (
            place.promotionRequested ? (
              <Text style={{ fontSize: 12, color: C.premium, fontFamily: F.bold }}>{t('mh.promoteRequested')}</Text>
            ) : (
              <Btn kind="premium" size="sm" icon={Icons.sparkle({ size: 13, color: '#fff' })} onPress={onPromote}>{t('mh.promote')}</Btn>
            )
          ) : null}
          <Pressable onPress={onToggleLive} hitSlop={6}>
            <Text style={{ fontSize: 12.5, fontFamily: F.bold, color: place.live === false ? C.sage : C.ink3 }}>{place.live === false ? t('mh.setLive') : t('mh.setNotLive')}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function VoucherSaleCard({ s, onRedeem }: { s: MerchantVoucherSale; onRedeem: () => void }) {
  const { t } = useI18n();
  const redeemed = s.status === 'redeemed';
  return (
    <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, padding: 14 }, SH.card]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 14.5, color: C.ink }}>{s.label || s.placeName}</Text>
          <Text style={{ fontSize: 12.5, color: C.ink2, fontFamily: F.regular, marginTop: 2 }}>
            {formatMoney(s.price, s.currencyCode)} → {formatMoney(s.value, s.currencyCode)} {t('place.balance')}
          </Text>
        </View>
        {s.code ? (
          <View style={{ alignItems: 'center', backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontSize: 9, color: C.ink3, fontFamily: F.bold, letterSpacing: 0.5 }}>{t('qr.code')}</Text>
            <Text style={{ fontSize: 13, color: C.ink, fontFamily: F.mono }}>{s.code}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
        {redeemed ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {Icons.check({ size: 15, color: C.sage, strokeWidth: 3 })}
            <Text style={{ color: C.sage, fontFamily: F.bold, fontSize: 13 }}>{t('mh.redeemed')}</Text>
          </View>
        ) : (
          <>
            <View style={{ flex: 1 }} />
            <Btn kind="dark" size="sm" onPress={onRedeem}>{t('mh.redeem')}</Btn>
          </>
        )}
      </View>
    </View>
  );
}

function BookingCard({ b, onConfirm, onRedeem }: { b: MerchantBooking; onConfirm: () => void; onRedeem: () => void }) {
  const { t } = useI18n();
  const redeemed = b.status === 'redeemed';
  const confirmed = b.status === 'confirmed';
  return (
    <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, padding: 14 }, SH.card]}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 14.5, color: C.ink }}>{b.familyName || t('mh.requested')}</Text>
          <Text style={{ fontSize: 12.5, color: C.ink2, fontFamily: F.regular, marginTop: 2 }}>{b.placeName} · {b.date} · {b.time}</Text>
          <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{t('mh.guests', { a: b.adults, k: b.kids } as any)}</Text>
          {b.note ? <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 3, fontStyle: 'italic' }}>“{b.note}”</Text> : null}
        </View>
        {b.code ? (
          <View style={{ alignItems: 'center', backgroundColor: C.surface2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ fontSize: 9, color: C.ink3, fontFamily: F.bold, letterSpacing: 0.5 }}>{t('qr.code')}</Text>
            <Text style={{ fontSize: 13, color: C.ink, fontFamily: F.mono }}>{b.code}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        {redeemed ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {Icons.check({ size: 15, color: C.sage, strokeWidth: 3 })}
            <Text style={{ color: C.sage, fontFamily: F.bold, fontSize: 13 }}>{t('mh.redeemed')}</Text>
          </View>
        ) : (
          <>
            {!confirmed ? <Btn kind="ghost" size="sm" onPress={onConfirm}>{t('mh.confirm')}</Btn> : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}>{Icons.check({ size: 14, color: C.sky, strokeWidth: 3 })}<Text style={{ color: C.sky, fontFamily: F.bold, fontSize: 13 }}>{t('mh.confirmed')}</Text></View>}
            <View style={{ flex: 1 }} />
            <Btn kind="dark" size="sm" onPress={onRedeem}>{t('mh.redeem')}</Btn>
          </>
        )}
      </View>
    </View>
  );
}

export function MerchantHomeScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { merchant, role, places, pendingPlaces, pendingApprovals, bookings, voucherSales, stats, requestPromotion, markRedeemed, confirmBooking, markVoucherRedeemed, setLive, approveClaim, rejectClaim, refresh } = useMerchant();
  const { t, lang, setLang } = useI18n();
  const { push } = useStore();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => { setRefreshing(true); refresh(); setTimeout(() => setRefreshing(false), 900); }, [refresh]);
  const roleLabel = role === 'owner' ? t('mh.roleOwner') : role === 'country_manager' ? t('mh.roleCountry') : role === 'branch_manager' ? t('mh.roleBranch') : '';
  const canManageTeam = role === 'owner' || role === 'country_manager';
  const canPromote = role !== 'branch_manager';
  const approveBranch = (p: MerchantPlace) => {
    Alert.alert(t('mh.approveClaimTitle'), p.name, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('mh.reject'), style: 'destructive', onPress: () => rejectClaim(p.id) },
      { text: t('mh.approve'), onPress: () => approveClaim(p.id) },
    ]);
  };
  const toggleLive = (p: MerchantPlace) => {
    const goOffline = p.live !== false; // currently live → take offline
    Alert.alert(goOffline ? t('mh.setNotLive') : t('mh.setLive'), p.name, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: goOffline ? t('mh.setNotLive') : t('mh.setLive'), style: goOffline ? 'destructive' : 'default', onPress: () => setLive(p.id, !goOffline) },
    ]);
  };

  const totals = {
    views: places.reduce((a, p) => a + (stats[p.id]?.views || 0), 0),
    clicks: places.reduce((a, p) => a + (stats[p.id]?.clicks || 0), 0),
    bookings: bookings.length,
    redeemed: bookings.filter((b) => b.status === 'redeemed').length,
    clients: new Set([...bookings.map((b) => b.uid), ...voucherSales.map((s) => s.uid)].filter(Boolean)).size,
    sold: voucherSales.length,
  };
  // Voucher revenue, grouped by currency (merchants may price in more than one).
  const revenue: Record<string, number> = {};
  for (const s of voucherSales) revenue[s.currencyCode] = (revenue[s.currencyCode] || 0) + (s.price || 0);
  const revenueLabel = Object.entries(revenue).map(([c, a]) => formatMoney(a, c)).join(' · ');
  const newVoucherCount = voucherSales.filter((s) => s.status === 'paid').length;

  const promote = (place: MerchantPlace) => {
    Alert.alert(t('mh.promoteTitle'), t('mh.promoteMsg'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('mh.requestPromo'), onPress: () => requestPromotion(place.id) },
    ]);
  };
  const countFor = (placeId: string) => bookings.filter((b) => b.placeId === placeId).length;
  const newCount = bookings.filter((b) => b.status === 'requested').length;
  const pickLanguage = () => {
    Alert.alert(t('profile.langTitle'), t('profile.langChoose'), [
      { text: 'English', onPress: () => setLang('en') },
      { text: 'العربية', onPress: () => setLang('ar') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.coral} colors={[C.coral]} />}>
        {/* Header */}
        <LinearGradient colors={[C.ink, '#2b2b3a']} style={{ paddingTop: insets.top + 16, paddingBottom: 26, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: F.semibold }}>{t('mh.welcome')}</Text>
              <Text style={{ color: '#fff', fontSize: 24, fontFamily: F.extrabold, marginTop: 2 }}>{merchant?.businessName || 'Spotly Business'}</Text>
              {roleLabel ? <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 11, fontFamily: F.bold, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>{roleLabel}</Text> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {canManageTeam ? (
                <Pressable onPress={() => push('merchantTeam')} hitSlop={8} style={{ height: 38, borderRadius: 19, paddingHorizontal: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontFamily: F.bold, fontSize: 13 }}>{t('mh.team')}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={pickLanguage} hitSlop={8} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                {Icons.globe({ size: 18, color: '#fff' })}
              </Pressable>
            </View>
          </View>

          {/* Overview analytics */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
            <StatTile n={totals.views} label={t('mh.statViews')} color={C.sky} onPress={() => push('merchantInsights', { metric: 'views' })} />
            <StatTile n={totals.clicks} label={t('mh.statClicks')} color={C.sun} onPress={() => push('merchantInsights', { metric: 'clicks' })} />
            <StatTile n={totals.bookings} label={t('mh.statBookings')} color={C.coral} onPress={() => push('merchantInsights', { metric: 'bookings' })} />
            <StatTile n={totals.sold} label={t('mh.statVouchers')} color={C.sun} onPress={() => push('merchantInsights', { metric: 'vouchers' })} />
            <StatTile n={totals.clients} label={t('mh.statClients')} color={C.plum} />
          </View>
          {revenueLabel ? (
            <Pressable onPress={() => push('merchantInsights', { metric: 'revenue' })} style={{ marginTop: 12, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10.5, fontFamily: F.bold, textTransform: 'uppercase', letterSpacing: 0.4 }}>{t('mh.voucherRevenue')}</Text>
                <Text style={{ color: '#fff', fontFamily: F.extrabold, fontSize: 22, marginTop: 3 }}>{revenueLabel}</Text>
              </View>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16 }}>›</Text>
            </Pressable>
          ) : null}
        </LinearGradient>

        {/* Scan a customer's QR to redeem at the branch */}
        <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
          <Btn kind="primary" full size="lg" icon={Icons.camera({ size: 18, color: '#fff' })} onPress={() => push('merchantScan')}>{t('mh.scan')}</Btn>
        </View>

        {/* Branch claims awaiting approval (owner / country manager) */}
        {pendingApprovals.length ? (
          <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
            <Text style={{ fontFamily: F.serif, fontSize: 20, color: C.ink, letterSpacing: -0.4 }}>{t('mh.claimsToApprove')}</Text>
            <View style={{ gap: 10, marginTop: 12 }}>
              {pendingApprovals.map((p) => (
                <View key={p.id} style={[{ backgroundColor: C.surface, borderRadius: R.xl, padding: 14, borderWidth: 1.5, borderColor: C.premium }, SH.card]}>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    <SpotImage photoUrl={p.photoUrl} tone="plum" height={48} radius={12} style={{ width: 48 }} />
                    <View style={{ flex: 1 }}>
                      <Text numberOfLines={1} style={{ fontFamily: F.extrabold, fontSize: 15, color: C.ink }}>{p.name}</Text>
                      <Text numberOfLines={1} style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{p.branchLabel || p.category}</Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.surface2, paddingHorizontal: 9, paddingVertical: 5, borderRadius: R.pill }}>
                      {Icons.clock({ size: 12, color: C.ink2 })}
                      <Text style={{ fontSize: 10.5, fontFamily: F.extrabold, color: C.ink2 }}>{t('mh.awaitingApproval')}</Text>
                    </View>
                    <Btn kind="dark" size="sm" onPress={() => approveBranch(p)}>{t('mh.reviewClaim')}</Btn>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Places */}
        <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontFamily: F.serif, fontSize: 20, color: C.ink, letterSpacing: -0.4, flex: 1 }}>{t('mh.places')}</Text>
            <Pressable onPress={() => push('merchantClaim')} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              {Icons.plus({ size: 15, color: C.coralDk })}
              <Text style={{ color: C.coralDk, fontFamily: F.bold, fontSize: 13 }}>{role === 'branch_manager' ? t('mh.claimBranch') : t('mh.addBranch')}</Text>
            </Pressable>
          </View>
          <View style={{ gap: 12, marginTop: 12 }}>
            {places.length === 0 && pendingPlaces.length === 0 ? (
              <Text style={{ color: C.ink3, fontFamily: F.regular, fontSize: 14 }}>{role === 'branch_manager' ? t('mh.noBranchYet') : t('mh.noPlaces')}</Text>
            ) : (
              places.map((p) => <PlaceCard key={p.id} place={p} count={countFor(p.id)} views={stats[p.id]?.views || 0} clicks={stats[p.id]?.clicks || 0} canPromote={canPromote} onPromote={() => promote(p)} onManageOffers={() => push('merchantVouchers', { placeId: p.id })} onToggleLive={() => toggleLive(p)} />)
            )}
            {/* Pending ownership claims — locked until an admin approves. */}
            {pendingPlaces.map((p) => (
              <View key={p.id} style={[{ backgroundColor: C.surface, borderRadius: R.xl, padding: 14, opacity: 0.85 }, SH.card]}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <SpotImage photoUrl={p.photoUrl} tone="sun" height={54} radius={12} style={{ width: 54 }} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontFamily: F.extrabold, fontSize: 15, color: C.ink }}>{p.name}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{p.category}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.surface2, paddingHorizontal: 9, paddingVertical: 5, borderRadius: R.pill }}>
                    {Icons.clock({ size: 12, color: C.ink2 })}
                    <Text style={{ fontSize: 10.5, fontFamily: F.extrabold, color: C.ink2, letterSpacing: 0.3 }}>{t('mh.awaitingApproval')}</Text>
                  </View>
                </View>
                <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 10 }}>{t('mh.claimUnderReview')}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Bookings */}
        <View style={{ paddingHorizontal: 20, marginTop: 26 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontFamily: F.serif, fontSize: 20, color: C.ink, letterSpacing: -0.4 }}>{t('mh.bookings')}</Text>
            {newCount > 0 ? (
              <View style={{ backgroundColor: C.coral, borderRadius: 999, minWidth: 22, height: 22, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontFamily: F.extrabold, fontSize: 12 }}>{newCount}</Text>
              </View>
            ) : null}
          </View>
          <View style={{ gap: 10, marginTop: 12 }}>
            {bookings.length === 0 ? (
              <Text style={{ color: C.ink3, fontFamily: F.regular, fontSize: 14 }}>{t('mh.noBookings')}</Text>
            ) : (
              bookings.map((b) => <BookingCard key={b.id} b={b} onConfirm={() => confirmBooking(b.id)} onRedeem={() => markRedeemed(b.id)} />)
            )}
          </View>
        </View>

        {/* Voucher sales */}
        <View style={{ paddingHorizontal: 20, marginTop: 26 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={{ fontFamily: F.serif, fontSize: 20, color: C.ink, letterSpacing: -0.4 }}>{t('mh.voucherSales')}</Text>
            {newVoucherCount > 0 ? (
              <View style={{ backgroundColor: C.coral, borderRadius: 999, minWidth: 22, height: 22, paddingHorizontal: 7, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontFamily: F.extrabold, fontSize: 12 }}>{newVoucherCount}</Text>
              </View>
            ) : null}
          </View>
          <View style={{ gap: 10, marginTop: 12 }}>
            {voucherSales.length === 0 ? (
              <Text style={{ color: C.ink3, fontFamily: F.regular, fontSize: 14 }}>{t('mh.noVoucherSales')}</Text>
            ) : (
              voucherSales.map((s) => <VoucherSaleCard key={s.id} s={s} onRedeem={() => markVoucherRedeemed(s.id)} />)
            )}
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 30 }}>
          <Btn kind="ghost" full onPress={signOut} icon={Icons.arrowL({ size: 14, color: C.coralDk })}>
            <Text style={{ color: C.coralDk, fontFamily: F.bold, fontSize: 14 }}>{t('profile.signOut')}</Text>
          </Btn>
        </View>
      </ScrollView>
    </View>
  );
}

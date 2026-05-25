// Spotly — merchant dashboard. Their places (status + performance + promote),
// and incoming bookings (confirm / mark redeemed). One login, routed here when
// a merchants/{uid} doc exists.
import React from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, SpotImage } from '../components/ui';
import { useAuth } from '../lib/auth';
import { useMerchant, MerchantPlace, MerchantBooking } from '../lib/merchant';
import { useI18n } from '../lib/i18n';

function statusMeta(s: string, t: (k: string) => string) {
  if (s === 'approved') return { label: t('mh.approved'), c: C.sage, bg: C.sageLt };
  if (s === 'rejected') return { label: t('mh.rejected'), c: C.coralDk, bg: C.coralLt };
  return { label: t('mh.pending'), c: C.ink2, bg: C.surface2 };
}

function StatTile({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={{ flex: 1, minWidth: 92, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 12 }}>
      <Text style={{ color: '#fff', fontFamily: F.extrabold, fontSize: 22, lineHeight: 24 }}>{n}</Text>
      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10.5, fontFamily: F.bold, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 3 }}>{label}</Text>
    </View>
  );
}

function PlaceCard({ place, count, views, clicks, onPromote }: { place: MerchantPlace; count: number; views: number; clicks: number; onPromote: () => void }) {
  const { t } = useI18n();
  const st = statusMeta(place.status, t);
  const promotedActive = place.promoted;
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
          {promotedActive ? <Text style={{ fontSize: 10, fontFamily: F.extrabold, color: '#fff', backgroundColor: C.premium, paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.pill, overflow: 'hidden', letterSpacing: 0.4 }}>{t('mh.promotedTag')}</Text> : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 18 }}>
        {[[views, t('mh.statViews')], [clicks, t('mh.statClicks')], [count, t('mh.statBookings')]].map(([n, l], i) => (
          <View key={i}>
            <Text style={{ fontFamily: F.extrabold, fontSize: 18, color: C.ink }}>{n}</Text>
            <Text style={{ fontSize: 10, color: C.ink3, fontFamily: F.bold, textTransform: 'uppercase', letterSpacing: 0.3 }}>{l}</Text>
          </View>
        ))}
        <View style={{ flex: 1 }} />
        {place.status === 'approved' && !promotedActive ? (
          place.promotionRequested ? (
            <Text style={{ fontSize: 12, color: C.premium, fontFamily: F.bold }}>{t('mh.promoteRequested')}</Text>
          ) : (
            <Btn kind="premium" size="sm" icon={Icons.sparkle({ size: 13, color: '#fff' })} onPress={onPromote}>{t('mh.promote')}</Btn>
          )
        ) : null}
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
  const { merchant, places, bookings, stats, requestPromotion, markRedeemed, confirmBooking } = useMerchant();
  const { t, lang, setLang } = useI18n();

  const totals = {
    views: places.reduce((a, p) => a + (stats[p.id]?.views || 0), 0),
    clicks: places.reduce((a, p) => a + (stats[p.id]?.clicks || 0), 0),
    bookings: bookings.length,
    redeemed: bookings.filter((b) => b.status === 'redeemed').length,
    clients: new Set(bookings.map((b) => b.uid).filter(Boolean)).size,
  };

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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
        {/* Header */}
        <LinearGradient colors={[C.ink, '#2b2b3a']} style={{ paddingTop: insets.top + 16, paddingBottom: 26, paddingHorizontal: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: F.semibold }}>{t('mh.welcome')}</Text>
              <Text style={{ color: '#fff', fontSize: 24, fontFamily: F.extrabold, marginTop: 2 }}>{merchant?.businessName || 'Spotly Business'}</Text>
            </View>
            <Pressable onPress={pickLanguage} hitSlop={8} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
              {Icons.globe({ size: 18, color: '#fff' })}
            </Pressable>
          </View>

          {/* Overview analytics */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 }}>
            <StatTile n={totals.views} label={t('mh.statViews')} color={C.sky} />
            <StatTile n={totals.clicks} label={t('mh.statClicks')} color={C.sun} />
            <StatTile n={totals.bookings} label={t('mh.statBookings')} color={C.coral} />
            <StatTile n={totals.redeemed} label={t('mh.statRedeemed')} color={C.sage} />
            <StatTile n={totals.clients} label={t('mh.statClients')} color={C.plum} />
          </View>
        </LinearGradient>

        {/* Places */}
        <View style={{ paddingHorizontal: 20, marginTop: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontFamily: F.serif, fontSize: 20, color: C.ink, letterSpacing: -0.4 }}>{t('mh.places')}</Text>
          </View>
          <View style={{ gap: 12, marginTop: 12 }}>
            {places.length === 0 ? (
              <Text style={{ color: C.ink3, fontFamily: F.regular, fontSize: 14 }}>{t('mh.noPlaces')}</Text>
            ) : (
              places.map((p) => <PlaceCard key={p.id} place={p} count={countFor(p.id)} views={stats[p.id]?.views || 0} clicks={stats[p.id]?.clicks || 0} onPromote={() => promote(p)} />)
            )}
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

        <View style={{ paddingHorizontal: 20, marginTop: 30 }}>
          <Btn kind="ghost" full onPress={signOut} icon={Icons.arrowL({ size: 14, color: C.coralDk })}>
            <Text style={{ color: C.coralDk, fontFamily: F.bold, fontSize: 14 }}>{t('profile.signOut')}</Text>
          </Btn>
        </View>
      </ScrollView>
    </View>
  );
}

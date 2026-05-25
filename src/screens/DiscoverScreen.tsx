// Spotly — Discover. Real nearby places (Google Places + curated) with photos.
import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Chip, Btn, SpotImage, Stars } from '../components/ui';
import { useStore } from '../lib/store';
import { useProfile, firstName, kidNames, familyFood } from '../lib/profile';
import { usePlaces } from '../lib/placesStore';
import { useSaves } from '../lib/saves';
import { useI18n } from '../lib/i18n';
import { Spot, formatDistance } from '../lib/places';

const AMENITY_ICON: Record<string, (p: any) => React.ReactNode> = {
  playArea: Icons.playArea, foodOnSite: Icons.foodOnSite, parking: Icons.parking, animals: Icons.animals,
  indoor: Icons.indoor, outdoor: Icons.outdoor, water: Icons.water, arts: Icons.arts,
  restroom: Icons.restroom, changing: Icons.changing, shade: Icons.shade, museum: Icons.museum,
  shop: Icons.shop, stroller: Icons.stroller,
};

function Eyebrow({ children, color = C.coral }: { children: React.ReactNode; color?: string }) {
  return <Text style={{ fontFamily: F.mono, fontSize: 10.5, color, letterSpacing: 1, textTransform: 'uppercase' }}>{children}</Text>;
}

function HeroCard({ spot, onPress }: { spot: Spot; onPress: () => void }) {
  const { isSaved, toggleSave } = useSaves();
  const { t } = useI18n();
  const saved = isSaved(spot.id);
  return (
    <Pressable onPress={onPress} style={[{ width: 280, borderRadius: R.xxl, overflow: 'hidden', backgroundColor: C.surface }, SH.card]}>
      <View>
        <SpotImage photoUrl={spot.photoUrl} tone={spot.tone} height={170} radius={0} label={spot.name} />
        <View style={{ position: 'absolute', top: 12, left: 12 }}>
          {spot.promoted ? (
            <Text style={{ backgroundColor: C.premium, color: '#fff', fontSize: 10, fontFamily: F.extrabold, paddingHorizontal: 9, paddingVertical: 5, borderRadius: R.pill, letterSpacing: 0.6, overflow: 'hidden' }}>
              {t('discover.promoted')}
            </Text>
          ) : (
            <Text style={{ backgroundColor: 'rgba(255,255,255,0.92)', color: C.coralDk, fontSize: 10, fontFamily: F.extrabold, paddingHorizontal: 9, paddingVertical: 5, borderRadius: R.pill, letterSpacing: 0.6, overflow: 'hidden' }}>
              {spot.source === 'curated' ? t('discover.editorPick') : t('discover.nearYouTag')}
            </Text>
          )}
        </View>
        <Pressable onPress={() => toggleSave(spot)} hitSlop={8} style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          {Icons.bookmark({ size: 16, color: saved ? C.coral : C.ink, filled: saved })}
        </Pressable>
      </View>
      <View style={{ padding: 16, paddingTop: 12 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, fontFamily: F.extrabold, color: C.ink, letterSpacing: -0.3 }}>{spot.name}</Text>
        <Text numberOfLines={1} style={{ fontSize: 12, color: C.ink2, fontFamily: F.regular, marginTop: 2 }}>{spot.category}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          {spot.rating ? <Stars value={spot.rating.toFixed(1)} /> : null}
          {spot.distanceKm != null ? <><Text style={{ color: C.ink3, fontSize: 11 }}>·</Text><Text style={{ color: C.ink3, fontSize: 11, fontFamily: F.semibold }}>{formatDistance(spot.distanceKm)}</Text></> : null}
        </View>
      </View>
    </Pressable>
  );
}

function CatTile({ ic, color, label, active, onPress }: { ic: (p: any) => React.ReactNode; color: string; label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ alignItems: 'center', gap: 8, width: 72 }}>
      <View style={[{ width: 60, height: 60, borderRadius: 20, backgroundColor: active ? color : C.surface, alignItems: 'center', justifyContent: 'center' }, SH.card]}>
        {ic({ size: 26, color: active ? '#fff' : color })}
      </View>
      <Text style={{ fontSize: 11, fontFamily: F.bold, color: active ? C.ink : C.ink2 }}>{label}</Text>
    </Pressable>
  );
}

// Top-level "what are you looking for" kinds (OR-filtered).
const KINDS = [
  { id: 'activity', key: 'kind.activity' },
  { id: 'dining', key: 'kind.dining' },
  { id: 'shop', key: 'kind.shop' },
];
const FILTER_CHIPS = [
  { id: 'playArea', key: 'filter.playArea' },
  { id: 'openNow', key: 'filter.openNow' },
  { id: 'free', key: 'filter.free' },
  { id: 'indoor', key: 'filter.indoor' },
];
const CATEGORIES = [
  { id: 'outdoor', ic: Icons.outdoor, color: C.sage, key: 'cat.parks' },
  { id: 'playArea', ic: Icons.playArea, color: C.coral, key: 'cat.indoorPlay' },
  { id: 'dining', ic: Icons.dining, color: C.coralDk, key: 'cat.dining' },
  { id: 'shop', ic: Icons.shop, color: C.plum, key: 'cat.kidsShops' },
  { id: 'museum', ic: Icons.museum, color: C.ink2, key: 'cat.museums' },
  { id: 'animals', ic: Icons.animals, color: C.sun, key: 'cat.zoos' },
  { id: 'water', ic: Icons.water, color: C.sky, key: 'cat.water' },
];

function FeedCard({ spot, onPress }: { spot: Spot; onPress: () => void }) {
  const { isSaved, toggleSave } = useSaves();
  const { t } = useI18n();
  const saved = isSaved(spot.id);
  return (
    <Pressable onPress={onPress} style={[{ backgroundColor: C.surface, borderRadius: R.xxl, overflow: 'hidden' }, SH.card]}>
      <View>
        <SpotImage photoUrl={spot.photoUrl} tone={spot.tone} height={180} radius={0} label={spot.name} />
        {spot.promoted ? (
          <Text style={{ position: 'absolute', top: 12, left: 12, backgroundColor: C.premium, color: '#fff', fontSize: 10, fontFamily: F.extrabold, paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, letterSpacing: 0.6, overflow: 'hidden' }}>{t('discover.promoted')}</Text>
        ) : spot.bookable ? (
          <Text style={{ position: 'absolute', top: 12, left: 12, backgroundColor: C.ink, color: '#fff', fontSize: 10, fontFamily: F.extrabold, paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, letterSpacing: 0.6, overflow: 'hidden' }}>BOOKABLE</Text>
        ) : spot.openNow === false ? (
          <Text style={{ position: 'absolute', top: 12, left: 12, backgroundColor: C.warn, color: '#fff', fontSize: 10, fontFamily: F.extrabold, paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, letterSpacing: 0.6, overflow: 'hidden' }}>CLOSED</Text>
        ) : null}
        <Pressable onPress={() => toggleSave(spot)} hitSlop={8} style={{ position: 'absolute', top: 12, right: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}>
          {Icons.bookmark({ size: 16, color: saved ? C.coral : C.ink, filled: saved })}
        </Pressable>
      </View>
      <View style={{ padding: 16, paddingTop: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 17, fontFamily: F.extrabold, color: C.ink, letterSpacing: -0.3 }}>{spot.name}</Text>
          {spot.price ? <Text style={{ fontSize: 12, fontFamily: F.bold, color: C.ink3, marginLeft: 8 }}>{spot.price}</Text> : null}
        </View>
        <Text numberOfLines={1} style={{ fontSize: 12.5, color: C.ink2, fontFamily: F.regular, marginTop: 2 }}>
          {spot.category}{spot.distanceKm != null ? ` · ${formatDistance(spot.distanceKm)}` : ''}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          {spot.rating ? <Stars value={spot.rating.toFixed(1)} /> : <Text style={{ color: C.ink3, fontSize: 11, fontFamily: F.regular }}>New</Text>}
          {spot.reviews ? <Text style={{ color: C.ink3, fontSize: 11, fontFamily: F.regular }}>· {spot.reviews} reviews</Text> : null}
          {spot.ages ? <Text style={{ marginLeft: 'auto', backgroundColor: C.sageLt, color: C.sage, fontSize: 10.5, fontFamily: F.extrabold, paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.pill, overflow: 'hidden' }}>AGE {spot.ages}</Text> : null}
        </View>
        {spot.amenities.length ? (
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
            {spot.amenities.map((a) => (
              <View key={a} style={{ width: 26, height: 26, borderRadius: 8, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' }}>
                {AMENITY_ICON[a]?.({ size: 15, color: C.ink2 })}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const { push } = useStore();
  const { profile } = useProfile();
  const { spots, filtered, loading, locationGranted, reload, setSelected, filters, toggleFilter, clearFilters } = usePlaces();
  const { t } = useI18n();
  const [showLocBanner, setShowLocBanner] = useState(true);
  const scrollRef = useRef<ScrollView>(null);
  const feedY = useRef(0);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('discover.morning') : hour < 18 ? t('discover.afternoon') : t('discover.evening');

  const open = (spot: Spot) => {
    setSelected(spot);
    push('place');
  };

  const seeAll = () => scrollRef.current?.scrollTo({ y: Math.max(0, feedY.current - 8), animated: true });

  const heroes = filtered.slice(0, 2);
  const feed = filtered;

  // "Tastes they'll love" — dining spots, ranked so any matching the kids'
  // favourite foods (by name/category) come first.
  const likes = familyFood(profile).likes;
  const tasteRail = (() => {
    if (!likes.length) return [];
    const dining = spots.filter((s) => s.kind === 'dining');
    const matches = (s: Spot) => {
      const hay = `${s.name} ${s.category}`.toLowerCase();
      return likes.some((l) => hay.includes(l.toLowerCase()));
    };
    return [...dining].sort((a, b) => Number(matches(b)) - Number(matches(a))).slice(0, 8);
  })();

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingBottom: 14, backgroundColor: C.bg, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.semibold }}>{greeting}</Text>
            <Text style={{ fontSize: 20, fontFamily: F.extrabold, color: C.ink, marginTop: 1 }}>{firstName(profile)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Pressable onPress={reload} style={[{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.pill, backgroundColor: C.surface }, SH.pill]}>
              {Icons.pin({ size: 13, color: C.coral, filled: true })}
              <Text style={{ fontSize: 12, fontFamily: F.bold, color: C.ink }}>{locationGranted ? t('discover.nearYou') : profile?.homeCity || 'Kuwait'}</Text>
            </Pressable>
            <Pressable onPress={() => push('paywall')} style={[{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }, SH.pill]}>
              {Icons.sparkle({ size: 16, color: C.premium })}
            </Pressable>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 120 }}>
          <ActivityIndicator color={C.coral} />
          <Text style={{ marginTop: 12, color: C.ink3, fontFamily: F.semibold }}>{t('discover.finding')}</Text>
        </View>
      ) : (
        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
          {!locationGranted && showLocBanner ? (
            <View style={{ marginHorizontal: 20, marginBottom: 6, padding: 14, borderRadius: R.lg, backgroundColor: C.coralLt, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              {Icons.pin({ size: 18, color: C.coralDk, filled: true })}
              <Text style={{ flex: 1, fontSize: 12.5, color: C.coralDk, fontFamily: F.semibold }}>{t('discover.locBanner')}</Text>
              <Pressable onPress={reload}><Text style={{ color: C.coralDk, fontFamily: F.bold, fontSize: 12.5 }}>{t('discover.enable')}</Text></Pressable>
            </View>
          ) : null}

          {/* What are you looking for — kind selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 10 }}>
            {KINDS.map((k) => (
              <Chip key={k.id} active={filters.has(k.id)} onPress={() => toggleFilter(k.id)}>{t(k.key)}</Chip>
            ))}
          </ScrollView>

          {/* This week */}
          <View style={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <View>
                <Eyebrow>{t('discover.thisWeek')}</Eyebrow>
                <Text style={{ fontFamily: F.serif, fontSize: 22, color: C.ink, marginTop: 2, letterSpacing: -0.5 }}>{t('discover.whereToday')}</Text>
              </View>
              <Pressable onPress={seeAll} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                <Text style={{ fontSize: 12, color: C.coralDk, fontFamily: F.bold }}>{t('common.seeAll')}</Text>
                {Icons.chevR({ size: 14, color: C.coralDk })}
              </Pressable>
            </View>
          </View>

          {heroes.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20, paddingBottom: 18 }}>
              {heroes.map((s) => <HeroCard key={s.id} spot={s} onPress={() => open(s)} />)}
            </ScrollView>
          ) : null}

          {/* Filters */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 20, paddingBottom: 14 }}>
            <Chip icon={Icons.filter({ size: 13, color: C.ink })} onPress={() => push('filters')}>{t('discover.filters')}</Chip>
            {FILTER_CHIPS.map((f) => (
              <Chip key={f.id} active={filters.has(f.id)} onPress={() => toggleFilter(f.id)}>{t(f.key)}</Chip>
            ))}
          </ScrollView>

          {/* Categories */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingBottom: 18 }}>
            {CATEGORIES.map((c, i) => (
              <CatTile key={`${c.id}-${i}`} ic={c.ic} color={c.color} label={t(c.key)} active={filters.has(c.id)} onPress={() => toggleFilter(c.id)} />
            ))}
          </ScrollView>

          {/* Tastes they'll love — food-aware dining rail */}
          {tasteRail.length ? (
            <View style={{ paddingTop: 4, paddingBottom: 18 }}>
              <View style={{ paddingHorizontal: 20, marginBottom: 12 }}>
                <Eyebrow color={C.coralDk}>{t('discover.tastesEyebrow')}</Eyebrow>
                <Text style={{ fontFamily: F.serif, fontSize: 22, color: C.ink, marginTop: 2, letterSpacing: -0.5 }}>
                  {t('discover.eatsFor', { names: likes.slice(0, 3).join(', ') })}
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 20 }}>
                {tasteRail.map((s) => <HeroCard key={`taste-${s.id}`} spot={s} onPress={() => open(s)} />)}
              </ScrollView>
            </View>
          ) : null}

          {/* Feed */}
          {feed.length ? (
            <View style={{ paddingHorizontal: 20, gap: 14 }} onLayout={(e) => { feedY.current = e.nativeEvent.layout.y; }}>
              <Text style={{ fontFamily: F.serif, fontSize: 22, color: C.ink, letterSpacing: -0.5 }}>{t('discover.pickedFor', { names: kidNames(profile) })}</Text>
              {feed.map((s) => <FeedCard key={s.id} spot={s} onPress={() => open(s)} />)}
            </View>
          ) : (
            <Empty hasFilters={filters.size > 0} onClear={clearFilters} onRetry={reload} />
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Empty({ hasFilters, onClear, onRetry }: { hasFilters: boolean; onClear: () => void; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <View style={{ paddingHorizontal: 24, paddingTop: 30, alignItems: 'center' }}>
      <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.coralLt, borderRadius: 60 }} />
        <View style={{ opacity: 0.55 }}><Icons.Mark size={66} color={C.coral} /></View>
      </View>
      <Text style={{ fontFamily: F.serif, fontSize: 28, marginTop: 22, letterSpacing: -0.6, color: C.ink, textAlign: 'center' }}>
        {hasFilters ? t('discover.noMatch') : t('discover.noNearby')}
      </Text>
      <Text style={{ marginTop: 8, color: C.ink2, fontFamily: F.regular, fontSize: 14.5, lineHeight: 21, maxWidth: 280, textAlign: 'center' }}>
        {hasFilters ? t('discover.loosen') : t('discover.checkConn')}
      </Text>
      <View style={{ marginTop: 24, width: '100%' }}>
        {hasFilters ? <Btn kind="primary" full onPress={onClear}>{t('discover.clearFilters')}</Btn> : <Btn kind="primary" full onPress={onRetry}>{t('common.retry')}</Btn>}
      </View>
    </View>
  );
}

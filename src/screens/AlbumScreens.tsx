// Spotly — Album editor + preview + checkout. Builds a real printed-album order
// from the family's memories and gives a proper editing/preview experience:
//   • editable title/subtitle
//   • live cover-finish (colour) preview
//   • photos-per-page layout control (re-paginates the book)
//   • "inside pages" spread previews
//   • a faux-3D, drag-to-spin book render + flip-through page preview
//   • delivery address + a complete order (payment gateway intentionally not wired)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, Alert, Pressable, Image, TextInput, Animated, Dimensions } from 'react-native';
import { KeyboardAwareScrollView, KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { C, F, R, SH } from '../lib/theme';
import { Icons } from '../components/icons';
import { Btn, CircBtn, SectionLabel } from '../components/ui';
import { useStore } from '../lib/store';
import { useAuth } from '../lib/auth';
import { useProfile, ShippingAddress } from '../lib/profile';
import { useMemories, memoryPhotos } from '../lib/memories';
import { createAlbumOrder } from '../lib/bookings';
import { useI18n } from '../lib/i18n';

const SCREEN_W = Dimensions.get('window').width;
const CURRENT_YEAR = String(new Date().getFullYear());

// Cover finishes — the colour shows live in every preview. `ink`/`sub` keep the
// title legible on light vs. dark boards.
export const COVER_FINISHES = [
  { key: 'Linen', sw: '#efe7da', board: '#e3d8c4', ink: C.ink, sub: C.ink3 },
  { key: 'Coral', sw: C.coral, board: C.coralDk, ink: '#fff', sub: 'rgba(255,255,255,0.85)' },
  { key: 'Sage', sw: C.sage, board: '#3d5a42', ink: '#fff', sub: 'rgba(255,255,255,0.85)' },
  { key: 'Ink', sw: C.ink, board: '#000', ink: '#fff', sub: 'rgba(255,255,255,0.8)' },
];
const finishByKey = (k?: string) => COVER_FINISHES.find((f) => f.key === k) || COVER_FINISHES[0];
const PER_PAGE = [1, 2, 3, 4];

export type AlbumDraft = {
  title: string;
  subtitle?: string;
  coverUrl?: string;
  coverColor: string; // COVER_FINISHES key
  perPage: number;
  photoUrls: string[];
  photoCount: number;
  pages: number;
};

type Page = { photos: string[] };
type Spread = { left?: Page; right?: Page };

const paginate = (urls: string[], perPage: number): Page[] => {
  const pp = Math.max(1, perPage);
  const out: Page[] = [];
  for (let i = 0; i < urls.length; i += pp) out.push({ photos: urls.slice(i, i + pp) });
  return out.length ? out : [{ photos: [] }];
};
const toSpreads = (pages: Page[]): Spread[] => {
  const out: Spread[] = [];
  for (let i = 0; i < pages.length; i += 2) out.push({ left: pages[i], right: pages[i + 1] });
  return out;
};
const pageCountFor = (count: number, perPage: number) => Math.max(1, Math.ceil(count / Math.max(1, perPage)));

// ── A printed page's photo layout (1–4 photos) ───────────────────────────────
function PageGrid({ photos, gap = 4, radius = 3 }: { photos: string[]; gap?: number; radius?: number }) {
  const cell = (uri: string, key: string, style: any) => (
    <Image key={key} source={{ uri }} style={[{ borderRadius: radius, backgroundColor: '#ece7df' }, style]} resizeMode="cover" />
  );
  const n = photos.length;
  if (n === 0) return <View style={{ flex: 1, borderRadius: radius, backgroundColor: '#f4efe7' }} />;
  if (n === 1) return <View style={{ flex: 1 }}>{cell(photos[0], 'a', { flex: 1 })}</View>;
  if (n === 2) return <View style={{ flex: 1, gap }}>{cell(photos[0], 'a', { flex: 1 })}{cell(photos[1], 'b', { flex: 1 })}</View>;
  if (n === 3)
    return (
      <View style={{ flex: 1, gap }}>
        {cell(photos[0], 'a', { flex: 1.5 })}
        <View style={{ flex: 1, flexDirection: 'row', gap }}>{cell(photos[1], 'b', { flex: 1 })}{cell(photos[2], 'c', { flex: 1 })}</View>
      </View>
    );
  return (
    <View style={{ flex: 1, gap }}>
      <View style={{ flex: 1, flexDirection: 'row', gap }}>{cell(photos[0], 'a', { flex: 1 })}{cell(photos[1], 'b', { flex: 1 })}</View>
      <View style={{ flex: 1, flexDirection: 'row', gap }}>{cell(photos[2], 'c', { flex: 1 })}{cell(photos[3], 'd', { flex: 1 })}</View>
    </View>
  );
}

// ── An open-book spread (two pages + centre gutter) ──────────────────────────
function BookSpread({ left, right, width }: { left?: Page; right?: Page; width: number }) {
  const h = width * 0.62;
  return (
    <View style={[{ width, height: h, borderRadius: 10, backgroundColor: '#fff', flexDirection: 'row', overflow: 'hidden' }, SH.pop]}>
      <View style={{ flex: 1, padding: 10 }}><PageGrid photos={left?.photos || []} /></View>
      <LinearGradient colors={['rgba(0,0,0,0.12)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.12)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ width: 16 }} />
      <View style={{ flex: 1, padding: 10 }}><PageGrid photos={right?.photos || []} /></View>
    </View>
  );
}

// ── Closed-book cover (flat). No perspective/rotateY — Fabric mis-renders those
// (shifts the layer off-screen), so depth comes from a spine + a static
// page-edge block instead. ───────────────────────────────────────────────────
function BookRender({ finish, coverUrl, title, subtitle, width = 210 }: { finish: typeof COVER_FINISHES[number]; coverUrl?: string; title: string; subtitle?: string; width?: number }) {
  const h = width * 1.2;
  return (
    <View style={{ width, height: h }}>
      {/* fore-edge page block, peeking out the right side */}
      <View style={{ position: 'absolute', right: -6, top: 7, bottom: 7, width: 8, borderTopRightRadius: 3, borderBottomRightRadius: 3, backgroundColor: '#efe9df', overflow: 'hidden' }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ position: 'absolute', left: i * 2, top: 0, bottom: 0, width: 0.8, backgroundColor: 'rgba(0,0,0,0.08)' }} />
        ))}
      </View>
      {/* cover board */}
      <View style={[{ width: '100%', height: '100%', borderRadius: 8, backgroundColor: finish.sw, overflow: 'hidden' }, SH.pop]}>
        {/* spine */}
        <LinearGradient colors={[finish.board, 'rgba(0,0,0,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 16 }} />
        {/* cover photo */}
        <View style={{ position: 'absolute', top: 16, left: 18, right: 14, height: h * 0.52 }}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={{ width: '100%', height: '100%', borderRadius: 4 }} resizeMode="cover" />
          ) : (
            <View style={{ width: '100%', height: '100%', borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.08)' }} />
          )}
        </View>
        {/* title */}
        <View style={{ position: 'absolute', left: 18, right: 14, bottom: 18 }}>
          <Text numberOfLines={2} style={{ fontFamily: F.serif, fontSize: width * 0.1, lineHeight: width * 0.11, letterSpacing: -0.5, color: finish.ink }}>{title}</Text>
          {subtitle ? <Text style={{ fontSize: width * 0.05, color: finish.sub, fontFamily: F.bold, marginTop: 5, textTransform: 'uppercase', letterSpacing: 0.6 }}>{subtitle}</Text> : null}
        </View>
        <View style={{ position: 'absolute', top: 10, right: 12 }}><Icons.Mark size={width * 0.058} color={finish.key === 'Coral' ? '#fff' : C.coral} /></View>
      </View>
    </View>
  );
}

// ── EDITOR ───────────────────────────────────────────────────────────────────
export function AlbumEditorScreen() {
  const insets = useSafeAreaInsets();
  const { pop, push } = useStore();
  const { t } = useI18n();
  const { profile } = useProfile();
  const { memories } = useMemories();

  const defaultTitle = useMemo(() => {
    const cities = memories.map((m) => m.city).filter(Boolean) as string[];
    const top = cities.sort((a, b) => cities.filter((c) => c === b).length - cities.filter((c) => c === a).length)[0];
    if (top) return t('al.defaultTitleCity', { city: top });
    const fam = (profile?.familyName || '').trim();
    return fam ? t('al.defaultTitleFamily', { family: fam }) : t('al.defaultTitle');
  }, [memories, profile?.familyName]);

  const [title, setTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState(CURRENT_YEAR);
  const [coverColor, setCoverColor] = useState(COVER_FINISHES[0].key);
  const [perPage, setPerPage] = useState(2);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(memories.map((m) => m.id)));
  const [coverId, setCoverId] = useState<string | undefined>(memories[0]?.id);

  const selectedMems = memories.filter((m) => selected.has(m.id));
  const coverMem = memories.find((m) => m.id === coverId && selected.has(m.id)) || selectedMems[0];
  // Include EVERY photo from each selected memory (a memory can have several).
  const photoUrls = selectedMems.flatMap((m) => memoryPhotos(m)).filter(Boolean);
  const pages = pageCountFor(photoUrls.length, perPage);
  const spreads = useMemo(() => toSpreads(paginate(photoUrls, perPage)), [photoUrls.join('|'), perPage]);
  const finish = finishByKey(coverColor);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const draft = (): AlbumDraft => ({
    title: title.trim() || defaultTitle,
    subtitle: subtitle.trim(),
    coverUrl: coverMem?.photoUrl,
    coverColor,
    perPage,
    photoUrls,
    photoCount: photoUrls.length,
    pages,
  });
  const guard = () => {
    if (photoUrls.length === 0) { Alert.alert(t('al.noPhotos')); return false; }
    return true;
  };
  const openPreview = () => { if (guard()) push('albumPreview', { draft: draft() }); };
  const goCheckout = () => { if (guard()) push('albumCheckout', { draft: draft() }); };

  return (
    <View style={{ flex: 1, backgroundColor: '#f4f1ec' }}>
      <KeyboardAwareScrollView showsVerticalScrollIndicator={false} bottomOffset={20} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 56, paddingHorizontal: 20, paddingBottom: 130 }}>
        {/* Title + subtitle */}
        <View style={[{ backgroundColor: C.surface, borderRadius: R.xl, paddingVertical: 14, paddingHorizontal: 16 }, SH.card]}>
          <Text style={lbl}>{t('al.albumTitle')}</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder={t('al.titleHint')} placeholderTextColor={C.ink3} style={{ fontFamily: F.serif, fontSize: 24, letterSpacing: -0.5, color: C.ink, marginTop: 2, paddingVertical: 2 }} />
          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 8 }} />
          <Text style={lbl}>{t('al.subtitle')}</Text>
          <TextInput value={subtitle} onChangeText={setSubtitle} placeholder={t('al.subtitleHint')} placeholderTextColor={C.ink3} style={{ fontFamily: F.bold, fontSize: 14, color: C.ink2, marginTop: 2, paddingVertical: 2 }} />
        </View>

        {/* Cover preview + finish */}
        <SectionLabel>{t('al.cover')}</SectionLabel>
        <View style={{ backgroundColor: '#efe6da', borderRadius: R.xl, paddingVertical: 22, alignItems: 'center', borderWidth: 1, borderColor: C.line }}>
          <BookRender finish={finish} coverUrl={coverMem?.photoUrl} title={title.trim() || defaultTitle} subtitle={subtitle.trim()} width={180} />
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          {COVER_FINISHES.map((cv) => {
            const sel = cv.key === coverColor;
            return (
              <Pressable key={cv.key} onPress={() => setCoverColor(cv.key)} style={{ flex: 1, alignItems: 'center' }}>
                <View style={{ height: 44, width: '100%', borderRadius: R.lg, backgroundColor: cv.sw, borderWidth: sel ? 3 : 1, borderColor: sel ? C.sage : C.line }} />
                <Text style={{ fontSize: 11, fontFamily: sel ? F.extrabold : F.bold, marginTop: 6, color: sel ? C.sage : C.ink2 }}>{cv.key}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Photos per page */}
        <SectionLabel>{t('al.photosPerPage')}</SectionLabel>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {PER_PAGE.map((n) => {
            const sel = n === perPage;
            return (
              <Pressable key={n} onPress={() => setPerPage(n)} style={[{ flex: 1, paddingVertical: 12, borderRadius: R.lg, alignItems: 'center', backgroundColor: sel ? C.ink : C.surface, borderWidth: 1, borderColor: sel ? C.ink : C.line }, SH.card]}>
                <Text style={{ fontFamily: F.extrabold, fontSize: 17, color: sel ? '#fff' : C.ink }}>{n}</Text>
                <Text style={{ fontFamily: F.semibold, fontSize: 10, color: sel ? 'rgba(255,255,255,0.8)' : C.ink3, marginTop: 1 }}>{t('al.perPage')}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Inside pages */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <SectionLabel>{t('al.insidePages')}</SectionLabel>
          <Text style={{ marginLeft: 'auto', marginTop: 24, marginBottom: 10, fontSize: 11, color: C.coralDk, fontFamily: F.bold }}>{t('al.photosPages', { photos: photoUrls.length, pages })}</Text>
        </View>
        {photoUrls.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: 8, paddingBottom: 4 }}>
            {spreads.map((s, i) => (
              <Pressable key={i} onPress={openPreview}>
                <BookSpread left={s.left} right={s.right} width={SCREEN_W * 0.66} />
                <Text style={{ fontFamily: F.semibold, fontSize: 11, color: C.ink3, marginTop: 6, textAlign: 'center' }}>{t('al.pagesLabel', { a: i * 2 + 1, b: i * 2 + 2 })}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : (
          <Text style={{ fontSize: 13, color: C.ink3, fontFamily: F.regular }}>{t('al.noPhotos')}</Text>
        )}

        {/* Choose photos */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <SectionLabel>{t('al.choosePhotos')}</SectionLabel>
          <Text style={{ marginLeft: 'auto', marginTop: 24, marginBottom: 10, fontSize: 11, color: C.coralDk, fontFamily: F.bold }}>{t('al.selectedCount', { n: selectedMems.length })}</Text>
        </View>
        <Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginBottom: 12, marginTop: -4 }}>{t('al.setCoverHint')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {memories.map((m) => {
            const on = selected.has(m.id);
            const isCover = coverMem?.id === m.id;
            return (
              <Pressable key={m.id} onPress={() => toggle(m.id)} style={{ width: '32%', aspectRatio: 1, borderRadius: R.md, overflow: 'hidden', backgroundColor: C.surface2, borderWidth: isCover ? 3 : 0, borderColor: C.coral }}>
                <Image source={{ uri: m.photoUrl }} style={{ width: '100%', height: '100%', opacity: on ? 1 : 0.4 }} resizeMode="cover" />
                <View style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: on ? C.sage : 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' }}>
                  {on ? Icons.check({ size: 12, color: '#fff', strokeWidth: 3 }) : null}
                </View>
                {on ? (
                  <Pressable onPress={() => setCoverId(m.id)} style={{ position: 'absolute', bottom: 6, left: 6, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, backgroundColor: isCover ? C.coral : 'rgba(0,0,0,0.45)', flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    {Icons.star({ size: 10, color: '#fff', filled: isCover })}
                    <Text style={{ color: '#fff', fontFamily: F.bold, fontSize: 9.5 }}>{t('al.setCover')}</Text>
                  </Pressable>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </KeyboardAwareScrollView>

      <View style={{ position: 'absolute', top: insets.top + 6, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <CircBtn onPress={pop}>{Icons.arrowL({ size: 18, color: C.ink })}</CircBtn>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, color: C.ink3, fontFamily: F.bold, letterSpacing: 0.4, textTransform: 'uppercase' }}>{t('al.step2')}</Text>
          <Text style={{ fontFamily: F.extrabold, fontSize: 15, color: C.ink }}>{t('al.editAlbum')}</Text>
        </View>
        <Btn kind="dark" size="sm" onPress={openPreview} icon={Icons.album({ size: 13, color: '#fff' })}>{t('al.preview')}</Btn>
      </View>

      <View style={[{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 12, height: 72, backgroundColor: C.surface, borderRadius: 24, flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 }, SH.pop]}>
        <View style={{ paddingLeft: 6 }}>
          <Text style={{ fontSize: 10, color: C.ink3, fontFamily: F.extrabold, letterSpacing: 0.5, textTransform: 'uppercase' }}>{t('al.photosPages', { photos: photoUrls.length, pages })}</Text>
          <Text style={{ fontSize: 19, fontFamily: F.extrabold, color: C.ink }}>
            {t('al.from')} €29<Text style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular }}> · {t('al.shipsIn')}</Text>
          </Text>
        </View>
        <Btn kind="sage" style={{ marginLeft: 'auto', height: 50 }} onPress={goCheckout}>{t('al.orderAlbum')}</Btn>
      </View>
    </View>
  );
}

// ── PREVIEW — flip through the book like a magazine ──────────────────────────
// A horizontal paged reader: page 0 is the closed cover, then each open-book
// spread. As you swipe, the focused page scales up and neighbours recede +
// dim (a "page turning" feel) using ONLY native-driver scale/opacity — no
// perspective/rotateY (those mis-render on Fabric). Tapping a side flips too.
function FlipPage({ scrollX, index, children }: { scrollX: Animated.Value; index: number; children: React.ReactNode }) {
  const inputRange = [(index - 1) * SCREEN_W, index * SCREEN_W, (index + 1) * SCREEN_W];
  const scale = scrollX.interpolate({ inputRange, outputRange: [0.86, 1, 0.86], extrapolate: 'clamp' });
  const opacity = scrollX.interpolate({ inputRange, outputRange: [0.45, 1, 0.45], extrapolate: 'clamp' });
  const rotate = scrollX.interpolate({ inputRange, outputRange: ['3deg', '0deg', '-3deg'], extrapolate: 'clamp' });
  return (
    <View style={{ width: SCREEN_W, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ opacity, transform: [{ scale }, { rotate }] }}>{children}</Animated.View>
    </View>
  );
}

export function AlbumPreviewScreen() {
  const insets = useSafeAreaInsets();
  const { pop, push, stack } = useStore();
  const { t } = useI18n();
  const draft: AlbumDraft = stack[stack.length - 1]?.params?.draft || DEFAULT_DRAFT;
  const finish = finishByKey(draft.coverColor);
  const spreads = useMemo(() => toSpreads(paginate(draft.photoUrls || [], draft.perPage || 2)), [draft.photoUrls, draft.perPage]);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scroller = useRef<ScrollView>(null);
  const [idx, setIdx] = useState(0);
  const pageCount = 1 + spreads.length; // cover + spreads
  useEffect(() => {
    const id = scrollX.addListener(({ value }) => { const i = Math.round(value / SCREEN_W); setIdx((p) => (p === i ? p : i)); });
    return () => scrollX.removeListener(id);
  }, []);
  const flip = (dir: 1 | -1) => {
    const next = Math.max(0, Math.min(pageCount - 1, idx + dir));
    scroller.current?.scrollTo({ x: next * SCREEN_W, animated: true });
  };
  const label = idx === 0 ? t('al.coverLabel') : t('al.pagesLabel', { a: (idx - 1) * 2 + 1, b: (idx - 1) * 2 + 2 });

  return (
    <View style={{ flex: 1, backgroundColor: '#26221d' }}>
      <Animated.ScrollView
        ref={scroller as any}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
        contentContainerStyle={{ alignItems: 'center', paddingTop: insets.top + 80, paddingBottom: 150 }}
      >
        {/* Closed cover */}
        <FlipPage scrollX={scrollX} index={0}>
          <BookRender finish={finish} coverUrl={draft.coverUrl} title={draft.title} subtitle={draft.subtitle} width={SCREEN_W * 0.6} />
        </FlipPage>
        {/* Open-book spreads */}
        {spreads.map((s, i) => (
          <FlipPage key={i} scrollX={scrollX} index={i + 1}>
            <BookSpread left={s.left} right={s.right} width={SCREEN_W - 64} />
          </FlipPage>
        ))}
      </Animated.ScrollView>

      {/* Tap zones to flip (don't block the swipe — they're thin side strips) */}
      {idx > 0 ? <Pressable onPress={() => flip(-1)} style={{ position: 'absolute', left: 0, top: insets.top + 70, bottom: 150, width: 36 }} /> : null}
      {idx < pageCount - 1 ? <Pressable onPress={() => flip(1)} style={{ position: 'absolute', right: 0, top: insets.top + 70, bottom: 150, width: 36 }} /> : null}

      {/* Top bar */}
      <View style={{ position: 'absolute', top: insets.top + 6, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <CircBtn onPress={pop} style={{ backgroundColor: 'rgba(255,255,255,0.14)' }}>{Icons.arrowL({ size: 18, color: '#fff' })}</CircBtn>
        <Text style={{ flex: 1, textAlign: 'center', fontFamily: F.extrabold, fontSize: 15, color: '#fff' }}>{t('al.preview')}</Text>
        <View style={{ width: 38 }} />
      </View>

      {/* Bottom: page label + dots + order */}
      <View style={{ position: 'absolute', left: 16, right: 16, bottom: insets.bottom + 14 }}>
        <Text style={{ textAlign: 'center', color: 'rgba(255,255,255,0.8)', fontFamily: F.bold, fontSize: 12.5, marginBottom: 8 }}>{label}</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
          {Array.from({ length: pageCount }).map((_, i) => (
            <View key={i} style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === idx ? '#fff' : 'rgba(255,255,255,0.35)' }} />
          ))}
        </View>
        <Btn kind="sage" size="lg" full onPress={() => push('albumCheckout', { draft })}>{t('al.orderAlbum')}</Btn>
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

const DEFAULT_DRAFT: AlbumDraft = { title: 'My family album', subtitle: CURRENT_YEAR, coverColor: 'Linen', perPage: 2, photoUrls: [], photoCount: 0, pages: 20 };

// ── CHECKOUT ─────────────────────────────────────────────────────────────────
export function AlbumCheckoutScreen() {
  const insets = useSafeAreaInsets();
  const { pop, popToRoot, stack } = useStore();
  const { user } = useAuth();
  const { profile, saveProfile } = useProfile();
  const { t } = useI18n();
  const draft: AlbumDraft = stack[stack.length - 1]?.params?.draft || DEFAULT_DRAFT;
  const [busy, setBusy] = useState(false);

  const sizes = [
    { n: 'Petite', d: '6×6 in', price: 29 },
    { n: 'Classic', d: '8×8 in', price: 49 },
    { n: 'Grand', d: '11×11 in', price: 89 },
  ];
  const [sizeIdx, setSizeIdx] = useState(1);
  const [coverIdx, setCoverIdx] = useState(Math.max(0, COVER_FINISHES.findIndex((c) => c.key === draft.coverColor)));
  const SHIPPING = 4.9;
  const money = (n: number) => `€${n.toFixed(2)}`;
  const total = sizes[sizeIdx].price + SHIPPING;
  const finish = COVER_FINISHES[coverIdx] || COVER_FINISHES[0];

  const addr = profile?.shippingAddress;
  const hasAddr = !!(addr && (addr.line1 || addr.name));
  const [addrOpen, setAddrOpen] = useState(false);
  const [form, setForm] = useState<ShippingAddress>({});
  const [savingAddr, setSavingAddr] = useState(false);
  const openAddr = () => { setForm(addr || { name: profile?.parentName || '' }); setAddrOpen(true); };
  const saveAddr = async () => {
    setSavingAddr(true);
    try {
      await saveProfile({ shippingAddress: { name: (form.name || '').trim(), line1: (form.line1 || '').trim(), city: (form.city || '').trim(), country: (form.country || '').trim(), phone: (form.phone || '').trim() } });
      setAddrOpen(false);
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('common.tryAgain'));
    } finally {
      setSavingAddr(false);
    }
  };

  const placeOrder = async () => {
    if (!hasAddr) { Alert.alert(t('al.needAddressTitle'), t('al.needAddressMsg'), [{ text: t('al.addAddress'), onPress: openAddr }]); return; }
    setBusy(true);
    try {
      if (user)
        await createAlbumOrder(user.uid, {
          title: draft.title,
          subtitle: draft.subtitle,
          size: `${sizes[sizeIdx].n} ${sizes[sizeIdx].d} hardcover`,
          cover: finish.key,
          total: money(total),
          currency: 'EUR',
          pages: draft.pages,
          photoCount: draft.photoCount,
          coverUrl: draft.coverUrl,
          photoUrls: draft.photoUrls,
          shipTo: profile?.shippingAddress,
        });
      Alert.alert(t('al.thankYou'), t('al.thankYouMsg'), [{ text: t('common.done'), onPress: popToRoot }]);
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
          <BookRender finish={finish} coverUrl={draft.coverUrl} title={draft.title} subtitle={draft.subtitle} width={200} />
        </View>
        <Text style={{ marginTop: 18, fontFamily: F.serif, fontSize: 24, letterSpacing: -0.5, color: C.ink }}>{draft.title}</Text>
        <Text style={{ fontSize: 13, color: C.ink3, fontFamily: F.regular, marginTop: 2 }}>
          {draft.subtitle ? `${draft.subtitle} · ` : ''}{t('al.photosPages', { photos: draft.photoCount, pages: draft.pages })}
        </Text>

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
          {COVER_FINISHES.map((cv, i) => {
            const sel = i === coverIdx;
            return (
              <Pressable key={cv.key} onPress={() => setCoverIdx(i)} style={{ flex: 1, alignItems: 'center' }}>
                <View style={{ height: 56, width: '100%', borderRadius: R.lg, backgroundColor: cv.sw, borderWidth: sel ? 3 : 1, borderColor: sel ? C.sage : C.line }} />
                <Text style={{ fontSize: 11, fontFamily: sel ? F.extrabold : F.bold, marginTop: 6, color: sel ? C.sage : C.ink2 }}>{cv.key}</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionLabel>{t('al.shipTo')}</SectionLabel>
        <Pressable onPress={openAddr} style={[{ backgroundColor: C.surface, borderRadius: R.lg, paddingVertical: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }, SH.card]}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: C.coralLt, alignItems: 'center', justifyContent: 'center' }}>
            {Icons.pin({ size: 18, color: C.coralDk, filled: true })}
          </View>
          <View style={{ flex: 1 }}>
            {hasAddr ? (
              <>
                <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: 14, color: C.ink }}>{addr?.name || t('al.editAddress')}</Text>
                <Text numberOfLines={1} style={{ fontSize: 12, color: C.ink3, fontFamily: F.regular, marginTop: 1 }}>{[addr?.line1, addr?.city, addr?.country].filter(Boolean).join(' · ') || t('al.addAddress')}</Text>
              </>
            ) : (
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.coralDk }}>{t('al.addAddress')}</Text>
            )}
          </View>
          <Text style={{ fontSize: 12, color: C.coralDk, fontFamily: F.bold }}>{hasAddr ? t('al.change') : t('common.add')}</Text>
        </Pressable>

        <SectionLabel>{t('al.summary')}</SectionLabel>
        <View style={[{ backgroundColor: C.surface, borderRadius: R.lg, padding: 16 }, SH.card]}>
          <SummaryRow k={`${sizes[sizeIdx].n} ${sizes[sizeIdx].d} hardcover`} v={money(sizes[sizeIdx].price)} />
          <SummaryRow k={`${finish.key} ${t('al.coverWord')}`} v="—" />
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

      {addrOpen ? (
        <KeyboardAvoidingView behavior="padding" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(20,15,10,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: insets.bottom + 18 }}>
            <View style={{ width: 42, height: 4, borderRadius: 2, backgroundColor: C.line, alignSelf: 'center', marginBottom: 14 }} />
            <Text style={{ fontFamily: F.serif, fontSize: 22, letterSpacing: -0.5, color: C.ink, marginBottom: 14 }}>{t('al.editAddress')}</Text>
            <AddrField label={t('al.fullName')} value={form.name} onChangeText={(v: string) => setForm((f) => ({ ...f, name: v }))} autoCapitalize="words" />
            <AddrField label={t('al.addressLine')} value={form.line1} onChangeText={(v: string) => setForm((f) => ({ ...f, line1: v }))} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}><AddrField label={t('al.cityRegion')} value={form.city} onChangeText={(v: string) => setForm((f) => ({ ...f, city: v }))} autoCapitalize="words" /></View>
              <View style={{ flex: 1 }}><AddrField label={t('al.country')} value={form.country} onChangeText={(v: string) => setForm((f) => ({ ...f, country: v }))} autoCapitalize="words" /></View>
            </View>
            <AddrField label={t('al.phone')} value={form.phone} onChangeText={(v: string) => setForm((f) => ({ ...f, phone: v }))} keyboardType="phone-pad" />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <Btn kind="ghost" style={{ flex: 1 }} onPress={() => setAddrOpen(false)}>{t('common.cancel')}</Btn>
              <Btn kind="primary" style={{ flex: 1.6 }} onPress={saveAddr}>{savingAddr ? t('gallery.saving') : t('al.saveAddress')}</Btn>
            </View>
          </View>
        </KeyboardAvoidingView>
      ) : null}
    </View>
  );
}

function AddrField({ label, ...props }: any) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ink3, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>{label}</Text>
      <View style={{ backgroundColor: C.surface, borderRadius: R.lg, paddingHorizontal: 14, height: 48, justifyContent: 'center', borderWidth: 1, borderColor: C.line }}>
        <TextInput style={{ fontFamily: F.medium, fontSize: 15, color: C.ink }} placeholderTextColor={C.ink3} autoCorrect={false} {...props} />
      </View>
    </View>
  );
}

const lbl = { fontSize: 10.5, color: C.ink3, fontFamily: F.extrabold, letterSpacing: 0.5, textTransform: 'uppercase' as const };

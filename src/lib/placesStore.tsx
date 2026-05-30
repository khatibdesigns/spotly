// Spotly — shared nearby-places state (location + spots + filters), used by
// Discover, Map, and Place detail. Loads once when the authed app mounts.
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserLocation, getSpots, getScreenVerdicts, requestScreen, KUWAIT_CITY, Spot, UserLoc } from './places';

// Short-lived local cache of the last shown spots so reopening the app paints
// instantly while a fresh fetch runs in the background. Only the small display
// snapshot is cached; verdicts/screening still come from Firestore.
const SPOTS_CACHE_KEY = 'spotly.spots.v1';

// Kind filters (activity / dining / shop / stay) — OR among themselves.
const KIND_OF: Record<string, Spot['kind']> = {
  activity: 'activity',
  dining: 'dining',
  shop: 'shop',
  stay: 'stay',
};

const PRICE_LABEL: Record<string, string> = { free: 'Free', $: '$', $$: '$$', $$$: '$$$' };

// True if at least one loaded spot would match this filter — used to hide
// filters that would return nothing.
export function filterHasResults(id: string, spots: Spot[]): boolean {
  if (KIND_OF[id]) return spots.some((s) => s.kind === KIND_OF[id]);
  if (id in PRICE_LABEL) return spots.some((s) => s.price === PRICE_LABEL[id]);
  if (id === 'openNow') return spots.some((s) => s.openNow === true);
  return spots.some((s) => s.amenities.includes(id)); // amenity
}

// Amenity/price/openNow predicates — a spot must satisfy ALL active ones (AND).
const PRED: Record<string, (s: Spot) => boolean> = {
  playArea: (s) => s.amenities.includes('playArea'),
  funPark: (s) => s.amenities.includes('funPark'),
  eatPlay: (s) => s.amenities.includes('eatPlay'),
  kidsMenu: (s) => s.amenities.includes('kidsMenu'),
  indoor: (s) => s.amenities.includes('indoor'),
  outdoor: (s) => s.amenities.includes('outdoor'),
  water: (s) => s.amenities.includes('water'),
  foodOnSite: (s) => s.amenities.includes('foodOnSite'),
  halal: (s) => s.amenities.includes('halal'),
  animals: (s) => s.amenities.includes('animals'),
  museum: (s) => s.amenities.includes('museum'),
  arts: (s) => s.amenities.includes('arts'),
  openNow: (s) => s.openNow === true,
  free: (s) => s.price === 'Free',
  $: (s) => s.price === '$',
  $$: (s) => s.price === '$$',
  $$$: (s) => s.price === '$$$',
};

type PlacesState = {
  loc: UserLoc;
  spots: Spot[];
  filtered: Spot[];
  loading: boolean;
  screening: boolean; // AI is screening newly-seen places in the background
  locationGranted: boolean;
  reload: () => void;
  // Load places centered on an arbitrary point (map "search this area" + the
  // Discover location picker). `label` is shown on the location pill.
  searchAt: (latitude: number, longitude: number, label?: string) => Promise<void>;
  areaLabel: string | null; // custom area name when not on the user's GPS location
  selected: Spot | null;
  setSelected: (s: Spot | null) => void;
  filters: Set<string>;
  toggleFilter: (id: string) => void; // multi-select (Filters sheet)
  setOnlyFilter: (id: string) => void; // single-select (home chips/tiles)
  clearFilters: () => void;
};

const Ctx = createContext<PlacesState | null>(null);

export function PlacesProvider({ children }: { children: React.ReactNode }) {
  const [loc, setLoc] = useState<UserLoc>({ ...KUWAIT_CITY, granted: false });
  const [spots, setSpots] = useState<Spot[]>([]);
  const [loading, setLoading] = useState(true);
  const [screening, setScreening] = useState(false);
  const [selected, setSelected] = useState<Spot | null>(null);
  const [filters, setFilters] = useState<Set<string>>(new Set());
  const [areaLabel, setAreaLabel] = useState<string | null>(null);

  // AI-screening curation (STRICT): a Google place is only shown once Claude
  // has approved it. Curated/merchant-claimed places (they opted in) always
  // show and are never screened. Verdicts are cached in Firestore forever, so
  // each place is screened once — over time the cache becomes a full vetted DB
  // and screening rarely runs.
  // Mirror of `spots` so callbacks can read the current list without re-creating.
  const spotsRef = useRef<Spot[]>([]);
  const applySpots = useCallback((list: Spot[]) => { spotsRef.current = list; setSpots(list); }, []);
  const cacheSpots = (list: Spot[], l: UserLoc) => {
    AsyncStorage.setItem(SPOTS_CACHE_KEY, JSON.stringify({ spots: list.slice(0, 80), loc: l, ts: Date.now() })).catch(() => {});
  };

  const screenable = (x: Spot) => x.source === 'google' && !x.ownerUid && !!x.id;
  const applyAndScreen = useCallback(async (raw: Spot[], l: UserLoc) => {
    const ids = raw.filter(screenable).map((x) => x.id);
    const verdicts = await getScreenVerdicts(ids); // cached id -> keep
    const approved = new Set<string>();
    for (const [id, keep] of verdicts) if (keep) approved.add(id);
    // STRICT: show non-screenable (curated/claimed) + cached-approved only.
    const initial = raw.filter((x) => !screenable(x) || approved.has(x.id));
    applySpots(initial);
    cacheSpots(initial, l);
    const unseen = raw.filter((x) => screenable(x) && !verdicts.has(x.id));
    if (unseen.length) {
      setScreening(true);
      requestScreen(unseen)
        .then((res) => {
          for (const [id, keep] of res) if (keep) approved.add(id);
          // Re-derive from raw so order (distance/promoted) is preserved.
          const next = raw.filter((x) => !screenable(x) || approved.has(x.id));
          applySpots(next);
          cacheSpots(next, l);
        })
        .catch(() => {})
        .finally(() => setScreening(false));
    }
  }, [applySpots]);

  const reload = useCallback(async () => {
    if (!spotsRef.current.length) setLoading(true); // only the cold, cache-less load shows the full spinner
    const l = await getUserLocation();
    setLoc(l);
    setAreaLabel(null); // back on the user's own location
    const s = await getSpots(l);
    await applyAndScreen(s, l);
    setLoading(false);
  }, [applyAndScreen]);

  // Re-centre the search on a chosen point (a city, a map region…).
  const searchAt = useCallback(async (latitude: number, longitude: number, label?: string) => {
    setLoading(true);
    const l: UserLoc = { latitude, longitude, granted: true };
    setLoc(l);
    setAreaLabel(label ?? null);
    const s = await getSpots(l);
    await applyAndScreen(s, l);
    setLoading(false);
  }, [applyAndScreen]);

  // On launch: paint the cached spots instantly (if any), then refresh in the
  // background. Reopening the app therefore shows places immediately instead of
  // waiting ~10s for GPS + the Google calls + screening.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rawC = await AsyncStorage.getItem(SPOTS_CACHE_KEY);
        if (!cancelled && rawC) {
          const c = JSON.parse(rawC);
          if (Array.isArray(c?.spots) && c.spots.length) { applySpots(c.spots); if (c.loc) setLoc(c.loc); setLoading(false); }
        }
      } catch {}
      if (!cancelled) reload(); // spotsRef is now populated → reload won't flash the spinner
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleFilter = useCallback((id: string) => {
    setFilters((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);
  // Single-select: tapping a chip makes it the only active filter (tap again
  // clears). Used by the home screen quick filters.
  const setOnlyFilter = useCallback((id: string) => {
    setFilters((prev) => (prev.has(id) && prev.size === 1 ? new Set() : new Set([id])));
  }, []);
  const clearFilters = useCallback(() => setFilters(new Set()), []);

  const filtered = useMemo(() => {
    if (filters.size === 0) return spots;
    const active = [...filters];
    const kinds = active.filter((f) => KIND_OF[f]).map((f) => KIND_OF[f]);
    const preds = active.filter((f) => PRED[f]);
    return spots.filter((s) => {
      if (kinds.length && !kinds.includes(s.kind)) return false; // OR across kinds
      return preds.every((f) => PRED[f](s)); // AND across amenity/price filters
    });
  }, [spots, filters]);

  return (
    <Ctx.Provider value={{ loc, spots, filtered, loading, screening, locationGranted: loc.granted, reload, searchAt, areaLabel, selected, setSelected, filters, toggleFilter, setOnlyFilter, clearFilters }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePlaces(): PlacesState {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlaces must be used within PlacesProvider');
  return v;
}

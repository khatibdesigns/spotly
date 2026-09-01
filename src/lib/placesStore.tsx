// Spotly — shared nearby-places state (location + spots + filters), used by
// Discover, Map, and Place detail. Loads once when the authed app mounts.
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserLocation, getSpots, getScreenVerdicts, requestScreen, KUWAIT_CITY, Spot, UserLoc } from './places';

// Short-lived local cache of the last shown spots so reopening the app paints
// instantly while a fresh fetch runs in the background. Only the small display
// snapshot is cached; verdicts/screening still come from Firestore.
const SPOTS_CACHE_KEY = 'spotly.spots.v2'; // v2: excludes no-cover-photo places
// How long a cached feed stays "fresh enough" to skip the launch-time refetch.
// Discovery data barely moves hour-to-hour, but every cold open used to re-bill
// the full Google Places fan-out — this caps the auto-refetch to once per window
// per device. On-demand refresh (pull-to-refresh, location changes) bypasses it.
const SPOTS_FRESH_MS = 12 * 60 * 60 * 1000; // 12h

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

  // AI-screening curation (FAIL-OPEN): a Google place is shown as soon as it
  // passes the cheap local kid-safety heuristic in getSpots (cafes/bars/shisha
  // primaryTypes excluded, dining goodForChildren===false dropped, no-cover-photo
  // dropped). The AI screener is a REFINEMENT layer on top: it only ever SUBTRACTS
  // places it has EXPLICITLY rejected (keep===false). Unseen places show
  // immediately and are screened in the background; any that come back rejected
  // are removed live. Curated/merchant-claimed places (they opted in) always show
  // and are never screened.
  //
  // Why fail-open: the old STRICT gate withheld every Google place until Claude
  // approved it. With the seeded curated docs purged, the feed is pure Google, so
  // a cold cache, a slow/unreachable screener, or testing from outside the swept
  // area (e.g. a sim's default US location) produced a COMPLETELY EMPTY Discover.
  // Fail-open keeps the feed populated in all those cases; verdicts cached in
  // Firestore still accumulate, so over time the rejected set is fully known and
  // the feed converges to the same vetted result the strict gate produced.
  // Mirror of `spots` so callbacks can read the current list without re-creating.
  const spotsRef = useRef<Spot[]>([]);
  const applySpots = useCallback((list: Spot[]) => { spotsRef.current = list; setSpots(list); }, []);
  const cacheSpots = (list: Spot[], l: UserLoc) => {
    AsyncStorage.setItem(SPOTS_CACHE_KEY, JSON.stringify({ spots: list.slice(0, 80), loc: l, ts: Date.now() })).catch(() => {});
  };

  const screenable = (x: Spot) => x.source === 'google' && !x.ownerUid && !!x.id;
  const applyAndScreen = useCallback(async (raw: Spot[], l: UserLoc) => {
    const screenables = raw.filter(screenable);
    const verdicts = await getScreenVerdicts(screenables.map((x) => x.id)); // cached id -> keep
    const rejected = new Set<string>();
    for (const [id, keep] of verdicts) if (!keep) rejected.add(id);
    // Show everything except places the AI has explicitly rejected.
    const visible = (rej: Set<string>) => raw.filter((x) => !screenable(x) || !rej.has(x.id));
    applySpots(visible(rejected));
    cacheSpots(visible(rejected), l);
    // Screen the never-seen places in the background and subtract any rejects.
    const unseen = screenables.filter((x) => !verdicts.has(x.id));
    if (unseen.length) {
      setScreening(true);
      requestScreen(unseen)
        .then((res) => {
          for (const [id, keep] of res) if (!keep) rejected.add(id);
          // Re-derive from raw so order (distance/promoted) is preserved.
          applySpots(visible(rejected));
          cacheSpots(visible(rejected), l);
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
      let fresh = false;
      try {
        const rawC = await AsyncStorage.getItem(SPOTS_CACHE_KEY);
        if (!cancelled && rawC) {
          const c = JSON.parse(rawC);
          if (Array.isArray(c?.spots) && c.spots.length) {
            applySpots(c.spots);
            if (c.loc) setLoc(c.loc);
            setLoading(false);
            // Fresh cache → skip the launch refetch. Every cold open used to
            // re-bill the whole Google Places fan-out even though the last feed
            // was still fine; this is the single biggest per-user cost cut.
            fresh = typeof c.ts === 'number' && Date.now() - c.ts < SPOTS_FRESH_MS;
          }
        }
      } catch {}
      // Only hit Google on launch when we don't already have a fresh feed. The
      // on-demand paths (pull-to-refresh, "use my location", location picker,
      // map "search this area") still force a live fetch whenever the user asks.
      if (!cancelled && !fresh) reload(); // spotsRef populated → reload won't flash the spinner
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

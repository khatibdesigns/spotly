// Spotly — shared nearby-places state (location + spots + filters), used by
// Discover, Map, and Place detail. Loads once when the authed app mounts.
import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { getUserLocation, getSpots, KUWAIT_CITY, Spot, UserLoc } from './places';

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
  indoor: (s) => s.amenities.includes('indoor'),
  outdoor: (s) => s.amenities.includes('outdoor'),
  water: (s) => s.amenities.includes('water'),
  foodOnSite: (s) => s.amenities.includes('foodOnSite'),
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
  locationGranted: boolean;
  reload: () => void;
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
  const [selected, setSelected] = useState<Spot | null>(null);
  const [filters, setFilters] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    setLoading(true);
    const l = await getUserLocation();
    setLoc(l);
    const s = await getSpots(l);
    setSpots(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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
    <Ctx.Provider value={{ loc, spots, filtered, loading, locationGranted: loc.granted, reload, selected, setSelected, filters, toggleFilter, setOnlyFilter, clearFilters }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePlaces(): PlacesState {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlaces must be used within PlacesProvider');
  return v;
}

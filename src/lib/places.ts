// Spotly — places service. Real nearby spots from Google Places API (New),
// merged with admin-curated places from Firestore. Photos are real.
import * as Location from 'expo-location';
import { collection, getDocs } from 'firebase/firestore';
import { firestore } from './firebase';
import { Voucher } from './currency';

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

// Default center when location is unavailable.
export const KUWAIT_CITY = { latitude: 29.3759, longitude: 47.9774 };

export type SpotSource = 'google' | 'curated';

// What kind of place this is — drives the Discover sections/filters.
export type SpotKind = 'activity' | 'dining' | 'shop';

export type Spot = {
  id: string;
  source: SpotSource;
  kind: SpotKind;
  name: string;
  category: string;
  lat: number;
  lng: number;
  rating?: number;
  reviews?: number;
  price?: string; // Free / $ / $$ / $$$
  ages?: string; // curated only
  amenities: string[]; // icon keys understood by the UI
  photoUrl?: string;
  distanceKm?: number;
  openNow?: boolean;
  bookable?: boolean;
  address?: string;
  tone: string; // fallback placeholder tone when no photo
  promoted?: boolean; // merchant-paid placement → shown first + badged
  ownerUid?: string; // merchant who owns this place (curated/claimed only)
  currencyCode?: string; // ISO code the place sells vouchers in (e.g. 'KWD')
  vouchers?: Voucher[]; // prepaid vouchers/offers the place sells
  googlePlaceId?: string; // Google place_id this curated/claim record links to
};

export type UserLoc = { latitude: number; longitude: number; granted: boolean };

export async function getUserLocation(): Promise<UserLoc> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return { ...KUWAIT_CITY, granted: false };
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, granted: true };
  } catch {
    return { ...KUWAIT_CITY, granted: false };
  }
}

function distKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function formatDistance(km?: number): string {
  if (km == null) return '';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

const PRICE: Record<string, string> = {
  PRICE_LEVEL_FREE: 'Free',
  PRICE_LEVEL_INEXPENSIVE: '$',
  PRICE_LEVEL_MODERATE: '$$',
  PRICE_LEVEL_EXPENSIVE: '$$$',
  PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
};

// Kid-friendly place types (valid Google Places "Table A" included types).
const KID_TYPES = ['park', 'zoo', 'aquarium', 'amusement_park', 'amusement_center', 'museum', 'tourist_attraction'];
// Family dining (valid Table A types).
const DINING_TYPES = ['restaurant', 'cafe', 'bakery', 'ice_cream_shop'];

const TYPE_AMENITY: Record<string, string> = {
  park: 'outdoor',
  zoo: 'animals',
  aquarium: 'water',
  amusement_park: 'playArea',
  amusement_center: 'playArea',
  museum: 'museum',
  tourist_attraction: 'outdoor',
  restaurant: 'foodOnSite',
  cafe: 'foodOnSite',
  bakery: 'foodOnSite',
  ice_cream_shop: 'foodOnSite',
  art_gallery: 'arts',
  water_park: 'water',
};
const TYPE_TONE: Record<string, string> = {
  park: 'sage',
  zoo: 'sun',
  aquarium: 'sky',
  amusement_park: 'plum',
  amusement_center: 'plum',
  museum: 'warm',
  tourist_attraction: 'sage',
  water_park: 'sky',
  restaurant: 'coral',
  cafe: 'warm',
  bakery: 'sun',
  ice_cream_shop: 'sky',
};

function prettyType(t?: string): string {
  if (!t) return 'Place';
  return t.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function amenitiesFromTypes(types: string[] = []): string[] {
  const out: string[] = [];
  for (const t of types) {
    const a = TYPE_AMENITY[t];
    if (a && !out.includes(a)) out.push(a);
  }
  if (!out.includes('restroom')) out.push('restroom');
  return out.slice(0, 4);
}
function toneFromTypes(types: string[] = []): string {
  for (const t of types) if (TYPE_TONE[t]) return TYPE_TONE[t];
  return 'warm';
}

export function photoUrl(name: string, w = 800): string {
  return `https://places.googleapis.com/v1/${name}/media?maxWidthPx=${w}&key=${KEY}`;
}

const FIELD_MASK =
  'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.primaryTypeDisplayName,places.photos,places.currentOpeningHours.openNow';

function mapPlace(p: any, loc: UserLoc, kind: SpotKind, shopAmenity = false): Spot {
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  const types: string[] = p.types || [];
  const amenities = amenitiesFromTypes(types);
  if (shopAmenity && !amenities.includes('shop')) amenities.unshift('shop');
  return {
    id: p.id,
    source: 'google',
    kind,
    name: p.displayName?.text || 'Unnamed place',
    category: p.primaryTypeDisplayName?.text || prettyType(types[0]),
    lat,
    lng,
    rating: p.rating,
    reviews: p.userRatingCount,
    price: p.priceLevel ? PRICE[p.priceLevel] : undefined,
    amenities: amenities.slice(0, 4),
    photoUrl: p.photos?.[0]?.name ? photoUrl(p.photos[0].name) : undefined,
    distanceKm: lat != null ? distKm(loc.latitude, loc.longitude, lat, lng) : undefined,
    openNow: p.currentOpeningHours?.openNow,
    address: p.formattedAddress,
    tone: kind === 'shop' ? 'plum' : toneFromTypes(types),
  };
}

// Nearby search by included types (activities, dining…).
async function searchNearby(loc: UserLoc, includedTypes: string[], kind: SpotKind, max = 20): Promise<Spot[]> {
  if (!KEY) return [];
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELD_MASK },
      body: JSON.stringify({
        includedTypes,
        maxResultCount: max,
        rankPreference: 'POPULARITY',
        locationRestriction: { circle: { center: { latitude: loc.latitude, longitude: loc.longitude }, radius: 15000 } },
      }),
    });
    const data = await res.json();
    if (!data?.places) return [];
    return data.places.map((p: any) => mapPlace(p, loc, kind));
  } catch {
    return [];
  }
}

// Kids/baby shops via text search (toy_store/baby_store aren't reliable in the
// new API, so we query by intent and bias to the user's location).
async function searchShops(loc: UserLoc): Promise<Spot[]> {
  if (!KEY) return [];
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELD_MASK },
      body: JSON.stringify({
        textQuery: 'kids toy and baby store',
        maxResultCount: 15,
        locationBias: { circle: { center: { latitude: loc.latitude, longitude: loc.longitude }, radius: 15000 } },
      }),
    });
    const data = await res.json();
    if (!data?.places) return [];
    return data.places.map((p: any) => mapPlace(p, loc, 'shop', true));
  } catch {
    return [];
  }
}

async function fetchCurated(loc: UserLoc): Promise<Spot[]> {
  if (!firestore) return [];
  try {
    const snap = await getDocs(collection(firestore, 'places'));
    const now = Date.now();
    return snap.docs
      // Hide merchant-submitted places until an admin approves them.
      .filter((d) => {
        const v = d.data() as any;
        return v.status !== 'pending' && v.status !== 'rejected';
      })
      .map((d): Spot => {
        const v = d.data() as any;
        const lat = v.lat ?? v.location?.latitude;
        const lng = v.lng ?? v.location?.longitude;
        // A promotion is active if flagged and (no expiry, or expiry in future).
        const promotedUntil = v.promotedUntil?.toMillis ? v.promotedUntil.toMillis() : v.promotedUntil;
        const promoted = !!v.promoted && (!promotedUntil || promotedUntil > now);
        return {
          id: d.id,
          source: 'curated',
          kind: (v.kind as SpotKind) || 'activity',
          name: v.name || 'Untitled',
          category: v.category || 'Curated',
          lat,
          lng,
          rating: v.rating,
          reviews: v.reviews,
          price: v.price,
          ages: v.ages,
          amenities: Array.isArray(v.amenities) ? v.amenities : [],
          photoUrl: v.photoUrl || undefined,
          distanceKm: lat != null ? distKm(loc.latitude, loc.longitude, lat, lng) : undefined,
          bookable: !!v.bookable,
          address: v.address,
          tone: v.tone || 'sun',
          promoted,
          ownerUid: v.ownerUid || undefined,
          currencyCode: v.currency || undefined,
          vouchers: Array.isArray(v.vouchers)
            ? (v.vouchers as Voucher[]).filter((x) => x && x.active !== false && Number(x.price) > 0)
            : undefined,
          googlePlaceId: v.googlePlaceId || undefined,
        };
      });
  } catch {
    return [];
  }
}

// Look up a single place by name/text (used to enrich AI-suggested itinerary
// stops with real coordinates + a photo). Returns null if nothing matches.
export type FoundPlace = { name: string; lat?: number; lng?: number; photoUrl?: string; category?: string; address?: string; rating?: number };
export async function findPlace(query: string, near?: string): Promise<FoundPlace | null> {
  if (!KEY || !query.trim()) return null;
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask': 'places.displayName,places.location,places.photos,places.primaryTypeDisplayName,places.formattedAddress,places.rating',
      },
      body: JSON.stringify({ textQuery: near ? `${query}, ${near}` : query, maxResultCount: 1 }),
    });
    const data = await res.json();
    const p = data?.places?.[0];
    if (!p) return null;
    return {
      name: p.displayName?.text || query,
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      photoUrl: p.photos?.[0]?.name ? photoUrl(p.photos[0].name, 600) : undefined,
      category: p.primaryTypeDisplayName?.text,
      address: p.formattedAddress,
      rating: p.rating,
    };
  } catch {
    return null;
  }
}

// Infer our coarse kind from Google place types.
const DINING_TYPESET = new Set(['restaurant', 'cafe', 'bakery', 'ice_cream_shop', 'meal_takeaway', 'food', 'coffee_shop']);
const SHOP_TYPESET = new Set(['store', 'shopping_mall', 'clothing_store', 'shoe_store', 'book_store', 'toy_store', 'department_store', 'gift_shop', 'baby_store']);
function kindFromTypes(types: string[] = []): SpotKind {
  if (types.some((t) => DINING_TYPESET.has(t))) return 'dining';
  if (types.some((t) => SHOP_TYPESET.has(t))) return 'shop';
  return 'activity';
}

// Multi-result text search — used by merchant onboarding so a business can find
// and claim their real Google listing instead of typing everything by hand.
export type PlaceSearchResult = {
  placeId: string;
  name: string;
  category?: string;
  address?: string;
  lat?: number;
  lng?: number;
  photoUrl?: string;
  rating?: number;
  kind: SpotKind;
};

export async function searchPlaces(text: string, near?: { latitude: number; longitude: number }): Promise<PlaceSearchResult[]> {
  if (!KEY || !text.trim()) return [];
  try {
    const body: any = { textQuery: text.trim(), maxResultCount: 8 };
    if (near) body.locationBias = { circle: { center: near, radius: 30000 } };
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.photos,places.primaryTypeDisplayName,places.formattedAddress,places.rating,places.types',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!data?.places) return [];
    return data.places.map((p: any): PlaceSearchResult => ({
      placeId: p.id,
      name: p.displayName?.text || 'Unnamed place',
      category: p.primaryTypeDisplayName?.text || prettyType((p.types || [])[0]),
      address: p.formattedAddress,
      lat: p.location?.latitude,
      lng: p.location?.longitude,
      photoUrl: p.photos?.[0]?.name ? photoUrl(p.photos[0].name, 600) : undefined,
      rating: p.rating,
      kind: kindFromTypes(p.types || []),
    }));
  } catch {
    return [];
  }
}

// Curated spots first (hand-picked), then Google activities + dining + shops,
// de-duped by name and sorted by distance.
export async function getSpots(loc: UserLoc): Promise<Spot[]> {
  const [activities, dining, shops, curated] = await Promise.all([
    searchNearby(loc, KID_TYPES, 'activity', 20),
    searchNearby(loc, DINING_TYPES, 'dining', 15),
    searchShops(loc),
    fetchCurated(loc),
  ]);
  // A curated doc may be a "claim record" linked to a Google place_id (the
  // merchant claimed their real listing). Match Google results to those claims
  // by place_id and overlay the merchant's commercial fields (vouchers,
  // currency, promotion, owner) onto the LIVE Google data — we never persist a
  // full copy of Google's place (ToS + staleness); only the place_id is stored.
  const claimByPlaceId = new Map<string, Spot>();
  for (const c of curated) if (c.googlePlaceId) claimByPlaceId.set(c.googlePlaceId, c);

  const consumed = new Set<string>(); // place_ids merged into a Google result
  const seenNames = new Set(curated.map((c) => c.name.toLowerCase()));
  const seenIds = new Set<string>(); // guard: a place can appear in >1 search list
  const google: Spot[] = [];
  for (const g of [...activities, ...dining, ...shops]) {
    if (seenIds.has(g.id)) continue; // same place returned by multiple type searches
    seenIds.add(g.id);
    const claim = claimByPlaceId.get(g.id);
    if (claim) {
      // Keep the claim's identity (id/source/owner/vouchers) but show the live
      // Google display fields where present.
      google.push({
        ...claim,
        name: g.name || claim.name,
        category: g.category || claim.category,
        photoUrl: g.photoUrl || claim.photoUrl,
        rating: g.rating ?? claim.rating,
        reviews: g.reviews ?? claim.reviews,
        openNow: g.openNow ?? claim.openNow,
        address: g.address || claim.address,
        lat: g.lat ?? claim.lat,
        lng: g.lng ?? claim.lng,
        distanceKm: g.distanceKm ?? claim.distanceKm,
      });
      consumed.add(g.id);
      continue;
    }
    // Otherwise drop Google duplicates of manually-curated places (by name).
    const k = g.name.toLowerCase();
    if (seenNames.has(k)) continue;
    seenNames.add(k);
    google.push(g);
  }
  // Curated docs not merged into a Google result (manual entries, or claims
  // Google didn't return nearby) stay as their own rows using their snapshot.
  const standaloneCurated = curated.filter((c) => !(c.googlePlaceId && consumed.has(c.googlePlaceId)));
  const merged = [...standaloneCurated, ...google];
  // Promoted places float to the top; otherwise nearest first.
  merged.sort((a, b) => {
    if (!!a.promoted !== !!b.promoted) return a.promoted ? -1 : 1;
    return (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999);
  });
  return merged;
}

// Hot events this week (admin-managed collabs, e.g. a 24am pop-up). Surfaced as
// map hotspots and a "hot this week" rail. Only currently-active ones are kept.
export type SpotEvent = {
  id: string;
  title: string;
  partner?: string;
  venue?: string;
  lat?: number;
  lng?: number;
  photoUrl?: string;
  startsAt?: number;
  endsAt?: number;
  tone: string;
};

export async function getEvents(): Promise<SpotEvent[]> {
  if (!firestore) return [];
  try {
    const snap = await getDocs(collection(firestore, 'events'));
    const now = Date.now();
    return snap.docs
      .map((d) => {
        const v = d.data() as any;
        const toMs = (x: any) => (x?.toMillis ? x.toMillis() : x);
        return {
          id: d.id,
          title: v.title || 'Event',
          partner: v.partner || undefined,
          venue: v.venue || undefined,
          lat: v.lat ?? v.location?.latitude,
          lng: v.lng ?? v.location?.longitude,
          photoUrl: v.photoUrl || undefined,
          startsAt: toMs(v.startsAt),
          endsAt: toMs(v.endsAt),
          tone: v.tone || 'plum',
          active: v.active !== false,
        };
      })
      // Keep active events that haven't ended yet.
      .filter((e) => e.active && (!e.endsAt || e.endsAt > now))
      .map(({ active, ...e }) => e);
  } catch {
    return [];
  }
}

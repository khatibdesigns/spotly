// Spotly — places service. Real nearby spots from Google Places API (New),
// merged with admin-curated places from Firestore. Photos are real.
import * as Location from 'expo-location';
import { collection, getDocs } from 'firebase/firestore';
import { firestore } from './firebase';

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
    return snap.docs.map((d): Spot => {
      const v = d.data() as any;
      const lat = v.lat ?? v.location?.latitude;
      const lng = v.lng ?? v.location?.longitude;
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

// Curated spots first (hand-picked), then Google activities + dining + shops,
// de-duped by name and sorted by distance.
export async function getSpots(loc: UserLoc): Promise<Spot[]> {
  const [activities, dining, shops, curated] = await Promise.all([
    searchNearby(loc, KID_TYPES, 'activity', 20),
    searchNearby(loc, DINING_TYPES, 'dining', 15),
    searchShops(loc),
    fetchCurated(loc),
  ]);
  const seen = new Set(curated.map((c) => c.name.toLowerCase()));
  const google: Spot[] = [];
  for (const g of [...activities, ...dining, ...shops]) {
    const k = g.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    google.push(g);
  }
  const merged = [...curated, ...google];
  merged.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
  return merged;
}

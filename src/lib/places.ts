// Spotly — places service. Real nearby spots from Google Places API (New),
// merged with admin-curated places from Firestore. Photos are real.
import * as Location from 'expo-location';
import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { firestore } from './firebase';
import { Voucher } from './currency';

const KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

// Default center when location is unavailable.
export const KUWAIT_CITY = { latitude: 29.3759, longitude: 47.9774 };

export type SpotSource = 'google' | 'curated';

// What kind of place this is — drives the Discover sections/filters.
// Note: 'stay' was retired in #42 (Hotels comes back with the travel/packages
// release). Kept in the union so any old persisted data still typechecks.
export type SpotKind = 'activity' | 'dining' | 'shop' | 'stay';

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
  photoUrls?: string[]; // up to several photos for the place gallery/carousel
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
  publicEvent?: boolean; // marked as a public event → yellow map pin
  primaryType?: string; // Google machine primaryType (e.g. 'cafe') — used to
                        // curate out non-kid-friendly places (shisha = 'cafe').
  goodForChildren?: boolean; // Google Atmosphere signal (food searches only)
  menuForChildren?: boolean; // Google Atmosphere signal — has a kids' menu
};

// Google primary types we refuse to show — they defeat the "kid/family-friendly
// outings" focus. Shisha/hookah lounges come back as primaryType 'cafe', which
// is why cafes/coffee shops are blocked wholesale. Applied to GOOGLE results
// only (a merchant who claims their place is always kept).
export const EXCLUDE_PRIMARY_TYPES = new Set<string>([
  'cafe', 'coffee_shop', 'internet_cafe',
  'bar', 'pub', 'wine_bar', 'bar_and_grill', 'night_club', 'liquor_store',
  'hookah_bar', 'smoking_area', 'casino', 'cigar_lounge',
]);

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

// Kid-friendly place types, split into 3 clusters so Google's per-call result
// cap (≈20) gives every theme fair representation instead of letting one
// theme dominate. Each name is a valid Google Places "Table A" included type.
//
// NATURE  = parks/gardens/zoos/aquariums/landmarks
// FUN     = amusement parks, indoor play, arcades, ice rinks, bowling, etc.
//           (THE Pokiddo bucket — `amusement_park` lives here)
// CULTURE = museums, planetariums, art galleries, cinema, historical sites
const KID_NATURE_TYPES = [
  'park', 'national_park', 'state_park',
  'garden', 'botanical_garden', 'picnic_ground', 'hiking_area',
  'zoo', 'aquarium', 'wildlife_park', 'wildlife_refuge',
  'tourist_attraction', 'observation_deck',
];
// FUN — split into 3 dedicated calls so each headline type gets guaranteed
// slots. Without this, Google's popularity ranking inside one call lets a
// single very-popular place hog all the amusement_park slots (e.g. Hawally
// Park crowded out Pokiddo in Kuwait). Each dedicated call uses
// rankPreference: DISTANCE so all nearby places of that type surface.
const KID_FUN_THRILLS_TYPES = ['amusement_park', 'roller_coaster', 'ferris_wheel'];
const KID_WATER_TYPES = ['water_park'];
// NOTE: bare 'playground' and 'community_center' are deliberately excluded —
// in practice they return football fields (ملعب) and diwaniyas/mosque halls
// that crowd out real kid spots under DISTANCE ranking. 'indoor_playground'
// is the type Google uses for actual kids' soft-play centres.
const KID_PLAY_TYPES = [
  'amusement_center', 'video_arcade', 'bowling_alley',
  'indoor_playground', 'ice_skating_rink',
];
const KID_CULTURE_TYPES = [
  'museum', 'planetarium',
  'art_gallery', 'art_studio',
  'historical_landmark', 'cultural_landmark', 'monument',
  'movie_theater',
];
// Family dining (valid Table A types). 'cafe' deliberately excluded — Google
// tags shisha/hookah lounges as cafe, and cafes/coffee shops aren't the focus.
const DINING_TYPES = ['restaurant', 'bakery', 'ice_cream_shop'];

// Type → amenity tag. The amenity tag is what `CATEGORIES` tiles + the
// Filters sheet check against, so every kid-relevant type MUST map to one.
const TYPE_AMENITY: Record<string, string> = {
  // Outdoors
  park: 'outdoor', national_park: 'outdoor', state_park: 'outdoor',
  garden: 'outdoor', botanical_garden: 'outdoor', picnic_ground: 'outdoor',
  hiking_area: 'outdoor',
  tourist_attraction: 'outdoor', observation_deck: 'outdoor',
  // Animals
  zoo: 'animals', aquarium: 'animals',
  wildlife_park: 'animals', wildlife_refuge: 'animals',
  // Waterparks (separate from 'animals' aquarium)
  water_park: 'water',
  // Fun parks / theme parks / big rides — own bucket so amusement_park
  // (Pokiddo) gets the right tile instead of being lumped into Indoor play.
  amusement_park: 'funPark', roller_coaster: 'funPark', ferris_wheel: 'funPark',
  // Indoor play / arcades / soft play / community spaces
  amusement_center: 'playArea', video_arcade: 'playArea', bowling_alley: 'playArea',
  playground: 'playArea', indoor_playground: 'playArea',
  ice_skating_rink: 'playArea', community_center: 'playArea',
  // Culture / museums (cinema folded in here for now)
  museum: 'museum', planetarium: 'museum',
  historical_landmark: 'museum', cultural_landmark: 'museum', monument: 'museum',
  movie_theater: 'museum',
  // Arts
  art_gallery: 'arts', art_studio: 'arts',
  // Dining
  restaurant: 'foodOnSite', cafe: 'foodOnSite',
  bakery: 'foodOnSite', ice_cream_shop: 'foodOnSite',
};
const TYPE_TONE: Record<string, string> = {
  // Outdoors → sage
  park: 'sage', national_park: 'sage', state_park: 'sage', garden: 'sage',
  botanical_garden: 'sage', picnic_ground: 'sage', hiking_area: 'sage',
  tourist_attraction: 'sage', observation_deck: 'sage',
  // Animals → sun
  zoo: 'sun', aquarium: 'sky',
  wildlife_park: 'sun', wildlife_refuge: 'sun',
  // Water → sky
  water_park: 'sky',
  // Fun parks → plum (bright)
  amusement_park: 'plum', roller_coaster: 'plum', ferris_wheel: 'plum',
  // Indoor play → coral
  amusement_center: 'coral', video_arcade: 'coral', bowling_alley: 'coral',
  playground: 'coral', indoor_playground: 'coral',
  ice_skating_rink: 'sky', community_center: 'sage',
  // Museums / culture → warm
  museum: 'warm', planetarium: 'sky',
  historical_landmark: 'warm', cultural_landmark: 'warm', monument: 'warm',
  movie_theater: 'plum',
  // Arts → plum
  art_gallery: 'plum', art_studio: 'plum',
  // Dining
  restaurant: 'coral', cafe: 'warm', bakery: 'sun', ice_cream_shop: 'sky',
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
  'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.types,places.primaryType,places.primaryTypeDisplayName,places.photos,places.currentOpeningHours.openNow';
// Pricier "Atmosphere/Enterprise" fields — appended ONLY for food searches so
// parks/museums calls stay on the cheaper SKU.
const ATMOSPHERE_FIELDS = ',places.goodForChildren,places.menuForChildren';

function mapPlace(p: any, loc: UserLoc, kind: SpotKind, shopAmenity = false): Spot {
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  const types: string[] = p.types || [];
  const amenities = amenitiesFromTypes(types);
  if (shopAmenity && !amenities.includes('shop')) amenities.unshift('shop');
  if (p.menuForChildren && !amenities.includes('kidsMenu')) amenities.unshift('kidsMenu');
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
    photoUrls: Array.isArray(p.photos)
      ? p.photos.slice(0, 8).map((ph: any) => (ph?.name ? photoUrl(ph.name) : null)).filter(Boolean)
      : undefined,
    distanceKm: lat != null ? distKm(loc.latitude, loc.longitude, lat, lng) : undefined,
    openNow: p.currentOpeningHours?.openNow,
    address: p.formattedAddress,
    tone: kind === 'shop' ? 'plum' : toneFromTypes(types),
    primaryType: p.primaryType,
    goodForChildren: p.goodForChildren,
    menuForChildren: p.menuForChildren,
  };
}

// Nearby search by included types (activities, dining…).
// `rankPref='DISTANCE'` is the right call for niche/headline types (e.g.
// amusement_park) where we want ALL nearby places of that type, not just the
// most-reviewed one — otherwise Google's popularity ranking buries less-
// reviewed but valid places (Pokiddo gets crowded out by Hawally Park).
async function searchNearby(
  loc: UserLoc,
  includedTypes: string[],
  kind: SpotKind,
  max = 20,
  rankPref: 'POPULARITY' | 'DISTANCE' = 'POPULARITY',
  pages = 1,
  extraFields = '',
): Promise<Spot[]> {
  if (!KEY) return [];
  const out: Spot[] = [];
  let pageToken: string | undefined;
  // Google caps maxResultCount at 20 per call. To get more (e.g. so Pokiddo
  // surfaces even when 20 amusement_park spots sit between you and Salmiya)
  // we follow nextPageToken up to `pages` times.
  for (let i = 0; i < pages; i++) {
    try {
      const body: any = { includedTypes, maxResultCount: Math.min(20, max), rankPreference: rankPref };
      if (pageToken) {
        body.pageToken = pageToken;
      } else {
        body.locationRestriction = { circle: { center: { latitude: loc.latitude, longitude: loc.longitude }, radius: 25000 } };
      }
      const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
        method: 'POST',
        // NOTE: searchNearby (New API) does NOT support nextPageToken — adding
        // it to the field mask 400s the whole request. (That bug returned an
        // empty activity feed in a sim test.) Pagination only works on
        // searchText, handled separately in searchByText().
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELD_MASK + extraFields },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data?.places) break;
      for (const p of data.places) out.push(mapPlace(p, loc, kind));
      if (!data.nextPageToken || i + 1 >= pages) break;
      pageToken = data.nextPageToken;
      // Google asks for a short delay before pagination requests.
      await new Promise((r) => setTimeout(r, 400));
    } catch {
      break;
    }
  }
  return out;
}

// Like searchNearby but uses places:searchText, which (unlike searchNearby)
// supports pagination via nextPageToken — so we can pull >20 results for a
// headline kid type. Used for the "Fun parks" search so e.g. Pokiddo surfaces
// from anywhere in Kuwait, not just neighbourhoods within ~20 amusement_park
// hops of the user.
async function searchByText(
  loc: UserLoc,
  textQuery: string,
  includedType: string | null,
  kind: SpotKind,
  pages = 1,
  extraAmenities: string[] = [],
  extraFields = '',
): Promise<Spot[]> {
  if (!KEY) return [];
  const out: Spot[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < pages; i++) {
    try {
      // The New Places API requires paging requests to REPEAT the original
      // params and just append pageToken — sending pageToken alone 400s with
      // "Empty text_query" (so prior page-2+ fetches silently failed and the
      // pagination "boost" was a no-op).
      const body: any = {
        pageSize: 20,
        textQuery,
        locationBias: { circle: { center: { latitude: loc.latitude, longitude: loc.longitude }, radius: 50000 } },
      };
      if (includedType) body.includedType = includedType;
      if (pageToken) body.pageToken = pageToken;
      const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': KEY,
          'X-Goog-FieldMask': FIELD_MASK + ',nextPageToken' + extraFields,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data?.places) break;
      for (const p of data.places) {
        const spot = mapPlace(p, loc, kind);
        // Inject intent-based amenities the type map can't infer — e.g. a
        // restaurant returned by "restaurant with kids play area" gets the
        // 'eatPlay' tag so it's filterable even though Google has no such type.
        if (extraAmenities.length) {
          spot.amenities = Array.from(new Set([...extraAmenities, ...spot.amenities])).slice(0, 5);
        }
        out.push(spot);
      }
      if (!data.nextPageToken || i + 1 >= pages) break;
      pageToken = data.nextPageToken;
      await new Promise((r) => setTimeout(r, 400));
    } catch {
      break;
    }
  }
  return out;
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

// Halal family restaurants via text search — there's no reliable "halal" type,
// so we query by intent and tag the results with a 'halal' amenity to filter on.
async function searchHalal(loc: UserLoc): Promise<Spot[]> {
  if (!KEY) return [];
  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': KEY, 'X-Goog-FieldMask': FIELD_MASK + ATMOSPHERE_FIELDS },
      body: JSON.stringify({
        textQuery: 'halal family restaurant',
        maxResultCount: 15,
        locationBias: { circle: { center: { latitude: loc.latitude, longitude: loc.longitude }, radius: 15000 } },
      }),
    });
    const data = await res.json();
    if (!data?.places) return [];
    return data.places.map((p: any) => {
      const s = mapPlace(p, loc, 'dining');
      if (!s.amenities.includes('halal')) s.amenities = ['halal', ...s.amenities].slice(0, 4);
      return s;
    });
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
          publicEvent: !!v.publicEvent,
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
  // Multiple parallel kid-activity searches so each headline theme gets
  // guaranteed slots — a single big multi-type call lets popular places hog
  // all 20 slots (which is why Pokiddo wasn't surfacing). Each niche call
  // uses rankPreference: DISTANCE so all *nearby* matches surface, not just
  // the most-reviewed. Hotels (stays) removed in #42.
  // PROXIMITY FEED: every kid search is rankPreference='DISTANCE' (closest
  // first — "what's around me"), and each headline theme gets its OWN narrow
  // call so a flood of one type can't crowd out another. This is what makes
  // a close-but-modestly-reviewed place like Pokiddo show — POPULARITY rank
  // was burying it behind famous places kilometres away.
  const [
    nature, thrills, water, play, culture,
    funText, playText, eatPlay, natureText,
    dining, diningText, shops, halal, curated,
  ] = await Promise.all([
    searchNearby(loc, KID_NATURE_TYPES, 'activity', 20, 'DISTANCE'),
    searchNearby(loc, KID_FUN_THRILLS_TYPES, 'activity', 20, 'DISTANCE'),
    searchNearby(loc, KID_WATER_TYPES, 'activity', 10, 'DISTANCE'),
    searchNearby(loc, KID_PLAY_TYPES, 'activity', 20, 'DISTANCE'),
    searchNearby(loc, KID_CULTURE_TYPES, 'activity', 20, 'DISTANCE'),
    // Coverage boosters: searchText paginates (3 pages ≈ 60 results) so dense
    // areas like a big mall (The Avenues) aren't capped at the 20 a single
    // searchNearby returns. Merged + de-duped + distance-sorted below.
    searchByText(loc, 'amusement park kids entertainment center', 'amusement_park', 'activity', 3),
    searchByText(loc, 'kids indoor play area soft play', null, 'activity', 3),
    // Restaurants WITH a kids' play area — Google has no such type, so query
    // by intent and tag eatPlay so the new "Eat & play" filter can find them.
    // Atmosphere fields requested so we can drop goodForChildren=false places.
    searchByText(loc, 'family restaurant with kids play area', 'restaurant', 'dining', 3, ['eatPlay', 'foodOnSite'], ATMOSPHERE_FIELDS),
    // Outdoor booster — parks/gardens/playgrounds beyond the 20-cap nearby call.
    searchByText(loc, 'family park garden playground', null, 'activity', 2),
    searchNearby(loc, DINING_TYPES, 'dining', 15, 'DISTANCE', 1, ATMOSPHERE_FIELDS),
    // Dining booster — more sit-down family restaurants than the 20-cap nearby
    // call returns. Atmosphere fields so goodForChildren=false gets dropped.
    searchByText(loc, 'family restaurant kids friendly', 'restaurant', 'dining', 2, ['foodOnSite'], ATMOSPHERE_FIELDS),
    searchShops(loc),
    searchHalal(loc),
    fetchCurated(loc),
  ]);
  const activities = [...nature, ...thrills, ...funText, ...water, ...play, ...playText, ...culture, ...natureText];
  const stays: Spot[] = []; // kept as an empty array so the merge loop below still typechecks
  // A curated doc may be a "claim record" linked to a Google place_id (the
  // merchant claimed their real listing). Match Google results to those claims
  // by place_id and overlay the merchant's commercial fields (vouchers,
  // currency, promotion, owner) onto the LIVE Google data — we never persist a
  // full copy of Google's place (ToS + staleness); only the place_id is stored.
  const claimByPlaceId = new Map<string, Spot>();
  for (const c of curated) {
    if (!c.googlePlaceId) continue;
    const prev = claimByPlaceId.get(c.googlePlaceId);
    // If two docs share a place_id, prefer the owned one (then the richer one).
    const better = !prev || (!prev.ownerUid && !!c.ownerUid) || ((prev.vouchers?.length || 0) < (c.vouchers?.length || 0));
    if (better) claimByPlaceId.set(c.googlePlaceId, c);
  }

  const consumed = new Set<string>(); // place_ids merged into a Google result
  const seenNames = new Set(curated.map((c) => c.name.toLowerCase()));
  const seenIds = new Set<string>(); // guard: a place can appear in >1 search list
  // Halal before dining so a halal-tagged restaurant isn't shadowed by its
  // untagged duplicate from the generic dining search.
  const google: Spot[] = [];
  // eatPlay (tagged) before generic dining so a restaurant that's in both
  // lists keeps its 'eatPlay' tag when de-duped by place_id.
  for (const g of [...activities, ...eatPlay, ...halal, ...dining, ...diningText, ...shops, ...stays]) {
    if (seenIds.has(g.id)) continue; // same place returned by multiple type searches
    seenIds.add(g.id);
    const claim = claimByPlaceId.get(g.id);
    // Curate OUT non-kid-friendly Google places (shisha/cafe/bar/etc.) — but a
    // merchant who claimed their listing is always kept (they opted in).
    if (!claim && g.primaryType && EXCLUDE_PRIMARY_TYPES.has(g.primaryType)) continue;
    // Drop food places Google explicitly flags as NOT good for children
    // (goodForChildren is only requested on food searches; activities are
    // undefined and never dropped here). Claimed places bypass this too.
    if (!claim && g.kind === 'dining' && g.goodForChildren === false) continue;
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
  // Google didn't return nearby) stay as their own rows — deduped by place_id
  // (prefer the owned doc) so two docs for one place don't both appear.
  const standaloneCurated: Spot[] = [];
  const addedPlaceIds = new Set<string>();
  for (const c of curated) {
    if (c.googlePlaceId) {
      if (consumed.has(c.googlePlaceId) || addedPlaceIds.has(c.googlePlaceId)) continue;
      addedPlaceIds.add(c.googlePlaceId);
      standaloneCurated.push(claimByPlaceId.get(c.googlePlaceId) || c);
    } else {
      standaloneCurated.push(c);
    }
  }
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

// ---- AI screening (kid-friendly curation) ---------------------------------
// Each Google place is screened ONCE by Claude on EC2 (/screen) and the verdict
// cached in Firestore `screenedPlaces/{id}`. The app reads the cache to hide
// non-kid-friendly places (fish-only restaurants, shisha cafes, gyms…) and
// sends never-seen places to the screener in the background.
const SCREEN_API = (process.env.EXPO_PUBLIC_PLAN_API_URL || 'http://16.16.79.251:8090').replace(/\/$/, '') + '/screen';

// id -> keep(boolean). Absent from the map = not yet screened.
export async function getScreenVerdicts(ids: string[]): Promise<Map<string, boolean>> {
  const out = new Map<string, boolean>();
  if (!firestore || !ids.length) return out;
  try {
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      const snap = await getDocs(query(collection(firestore, 'screenedPlaces'), where(documentId(), 'in', chunk)));
      snap.forEach((d) => { out.set(d.id, (d.data() as any)?.keep === true); });
    }
  } catch {}
  return out;
}

// Send uncached places to the EC2 screener (it classifies + persists verdicts).
// Returns a verdict map id -> keep(boolean) for everything it screened.
export async function requestScreen(places: Spot[]): Promise<Map<string, boolean>> {
  const verdicts = new Map<string, boolean>();
  const items = places.slice(0, 60).filter((p) => p.id);
  if (!items.length) return verdicts;
  try {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), 130000);
    const res = await fetch(SCREEN_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        places: items.map((p) => ({
          id: p.id, name: p.name, primaryType: p.primaryType, category: p.category,
          rating: p.rating, reviews: p.reviews, address: p.address,
        })),
      }),
      signal: ctrl.signal,
    });
    clearTimeout(to);
    const data = await res.json();
    for (const r of data?.results || []) if (r && r.id) verdicts.set(r.id, r.keep === true);
  } catch {}
  return verdicts;
}

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

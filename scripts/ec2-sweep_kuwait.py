#!/usr/bin/env python3
# Spotly — bulk pre-screen sweep (Kuwait).
#
# Walks Kuwait's populated district centers, queries Google Places (New) for the
# same kid/family place types the app uses, dedupes place_ids, skips already-
# cached verdicts, then screens the rest through Claude (Sonnet, offline = no
# timeout pressure) and caches the verdicts into Firestore `screenedPlaces`.
#
# After a sweep, the app finds nearly every nearby place already screened, so the
# feed fills instantly (no live screening wait) and stays accurate.
#
# ToS-safe: only the place_id + OUR verdict are persisted. Google's place content
# (name/address/types) is fetched transiently, used to make the verdict, and
# discarded — it is never written to Firestore.
#
# Deploy to /home/ec2-user/caption-proxy/sweep_kuwait.py (next to screen_mod.py).
# Run on the box:
#   cd /home/ec2-user/caption-proxy
#   GOOGLE_MAPS_API_KEY=AIza... python3 sweep_kuwait.py            # full sweep
#   GOOGLE_MAPS_API_KEY=AIza... python3 sweep_kuwait.py --points 3 # validate a few
#   GOOGLE_MAPS_API_KEY=AIza... DRY_RUN=1 python3 sweep_kuwait.py  # count only, no $ on Claude/no writes
import os
import sys
import json
import time
import urllib.request
import urllib.error

import screen_mod  # run_screen() + _get_db() — shared with the live /screen route

KEY = os.environ.get("GOOGLE_MAPS_API_KEY") or os.environ.get("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY")
RADIUS = int(os.environ.get("SWEEP_RADIUS", "14000"))     # metres per nearby/text query
TEXT_PAGES = int(os.environ.get("SWEEP_PAGES", "2"))      # nextPageToken follows for text searches
MODEL = os.environ.get("SWEEP_MODEL", "sonnet")           # offline => thorough
BATCH = int(os.environ.get("SWEEP_BATCH", "25"))          # places per Claude call
DRY_RUN = os.environ.get("DRY_RUN") == "1"                # collect + count only, no screening
FORCE = os.environ.get("FORCE") == "1"                    # re-screen even already-cached ids

# Pro+Enterprise field mask: everything the gatekeeper prompt reads (name,
# primaryType, types, rating, REVIEW COUNT, price, address). Review count is the
# reality check that catches vanity mislabels (a lone tree tagged "landmark").
# No photos/atmosphere — keeps the SKU down; verdicts don't need them.
FIELD_MASK = (
    "places.id,places.displayName,places.primaryType,places.types,"
    "places.rating,places.userRatingCount,places.priceLevel,places.formattedAddress"
)

# Mirror of the app's kid/family type clusters (src/lib/places.ts).
NATURE = [
    "park", "national_park", "state_park",
    "garden", "botanical_garden", "picnic_ground", "hiking_area",
    "zoo", "aquarium", "wildlife_park", "wildlife_refuge",
    "tourist_attraction", "observation_deck",
]
THRILLS = ["amusement_park", "roller_coaster", "ferris_wheel"]
WATER = ["water_park"]
PLAY = ["amusement_center", "video_arcade", "bowling_alley", "indoor_playground", "ice_skating_rink"]
CULTURE = [
    "museum", "planetarium", "art_gallery", "art_studio",
    "historical_landmark", "cultural_landmark", "monument", "movie_theater",
]
DINING = ["restaurant", "bakery", "ice_cream_shop"]

# Intent text searches (Google has no clean type for these).
TEXT_SEARCHES = [
    ("amusement park kids entertainment center", "amusement_park"),
    ("kids indoor play area soft play", None),
    ("family restaurant with kids play area", "restaurant"),
    ("family park garden playground", None),
    ("kids toy and baby store", None),
    ("halal family restaurant", "restaurant"),
]

PRICE = {
    "PRICE_LEVEL_FREE": "Free",
    "PRICE_LEVEL_INEXPENSIVE": "$",
    "PRICE_LEVEL_MODERATE": "$$",
    "PRICE_LEVEL_EXPENSIVE": "$$$",
    "PRICE_LEVEL_VERY_EXPENSIVE": "$$$$",
}

# Kuwait's populated district centers (lat, lng). Chosen — not a blind grid — so
# spend lands on inhabited areas, not desert/sea. ~14km radius overlaps; the
# global place_id dedup removes the duplicates.
POINTS = [
    ("Kuwait City", 29.3759, 47.9774),
    ("Sharq / Marina", 29.3797, 48.0010),
    ("Dasma / Daiya", 29.3580, 47.9930),
    ("Adailiya / Khaldiya", 29.3380, 47.9700),
    ("Shuwaikh", 29.3470, 47.9300),
    ("Sulaibikhat", 29.3560, 47.9300),
    ("Doha", 29.3850, 47.8200),
    ("Salmiya", 29.3340, 48.0680),
    ("Salmiya Coast / Bida'a", 29.3160, 48.0850),
    ("Hawally", 29.3330, 48.0290),
    ("Jabriya", 29.3220, 48.0220),
    ("Rumaithiya", 29.3120, 48.0700),
    ("Salwa", 29.2920, 48.0760),
    ("Bayan / Mishref", 29.2850, 48.0560),
    ("Surra / Qortuba", 29.3050, 47.9700),
    ("Farwaniya", 29.2775, 47.9586),
    ("Khaitan", 29.2870, 47.9700),
    ("Ardiya", 29.3060, 47.9100),
    ("Jleeb Al-Shuyoukh", 29.2700, 47.9200),
    ("Sabah Al Salem", 29.2570, 48.0680),
    ("Mubarak Al-Kabeer", 29.2300, 48.0830),
    ("Qurain / Adan", 29.2500, 48.0700),
    ("Fintas", 29.1730, 48.1170),
    ("Mahboula", 29.1500, 48.1200),
    ("Abu Halifa", 29.1300, 48.1280),
    ("Mangaf", 29.0970, 48.1330),
    ("Fahaheel", 29.0826, 48.1300),
    ("Ahmadi", 29.0769, 48.0837),
    ("Egaila / Sabahiya", 29.1900, 48.1000),
    ("Jahra", 29.3375, 47.6581),
    ("Saad Al Abdullah", 29.3400, 47.6000),
    ("Wafra (south)", 28.6400, 47.9300),
]

_session_headers = {"Content-Type": "application/json", "X-Goog-Api-Key": KEY or "", "X-Goog-FieldMask": FIELD_MASK}
_pagemask = FIELD_MASK + ",nextPageToken"

calls = 0  # billed Google requests (for the cost estimate)


def _post(url, body, field_mask):
    global calls
    calls += 1
    data = json.dumps(body).encode()
    headers = dict(_session_headers)
    headers["X-Goog-FieldMask"] = field_mask
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:300]
        print("  ! Google %s: %s" % (e.code, body))
        return {}
    except Exception as e:
        print("  ! Google error:", e)
        return {}


def _row(p):
    return {
        "id": p.get("id"),
        "name": (p.get("displayName") or {}).get("text", ""),
        "primaryType": p.get("primaryType", ""),
        "types": p.get("types", []),
        "rating": p.get("rating", ""),
        "reviews": p.get("userRatingCount", ""),
        "price": PRICE.get(p.get("priceLevel", ""), ""),
        "address": p.get("formattedAddress", ""),
    }


def search_nearby(lat, lng, types):
    body = {
        "includedTypes": types,
        "maxResultCount": 20,
        "rankPreference": "DISTANCE",
        "locationRestriction": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": RADIUS}},
    }
    data = _post("https://places.googleapis.com/v1/places:searchNearby", body, FIELD_MASK)
    return [_row(p) for p in data.get("places", []) if p.get("id")]


def search_text(lat, lng, query, included_type, pages):
    out = []
    page_token = None
    for _ in range(pages):
        # The New Places API requires paging requests to REPEAT the original
        # params (textQuery/locationBias/includedType) and just add pageToken —
        # sending pageToken alone 400s with "Empty text_query".
        body = {
            "textQuery": query,
            "pageSize": 20,
            "locationBias": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": RADIUS}},
        }
        if included_type:
            body["includedType"] = included_type
        if page_token:
            body["pageToken"] = page_token
        data = _post("https://places.googleapis.com/v1/places:searchText", body, _pagemask)
        out.extend(_row(p) for p in data.get("places", []) if p.get("id"))
        page_token = data.get("nextPageToken")
        if not page_token:
            break
        time.sleep(0.4)  # Google asks for a short delay before paging
    return out


def already_cached(db, ids):
    """Return the subset of ids that already have a screenedPlaces verdict."""
    cached = set()
    refs = [db.collection("screenedPlaces").document(i) for i in ids]
    for i in range(0, len(refs), 300):
        chunk = refs[i:i + 300]
        try:
            for snap in db.get_all(chunk):
                if snap.exists:
                    cached.add(snap.id)
        except Exception as e:
            print("  ! cache read failed:", e)
    return cached


def main():
    if not KEY:
        print("ERROR: set GOOGLE_MAPS_API_KEY (or EXPO_PUBLIC_GOOGLE_MAPS_API_KEY).")
        sys.exit(1)

    limit = None
    if "--points" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--points") + 1])
    points = POINTS[:limit] if limit else POINTS

    print("Sweep: %d points, radius %dm, %d text pages, model=%s%s"
          % (len(points), RADIUS, TEXT_PAGES, MODEL, "  [DRY RUN]" if DRY_RUN else ""))

    found = {}  # id -> row (deduped globally)
    for idx, (name, lat, lng) in enumerate(points, 1):
        before = len(found)
        for types in (NATURE, THRILLS, WATER, PLAY, CULTURE, DINING):
            for r in search_nearby(lat, lng, types):
                found.setdefault(r["id"], r)
        for q, itype in TEXT_SEARCHES:
            for r in search_text(lat, lng, q, itype, TEXT_PAGES):
                found.setdefault(r["id"], r)
        print("[%2d/%2d] %-26s  +%-3d new  (total %d, %d calls)"
              % (idx, len(points), name, len(found) - before, len(found), calls))

    ids = list(found.keys())
    print("\nCollected %d unique place_ids across %d Google calls." % (len(ids), calls))
    # Google "Nearby/Text Search Pro+Enterprise" ≈ $35 / 1000 requests.
    print("Estimated Google spend: ~$%.2f (%d calls @ ~$0.035)." % (calls * 0.035, calls))

    db = screen_mod._get_db()
    if db is None:
        print("ERROR: Firestore unavailable — cannot read cache or write verdicts.")
        sys.exit(1)

    cached = already_cached(db, ids) if not FORCE else set()
    todo = [found[i] for i in ids if i not in cached]
    if FORCE:
        print("FORCE — re-screening ALL %d (ignoring existing cache)." % len(todo))
    else:
        print("Already screened: %d.  New to screen: %d." % (len(cached), len(todo)))

    if DRY_RUN:
        print("DRY RUN — stopping before screening. No Claude calls, no writes.")
        return

    if not todo:
        print("Nothing new to screen. Done.")
        return

    kept = 0
    for i in range(0, len(todo), BATCH):
        batch = todo[i:i + BATCH]
        t0 = time.time()
        try:
            results = screen_mod.run_screen(batch, model=MODEL)
        except Exception as e:
            print("  ! screen batch failed (%d..%d): %s" % (i, i + len(batch), e))
            continue
        k = sum(1 for r in results if r.get("keep"))
        kept += k
        print("screened %4d/%-4d  kept %3d/%-3d  (%.0fs)"
              % (min(i + BATCH, len(todo)), len(todo), k, len(batch), time.time() - t0))

    print("\nDone. Screened %d new places; %d kept, %d dropped. Cache now covers %d ids in this run."
          % (len(todo), kept, len(todo) - kept, len(cached) + len(todo)))


if __name__ == "__main__":
    main()

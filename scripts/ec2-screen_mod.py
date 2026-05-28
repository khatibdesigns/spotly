# Spotly — AI place screening (runs on EC2, imported by caption-proxy/server.py).
#
# Given a batch of Google Places candidates, asks Claude (via the subscription
# CLI — no API tokens) whether each is a genuine KID/FAMILY outing place, writes
# each verdict to Firestore `screenedPlaces/{placeId}` (so it's screened once,
# then cached forever), and returns the verdicts to the caller.
#
# Deployed to /home/ec2-user/caption-proxy/screen_mod.py
import os
import re
import json
import subprocess
import threading

CLAUDE_BIN = os.environ.get("CLAUDE_BIN", "/home/ec2-user/.nvm/versions/node/v22.22.2/bin/claude")
# Default model. Haiku is fast enough for the app's live ~60-place batch (Sonnet
# ~38s/20 places => ~120s/60 which times out the client). The strong gatekeeper
# prompt does the heavy lifting on accuracy. The offline bulk-sweep can pass
# model="sonnet" per request for extra thoroughness where speed doesn't matter.
SCREEN_MODEL = os.environ.get("SCREEN_MODEL", "haiku")
SCREEN_TIMEOUT = int(os.environ.get("SCREEN_TIMEOUT", "120"))
SA_PATH = os.environ.get("SPOTLY_SA", "/home/ec2-user/caption-proxy/spotly-sa.json")

_db = None
_db_lock = threading.Lock()


def _get_db():
    global _db
    if _db is not None:
        return _db
    with _db_lock:
        if _db is None:
            try:
                import firebase_admin
                from firebase_admin import credentials, firestore
                if not firebase_admin._apps:
                    firebase_admin.initialize_app(credentials.Certificate(SA_PATH))
                _db = firestore.client()
            except Exception as e:
                print("screen: firestore init failed:", e)
    return _db


RUBRIC = """You are the Ultimate Quality Gatekeeper for "Spotly" — a curated app that helps families find places to take their CHILDREN (toddlers to ~12 years old) OUT for the day. Your job is to screen raw Google Places data and decide if each venue TRULY fits the theme.

Google data is notoriously noisy: it calls graveyards "parks", baqalas/grocery shops "stores", gas-station counters "restaurants". You must look PAST the generic tags and analyze the NAME (and types, rating, REVIEW COUNT, price) to make an intelligent, human-like decision. The NAME is the strongest signal; the REVIEW COUNT is your reality check (a real public attraction has many reviews; a mislabel has almost none).

### WHAT PASSES (keep=true) — genuine kid/family OUTING destinations
Parks & public gardens (for recreation/play), playgrounds, amusement & theme parks, water parks, zoos, aquariums, wildlife parks, museums and science / discovery / children's centers, planetariums, kids entertainment & indoor soft-play centers, arcades, bowling alleys, ice / roller skating rinks, trampoline parks, REAL sit-down family restaurants (especially with a kids play area or kids menu), ice-cream & dessert parlours, and kid-focused shops (toy stores, kids' book stores). Family-oriented experiential attractions.

### WHAT FAILS (keep=false) — NOT a kids outing
- Baqalas, grocery / convenience stores, supermarkets, mini-marts.
- Cafes, coffee shops, shisha / hookah lounges, bars, pubs, night clubs, lounges, any adult venue.
- Gas stations and their food counters; grab-and-go / takeaway-only fast-food counters.
- Laundries, salons / spas / barbers, clinics / pharmacies / hospitals, gyms / fitness studios.
- Offices, banks, car services / garages, phone / electronics / generic retail.
- Government buildings, mosques / religious or community halls, wedding / banquet halls, hotels / lodging.
- Cemeteries, roundabouts, parking lots, transit/utility points, vacant lots.

### RULES
1. BE SKEPTICAL — never trust Google's category alone; READ THE NAME. A name containing words like Baqala, Grocery, Market, Laundry, Clinic, Pharmacy, Salon, Barber, Gas, Petrol, Café/Coffee, Shisha/Hookah, Lounge, Garage, Mosque, Co-op/Jam'iya is almost never a kids outing → FAIL.
2. GRAVEYARD TEST — a "green space" that is a cemetery, roundabout, median, or utility area is a FAIL.
3. BAQALA / SANDWICH TEST — groceries, baqalas, convenience stores, gas-station counters, and grab-and-go joints are a FAIL even if Google tags them restaurant/store.
4. MISLABEL / VANITY TEST — locals sometimes register a private or trivial spot under an impressive category (e.g. one old tree, a family's house or farm, or a vacant plot tagged "historical_landmark" / "tourist_attraction" / "monument"). Use the REVIEW COUNT as the reality check: a grand category with very few or zero reviews AND an odd, personal, or generic name is almost certainly a mislabel → FAIL. (Do NOT punish genuinely small kid venues — a new play area, arcade, café-free family restaurant — just for low reviews; judge those on name + type.)
5. READ ARABIC — names are often Arabic or transliterated. Judge by MEANING, not script: حديقة = park/garden, مقبرة = cemetery (FAIL), جمعية = co-op/grocery (FAIL), ديوانية = men's hall (FAIL), مسجد = mosque (FAIL), بقالة = baqala (FAIL), ملاهي = funfair (PASS), مطعم = restaurant.
6. WHEN IN DOUBT, REJECT — a small, 100% accurate database beats a populated one full of junk.

### CATEGORY (for passes only) — choose the single best:
park, funPark, playArea, animals, water, museum, eatPlay, dining, shop, other

### INPUT
A list of places, each line: id | name | primaryType | types | rating | reviews | price | address

### OUTPUT — STRICT JSON ONLY, no prose, no markdown fences. Include EVERY input id exactly once:
{"results":[{"id":"<id>","keep":true,"category":"park","reason":"<one short sentence>"}]}"""


def run_screen(places, model=None):
    """places: [{id, name, primaryType, category, address}] -> [{id, keep, category}]"""
    use_model = model or SCREEN_MODEL
    items = [p for p in places if p.get("id")]
    if not items:
        return []
    def _types(p):
        t = p.get("types")
        if isinstance(t, list):
            return ",".join(t)
        return t or p.get("category", "")
    listing = "\n".join(
        "%s | %s | %s | %s | %s | %s | %s | %s"
        % (p.get("id", ""), p.get("name", ""), p.get("primaryType", ""), _types(p),
           p.get("rating", ""), p.get("reviews", ""), p.get("price", ""), p.get("address", ""))
        for p in items
    )
    prompt = RUBRIC + "\n\nPLACES:\n" + listing
    env = dict(os.environ)
    env["HOME"] = "/home/ec2-user"
    env.pop("ANTHROPIC_API_KEY", None)  # force subscription auth (no token cost)
    proc = subprocess.run(
        [CLAUDE_BIN, "-p", prompt, "--model", use_model, "--output-format", "text"],
        capture_output=True, text=True, timeout=SCREEN_TIMEOUT, env=env,
        cwd="/home/ec2-user/caption-proxy",
    )
    if proc.returncode != 0:
        raise RuntimeError((proc.stderr or "claude CLI failed").strip()[:300])
    text = (proc.stdout or "").strip()
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        text = m.group(0)
    data = json.loads(text)
    results = data.get("results", []) if isinstance(data, dict) else []
    # Persist verdicts (screened once, cached forever).
    db = _get_db()
    if db is not None and results:
        try:
            from firebase_admin import firestore as _fs
            batch = db.batch()
            for r in results:
                rid = r.get("id")
                if not rid:
                    continue
                batch.set(
                    db.collection("screenedPlaces").document(rid),
                    {
                        "keep": bool(r.get("keep")),
                        "category": r.get("category") or "other",
                        "screenedAt": _fs.SERVER_TIMESTAMP,
                        "model": use_model,
                    },
                    merge=True,
                )
            batch.commit()
        except Exception as e:
            print("screen: firestore write failed:", e)
    return results

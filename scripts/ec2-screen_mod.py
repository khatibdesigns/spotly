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
# Screening is a simple classification — Haiku is fast + plenty good here
# (unlike the planner, which the user wants on Sonnet/Opus for quality).
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


RUBRIC = """You screen places for Spotly, an app that helps families find KID-FRIENDLY places to take their children (toddlers to about 12 years old) out for the day.

KEEP (keep=true) — genuine kid / family outing destinations:
parks, gardens, playgrounds, amusement & theme parks, water parks, zoos, aquariums, wildlife parks, museums and science / discovery / children's centers, planetariums, kids entertainment & indoor soft-play centers, arcades, bowling, ice or roller skating rinks, trampoline parks, family restaurants (especially with a kids play area or kids menu), ice-cream & dessert shops, kid-focused shops (toy or book stores), and clearly family-oriented attractions.

DROP (keep=false) — NOT a kid/family outing:
cafes, coffee shops, shisha / hookah lounges, bars, pubs, night clubs, adult venues, gyms / fitness studios, spas / salons, clinics / pharmacies, offices, banks, car services / garages, generic grocery / retail / electronics, government buildings, mosques / religious or community halls, wedding / banquet halls, hotels / lodging.

For each place pick the best category from: park, funPark, playArea, animals, water, museum, eatPlay, dining, shop, other.

Return STRICT JSON ONLY — no prose, no markdown fences:
{"results":[{"id":"<id>","keep":true,"category":"park"}]}"""


def run_screen(places):
    """places: [{id, name, primaryType, category, address}] -> [{id, keep, category}]"""
    items = [p for p in places if p.get("id")]
    if not items:
        return []
    listing = "\n".join(
        "- id=%s | name=%s | type=%s | cat=%s | %s"
        % (p.get("id", ""), p.get("name", ""), p.get("primaryType", ""), p.get("category", ""), p.get("address", ""))
        for p in items
    )
    prompt = RUBRIC + "\n\nPLACES:\n" + listing
    env = dict(os.environ)
    env["HOME"] = "/home/ec2-user"
    env.pop("ANTHROPIC_API_KEY", None)  # force subscription auth (no token cost)
    proc = subprocess.run(
        [CLAUDE_BIN, "-p", prompt, "--model", SCREEN_MODEL, "--output-format", "text"],
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
                        "model": SCREEN_MODEL,
                    },
                    merge=True,
                )
            batch.commit()
        except Exception as e:
            print("screen: firestore write failed:", e)
    return results

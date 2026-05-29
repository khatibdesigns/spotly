#!/usr/bin/env python3
# Spotly — targeted re-screen of CURRENTLY-KEPT places.
#
# Re-judges every `screenedPlaces` doc with keep==true using the IMPROVED
# gatekeeper (review-count reality check + Arabic mislabel rules) and DROPS
# places that have no Google photo. Fixes false-positives that slipped through
# the first sweep (judged by the older, no-review prompt) and removes ugly
# photo-less cards — WITHOUT paying for a full re-collection (only the ~kept set
# is re-fetched, via Place Details, which also carries photo presence).
#
# ToS-safe: still only place_id + OUR verdict are stored; Google content is
# fetched transiently to make the verdict and discarded.
#
#   cd /home/ec2-user/caption-proxy
#   GOOGLE_MAPS_API_KEY=AIza... python3 rescreen_kept.py             # full pass
#   GOOGLE_MAPS_API_KEY=AIza... python3 rescreen_kept.py --limit 40  # sample
#   GOOGLE_MAPS_API_KEY=AIza... DRY=1 python3 rescreen_kept.py       # fetch+count, no writes
#   KEEP_NO_PHOTO=1 ...                                              # keep photo-less places
import os
import sys
import json
import time
import subprocess
import urllib.request
import urllib.error

import screen_mod  # run_screen() (improved prompt) + _get_db()

KEY = os.environ.get("GOOGLE_MAPS_API_KEY") or os.environ.get("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY")
MODEL = os.environ.get("RESCREEN_MODEL", "sonnet")
BATCH = int(os.environ.get("RESCREEN_BATCH", "25"))
DROP_NO_PHOTO = os.environ.get("KEEP_NO_PHOTO") != "1"
DRY = os.environ.get("DRY") == "1"
TARGET = os.environ.get("TG_TARGET", "8851553014")
OPENCLAW = os.path.expanduser("~/.nvm/versions/node/v22.22.2/bin/openclaw")

# Place Details (New) — Enterprise tier (rating + userRatingCount). photos field
# tells us whether the place has any image to show.
FIELDS = "id,displayName,primaryType,types,rating,userRatingCount,photos,formattedAddress"

PRICE = {
    "PRICE_LEVEL_FREE": "Free", "PRICE_LEVEL_INEXPENSIVE": "$",
    "PRICE_LEVEL_MODERATE": "$$", "PRICE_LEVEL_EXPENSIVE": "$$$",
    "PRICE_LEVEL_VERY_EXPENSIVE": "$$$$",
}


def details(pid):
    req = urllib.request.Request(
        "https://places.googleapis.com/v1/places/" + pid,
        headers={"X-Goog-Api-Key": KEY, "X-Goog-FieldMask": FIELDS},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"_err": e.code}
    except Exception as e:
        return {"_err": str(e)}


def tg(msg):
    try:
        subprocess.run([OPENCLAW, "message", "send", "--channel", "telegram",
                        "--target", TARGET, "--message", msg], timeout=60)
    except Exception as e:
        print("telegram send failed:", e)


def main():
    if not KEY:
        print("ERROR: set GOOGLE_MAPS_API_KEY."); sys.exit(1)
    db = screen_mod._get_db()
    if db is None:
        print("ERROR: Firestore unavailable."); sys.exit(1)

    kept = [d.id for d in db.collection("screenedPlaces").stream() if d.to_dict().get("keep")]
    if "--limit" in sys.argv:
        kept = kept[:int(sys.argv[sys.argv.index("--limit") + 1])]
    print("Currently-kept docs to re-check:", len(kept))
    print("Estimated Google spend: ~$%.2f (%d Place Details @ ~$0.02)" % (len(kept) * 0.02, len(kept)))

    rows = []      # has-photo -> re-screen
    no_photo = []  # no photo -> drop
    gone = []      # deleted/unavailable -> drop
    for i, pid in enumerate(kept, 1):
        p = details(pid)
        if p.get("_err"):
            gone.append(pid)
            continue
        photos = p.get("photos") or []
        row = {
            "id": pid,
            "name": (p.get("displayName") or {}).get("text", ""),
            "primaryType": p.get("primaryType", ""),
            "types": p.get("types", []),
            "rating": p.get("rating", ""),
            "reviews": p.get("userRatingCount", ""),
            "price": PRICE.get(p.get("priceLevel", ""), ""),
            "address": p.get("formattedAddress", ""),
        }
        if DROP_NO_PHOTO and not photos:
            no_photo.append(row)
        else:
            rows.append(row)
        if i % 50 == 0:
            print("  fetched %d/%d" % (i, len(kept)))

    print("has-photo to re-screen: %d | no-photo to drop: %d | gone/deleted: %d"
          % (len(rows), len(no_photo), len(gone)))

    if DRY:
        print("DRY — no writes."); return

    from firebase_admin import firestore as _fs

    def write_drop(items, reason, is_nophoto):
        b = db.batch(); n = 0
        for x in items:
            pid = x["id"] if isinstance(x, dict) else x
            b.set(db.collection("screenedPlaces").document(pid),
                  {"keep": False, "category": "other", "reason": reason, "noPhoto": is_nophoto,
                   "rescreenedAt": _fs.SERVER_TIMESTAMP, "model": MODEL}, merge=True)
            n += 1
            if n % 400 == 0:
                b.commit(); b = db.batch()
        b.commit()

    if no_photo:
        write_drop(no_photo, "no photo", True)
    if gone:
        write_drop(gone, "unavailable", False)

    kept_now = 0; flipped = 0
    for i in range(0, len(rows), BATCH):
        batch = rows[i:i + BATCH]
        t0 = time.time()
        try:
            res = screen_mod.run_screen(batch, model=MODEL)
        except Exception as e:
            print("  ! batch %d failed: %s" % (i, e)); continue
        for r in res:
            if r.get("keep"):
                kept_now += 1
            else:
                flipped += 1
        print("re-screened %d/%d (%.0fs)" % (min(i + BATCH, len(rows)), len(rows), time.time() - t0))

    summary = ("✅ Spotly re-pass done. Of %d previously-kept Kuwait places:\n"
               "• dropped (no photo): %d\n"
               "• dropped (unavailable): %d\n"
               "• re-screened %d → kept %d, newly-dropped %d\n"
               "Net kept now ≈ %d — tighter + photo-backed."
               % (len(kept), len(no_photo), len(gone), len(rows), kept_now, flipped, kept_now))
    print("\n" + summary)
    tg(summary)


if __name__ == "__main__":
    main()

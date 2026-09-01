#!/usr/bin/env python3
# Spotly — daily birthday push worker (runs on EC2 via cron).
#
# Scans families/*/kids[].dob, finds children whose birthday (MM-DD) is "today"
# in Kuwait time (UTC+3), and pushes a celebratory FCM notification to that
# family's devices. Idempotent per day via families/{id}.lastBirthdayPush.
#
# Requires the SPOTLY (spotly-6ca9a) service account + firebase-admin.
#   export SPOTLY_SA=/home/ec2-user/caption-proxy/spotly-sa.json
# Cron (06:00 Kuwait = 03:00 UTC):
#   0 3 * * * SPOTLY_SA=/home/ec2-user/caption-proxy/spotly-sa.json /usr/bin/python3 \
#     /home/ec2-user/caption-proxy/ec2-birthday-worker.py >> /home/ec2-user/caption-proxy/birthday.log 2>&1
#
# Env knobs:
#   DRY=1               -> compute + log only; never send or write markers
#   BDAY_TODAY=MM-DD    -> force "today" (for testing the match logic)
#   BDAY_TZ_OFFSET=3    -> hours to add to UTC for the local date (Kuwait=3)
import os
import sys
from datetime import datetime, timedelta
import firebase_admin
from firebase_admin import credentials, firestore, messaging

SA_PATH = os.environ.get("SPOTLY_SA", "/home/ec2-user/caption-proxy/spotly-sa.json")
DRY = os.environ.get("DRY") == "1"
TZ_OFFSET_HOURS = int(os.environ.get("BDAY_TZ_OFFSET", "3"))  # Kuwait = UTC+3


def init():
    if not firebase_admin._apps:
        firebase_admin.initialize_app(credentials.Certificate(SA_PATH))
    return firestore.client()


def tokens_for_family(db, family_id):
    toks = []
    for u in db.collection("users").where("familyId", "==", family_id).stream():
        t = (u.to_dict() or {}).get("fcmToken")
        if t:
            toks.append(t)
    return list({t for t in toks if t})


def send(title, body, tokens, data):
    if not tokens:
        return 0
    sent = 0
    for i in range(0, len(tokens), 500):
        chunk = tokens[i:i + 500]
        msg = messaging.MulticastMessage(
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in data.items()},
            android=messaging.AndroidConfig(priority="high"),
            apns=messaging.APNSConfig(payload=messaging.APNSPayload(aps=messaging.Aps(sound="default"))),
            tokens=chunk,
        )
        resp = messaging.send_each_for_multicast(msg)
        sent += resp.success_count
    return sent


def main():
    db = init()
    now_local = datetime.utcnow() + timedelta(hours=TZ_OFFSET_HOURS)
    today = now_local.strftime("%Y-%m-%d")
    md = os.environ.get("BDAY_TODAY") or today[5:10]  # MM-DD
    print(f"[birthday] run for {today} (md={md}) dry={DRY}", flush=True)

    scanned = 0
    matched = 0
    pushed = 0
    for fam in db.collection("families").stream():
        scanned += 1
        d = fam.to_dict() or {}
        if d.get("lastBirthdayPush") == today:
            continue
        names = []
        for k in (d.get("kids") or []):
            dob = k.get("dob") or ""
            if len(dob) >= 10 and dob[5:10] == md:
                names.append((k.get("name") or "").strip() or "your little one")
        if not names:
            continue
        matched += 1
        who = names[0] if len(names) == 1 else " & ".join(names)
        title = f"\U0001F382 Happy birthday, {who}!"
        body = "Make today special — find birthday-friendly places near you on Spotly."
        toks = tokens_for_family(db, fam.id)
        print(f"[birthday] family {fam.id}: {who} -> {len(toks)} device(s)", flush=True)
        if DRY:
            continue
        try:
            pushed += send(title, body, toks, {"type": "birthday", "familyId": fam.id})
        except Exception as e:
            print(f"[birthday] send failed for {fam.id}: {str(e)[:160]}", flush=True)
        # Mark handled for today so a re-run won't double-send.
        try:
            fam.reference.update({"lastBirthdayPush": today})
        except Exception as e:
            print(f"[birthday] marker update failed for {fam.id}: {str(e)[:160]}", flush=True)

    print(f"[birthday] done: scanned {scanned} families, {matched} birthday(s), {pushed} push(es) sent", flush=True)


if __name__ == "__main__":
    main()

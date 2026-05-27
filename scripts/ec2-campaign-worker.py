#!/usr/bin/env python3
# Spotly — campaign push worker (runs on EC2).
#
# Watches the Firestore `campaigns` collection for docs with status == "queued"
# and sends them as FCM push notifications to the chosen audience, then marks
# them "sent". Targeting:
#   audience == "all"    -> the "all" topic (every device that registered)
#   audience == "city"   -> families whose homeCity == targetCity
#   audience == "family" -> the family of the user with targetEmail
#
# Requires the SPOTLY (spotly-6ca9a) service-account JSON — NOT another project.
#   pip3 install firebase-admin
#   export SPOTLY_SA=/home/ec2-user/caption-proxy/spotly-sa.json
# Run once via cron (every minute) or as a loop:
#   * * * * * SPOTLY_SA=/home/ec2-user/caption-proxy/spotly-sa.json /usr/bin/python3 /home/ec2-user/caption-proxy/ec2-campaign-worker.py >> /home/ec2-user/caption-proxy/campaign.log 2>&1
import os
import sys
import firebase_admin
from firebase_admin import credentials, firestore, messaging, auth

SA_PATH = os.environ.get("SPOTLY_SA", "/home/ec2-user/caption-proxy/spotly-sa.json")

def init():
    cred = credentials.Certificate(SA_PATH)
    firebase_admin.initialize_app(cred)
    return firestore.client()

def tokens_for_family(db, family_id):
    toks = []
    for u in db.collection("users").where("familyId", "==", family_id).stream():
        t = (u.to_dict() or {}).get("fcmToken")
        if t:
            toks.append(t)
    return toks

def tokens_for_city(db, city):
    fam_ids = [f.id for f in db.collection("families").where("homeCity", "==", city).stream()]
    toks = []
    for fid in fam_ids:
        toks += tokens_for_family(db, fid)
    return toks

def send_to_tokens(title, body, tokens):
    tokens = list({t for t in tokens if t})
    if not tokens:
        return 0
    sent = 0
    # FCM multicast caps at 500 tokens per call.
    for i in range(0, len(tokens), 500):
        chunk = tokens[i:i + 500]
        msg = messaging.MulticastMessage(
            notification=messaging.Notification(title=title, body=body),
            tokens=chunk,
        )
        resp = messaging.send_each_for_multicast(msg)
        sent += resp.success_count
    return sent

def process(db):
    q = db.collection("campaigns").where("status", "==", "queued").stream()
    for doc in q:
        c = doc.to_dict() or {}
        title = c.get("title") or "Spotly"
        body = c.get("message") or ""
        audience = c.get("audience") or "all"
        try:
            if audience == "all":
                messaging.send(messaging.Message(
                    notification=messaging.Notification(title=title, body=body),
                    topic="all",
                ))
                count = -1  # topic send: recipient count unknown
            elif audience == "city" and c.get("targetCity"):
                count = send_to_tokens(title, body, tokens_for_city(db, c["targetCity"]))
            elif audience == "family" and c.get("targetEmail"):
                uid = auth.get_user_by_email(c["targetEmail"]).uid
                u = db.collection("users").document(uid).get()
                fid = (u.to_dict() or {}).get("familyId", uid) if u.exists else uid
                count = send_to_tokens(title, body, tokens_for_family(db, fid))
            else:
                count = 0
            doc.reference.update({"status": "sent", "sentAt": firestore.SERVER_TIMESTAMP, "sentCount": count})
            print(f"sent campaign {doc.id} ({audience}) -> {count}")
        except Exception as e:
            doc.reference.update({"status": "error", "error": str(e)})
            print(f"campaign {doc.id} failed: {e}", file=sys.stderr)

if __name__ == "__main__":
    process(init())

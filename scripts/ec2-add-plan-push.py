# One-shot, idempotent patch for caption-proxy/server.py:
# When an async AI-planner job finishes, push an FCM notification to the device
# that started it, so the user is told even if the app is fully closed by then
# (the in-app local notification only fires while the app is alive).
#
# It does four targeted edits:
#   1. inject _ensure_fcm() + _send_plan_push() helpers (firebase-admin)
#   2. _start_plan_job(prompt) -> _start_plan_job(prompt, fcm_token=None)
#   3. call _send_plan_push(...) inside the worker once the result is stored
#   4. /plan/start reads "fcmToken" from the body and forwards it
#
# Safe to run repeatedly: each edit no-ops if already applied, and a required
# anchor that is missing (and not already patched) aborts loudly without writing.
p = "server.py"
s = open(p).read()
orig = s

HELPER = '''# ── AI-planner push: notify the device when an async plan job finishes, even if
# the app is fully closed by then (its local notification only fires while it's
# alive). Uses the SPOTLY service account; no-ops cleanly if firebase-admin or
# the credentials aren't available, so the proxy never breaks on this path.
_FCM_READY = None  # None = untried, True = ready, False = unavailable
_FCM_LOCK = threading.Lock()


def _ensure_fcm():
    global _FCM_READY
    with _FCM_LOCK:
        if _FCM_READY is not None:
            return _FCM_READY
        try:
            import firebase_admin
            from firebase_admin import credentials
            sa = os.environ.get("SPOTLY_SA", "/home/ec2-user/caption-proxy/spotly-sa.json")
            if not firebase_admin._apps:
                firebase_admin.initialize_app(credentials.Certificate(sa))
            _FCM_READY = True
        except Exception as e:
            print("[plan-push] firebase init failed:", str(e)[:200], flush=True)
            _FCM_READY = False
        return _FCM_READY


def _send_plan_push(fcm_token, jid, res):
    if not fcm_token:
        return
    if not _ensure_fcm():
        return
    try:
        from firebase_admin import messaging
        ok = res.get("status") == "done"
        title = "Your trip plan is ready \\u2728" if ok else "Couldn\\u2019t build your plan"
        body = "Tap to view your itinerary." if ok else (res.get("error") or "Tap to try again.")
        msg = messaging.Message(
            token=fcm_token,
            notification=messaging.Notification(title=title, body=body),
            data={"type": "aiPlan", "jobId": str(jid), "status": str(res.get("status", ""))},
            android=messaging.AndroidConfig(priority="high"),
            apns=messaging.APNSConfig(payload=messaging.APNSPayload(aps=messaging.Aps(sound="default"))),
        )
        messaging.send(msg)
        print("[plan-push] sent for job", jid, "ok=", ok, flush=True)
    except Exception as e:
        print("[plan-push] send failed:", str(e)[:200], flush=True)


'''

# 1) Inject the helpers immediately before the job-launcher definition.
if "def _send_plan_push(" not in s:
    anchor = "def _start_plan_job(prompt"
    if anchor not in s:
        raise SystemExit("ERROR: _start_plan_job definition not found")
    s = s.replace(anchor, HELPER + anchor, 1)

# 2) Widen the signature to accept an optional fcm token.
if "def _start_plan_job(prompt, fcm_token=None):" not in s:
    if "def _start_plan_job(prompt):" not in s:
        raise SystemExit("ERROR: _start_plan_job(prompt): signature not found")
    s = s.replace("def _start_plan_job(prompt):", "def _start_plan_job(prompt, fcm_token=None):", 1)

# 3) Fire the push once the worker stores its result. Guard on the call IN its
# worker context (the helper definition above also contains the bare call text,
# so we must match the indented call that follows the result store).
if "            _JOBS[jid] = res\n        _send_plan_push(fcm_token, jid, res)" not in s:
    work_anchor = (
        "        with _JOBS_LOCK:\n"
        "            _JOBS[jid] = res\n"
        "\n"
        "    threading.Thread(target=_work, daemon=True).start()"
    )
    if work_anchor not in s:
        raise SystemExit("ERROR: worker result-store anchor not found")
    s = s.replace(
        work_anchor,
        "        with _JOBS_LOCK:\n"
        "            _JOBS[jid] = res\n"
        "        _send_plan_push(fcm_token, jid, res)\n"
        "\n"
        "    threading.Thread(target=_work, daemon=True).start()",
        1,
    )

# 4) Forward the device token from the /plan/start request body.
old_start = 'self._send(200, {"jobId": _start_plan_job(prompt)})'
new_start = 'self._send(200, {"jobId": _start_plan_job(prompt, (payload.get("fcmToken") or "").strip() or None)})'
if new_start not in s:
    if old_start not in s:
        raise SystemExit("ERROR: /plan/start dispatch line not found")
    s = s.replace(old_start, new_start, 1)

open(p, "w").write(s)
print("helper:", "def _send_plan_push(" in s,
      "| sig:", "fcm_token=None" in s,
      "| worker-call:", "_send_plan_push(fcm_token, jid, res)" in s,
      "| start-fwd:", new_start in s,
      "| delta bytes:", len(s) - len(orig))

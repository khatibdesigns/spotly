#!/usr/bin/env bash
# Ping IndexNow → Bing/Yandex/Naver/Seznam/Yep (NOT Google) to recrawl URLs.
# Re-run after publishing or updating pages:  bash tools/indexnow-submit.sh
set -euo pipefail
KEY="49f1aa41247bd495b828e4f846c13333"
HOST="meetspotly.com"
python3 - "$KEY" "$HOST" <<'PY'
import sys,json,re,urllib.request
key,host=sys.argv[1],sys.argv[2]
sm=open("sitemap.xml",encoding="utf-8").read()
urls=re.findall(r"<loc>([^<]+)</loc>",sm)
body=json.dumps({"host":host,"key":key,
  "keyLocation":f"https://{host}/{key}.txt","urlList":urls}).encode()
req=urllib.request.Request("https://api.indexnow.org/indexnow",data=body,
  headers={"Content-Type":"application/json; charset=utf-8"},method="POST")
try:
    r=urllib.request.urlopen(req,timeout=30)
    print(f"IndexNow: HTTP {r.status} — submitted {len(urls)} URLs")
except urllib.error.HTTPError as e:
    print(f"IndexNow: HTTP {e.code} — {e.read().decode()[:200]} ({len(urls)} URLs)")
PY

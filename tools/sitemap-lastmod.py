#!/usr/bin/env python3
"""Set every <lastmod> in sitemap.xml to that page's last git commit date.

The sitemap is hand-maintained, so lastmods froze at 2026-07-03 even for pages
edited later. Google reads lastmod as a recrawl hint, and the kwnas
spotly-indexing job only pings IndexNow for URLs whose lastmod changed — so a
stale value means edits are never re-submitted anywhere.

Run after committing page edits, then commit the sitemap:
    python3 tools/sitemap-lastmod.py && git add sitemap.xml
"""
from __future__ import annotations
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITEMAP = ROOT / "sitemap.xml"
HOST = "https://meetspotly.com"


def file_for(url: str) -> Path:
    path = url[len(HOST):].lstrip("/") if url.startswith(HOST) else url
    if path == "" or path.endswith("/"):
        path += "index.html"
    return ROOT / path


def last_commit_date(f: Path) -> str | None:
    out = subprocess.run(["git", "log", "-1", "--format=%cs", "--", str(f)],
                         cwd=ROOT, capture_output=True, text=True).stdout.strip()
    return out or None


def main() -> None:
    xml = SITEMAP.read_text(encoding="utf-8")
    changed = 0

    def fix(m: re.Match) -> str:
        nonlocal changed
        loc, old = m.group(1), m.group(2)
        f = file_for(loc)
        if not f.exists():
            print(f"  ! no file for {loc} — left as {old}")
            return m.group(0)
        new = last_commit_date(f) or old
        if new != old:
            changed += 1
        return m.group(0).replace(f"<lastmod>{old}</lastmod>", f"<lastmod>{new}</lastmod>")

    xml = re.sub(r"<loc>([^<]+)</loc><lastmod>([^<]+)</lastmod>", fix, xml)
    SITEMAP.write_text(xml, encoding="utf-8")
    print(f"sitemap.xml: {changed} lastmod value(s) updated")


if __name__ == "__main__":
    main()

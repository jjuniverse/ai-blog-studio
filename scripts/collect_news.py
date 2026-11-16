#!/usr/bin/env python3
"""Collect public RSS headlines (not article content) for a static GitHub Pages dashboard.
No paywall bypass, scraping of article bodies, or publishing copyrighted images.
"""
import json
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

FEEDS = [
    ("AI·생산성", "EN", "AI productivity software when:3d", "en-US", "US"),
    ("K-pop", "EN", "K-pop comeback official announcement when:3d", "en-US", "US"),
    ("연예", "KO", "드라마 예능 공식 발표 when:3d", "ko", "KR"),
    ("IT·AI", "KO", "AI 생산성 도구 출시 when:3d", "ko", "KR"),
]
OUT = Path("public/data/news.json")


def fetch(category, region, query, hl, gl):
    params = urllib.parse.urlencode({"q": query, "hl": hl, "gl": gl, "ceid": f"{gl}:{hl.split('-')[0]}"})
    url = "https://news.google.com/rss/search?" + params
    req = urllib.request.Request(url, headers={"User-Agent": "AI-Blog-Studio/0.3 (+RSS headline aggregator)"})
    with urllib.request.urlopen(req, timeout=18) as response:
        raw = response.read(1_500_000)
    root = ET.fromstring(raw)
    for item in root.findall("./channel/item")[:12]:
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        publisher = (item.findtext("source") or "").strip()
        published = (item.findtext("pubDate") or "").strip()
        if not title or not link.startswith("https://"):
            continue
        try:
            published_at = parsedate_to_datetime(published).astimezone(timezone.utc).isoformat()
        except (TypeError, ValueError):
            published_at = None
        yield {"title": title[:240], "url": link, "publisher": publisher,
               "publishedAt": published_at, "category": category, "region": region}


def main():
    items = []
    errors = []
    seen = set()
    for cat, region, query, hl, gl in FEEDS:
        try:
            for row in fetch(cat, region, query, hl, gl):
                key = (row["title"].lower(), row["region"])
                if key not in seen:
                    items.append(row)
                    seen.add(key)
        except Exception as exc:
            errors.append(f"{cat}/{region}: {type(exc).__name__}: {exc}")
    if not items:
        raise RuntimeError("No RSS headlines collected. Keeping existing data unchanged. " + "; ".join(errors))
    doc = {"fetchedAt": datetime.now(timezone.utc).isoformat(), "source": "Google News RSS search",
           "note": "Headlines are unverified pointers. Please verify facts and media rights before content creation.",
           "items": items, "errors": errors}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Collected {len(items)} headlines; failed feeds: {len(errors)}")


if __name__ == "__main__":
    main()

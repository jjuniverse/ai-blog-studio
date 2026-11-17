#!/usr/bin/env python3
"""Discover public news headlines for Today Pick, without scraping article bodies.

News RSS is an idea feed, NOT evidence of correctness or commercial rights.
The output is deliberately limited, diversified and deduplicated.
"""
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

FEEDS = [
    # Domestic news and practical guides
    ("연예", "KO", "드라마 OTT 공개일 출연진 공식 발표 when:3d", "ko", "KR"),
    ("연예", "KO", "예능 방송 편성 출연 공식 발표 when:3d", "ko", "KR"),
    ("K-pop", "KO", "아이돌 컴백 콘서트 티켓 예매 공식 발표 when:3d", "ko", "KR"),
    ("IT·AI", "KO", "AI 신기능 출시 공식 업데이트 생산성 when:3d", "ko", "KR"),
    ("IT·AI", "KO", "AI 업무 자동화 사용법 활용 가이드 when:7d", "ko", "KR"),
    ("생활 정보", "KO", "생활 서비스 신청 방법 공식 안내 when:7d", "ko", "KR"),
    # Overseas channels
    ("K-pop", "EN", "K-pop comeback album concert official announcement when:3d", "en-US", "US"),
    ("K-드라마", "EN", "Korean drama streaming premiere Netflix Disney official when:3d", "en-US", "US"),
    ("AI·생산성", "EN", "AI productivity tools new features official release when:3d", "en-US", "US"),
    ("AI·생산성", "EN", "AI workflow software how to comparison when:7d", "en-US", "US"),
]
MAX_ITEMS_PER_FEED = 16
MAX_ITEMS_PER_CATEGORY = 28
MAX_DAYS_OLD = 7

KPOP_TERMS = re.compile(r"\bk[ -]?pop\b|\bbts\b|\bblackpink\b|\btwice\b|\bnayeon\b|\btxt\b|\b2ne1\b|\bampers?\s*(?:and|&)?\s*one\b|\baespa\b|\bstray\s+kids\b|\bseventeen\b|\bidol\b|\bcomeback\b", re.I)
KDRAMA_TERMS = re.compile(r"k[ -]?drama|korean\s+drama|korean\s+series|good\s+partner|crash\s+season|blue\s+road", re.I)
OUTPUT = Path("public/data/news.json")
PROMOTION = re.compile(
    r"\b(?:promo(?:tional)?|discount|coupon|referral)\s+codes?\b|"
    r"\bsponsored\s+(?:post|content)\b|\blifetime\s+access\b|\bpay\s+\$\d+\b|"
    r"할인\s*코드|쿠폰\s*코드|프로모션\s*코드|추천인\s*코드",
    re.IGNORECASE,
)
NOISE = re.compile(r"\s+[-–|]\s+[^–|]{2,80}$")


def normalized_title(title):
    text = NOISE.sub("", title).lower()
    text = re.sub(r"[\W_]+", " ", text, flags=re.UNICODE)
    return " ".join(text.split())


def fetch(category, region, query, hl, gl):
    params = urllib.parse.urlencode({
        "q": query, "hl": hl, "gl": gl, "ceid": f"{gl}:{hl.split('-')[0]}"
    })
    url = "https://news.google.com/rss/search?" + params
    request = urllib.request.Request(url, headers={
        "User-Agent": "TodayPick-News-Collector/0.5"
    })
    with urllib.request.urlopen(request, timeout=20) as response:
        raw = response.read(2_000_000)
    root = ET.fromstring(raw)
    if root.tag != "rss":
        raise ValueError("Unexpected RSS payload")
    for item in root.findall("./channel/item")[:MAX_ITEMS_PER_FEED]:
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        publisher = (item.findtext("source") or "").strip()
        date_str = (item.findtext("pubDate") or "").strip()
        if not title or not publisher or not link.startswith("https://"):
            continue
        try:
            published = parsedate_to_datetime(date_str).astimezone(timezone.utc)
        except (TypeError, ValueError):
            continue
        if published < datetime.now(timezone.utc) - timedelta(days=MAX_DAYS_OLD):
            continue
        if PROMOTION.search(title):
            continue
        if region == 'EN' and category == 'K-pop' and not KPOP_TERMS.search(title):
            continue
        if region == 'EN' and category == 'K-드라마' and not KDRAMA_TERMS.search(title):
            continue
        yield {
            "title": title[:240],
            "url": link,
            "publisher": publisher[:120],
            "publishedAt": published.isoformat(),
            "category": category,
            "region": region,
        }


def main():
    collected = []
    failures = []
    counters = {}
    duplicates = set()
    for category, region, query, hl, gl in FEEDS:
        key = (category, region)
        counters.setdefault(key, 0)
        try:
            for row in fetch(category, region, query, hl, gl):
                identity = (region, normalized_title(row["title"]))
                if identity in duplicates or counters[key] >= MAX_ITEMS_PER_CATEGORY:
                    continue
                duplicates.add(identity)
                collected.append(row)
                counters[key] += 1
        except (OSError, ET.ParseError, ValueError) as exc:
            failures.append(f"{category}/{region}: {type(exc).__name__}: {exc}")
    if not collected:
        raise RuntimeError("No valid feeds were retrieved; old data preserved. " + "; ".join(failures))
    collected.sort(key=lambda row: row["publishedAt"], reverse=True)
    output = {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": "Google News RSS search",
        "sourceType": "headline_discovery_only",
        "collectionVersion": 2,
        "note": "Headlines are not verified facts. Verify official sources, article content and rights before publishing.",
        "categoryCounts": {f"{cat}/{lang}": count for (cat, lang), count in counters.items()},
        "items": collected,
        "errors": failures,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Collected {len(collected)} headlines from {len(FEEDS)} queries; feed errors={len(failures)}")


if __name__ == "__main__":
    main()

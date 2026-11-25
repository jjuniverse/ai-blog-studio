#!/usr/bin/env python3
"""Discover public news headlines for Today Pick, without scraping article bodies.

News RSS is an idea feed, NOT evidence of correctness or commercial rights.
The output is deliberately limited, diversified and deduplicated.
"""
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from itertools import groupby, zip_longest
from pathlib import Path

SENIOR_WELFARE = "시니어·복지"

FEEDS = [
    # Domestic news and practical guides
    ("연예", "KO", "드라마 OTT 공개일 출연진 공식 발표 when:3d", "ko", "KR"),
    ("연예", "KO", "예능 방송 편성 출연 공식 발표 when:3d", "ko", "KR"),
    ("K-pop", "KO", "아이돌 컴백 공식 발표 when:3d", "ko", "KR"),
    ("K-pop", "KO", "아이돌 콘서트 예매 일정 when:3d", "ko", "KR"),
    ("IT·AI", "KO", "AI 신기능 출시 공식 업데이트 생산성 when:3d", "ko", "KR"),
    ("IT·AI", "KO", "AI 업무 자동화 사용법 활용 가이드 when:7d", "ko", "KR"),
    # Separate senior-life and general-welfare searches feed the same category.
    # Alternate the two lanes so one cannot consume the category cap by itself.
    (SENIOR_WELFARE, "KO", '("시니어" OR "고령층" OR "고령자" OR "어르신" OR "노년") when:7d', "ko", "KR"),
    (SENIOR_WELFARE, "KO", '("복지" OR "사회보장" OR "긴급복지" OR "복지로") when:7d', "ko", "KR"),
    (SENIOR_WELFARE, "KO", '("노인일자리" OR "노인 일자리" OR "장기요양" OR "기초연금") when:7d', "ko", "KR"),
    (SENIOR_WELFARE, "KO", '("청년월세" OR "아동수당" OR "부모급여" OR "주거급여" OR "장애인연금" OR "기초생활수급") when:7d', "ko", "KR"),
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
SENIOR_TERMS = re.compile(
    r"시니어|어르신|노년|노인|고령(?:자|층|사회|인구|화)|기초\s*연금|장기\s*요양|실버\s*(?:세대|타운|산업)"
)
WELFARE_TERMS = re.compile(
    r"복지(?!부|리후생)|사회\s*보장|기초\s*생활|아동\s*수당|부모\s*급여|"
    r"청년\s*월세|(?:주거|생계|교육|의료)\s*급여|장애인\s*연금|한부모\s*(?:가족|양육)"
)

def matches_senior_or_welfare(title, publisher=""):
    # Google appends the publisher to RSS titles; it is not topic evidence.
    suffix = " - " + publisher
    headline = title[:-len(suffix)] if publisher and title.endswith(suffix) else title
    return bool(SENIOR_TERMS.search(headline) or WELFARE_TERMS.search(headline))


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
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                raw = response.read(2_000_000)
            break
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 503) or attempt == 2:
                raise
            retry_after = exc.headers.get("Retry-After", "")
            delay = min(20, max(2, int(retry_after) if retry_after.isdigit() else 3 * (attempt + 1)))
            time.sleep(delay)
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
    def read_feed(feed):
        try:
            yield from fetch(*feed)
        except (OSError, ET.ParseError, ValueError) as exc:
            category, region, *_ = feed
            failures.append(f"{category}/{region}: {type(exc).__name__}: {exc}")

    def fits_category(row, key):
        return key[0] != SENIOR_WELFARE or matches_senior_or_welfare(row.get("title", ""), row.get("publisher", ""))

    for key, feeds in groupby(FEEDS, key=lambda feed: feed[:2]):
        counters.setdefault(key, 0)
        streams = [filter(lambda row: fits_category(row, key), read_feed(feed)) for feed in feeds]
        if key[0] == SENIOR_WELFARE:
            rows = (row for batch in zip_longest(*streams) for row in batch if row is not None)
        else:
            rows = (row for stream in streams for row in stream)
        for row in rows:
            identity = (key[1], normalized_title(row["title"]))
            if identity in duplicates or counters[key] >= MAX_ITEMS_PER_CATEGORY:
                continue
            duplicates.add(identity)
            collected.append(row)
            counters[key] += 1
    # Preserve still-recent items from a previous successful run if a category failed.
    # Never label these as freshly collected; the fetchedAt timestamp is retained per item.
    retained_count = 0
    if failures and OUTPUT.exists():
        try:
            previous = json.loads(OUTPUT.read_text(encoding="utf-8"))
            cutoff = datetime.now(timezone.utc) - timedelta(days=MAX_DAYS_OLD)
            for row in previous.get("items", []):
                key = (row.get("category"), row.get("region"))
                try:
                    published = datetime.fromisoformat(row["publishedAt"]).astimezone(timezone.utc)
                except (KeyError, ValueError, TypeError):
                    continue
                identity = (row.get("region"), normalized_title(row.get("title", "")))
                if key not in counters or counters[key] > 0 or published < cutoff or identity in duplicates or not fits_category(row, key):
                    continue
                collected.append(row)
                duplicates.add(identity)
                retained_count += 1
        except (OSError, ValueError, TypeError):
            pass
    if not collected:
        raise RuntimeError("No valid feeds were retrieved; old data preserved. " + "; ".join(failures))
    collected.sort(key=lambda row: row["publishedAt"], reverse=True)
    output = {
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "source": "Google News RSS search",
        "sourceType": "headline_discovery_only",
        "collectionVersion": 3,
        "note": "Headlines are not verified facts. Verify official sources, article content and rights before publishing.",
        "categoryCounts": {f"{cat}/{lang}": count for (cat, lang), count in counters.items()},
        "retainedFromPrevious": retained_count,
        "items": collected,
        "errors": failures,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Collected {len(collected)} headlines from {len(FEEDS)} queries; feed errors={len(failures)}")


if __name__ == "__main__":
    main()

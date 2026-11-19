#!/usr/bin/env python3
"""Collect ONLY public recent posts from the operator's two official RSS feeds.

No login, page scraping, publish actions or secrets. Failed fetches never
silently turn a previously successful snapshot into an empty published list.
"""
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlparse

OUTPUT = Path("public/data/published.json")
SOURCES = {
    "naver": "https://rss.blog.naver.com/todaypickkr.xml",
    "tistory": "https://blog83848.tistory.com/rss",
}
MAX_POSTS = 50
MAX_BYTES = 2_500_000


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def text(node, tag):
    child = node.find(tag)
    return "".join(child.itertext()).strip() if child is not None else ""


def allowed_link(url, channel):
    try:
        parts = urlparse(url)
        if parts.scheme != "https" or parts.username or parts.password:
            return False
        if channel == "naver":
            return parts.hostname in ("blog.naver.com", "m.blog.naver.com") and (
                parts.path.startswith("/todaypickkr/") or
                (parts.path == "/PostView.naver" and "todaypickkr" in parts.query)
            )
        return parts.hostname == "blog83848.tistory.com" and (
            bool(re.search(r"/\d+(?:$|/)", parts.path)) or
            parts.path.startswith("/entry/")
        )
    except ValueError:
        return False


def parse_date(raw):
    try:
        dt = parsedate_to_datetime(raw)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    except (ValueError, TypeError, IndexError, OverflowError):
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
        except (ValueError, TypeError):
            return ""


def parse_feed(xml, channel):
    root = ET.fromstring(xml)
    posts = []
    seen = set()
    items = root.findall(".//item")
    # Support Atom feeds too, should either provider migrate.
    if not items:
        items = root.findall(".//{http://www.w3.org/2005/Atom}entry")
    for item in items:
        title = text(item, "title") or text(item, "{http://www.w3.org/2005/Atom}title")
        link = text(item, "link")
        if not link:
            link_node = item.find("{http://www.w3.org/2005/Atom}link")
            link = link_node.attrib.get("href", "") if link_node is not None else ""
        date = text(item, "pubDate") or text(item, "{http://www.w3.org/2005/Atom}published") or text(item, "{http://www.w3.org/2005/Atom}updated")
        title = re.sub(r"\s+", " ", title)[:220].strip()
        if not title or len(title) < 4 or not allowed_link(link, channel) or link in seen:
            continue
        seen.add(link)
        posts.append({
            "channel": channel,
            "title": title,
            "url": link,
            "publishedAt": parse_date(date),
        })
        if len(posts) >= MAX_POSTS:
            break
    return posts


def fetch_feed(url):
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "TodayPickStudio-RSS-Checker/1.0", "Accept": "application/rss+xml, application/xml, text/xml"},
    )
    with urllib.request.urlopen(req, timeout=14) as response:
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("RSS payload too large")
    return data


def collect(fetcher=fetch_feed, output=OUTPUT):
    previous = {}
    if output.exists():
        try:
            previous = json.loads(output.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            previous = {}
    old_posts = previous.get("posts", [])
    old_source = {x.get("channel"): x for x in previous.get("sources", [])}
    result = {"generatedAt": now_iso(), "sources": [], "posts": []}
    for channel, url in SOURCES.items():
        try:
            posts = parse_feed(fetcher(url), channel)
            # Feed with zero public items can be legitimate; signal empty explicitly.
            state = {"channel": channel, "feedUrl": url, "status": "ok",
                     "count": len(posts), "lastSuccessAt": result["generatedAt"]}
        except (OSError, ValueError, ET.ParseError) as exc:
            posts = [p for p in old_posts if p.get("channel") == channel][:MAX_POSTS]
            state = {"channel": channel, "feedUrl": url, "status": "error",
                     "count": len(posts), "lastSuccessAt": old_source.get(channel, {}).get("lastSuccessAt", ""),
                     "error": type(exc).__name__ + " (RSS 조회 실패, 이전 기록 유지)"}
        result["sources"].append(state)
        result["posts"].extend(posts)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return result


if __name__ == "__main__":
    data = collect()
    print("Public posts:", len(data["posts"]), [(s["channel"], s["status"], s["count"]) for s in data["sources"]])

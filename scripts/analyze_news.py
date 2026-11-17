#!/usr/bin/env python3
"""Conservative headline discovery: never infer search volume, earnings or factual truth."""
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

STOP = set("""the and from with about for this that what when how after into new latest news says official report reports of on at to in a an is are as by ai kpop 관련 발표 공개 소식 오늘 최신 공식 단독""".split())
RISK = ("rumor", "rumour", "alleged", "unconfirmed", "dating", "scandal",
        "lawsuit", "accused", "suspected", "열애설", "의혹", "루머", "논란", "폭로", "혐의", "사망", "자살")
# Detect commercial promotion, not articles discussing normal pricing or subscription plans.
PROMOTION_PATTERNS = (
    r"\bpromo(?:tional)?\s+codes?\b", r"\bcoupon\s+codes?\b",
    r"\bdiscount\s+codes?\b", r"\breferral\s+codes?\b",
    r"\buse\s+code\s+[a-z0-9]+\b", r"\bexclusive\s+(?:deal|offer)\b",
    r"\bsponsored\s+(?:post|content|article)\b", r"\baffiliate\s+link\b",
    r"할인\s*코드", r"쿠폰\s*코드", r"프로모션\s*코드", r"추천인\s*코드",
    r"제휴\s*(?:광고|링크)", r"협찬\s*(?:기사|포스팅)", r"광고성\s*(?:기사|게시물)",
)
USEFUL = ("tutorial", "how to", "step-by-step", "guide", "comparison",
          "alternatives", "review", "사용법", "활용법", "가이드", "비교", "차이", "설정", "방법")
PRODUCT = ("software", "tool", "app", "workflow", "automation", "productivity",
           "도구", "자동화", "생산성", "기능")
VISUAL = ("tutorial", "demo", "walkthrough", "how to", "guide", "step-by-step",
          "기능", "방법", "사용법", "가이드", "비교", "시연", "컴백", "일정", "출연진")
OUT = Path("public/data/candidates.json")


def terms(title):
    words = re.findall(r"[a-z0-9]+|[가-힣]{2,}", title.rsplit(" - ", 1)[0].lower().replace("k-pop", "kpop"))
    return {word for word in words if word not in STOP and len(word) > 1}


def similar(a, b):
    if a["category"] != b["category"] or a["region"] != b["region"]:
        return False
    left, right = terms(a["title"]), terms(b["title"])
    overlap = len(left & right)
    # Avoid joining headlines simply because they share common topic words.
    return bool(left and right and overlap >= 3 and overlap / len(left | right) >= 0.38)


def evaluate(group):
    title = group[0]["title"].lower()
    category = group[0]["category"]
    publishers = {row.get("publisher", "").strip().lower() for row in group if row.get("publisher", "").strip()}
    count = len(publishers)
    promotion = any(re.search(pattern, title, flags=re.IGNORECASE) for pattern in PROMOTION_PATTERNS)
    risk = any(word in title for word in RISK)
    informational = any(word in title for word in USEFUL)
    product = any(word in title for word in PRODUCT)
    commercial_fit = min(55, (12 if category in ("AI·생산성", "IT·AI") else 8)
                         + 18 * informational + 12 * product)
    visual_fit = min(65, 30 + 22 * any(word in title for word in VISUAL)
                     + 8 * (category in ("K-pop", "연예")))
    coverage = min(75, 15 + 15 * min(4, count))
    priority = round(commercial_fit * 0.35 + visual_fit * 0.25 + coverage * 0.4)
    reasons = []
    if promotion:
        status = "excluded_promotion"
        reasons.append("할인코드·제휴 홍보성 제목 감지: 자동 추천 제외")
        commercial_fit = 0
        priority = 0
    elif risk:
        status = "sensitive_review"
        reasons.append("사생활·논란 등 민감 이슈: 자동 추천 제외")
        priority = 0
    elif count < 2:
        status = "needs_sources"
        reasons.append("서로 다른 매체 2곳 미만: 검증 근거 부족")
        priority = min(priority, 39)
    else:
        status = "research_required"
        reasons.append("복수 매체 헤드라인 확인: 원문 및 공식 발표 추가 검증 필요")
    if not promotion and informational:
        reasons.append("사용법·비교 등 정보 탐색 의도 단서")
    if not promotion and product:
        reasons.append("도구·생산성 관련 키워드")
    return {
        "status": status,
        "reasons": reasons,
        "scores": {
            "editorialPriority": priority,
            "commercialFitHeuristic": commercial_fit,
            "shortformFitHeuristic": visual_fit,
            "coverageHeuristic": coverage,
            "independentPublisherCount": count,
            "riskFlag": risk,
            "promotionFlag": promotion,
            "measuredTraffic": None,
            "estimatedRevenue": None,
            "evidenceLevel": "headlines_only",
        },
    }


def build_candidates(rows):
    groups = []
    for row in rows:
        if not row.get("title") or not row.get("url", "").startswith("https://"):
            continue
        match = next((group for group in groups if similar(row, group[0])), None)
        if match is None:
            groups.append([row])
        else:
            match.append(row)

    candidates = []
    for group in groups:
        original = group[0]
        title = original["title"].rsplit(" - ", 1)[0]
        key = f"{original['region']}|{original['category']}|{' '.join(sorted(terms(title)))}"
        evaluation = evaluate(group)
        candidates.append({
            "id": hashlib.sha256(key.encode()).hexdigest()[:14],
            "title": title,
            "category": original["category"],
            "region": original["region"],
            "headlines": [
                {"title": item["title"], "publisher": item.get("publisher", ""),
                 "url": item["url"], "publishedAt": item.get("publishedAt")}
                for item in group
            ],
            "scores": evaluation["scores"],
            "status": evaluation["status"],
            "reasons": evaluation["reasons"],
        })

    # Preserve editorial eligibility boundaries while alternating categories.
    # Otherwise a wave of AI articles crowds out entertainment and Korean topics.
    priority_order = ("research_required", "needs_sources", "sensitive_review", "excluded_promotion")
    balanced = []
    for status in priority_order:
        subset = [item for item in candidates if item["status"] == status]
        buckets = {}
        for item in subset:
            key = (item["category"], item["region"])
            buckets.setdefault(key, []).append(item)
        for entries in buckets.values():
            entries.sort(key=lambda x: (-x["scores"]["editorialPriority"], -len(x["headlines"])))
        while any(buckets.values()):
            for key in list(buckets):
                if buckets[key]:
                    balanced.append(buckets[key].pop(0))
    return balanced


def main():
    data = json.loads(Path("public/data/news.json").read_text(encoding="utf-8"))
    candidates = build_candidates(data.get("items", []))
    document = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "disclaimer": "Editorial-only heuristics; no measured traffic, revenue or factual verification. Promotional topics are excluded from recommendations.",
        "candidates": candidates,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Analyzed {len(candidates)} clusters; promotion excluded: {sum(x['status'] == 'excluded_promotion' for x in candidates)}")


if __name__ == "__main__":
    main()

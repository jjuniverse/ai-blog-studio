import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import collect_news
from analyze_news import build_candidates

class CollectorTests(unittest.TestCase):
    def test_title_normalization_strips_publisher(self):
        self.assertEqual(collect_news.normalized_title("New AI Feature - Example News"),
                         collect_news.normalized_title("New AI Feature | Another Publisher"))

    def test_coupon_detection(self):
        self.assertTrue(collect_news.PROMOTION.search("Save today with Promo Code XX12"))
        self.assertTrue(collect_news.PROMOTION.search("특별 할인 코드 소개"))
        self.assertFalse(collect_news.PROMOTION.search("Software subscription pricing comparison"))

    def test_categories_include_domestic_and_international(self):
        groups = {(item[0], item[1]) for item in collect_news.FEEDS}
        self.assertIn(("생활 정보", "KO"), groups)
        self.assertIn(("시니어·복지", "KO"), groups)
        senior = [feed for feed in collect_news.FEEDS if feed[0] == "시니어·복지"]
        self.assertGreaterEqual(len(senior), 4)
        self.assertTrue(all(feed[1] == "KO" for feed in senior))
        self.assertTrue(any("기초연금" in feed[2] for feed in senior))
        self.assertTrue(any("장기요양" in feed[2] for feed in senior))
        self.assertTrue(any("노인일자리" in feed[2] for feed in senior))
        self.assertIn(("K-pop", "KO"), groups)
        self.assertIn(("K-pop", "EN"), groups)
        self.assertIn(("AI·생산성", "EN"), groups)

    def test_senior_or_welfare_matches_either_side_but_not_publisher_only(self):
        senior, welfare = collect_news.SENIOR_TERMS, collect_news.WELFARE_TERMS
        senior_only = "고령층 스마트폰 사진 강좌 개강"
        welfare_only = "아동수당 지급 대상 확대 안내"
        both = "어르신 복지시설 이용시간 안내"
        self.assertIsNone(welfare.search(senior_only))
        self.assertIsNone(senior.search(welfare_only))
        for title in (senior_only, welfare_only, both, "청년 월세 지원 신청 안내", "장애인연금 대상 안내"):
            with self.subTest(title=title):
                self.assertTrue(collect_news.matches_senior_or_welfare(title))
        self.assertFalse(collect_news.matches_senior_or_welfare("프로야구 경기 결과 - 복지신문", "복지신문"))
        self.assertFalse(collect_news.matches_senior_or_welfare("복지부 청사 이전 발표"))

    def test_collection_keeps_both_lanes_under_category_cap_and_skips_duplicate(self):
        category = collect_news.SENIOR_WELFARE
        feeds = [feed for feed in collect_news.FEEDS if feed[0] == category]
        self.assertTrue(all(" OR " in feed[2] for feed in feeds))
        self.assertTrue(any("아동수당" in feed[2] and "노인" not in feed[2] for feed in feeds))
        now = datetime.now(timezone.utc).isoformat()
        senior = "고령층 스마트폰 사진 강좌 개강"
        welfare = "아동수당 지급 대상 확대 안내"
        also_senior = "노인 일자리 참여자 모집"
        also_welfare = "청년 월세 지원 신청 기간 연장"
        fixture = {
            feeds[0][2]: ["프로야구 경기 결과 - 복지신문", senior, "시니어 글쓰기 강좌", "어르신 합창단 신설", "고령층 교양 강좌"],
            feeds[1][2]: [welfare],
            feeds[2][2]: [senior, also_senior],
            feeds[3][2]: [also_welfare],
        }

        def fake_fetch(category, region, query, *_):
            feed_index = list(fixture).index(query)
            for index, title in enumerate(fixture[query]):
                yield {"title": title, "url": f"https://example.test/{feed_index}/{index}",
                       "publisher": "복지신문" if title.endswith("복지신문") else "예시신문",
                       "publishedAt": now, "category": category, "region": region}

        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "news.json"
            with patch.multiple(collect_news, FEEDS=feeds, OUTPUT=output, MAX_ITEMS_PER_CATEGORY=4, fetch=fake_fetch):
                collect_news.main()
            data = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(data["collectionVersion"], 3)
        self.assertCountEqual([row["title"] for row in data["items"]],
                              [senior, welfare, also_welfare, "시니어 글쓰기 강좌"])
        self.assertTrue(all(row["category"] == category for row in build_candidates(data["items"])))

if __name__ == "__main__":
    unittest.main()

import sys
import unittest
from pathlib import Path
from unittest.mock import patch
from datetime import datetime, timezone, timedelta

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import collect_news

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
        self.assertIn(("K-pop", "KO"), groups)
        self.assertIn(("K-pop", "EN"), groups)
        self.assertIn(("AI·생산성", "EN"), groups)

if __name__ == "__main__":
    unittest.main()

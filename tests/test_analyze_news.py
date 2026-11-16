import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from analyze_news import build_candidates, evaluate


def headline(title, publisher="Publisher"):
    return {"title": title, "publisher": publisher, "url": "https://example.org/article",
            "category": "AI·생산성", "region": "EN", "publishedAt": "2026-11-16T00:00:00Z"}


class EditorialScoringTests(unittest.TestCase):
    def test_promo_code_is_excluded_even_with_many_publishers(self):
        group = [headline('Gamsgo Promo Code "MYPSR" – How to Find Affordable Digital Subscription Plans', p)
                 for p in ("One", "Two", "Three")]
        result = evaluate(group)
        self.assertEqual(result["status"], "excluded_promotion")
        self.assertEqual(result["scores"]["editorialPriority"], 0)
        self.assertTrue(result["scores"]["promotionFlag"])

    def test_one_source_cannot_be_recommended(self):
        result = evaluate([headline("AI software automation tutorial")])
        self.assertEqual(result["status"], "needs_sources")
        self.assertLessEqual(result["scores"]["editorialPriority"], 39)

    def test_regular_subscription_coverage_is_not_promo(self):
        group = [headline("New software subscription pricing comparison", p) for p in ("One", "Two")]
        result = evaluate(group)
        self.assertEqual(result["status"], "research_required")
        self.assertFalse(result["scores"]["promotionFlag"])

    def test_multiple_outlets_dont_verify_facts(self):
        result = evaluate([headline("New productivity app features announced", p) for p in ("One", "Two")])
        self.assertEqual(result["status"], "research_required")
        self.assertEqual(result["scores"]["evidenceLevel"], "headlines_only")
        self.assertIsNone(result["scores"]["measuredTraffic"])
        self.assertIsNone(result["scores"]["estimatedRevenue"])

    def test_promo_appears_after_eligible_topics(self):
        rows = [headline("Gamsgo Promo Code MYPSR – save now", "One"),
                headline("A useful AI productivity software comparison", "One"),
                headline("A useful AI productivity software comparison", "Two")]
        result = build_candidates(rows)
        self.assertEqual(result[-1]["status"], "excluded_promotion")


if __name__ == "__main__":
    unittest.main()

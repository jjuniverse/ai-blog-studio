import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import research_news

def candidate(id, category, region="KO", status="needs_sources"):
    return {"id": id, "title": "Test topic " + id, "category": category,
            "region": region, "status": status,
            "scores": {"riskFlag": False, "promotionFlag": False},
            "headlines": [{"title":"one", "publisher":"news"}]}

class ResearchQueueTests(unittest.TestCase):
    def test_skips_risk_and_advertisement(self):
        rows = [candidate("safe","IT·AI"),candidate("risk","K-pop"),candidate("ad","연예")]
        rows[1]["scores"]["riskFlag"] = True
        rows[2]["scores"]["promotionFlag"] = True
        selected = research_news.select_candidates(rows, {"entries":[], "dailyAttempts":{}}, "2026-11-17")
        self.assertEqual([x["id"] for x in selected], ["safe"])

    def test_diversifies_categories(self):
        rows = [candidate("a","IT·AI"),candidate("b","IT·AI"),candidate("c","K-pop")]
        selected = research_news.select_candidates(rows, {"entries":[], "dailyAttempts":{}}, "2026-11-17")
        self.assertEqual([x["id"] for x in selected[:2]], ["a","c"])

    def test_cached_candidate_not_selected_again(self):
        rows = [candidate("a","IT·AI"), candidate("b","연예")]
        cache = {"entries":[{"candidateId":"a","researchedAt":datetime.now(timezone.utc).isoformat()}],"dailyAttempts":{}}
        selected = research_news.select_candidates(rows, cache, "2026-11-17")
        self.assertEqual([x["id"] for x in selected], ["b"])

    def test_safe_https(self):
        self.assertTrue(research_news.is_valid_https("https://www.example.com/news"))
        self.assertFalse(research_news.is_valid_https("http://www.example.com/news"))
        self.assertFalse(research_news.is_valid_https("https://user:pass@www.example.com/x"))

if __name__ == "__main__":
    unittest.main()

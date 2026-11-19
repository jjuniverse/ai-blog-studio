import json
import tempfile
import unittest
from pathlib import Path
from scripts.collect_published import allowed_link, collect, parse_feed

NAVER = b"""<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><title>todaypickkr</title>
<item><title>Taeyeon concert FLY tickets</title><link>https://blog.naver.com/todaypickkr/2222222</link>
<pubDate>Thu, 19 Nov 2026 09:00:00 +0900</pubDate></item>
<item><title>Other author's article</title><link>https://blog.naver.com/other/2222</link></item>
</channel></rss>"""
TISTORY = b"""<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel><item><title>Taeyeon fourth album and Seoul concert guide</title>
<link>https://blog83848.tistory.com/4</link><pubDate>Thu, 19 Nov 2026 09:00:00 +0900</pubDate></item>
</channel></rss>"""

class PublishedFeedTests(unittest.TestCase):
    def test_parse_only_own_public_posts(self):
        posts = parse_feed(NAVER, "naver")
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0]["title"], "Taeyeon concert FLY tickets")
        self.assertIn("2026-11-19T00:00:00", posts[0]["publishedAt"])
        self.assertTrue(allowed_link("https://blog83848.tistory.com/entry/hello", "tistory"))
        self.assertFalse(allowed_link("https://blog83848.tistory.com.evil.example/4", "tistory"))
        self.assertFalse(allowed_link("http://blog.naver.com/todaypickkr/222", "naver"))

    def test_fetch_two_channels(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "published.json"
            feeds = {"https://rss.blog.naver.com/todaypickkr.xml": NAVER,
                     "https://blog83848.tistory.com/rss": TISTORY}
            result = collect(lambda url: feeds[url], path)
            self.assertEqual(len(result["posts"]), 2)
            self.assertEqual([x["status"] for x in result["sources"]], ["ok", "ok"])
            self.assertEqual(len(json.loads(path.read_text())["posts"]), 2)

    def test_failure_does_not_erase_previous_post_history(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "published.json"
            feeds = {"https://rss.blog.naver.com/todaypickkr.xml": NAVER,
                     "https://blog83848.tistory.com/rss": TISTORY}
            collect(lambda url: feeds[url], path)
            def broken(url):
                if "rss.blog.naver.com" in url:
                    raise OSError("blocked")
                return TISTORY
            data = collect(broken, path)
            self.assertEqual(len(data["posts"]), 2)
            self.assertEqual(data["sources"][0]["status"], "error")
            self.assertEqual(data["sources"][1]["status"], "ok")
            self.assertTrue(data["sources"][0]["lastSuccessAt"])

if __name__ == "__main__":
    unittest.main()

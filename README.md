# AI Blog Studio — 오늘의 픽

Mobile-friendly **GitHub Pages static prototype** for managing Korean and international content ideas. It ranks example AI/productivity and K-pop topics using adjustable hypothetical scores, offers an editable storyboard outline, and exports reviewer-approved JSON locally.

## Status

- ✅ Topic list, score weighting, editable storyboard template, manual review checkbox, JSON export.
- ⛔ Real news collection, AI generation, DB persistence, TTS, video rendering, YouTube/Instagram uploads, and platform authentication are **not implemented** in this Pages build.
- ⚠️ All example scores are illustrative, not actual audience, revenue or trend predictions. New entries reset on refresh.

## Local development

```bash
npm install
npm run dev
```

## Deployment

Push to `main`. The GitHub Actions workflow builds a static Next.js export and deploys `out/` to GitHub Pages.

In repository **Settings → Pages → Build and deployment → Source**, choose **GitHub Actions**. The expected public URL is https://jjuniverse.github.io/ai-blog-studio/ after a successful deployment.

## Security and architecture

GitHub Pages is public static hosting. **Never put API keys, Supabase service-role secrets, OAuth tokens or private user data into this repository or browser app.** A future authenticated backend can be deployed separately and called only from an authorized, authenticated client. GitHub Pages itself does not provide private access control.

The previously drafted v0.2 server-based prototype is intentionally not copied as-is: Next.js API routes and middleware cannot execute on GitHub Pages.

## Public news headline ingestion (new)

The [Collect news headlines](../../actions/workflows/collect-news.yml) workflow queries public Google News RSS search feeds every 6 hours (GitHub scheduled workflows may be delayed). To populate the dashboard immediately, open **Actions → Collect news headlines → Run workflow** and select `main`. The workflow commits `public/data/news.json` only when valid headlines are collected; pushing it triggers the GitHub Pages deployment automatically.

The UI reads titles, publisher names, dates and source links from that static JSON. **This does not retrieve article bodies, verify news, estimate real traffic or call an LLM.** Score 50 on RSS headlines is an explicitly uncalibrated placeholder, and published claims need manual verification. If sources fail, existing JSON is preserved; otherwise the dashboard shows example topics. News data and the website are public, so do not store secrets or private drafts here.

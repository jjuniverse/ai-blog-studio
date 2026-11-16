# AI Blog Studio — 오늘의 픽

Mobile-friendly **GitHub Pages static prototype** for managing Korean and international content ideas. It ranks example AI/productivity and K-pop topics using adjustable hypothetical scores, offers an editable storyboard outline, and exports reviewer-approved JSON locally.

## Current experience (v0.5 UI)

- **Topic discovery:** real public RSS headline clusters only (no fictional sample rankings). Search, category filters, editorial status and evidence links. Scores are heuristics, **not forecast traffic or revenue**.
- **Content studio:** view optional pre-generated AI editorial outlines, edit Naver/Tistory/shortform versions, copy text or export a plain-text file. The image section provides **three editable placement briefs**, not images; no media is generated yet.
- **Publishing tracker:** record actual Naver/Tistory post URLs after manual publication. Existing channels: [Naver](https://blog.naver.com/todaypickkr) and [Tistory](https://blog83848.tistory.com/).
- **Local-only edits:** manual text changes, image briefs and publication URLs are saved in this device's browser `localStorage` and can be exported as JSON. They are **not synchronized**, private by authentication, or stored in the repository.
- **AI generation:** separately triggered in GitHub Actions through [Generate AI editorial outlines](../../actions/workflows/generate-drafts.yml); the generated outline file is committed to the **public** repo. Never include private text, credentials or account details.
- **Not yet implemented:** integrated AI full-article generation, actual screenshot/image creation, video rendering, OAuth, automatic publishing, private cloud storage, verified facts and real advertising/sales metrics.

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

The UI reads titles, publisher names, dates and source links from that static JSON. **This does not retrieve article bodies, verify news, estimate real traffic or call an LLM.** Score 50 on RSS headlines is an explicitly uncalibrated placeholder, and published claims need manual verification. If sources fail, existing JSON is preserved; otherwise the dashboard shows a data-availability message. News data and the website are public, so do not store secrets or private drafts here.

## Editorial analysis and optional AI drafts (v0.4)

- `scripts/analyze_news.py` groups near-identical headlines conservatively and writes `public/data/candidates.json` after every news collection. Scores are **editorial heuristics**, not measured traffic, search volume, ad RPM, or expected earnings. Different publishers do not prove a story is true.
- The homepage displays grouped headlines, source links, risk flags and editorial priority.
- **Optional AI prep outlines:** add `OPENAI_API_KEY` under **Settings → Secrets and variables → Actions → New repository secret**, then manually run [Generate AI editorial outlines](../../actions/workflows/generate-drafts.yml). It uses the API from GitHub Actions, not the browser. It skips risky headline topics and requires at least two headline sources, but these checks do **not** establish factual correctness.
- The generated `public/data/drafts.json` is **PUBLIC** and contains NOT-READY-FOR-PUBLICATION outlines for Naver, Tistory and shortform. Never put private material in it. The AI has only headlines and links, not article contents; all assertions must be verified independently before publication.
- Draft generation is deliberately **manual** to control API costs and avoid unsupervised publishing. No automatic article publication or video generation is implemented yet.

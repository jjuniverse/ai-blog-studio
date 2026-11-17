# AI Blog Studio — 오늘의 픽

Mobile-friendly **GitHub Pages static prototype** for managing Korean and international content ideas. It ranks example AI/productivity and K-pop topics using adjustable hypothetical scores, offers an editable storyboard outline, and exports reviewer-approved JSON locally.

## In-page AI generation (Cloudflare Worker integration)

The **콘텐츠 스튜디오** screen now supports an inline **AI 원고 생성** button. This requires deploying the **Cloudflare Worker** under [worker/](worker/README.md) once, and entering its `workers.dev` HTTPS URL and a separate Studio passphrase in the web UI. The passphrase is **not persisted**, the backend holds the OpenAI API key in Cloudflare Secrets, and generation remains gated behind editorial-review status and rate limits. [Setup guide](worker/README.md)

The button is implemented, but the backend is **not yet deployed** to a Cloudflare account, so the live OpenAI call cannot complete until the one-time Worker setup. Existing GitHub Actions generation remains available as a legacy optional path.

## Current experience (v0.5 UI)

- **Topic discovery:** real public RSS headline clusters only (no fictional sample rankings). Search, category filters, editorial status and evidence links. Scores are heuristics, **not forecast traffic or revenue**.
- **Content studio:** view optional pre-generated AI editorial outlines, edit Naver/Tistory/shortform versions, copy text or export a plain-text file. The image section provides **three editable placement briefs**, not images; no media is generated yet.
- **Publishing tracker:** record actual Naver/Tistory post URLs after manual publication. Existing channels: [Naver](https://blog.naver.com/todaypickkr) and [Tistory](https://blog83848.tistory.com/).
- **Local-only edits:** manual text changes, image briefs and publication URLs are saved in this device's browser `localStorage` and can be exported as JSON. They are **not synchronized**, private by authentication, or stored in the repository.
- **Legacy AI generation:** separately triggered in GitHub Actions through [Generate AI editorial outlines](../../actions/workflows/generate-drafts.yml); the generated outline file is committed to the **public** repo. Never include private text, credentials or account details.
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

## Blog post preview and downloadable image cards

The **콘텐츠 스튜디오** now offers a formatted article preview (headings, paragraphs) with three automatically rendered branded PNG cards: cover, explanatory and summary. Each card has a **PNG 이미지 저장** action. These are local Canvas illustrations, **not generated factual screenshots or licensed entertainment photos**. Review card wording for accuracy. Download images separately and insert them into the Naver or Tistory editor; the current copy button only copies text, not images. A truly one-click rich-text post package and automatic publishing are still not implemented.

Headline-only older drafts may remain in local browser storage. Use the **이전 초안 백업 후 초기화** control where shown, then generate again after deploying the updated Worker. The Worker rejects generic short articles instead of presenting them as ready to post. Real publishable quality and source accuracy have not yet been validated by an end-to-end API test.

## Scheduled editorial research (new)

[Research top news candidates](.github/workflows/research-news.yml) runs **once per day at 01:15 UTC** (10:15 KST, GitHub schedule may be delayed). It reads the latest public `candidates.json` and makes **at most 3 OpenAI Responses web_search requests per UTC calendar day** recorded in `public/data/research.json`. It uses the existing GitHub Actions `OPENAI_API_KEY` secret. The queue diversifies categories/languages, skips obvious sensitive/promotional topics and caches recent candidate results. Repeated runs that see the updated daily counter don't create more requests, but failed/uncommitted runs may still incur extra calls; this is **not a financial hard spending cap**. Monitor [OpenAI usage](https://platform.openai.com/usage) and set budget alerts.

The public research feed includes editorial leads, questions and search-reported URLs; these are **not independently verified facts** and don't authorize automated publication. No full article, image or social video is automatically generated by the research workflow. The Studio shows these leads in the separate **자동 자료 조사** panel before content creation. A user should inspect each linked official document and correct factual claims before approving a draft.

Manual testing: go to [Research top news candidates Actions](https://github.com/jjuniverse/ai-blog-studio/actions/workflows/research-news.yml) and choose **Run workflow**. This initiates paid web searches (up to the daily cap). Check the workflow logs for success/failure and refresh the Studio after GitHub Pages redeploys. Never commit private information to the public research JSON.

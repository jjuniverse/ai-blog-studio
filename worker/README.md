# Cloudflare Worker — AI Blog Studio

This Worker lets the existing public GitHub Pages dashboard request OpenAI draft preparation **without leaving the page**.

## Deploy once (requires your own Cloudflare account)

From the repository root:

```bash
cd worker
npx wrangler login
npx wrangler deploy
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put STUDIO_PASSWORD
```

- `OPENAI_API_KEY`: Your existing OpenAI API key, entered **only into Cloudflare Secrets**, never committed, never pasted into this chat or the website.
- `STUDIO_PASSWORD`: A **new distinct random passphrase of at least 16 characters** for your personal dashboard. Do not reuse your GitHub or OpenAI password.
- After updating secrets, look at the Worker URL shown by Wrangler, e.g. `https://todaypick-studio-api.<your-subdomain>.workers.dev`.
- Go to `https://jjuniverse.github.io/ai-blog-studio/`, open **콘텐츠 스튜디오**, paste the Worker URL and type your Studio passphrase. The URL alone is saved on this device; the passphrase stays in page memory and is cleared on refresh.
- Start with a topic marked **검토 후보**. Click **이 화면에서 AI 원고 생성**. The draft appears directly in the three platform tabs.
- GitHub Actions Secrets **do not automatically transfer** to Cloudflare. You must register the API key again on Cloudflare.

## Security limits and operational constraints

- The Worker accepts browser requests from `https://jjuniverse.github.io` only (CORS + Origin check); **CORS is not authentication**. A secret passphrase is verified server-side before each paid request.
- Cloudflare built-in rate limits: authentication attempts 10 per minute and generation calls 3 per minute, both keyed globally per Cloudflare location. These limits are approximate, NOT a hard monthly cost cap. Track spending and set budget alerts on OpenAI Platform.
- No API keys or passphrase are shipped with the GitHub Pages bundle. **Never store credentials in `public/`, source code, `next.config`, or GitHub Pages JavaScript.**
- This is a personal MVP with one shared passphrase, not multi-user authentication. For expanded use, migrate to Cloudflare Access or another robust account-based auth solution.
- Browser-edited drafts live in localStorage on the current device; no cloud sync.
- Only headline metadata is provided. Two publishers do not prove a claim. Without independently verified notes, the Worker only prepares a **NOT READY FOR PUBLICATION** review scaffold and verification questions.
- Image briefs are generated as text; actual image assets, TTS, video and posting are **not yet implemented**.
- Before using from a publicly shared environment, consider moving to a private, authenticated app. This publicly viewable GitHub Pages UI is not private.

## Development

`wrangler.toml` defines the Worker and rate-limit bindings. Configure local secrets in `worker/.dev.vars` if needed; this path must stay ignored by git.

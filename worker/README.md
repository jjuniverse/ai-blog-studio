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
- Select a topic marked **검토 후보** or **추가 출처 필요**. A one-source topic produces a clearly labeled **research-only scaffold**, not a factual article. Topics marked **홍보성 제외** or **민감 이슈 제외** remain blocked.
- Once GitHub Actions deployment secrets are configured, Worker code changes merged to `main` deploy automatically. Before that initial setup, manual `wrangler deploy` is still available; existing Cloudflare secrets remain set on the same Worker.
- GitHub Actions Secrets **do not automatically transfer** to Cloudflare. You must register the API key again on Cloudflare.

## Automatic Cloudflare deployment (GitHub Actions)

The repository now includes [Deploy Cloudflare Worker](../.github/workflows/deploy-worker.yml).

- **Automatic:** every push to `main` that changes a file under `worker/**` (or the deployment workflow itself) deploys the existing `todaypick-studio-api` Worker.
- **Manual:** open **Actions → Deploy Cloudflare Worker → Run workflow** to redeploy the same commit even if no Worker files changed.
- **No repeat terminal commands** once the GitHub Actions connection is configured.

### One-time configuration

1. In [Cloudflare dashboard](https://dash.cloudflare.com/profile/api-tokens), create a Cloudflare **API token** (not your Global API Key), scoped to your account with **Edit Cloudflare Workers** permission, ideally restricted to this Worker/account.
2. Find the **Cloudflare Account ID** in Cloudflare account dashboard (Account ID in the sidebar or account overview).
3. Open the repo [Actions secrets](https://github.com/jjuniverse/ai-blog-studio/settings/secrets/actions) → New repository secret and add:
   - `CLOUDFLARE_API_TOKEN`: the token you just created.
   - `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID.
4. Go to [Deploy Cloudflare Worker Actions](https://github.com/jjuniverse/ai-blog-studio/actions/workflows/deploy-worker.yml), select `main` and press **Run workflow** for the first authenticated deployment.
5. Confirm the successful run and test the dashboard's AI generation button.

The initial workflow run **fails clearly** if either GitHub Secret is missing. This does not alter the currently running Worker. Do **not** paste either secret into the chat or a committed file.

### Secret separation

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` live in **GitHub Actions secrets** for deployment only.
- `OPENAI_API_KEY` and `STUDIO_PASSWORD` remain configured in **Cloudflare Worker secrets**, untouched by the workflow. Do not copy these into the repository.
- The auto-deploy workflow validates Worker JS syntax but does not run end-to-end OpenAI API tests. Watch the production Worker and API usage after deployments.
- If GitHub branch protection requires PR review, the push trigger runs after approved changes merge into `main`.

## Security limits and operational constraints

- The Worker accepts browser requests from `https://jjuniverse.github.io` only (CORS + Origin check); **CORS is not authentication**. A secret passphrase is verified server-side before each paid request.
- Cloudflare built-in rate limits: authentication attempts 10 per minute and generation calls 3 per minute, both keyed globally per Cloudflare location. These limits are approximate, NOT a hard monthly cost cap. Track spending and set budget alerts on OpenAI Platform.
- No API keys or passphrase are shipped with the GitHub Pages bundle. **Never store credentials in `public/`, source code, `next.config`, or GitHub Pages JavaScript.**
- This is a personal MVP with one shared passphrase, not multi-user authentication. For expanded use, migrate to Cloudflare Access or another robust account-based auth solution.
- Browser-edited drafts live in localStorage on the current device; no cloud sync.
- Only headline metadata is provided. One or two publishers do not prove a claim. Without independently verified notes, the Worker only prepares a **NOT READY FOR PUBLICATION** review scaffold and verification questions.
- Image briefs are generated as text; actual image assets, TTS, video and posting are **not yet implemented**.
- Before using from a publicly shared environment, consider moving to a private, authenticated app. This publicly viewable GitHub Pages UI is not private.

## Development

`wrangler.toml` defines the Worker and rate-limit bindings. Configure local secrets in `worker/.dev.vars` if needed; this path must stay ignored by git.

## Research-first blog drafting (quality update)

Inline generation separates **evidence collection** from **writing**. The first Responses API call searches the web (maximum three built-in tool calls) and extracts distinct facts bound to URLs actually returned by search. With fewer than three usable facts or fewer than two non-event categories, it skips the writing call. Otherwise a second Responses API call writes from the extracted facts alone, without web tools. There are no automatic retries. The total output-token cap is 12,000 across both stages, although both requests incur usage. If writing fails or the editorial checks block publication, the UI keeps the collected facts and their links available for review. Search matching is provenance, not a guarantee that any individual claim is true. Monitor costs in the [OpenAI API usage dashboard](https://platform.openai.com/usage).

For an existing Worker, **prefer the GitHub Actions auto-deploy workflow above**. Manual redeployment remains a fallback when CI deployment is not configured:

```bash
git pull
cd worker  # omit if already inside the worker directory
npx wrangler deploy
```

Changes to the Worker backend do not require a GitHub Pages rebuild. Refresh GitHub Pages if the frontend itself was changed. AI-generated material still requires a human editor to verify each key claim, rights and dates; no automated fact certification is implied. The Worker endpoint does not generate images, only image placement notes.

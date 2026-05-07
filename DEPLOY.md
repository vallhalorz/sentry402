# Deploying Sentry402 to a public URL

Hackathon submission requires (a) a public GitHub repo and (b) a working live demo URL. Vercel covers both in ~10 minutes — same company that maintains Next.js, free tier handles this load comfortably, env vars pluggable.

## 1. Push to GitHub (~3 min)

If you don't already have a repo:

```bash
cd ~/Documents/Claude/Projects/hackathon/sentry402

# Initialize git (one-time)
git init
git add -A
git commit -m "Sentry402 v0.1.3-mvp — Covalent GoldRush hackathon submission"

# Create the repo on GitHub.com first (https://github.com/new) — public, no README, no .gitignore (we already have one)
# Then push:
git branch -M main
git remote add origin https://github.com/<your-username>/sentry402.git
git push -u origin main
```

**Important:** the `.env.local` file is gitignored (good — it contains your GoldRush API key). Verify with:

```bash
git status   # .env.local should NOT appear
git ls-files | grep env   # should only show .env.example
```

If `.env.local` somehow got committed, rotate the GoldRush API key immediately at goldrush.dev → Platform → Settings.

## 2. Deploy to Vercel (~5 min)

### Easiest: through the Vercel web UI

1. Go to <https://vercel.com/signup>, sign in with the same GitHub account.
2. Click **Add New → Project**.
3. Select your `sentry402` repo and click **Import**.
4. **Framework Preset:** auto-detected as Next.js. Leave defaults.
5. Expand **Environment Variables** and add:
   - `GOLDRUSH_API_KEY` = `cqt_rQDR9X…` (your real key)
   - `X402_PAY_TO_ADDRESS` = a Base Sepolia address you control (optional — falls back to zero address if absent; for the demo video that's fine)
6. Click **Deploy**.

In ~90 seconds you get a URL like `https://sentry402.vercel.app` (or `sentry402-<your-username>.vercel.app`).

### Faster: through the CLI

```bash
npx vercel
# Follow the prompts:
#   Set up and deploy? Y
#   Which scope? <pick your account>
#   Link to existing project? N
#   Project name? sentry402
#   In which directory? ./
#   Override settings? N

# After first deploy:
npx vercel env add GOLDRUSH_API_KEY     # paste key, choose all envs
npx vercel --prod                       # promote to production
```

## 3. Smoke-test the live URL

Replace `https://sentry402.vercel.app` with whatever URL Vercel gave you:

```bash
# Dashboard
open https://sentry402.vercel.app

# OFAC direct match — should return score 100, 2 critical signals
curl -s 'https://sentry402.vercel.app/api/risk?chain=eth-mainnet&wallet=0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D' | jq '.overall_score, .severity, [.signals[].type]'

# x402 paid endpoint — should return HTTP 402 + spec body
curl -i 'https://sentry402.vercel.app/api/risk/paid?chain=eth-mainnet&wallet=0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D' | head -25

# x402 paid with payment header — should return 200 + dossier
curl -i -H 'X-PAYMENT: demo' 'https://sentry402.vercel.app/api/risk/paid?chain=eth-mainnet&wallet=0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D' | head -25

# Agent against the live URL
SENTRY402_URL=https://sentry402.vercel.app npm run agent -- 0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D
```

## 4. Update the submission

- **Live URL:** `https://sentry402.vercel.app` (paste in the Superteam Earn submission form)
- **GitHub repo:** `https://github.com/<your-username>/sentry402`
- **Demo video:** record using DEMO_VIDEO.md but replace the `localhost:3000` references in the script with the live URL — the dashboard's curl examples will already show the right URL because we made them dynamic.

## 5. Known limitation: in-memory dossier cache

The `/api/risk/export` endpoint reads from an in-memory `Map`. On Vercel's serverless runtime, requests can land on different lambda instances, so the JSON/PDF export buttons in the dashboard *may* return 404 ("Dossier not found in cache") if the export hits a cold instance.

Two fixes, in order of effort:

- **Demo workaround** (~1 minute): in your demo video, click Export immediately after generating the dossier. Vercel keeps the lambda warm for the next 5 minutes, so the export will hit the same instance.
- **Production fix** (~30 min): swap `lib/store.ts` to use Vercel KV or Upstash Redis. Same API — `cacheDossier(d)` and `getCachedDossier(id)` — different backend.

For the hackathon demo this is fine. Document the limitation in your submission notes if asked.

## 6. Optional: custom domain

If you want `sentry402.dev` instead of `sentry402.vercel.app`:

1. Buy `sentry402.dev` (Namecheap, Cloudflare Registrar, etc. — ~$15/year for a `.dev` domain)
2. In Vercel project settings → Domains → add `sentry402.dev`
3. Vercel gives you DNS records to add at your registrar
4. Wait ~10 min for DNS propagation, you're live on the custom domain

For the hackathon demo the auto-generated `vercel.app` URL is perfectly fine — judges click whatever URL is in the submission form.

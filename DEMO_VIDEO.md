# Sentry402 demo video script

**Target length:** 2:00. Submission requirement: post on X tagging @goldrushdev.

**Recording setup:**
- ScreenStudio or Loom, 1080p
- Mic on, ambient noise off
- Two takes minimum, pick the better cut
- Shoot Day 4 evening (2026-05-11), not Day 5 morning — buffer time matters
- Run through the demo dry once with the dev server already up before hitting record

**Pre-flight checklist** (5 minutes before recording):
- [ ] `npm run dev` running, http://localhost:3000 reachable
- [ ] `.env.local` has `GOLDRUSH_API_KEY` set
- [ ] One Terminal tab open at `~/Documents/Claude/Projects/hackathon/sentry402` for the curl + agent demo
- [ ] Browser tabs: localhost:3000 (dashboard), localhost:3000/api/risk/paid?... (will hit it live)
- [ ] Window size 1280×800 — no chrome bookmarks bar visible
- [ ] System notifications muted

---

## Script (timestamped)

### 0:00–0:12 — Cold-open the pain (single-persona hook)

> *[On screen: dashboard at localhost:3000, empty state]*
>
> "I'm an AML Analyst II. Every drainer alert means switching between four tabs — Chainalysis at thirty thousand a year, our KYC portal, Etherscan, a Google Sheet for the SAR. And when my regulator asks me to defend a score, I can't reproduce it. Chainalysis's own investigations lead testified in court they don't have an error-rate study for Reactor."

### 0:12–0:22 — Promise

> *[Click the OFAC demo wallet chip → form auto-fills with 0xcB74874f...]*
>
> "Sentry402 is wallet-risk built for compliance officers like me. Powered entirely by GoldRush, paid for per call via x402, designed so every flag is auditable."

### 0:22–0:55 — Live demo, OFAC direct match

> *[Click "Generate dossier" → ~6 seconds processing → dossier renders]*
>
> "I just pasted Amnokgang Technology Development Company — designated by OFAC on March twelfth, twenty twenty-six, for funding North Korean weapons programs through cryptocurrency."
>
> *[Point to score: 100/100, severity critical]*
>
> "Score one hundred, severity critical. Two indicators."
>
> *[Click first indicator to expand: ofac_direct_match]*
>
> "Direct match on the active OFAC SDN list. The rationale cites FATF Recommendation 6 — targeted financial sanctions related to terrorism, terrorist financing, and proliferation. FinCEN SAR Form 111, suspicious activity type thirty-one-y. Click the evidence —"
>
> *[Expand evidence, point to source URL and treasury.gov reference]*
>
> "— and you get the exact source: Treasury press release SB0416, March twelfth, twenty twenty-six. Re-runnable. Auditable. The Chainalysis answer to that question is 'because the model says so.'"

### 0:55–1:15 — Reproducibility & exports

> *[Scroll to Reproducibility metadata box]*
>
> "Every dossier carries the rule pack version, sha256, OFAC list version, GoldRush API version. FCA twenty twenty-four requires this; no major vendor ships it. And —"
>
> *[Click "Export SAR-style PDF" → new tab opens with FinCEN-styled exhibit]*
>
> "— I can export it as a SAR-grade PDF mirroring FinCEN Form 111 sectioning, ready for the SAR file as exhibit A."

### 1:15–1:40 — x402 paid endpoint

> *[Switch to Terminal]*
>
> "Now the agent rail. The dashboard is free. AI agents and integrations call slash api slash risk slash paid — x402-gated."
>
> *[Run: `curl -i 'http://localhost:3000/api/risk/paid?chain=eth-mainnet&wallet=0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D' | head -30`]*
>
> "Without a payment header — HTTP 402 Payment Required, exact x402 spec body, fifty thousand atoms USDC on Base Sepolia, the asset address, the description. Production agents read this, sign the payment, retry."
>
> *[Run: `curl -s -H 'X-PAYMENT: demo' '...' | head -20`]*
>
> "With the payment header — same dossier, settlement response in the headers. GoldRush's own x402 service is also on Base Sepolia today; mainnet's coming. We're testnet-honest."

### 1:40–1:55 — Persistent monitor

> *[Run: `npm run agent -- 0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D`]*
>
> "And the watchdog. Read-only agent — it polls Sentry402 over x402, never signs anything, never holds funds. When severity hits high or critical, it posts cited evidence to Telegram. Here it's printing to stdout because I haven't set the bot token, but the format is identical."
>
> *[Output shows the alert with all the citations]*

### 1:55–2:00 — Close

> "Sentry402. Audit-grade wallet risk for the ninety-five percent of compliance teams who can't afford a thirty-thousand-dollar Chainalysis seat. Built by an AML II, powered by @goldrushdev, monetized via x402. Repo's in the description."

---

## Tweet (post-record)

> Just shipped Sentry402 for the @goldrushdev hackathon — audit-grade wallet risk where every score is citation-bound to a specific GoldRush API call, tx hash, and dataset version. Built by an AML Analyst II for compliance teams priced out of $30K Chainalysis seats. Pay per call via x402.
>
> Demo: [link]
> Repo: [link]
>
> #BuildWithGoldRush #x402

Attach the 2-min video. Three sequential reply tweets with screenshots:
1. Dashboard with score 100/100 OFAC direct match
2. SAR-style PDF export
3. Terminal showing 402 → agent alert

---

## Post-record polish

- [ ] Captions burned into the video (accessibility + lower-volume judges)
- [ ] First 3 seconds are punchy — that's all most judges watch before deciding to skip
- [ ] Live demo URL works on a fresh browser session (no localStorage, no cookies)
- [ ] README sponsor-aware: `powered by @goldrushdev` mentioned within the first 50 words
- [ ] Submission form on Superteam Earn includes: GitHub link, video link, the wedge sentence, every GoldRush endpoint used in a bulleted list

---

## Sponsor-bounty alignment text (for submission form)

Sentry402 hits five Covalent / GoldRush sponsor signals from the brief:

1. **GoldRush APIs** (mandatory) — 4 Foundational endpoints: BalanceService, SecurityService, TransactionService.getEarliestTransactionsForAddress, TransactionService.getAllTransactionsForAddressByPage. Architecture pins the API version into every dossier.
2. **x402** (sponsor's "Killer App" hook) — `/api/risk/paid` returns 402 with spec-compliant payment-required JSON; with X-PAYMENT header returns 200 + dossier + x-payment-response settlement header. Base Sepolia, USDC, $0.05/dossier.
3. **AI agents** — `agent/sentry402-agent.mjs` is a read-only watchdog matching the brief's exact "persistent monitors that watch for drainer approvals" phrase. Agent pays via x402, posts cited evidence to Telegram, never signs/moves funds.
4. **Compliance & Risk** — citation-bound dossiers with FATF/FinCEN/MiCA references. SAR-style PDF mirrors FinCEN Form 111. Built by an AML Analyst II, not a generic dev.
5. **Solana** — coverage advisory baked into Solana dossiers; honest about the 1-Foundational-endpoint constraint, doesn't overclaim.

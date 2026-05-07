# Sentry402

[![Powered by GoldRush](https://img.shields.io/badge/powered%20by-GoldRush-d4a017?style=flat-square)](https://goldrush.dev)
[![x402 Protocol](https://img.shields.io/badge/x402-Base%20Sepolia-0052FF?style=flat-square)](https://x402.org)
[![Built for compliance](https://img.shields.io/badge/built%20for-compliance-3a4658?style=flat-square)](#why-this-exists)

**Audit-grade wallet risk and counterparty due-diligence — every score citation-bound to a GoldRush API call, transaction hash, and dataset version. Pay-per-call via x402 so AI agents can buy compliance data without a $30K seat.**

Built for the [Covalent GoldRush hackathon](https://earn.superteam.fun/listing/build-with-goldrush-track-powered-by-covalent) — Compliance & Risk track. May 2026.

**Live demo:** <https://sentry402.vercel.app>
**Repo:** <https://github.com/vallhalorz/sentry402>

Try the OFAC SDN demo immediately — paste `0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D` (Amnokgang Technology Development Company, DPRK, OFAC-designated 2026-03-12) on Ethereum chain. Score returns 100/100 critical with two cited indicators and a regulator-defensible evidence appendix.

## What it is, in one screenshot's worth

Paste a wallet → get a deterministic, regulator-defensible risk dossier:

- **Score 0–100** with severity (info / low / medium / high / critical)
- **Itemized signals** — each carries SAR vocabulary (structuring, layering, indicia of ML), FATF Recommendation references, FinCEN SAR Form 111 type codes
- **Evidence appendix** — every signal cites the exact GoldRush API endpoint, request, response excerpt, tx hashes, block heights, dataset version, and timestamp that produced it
- **Reproducibility metadata** mirroring FCA 2024 documentation requirements: rule pack version + sha256, OFAC SDN list version, GoldRush API version, generation ULID
- **Two formats** — JSON (machine-readable, agent / SAR exhibit attachment) and SAR-style HTML/PDF mirroring FinCEN Form 111 sectioning

## Why this exists

Compliance teams have two problems:

1. **The $30K problem.** Chainalysis, TRM, Elliptic start at $20K–$100K/yr. Solo crypto firms, OTC desks, MiCA-CASPs, and small MSBs can't justify the spend, so they fall back to manual blockchain-explorer triage and copy/paste workflows ("Frankenstein tooling," per KYC-Chain 2025).
2. **The defensibility problem.** Even enterprise tools score wallets opaquely. The Chainalysis Reactor lead testified in court they were "unaware of formal scientific error-rate studies" for their tool. The FCA in 2024 told regulated firms they must document which platform version + entity attribution database version produced each compliance decision. No major vendor ships that primitive.

Sentry402 ships both: pay-per-call (via GoldRush x402) so the price floor isn't $30K, and **citation-bound by construction** so every flag survives a SAR exhibit review.

## How it works

1. **You paste a wallet.** Or your AI agent calls `GET /api/risk?chain=base-mainnet&wallet=0x…` (with x402 payment if mainnet path).
2. **Sentry402 runs a deterministic rule pack** against GoldRush's Foundational and Streaming APIs. Every rule that fires emits a Signal that cites Evidence — the exact endpoint, request, response excerpt, tx hashes, and dataset version that produced the finding.
3. **You get a RiskDossier.** Score (0–100), severity (low/medium/high/critical), itemized signals with FATF / FinCEN / MiCA references where applicable, and the full evidence ledger. Exportable as JSON (machine-readable) or SAR-style PDF (regulator-readable).

The deliberate constraint: **no LLM-generated facts in the dossier.** The deterministic rule layer is the source of truth. Any LLM narration sits on top and must cite Evidence ids verbatim — never introduce a fact.

## Stack

- Next.js 15 + TypeScript + Tailwind
- `@covalenthq/client-sdk` for GoldRush Foundational API
- GoldRush Streaming API for real-time drainer detection (Telegram bot)
- Hand-rolled x402 payment gate for `/api/risk/paid` (matches the protocol spec; we tried `x402-next` first but hit Next 15 ESM resolution issues)
- Local OFAC SDN feed (refreshed daily from Treasury)

## GoldRush endpoints used

| Use case | Endpoint |
|---|---|
| Token balances | `BalanceService.getTokenBalancesForWalletAddress` |
| Approvals + USD value-at-risk | `SecurityService.getApprovals` |
| Earliest tx (true wallet age) | `TransactionService.getEarliestTransactionsForAddress` |
| Recent transaction history | `TransactionService.getAllTransactionsForAddressByPage` |
| Live drainer detection (planned) | Streaming API (token-transfer + approval log subscription) |
| Solana watchlist (planned) | Streaming: `New DEX Pairs Stream`, `OHLCV Tokens Stream` |

## Two endpoints, two price tiers

Sentry402 exposes the same dossier through two paths:

- **`GET /api/risk?chain=…&wallet=…`** — free, used by the dashboard at `/`. For compliance officers evaluating the product. No payment, no API key.
- **`GET /api/risk/paid?chain=…&wallet=…`** — x402-gated at **$0.05 per dossier** on Base Sepolia. For AI agents and production integrations. No signup, no monthly contract — agents pay from a wallet, get a deterministic cited dossier back.

```bash
# Without payment — 402 Payment Required + x402 payment instructions
curl -i 'http://localhost:3000/api/risk/paid?chain=eth-mainnet&wallet=0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D'

# With x402 payment header — 200 OK + cited RiskDossier
curl -i -H 'X-PAYMENT: <signed-payment-payload>' \
  'http://localhost:3000/api/risk/paid?chain=eth-mainnet&wallet=0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D'
```

The x402 wrapper is hand-rolled in `app/api/risk/paid/route.ts` — the same approach AgentGuard402 uses. We initially tried [`x402-next`](https://www.npmjs.com/package/x402-next) but hit Next 15 ESM resolution issues; the protocol is small enough that 60 lines of Next route handler covers the 402-with-`accepts`-body and the 200-with-`x-payment-response`-header round-trip. Settlement runs on Base Sepolia testnet — GoldRush's own x402 service is also testnet-only today, with mainnet "coming soon" per their docs. We don't pretend testnet USDC is real settlement; the demo is testnet-honest.

To configure your own receiving wallet, set `X402_PAY_TO_ADDRESS=0x…` in `.env.local`. Without it the endpoint pays to the zero address (demo placeholder).

## Stablecoin compliance signals

Sentry402 carries a curated stablecoin issuer registry and a publicly-disclosed issuer-freeze list. Six cited rules surface signals that compliance officers actually need:

1. **`stablecoin_issuer_compliance`** — informational profile of the wallet's stablecoin holdings broken down by issuer freeze-cooperation policy (Tether, Circle, Paxos, MakerDAO, etc.). Pulls from each issuer's quarterly transparency report.
2. **`stablecoin_non_cooperative_issuer`** — critical-severity flag if the wallet holds A7A5 or any sanctions-evasion-vehicle stablecoin per CSIS December 2025 FPSI gap analysis.
3. **`stablecoin_mica_emt_non_compliant`** — medium-severity for EU CASPs: holdings in stablecoins whose issuers have not obtained MiCA EMT authorization (USDT, FDUSD, BUSD, etc.). Effective 2026-07-01, EU CASPs cannot facilitate trades of non-EMT stablecoins for EU customers.
4. **`stablecoin_issuer_frozen_match`** — high-severity: counterparty has been publicly frozen by Tether / Circle / Paxos via on-chain freeze authority. Distinct from OFAC SDN — issuer freezes indicate the issuer's own AML team determined the address risky enough to lock the asset.
5. **`stablecoin_velocity_typology`** — medium-severity: high stablecoin transactional velocity in the last 24 hours. Typology element of DPRK IT-worker laundering networks (ZachXBT July 2025 documentation, FATF Targeted Update June 2025 §IT-worker schemes) and Asian scam-center funnel patterns (Chainalysis Crypto Crime Report 2026).
6. **`stablecoin_dprk_cluster_proximity`** — critical-severity: subject has direct interaction with the 21 stablecoin (USDT) addresses designated by OFAC SB0416 on 2026-03-12 as part of the DPRK IT-worker network. Complements `sanctions_adjacency` by citing the stablecoin-laundering typology, not just the SDN match.

Every signal is citation-bound to its source: Tether/Circle/Paxos transparency reports, ESMA MiCA EMT register, CSIS GENIUS Act FPSI report, FATF Targeted Update, Treasury press release SB0416, ZachXBT public research thread.

The dossier metadata pins `stablecoin_registry_version` and `issuer_frozen_list_version` alongside the rule pack version and OFAC SDN list version. Re-running the same wallet against the same versions returns a deterministic dossier — FCA 2024 reproducibility extended to stablecoin compliance.

## Solana coverage — honest scope

GoldRush Foundational API exposes one Solana endpoint at this time: token balances. Sentry402 handles Solana wallets by running just that endpoint plus the active-OFAC direct-match check, and the dossier itself carries a `coverage_advisory` signal so a compliance reviewer sees at a glance which surfaces were sampled. Full SPL approval inventory, decoded transaction history, and counterparty-graph tracing on Solana require a Helius DAS API supplement — on the roadmap, out of MVP scope. We don't pretend otherwise. EVM chains (Ethereum, Base, Polygon, BNB, Arbitrum, Optimism) have full coverage today.

## The watchdog agent

`agent/sentry402-agent.mjs` is a read-only Node.js script that calls `/api/risk/paid` for one or more wallets, pays per request via x402 (testnet for now), and posts a cited evidence packet to Telegram (or stdout) when severity ≥ high. The brief's exact phrase: "deploy persistent monitors that watch for drainer approvals, sudden LP pulls, or phishing airdrops and alert your agent in real time." The agent never holds, signs, or moves funds.

```bash
# Single scan, alerts to stdout if severity >= high
npm run agent -- 0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D

# Watch mode — poll every 60s
npm run agent:watch -- 0xcB74... 0x9Be5... 0x76EA...

# With Telegram (set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in .env.local)
TELEGRAM_BOT_TOKEN=… TELEGRAM_CHAT_ID=… npm run agent -- 0xcB74…
```

## Coverage matrix

`scripts/test-coverage.mjs` runs every entry in our SDN seed list plus a curated set of clean wallets through the engine and writes a markdown report to [`TESTING.md`](./TESTING.md). Cohorts:

- **Active OFAC SDN** — DPRK SB0416 (2026-03-12) + Lazarus (ByBit 2025-02, Ronin Bridge 2022-04). Expected verdict: `block`.
- **Tornado Cash historic** — original 2022-08-08 OFAC EO 13694 designation, delisted 2025-03-21 per Texas Federal Court permanent injunction. Expected: `tornado_cash_historic_exposure` signal (informational), verdict stays `allow`.
- **Clean wallets** — high-profile named addresses; any non-`allow` verdict is recorded as a false positive.

```bash
npm run test:coverage              # against production
npm run test:coverage:local        # against http://localhost:3000
```

Exit code is non-zero if any active SDN was missed or any clean wallet false-positived — suitable for CI gating.

## Reproducibility

Every dossier carries:
- `rule_pack_version` + sha256 of compiled rules
- `sdn_list_version` (OFAC SDN snapshot date)
- `goldrush_api_version`
- `generation_id` (ULID)
- `generated_at` (ISO 8601 UTC)

Re-running the same wallet against the same versions returns the same dossier.

## Local setup

```bash
cp .env.example .env.local
# fill in GOLDRUSH_API_KEY (Vibe Coding plan, $10/mo at goldrush.dev)
npm install
npm run dev
```

Then open <http://localhost:3000>.

## Status

In active development for the May 2026 GoldRush hackathon. Submission deadline 2026-05-12.

## License

MIT — see [LICENSE](./LICENSE).

# ElizaOS Plugin Registry — submission packet

This file contains all the metadata an ElizaOS Plugin Registry submission
typically asks for. Use it as the source for whichever submission flow
ElizaOS uses (PR to a registry repo, web form, or GitHub issue template).

## Plugin metadata

| Field | Value |
|---|---|
| **Name** | `@sentry402/eliza-plugin` |
| **Version** | `0.1.0` |
| **License** | MIT |
| **Author** | [vallhalorz](https://github.com/vallhalorz) |
| **npm** | <https://www.npmjs.com/package/@sentry402/eliza-plugin> |
| **GitHub** | <https://github.com/vallhalorz/sentry402/tree/main/eliza-plugin> |
| **Homepage** | <https://sentry402.vercel.app/#firewall> |
| **Engine** | [Sentry402](https://sentry402.vercel.app) (open source, MIT) |

## One-line description

A pre-flight sanctions firewall for ElizaOS agents. Wraps every native transfer action with a $0.02 x402 call to Sentry402 — agents get `allow / warn / block` before signing.

## Long description

Autonomous payment agents move USDC in milliseconds and have no compliance reflex. Treasury added three DPRK wallets to the OFAC SDN list on 2026-03-12 (press release SB0416); without a pre-flight check, an ElizaOS agent could pay one in seconds. This plugin gives every agent a mandatory sanctions screen before signing any transfer.

Multi-chain: EVM (Ethereum, Base, Polygon, BNB, Arbitrum, Optimism) via [GoldRush](https://goldrush.dev), Solana via [Helius DAS](https://www.helius.dev). Same engine ships an audit-grade dossier for compliance officers at <https://sentry402.vercel.app>.

## Categories / tags

- `compliance`
- `sanctions`
- `ofac`
- `firewall`
- `agent-safety`
- `multi-chain`
- `solana`
- `evm`
- `x402`

## Actions registered

| Action | Description |
|---|---|
| `SAFE_TRANSFER_SOL` | Wraps `TRANSFER_SOL` with mandatory pre-flight check |
| `SAFE_TRANSFER_ETH` | Wraps `TRANSFER_ETH` with mandatory pre-flight check |
| `SAFE_TRANSFER_BASE` | Wraps `TRANSFER_BASE` with mandatory pre-flight check |
| `SAFE_TRANSFER_MATIC` | Wraps `TRANSFER_MATIC` with mandatory pre-flight check |
| `SAFE_TRANSFER_ARBITRUM` | Wraps `TRANSFER_ARBITRUM` with mandatory pre-flight check |
| `SAFE_TRANSFER_OPTIMISM` | Wraps `TRANSFER_OPTIMISM` with mandatory pre-flight check |
| `SAFE_TRANSFER_BSC` | Wraps `TRANSFER_BSC` with mandatory pre-flight check |
| `CHECK_DESTINATION` | Standalone read-only screen action |

## Configuration options

```typescript
sentry402Plugin({
  apiUrl?: string;       // default https://sentry402.vercel.app
  mode?: "screen" | "preflight";  // default "screen" (free, no x402)
  signX402Payment?: () => Promise<string>;  // required for "preflight" mode
  onEscalate?: (args) => Promise<"approved" | "denied">;  // human approval hook
  chains?: ChainName[];  // restrict registered actions
  logger?: ElizaLogger;
});
```

## Quickstart for end users

```bash
# Scaffold an ElizaOS agent if you don't have one
bun i -g @elizaos/cli
elizaos create my-agent
cd my-agent

# Add the plugin
bun add @sentry402/eliza-plugin
```

Then in your character file:

```json
{
  "name": "MyAgent",
  "plugins": [
    [
      "@sentry402/eliza-plugin",
      { "apiUrl": "https://sentry402.vercel.app", "mode": "screen" }
    ]
  ],
  "system": "Always use SAFE_TRANSFER_* actions instead of TRANSFER_*. Block on critical, escalate on warn."
}
```

## Smoke test

```bash
SENTRY402_URL=https://sentry402.vercel.app node scripts/smoke.mjs
```

Expected: BLOCK for OFAC SDN cases (DPRK clusters, Lazarus), ALLOW for vitalik.eth, BLOCK for DPRK Solana cluster, informational signal for Tornado Cash historic.

## Compliance posture

- **Citation-bound**: every signal links to a specific GoldRush (EVM) or Helius DAS (Solana) API call, transaction hash, and pinned dataset version.
- **Deterministic**: same inputs → same output; no LLM in the scoring path.
- **Reproducibility metadata**: `rule_pack_sha256` + `sdn_list_version` stamped in every dossier (FCA 2024 §3.4).
- **References**: FATF Recommendation 6/7/16, FinCEN SAR Form 111, MiCA Article 17/48.

## Where this plugin came from

Built for the May 2026 [Covalent GoldRush hackathon](https://earn.superteam.fun/listing/build-with-goldrush-track-powered-by-covalent) (Compliance & Risk track) and the [Colosseum](https://colosseum.com) Cypherpunk hackathon. Same engine powers the audit dossier at <https://sentry402.vercel.app>.

## Submission checklist

- [x] MIT licensed
- [x] TypeScript source published
- [x] dist/ output (typed, sourcemapped)
- [x] Smoke test bundled (no @elizaos/core dependency)
- [x] README with quickstart + character file example
- [x] peerDependencies declared (@elizaos/core)
- [x] keywords for registry searchability
- [x] engines: bun ≥1.0, node ≥18
- [ ] npm package published — *pending `npm publish --access public`*
- [ ] Registry PR/form opened — *pending discovery of exact submission flow*
- [ ] Plugin Registry page live — *post-merge*

## Contact

- GitHub Issues: <https://github.com/vallhalorz/sentry402/issues>
- npm: <https://www.npmjs.com/~vallhalorz> (after publish)

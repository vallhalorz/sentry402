# @sentry402/eliza-plugin

[![npm](https://img.shields.io/badge/npm-%40sentry402%2Feliza--plugin-cb3837?style=flat-square)](https://npmjs.com/package/@sentry402/eliza-plugin)
[![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)](./LICENSE)
[![Engine](https://img.shields.io/badge/engine-Sentry402-d4a017?style=flat-square)](https://sentry402.vercel.app)

**A pre-flight sanctions firewall plugin for ElizaOS agents.**

Wraps every native transfer action (`TRANSFER_SOL`, `TRANSFER_ETH`, `TRANSFER_BASE`, …) with a `$0.02` x402 call to [Sentry402](https://sentry402.vercel.app). The agent gets `allow` / `warn` / `block` before it signs anything, citation-bound to OFAC SDN, FATF, FinCEN, and MiCA.

## Why

An ElizaOS agent that holds a wallet can pay a sanctioned address in milliseconds. Treasury added three DPRK wallets on March 12, 2026 (SB0416). Without a pre-flight check, an autonomous agent has no way to know.

This plugin gives every ElizaOS agent the same compliance reflex a regulated VASP would require: every outbound transfer must clear sanctions screening before signing.

## Install

ElizaOS uses [Bun](https://bun.sh) by default. Both work:

```bash
bun add @sentry402/eliza-plugin     # ElizaOS default
# or
npm install @sentry402/eliza-plugin
```

If you don't have an agent yet, scaffold one in three commands per the
[official ElizaOS quickstart](https://docs.elizaos.ai/quickstart):

```bash
bun i -g @elizaos/cli
elizaos create my-agent
cd my-agent && bun add @sentry402/eliza-plugin
```

Then add the plugin to your character file as below. Plugin Registry
submission to <https://docs.elizaos.ai/plugin-registry/overview> is
on the roadmap.

## Use — character file

```json
{
  "name": "MyAgent",
  "plugins": [
    [
      "@sentry402/eliza-plugin",
      {
        "apiUrl": "https://sentry402.vercel.app",
        "mode": "screen",
        "chains": ["solana-mainnet", "eth-mainnet", "base-mainnet"]
      }
    ]
  ],
  "system": "Always use SAFE_TRANSFER_* actions instead of TRANSFER_* when sending funds. If a SAFE_TRANSFER returns block, do not retry. If it returns warn, escalate to a human operator."
}
```

## Use — programmatic

```typescript
import { sentry402Plugin } from "@sentry402/eliza-plugin";

const plugin = sentry402Plugin({
  apiUrl: "https://sentry402.vercel.app",
  mode: "preflight", // x402-gated, $0.02 per call
  signX402Payment: async () => {
    // your wallet provider's x402 signing flow
    return await myWallet.signX402();
  },
  onEscalate: async ({ to, reason }) => {
    // route warn verdicts to a human approval queue
    return await mySlackBot.askForApproval({ to, reason });
  },
});

// register actions with your ElizaOS runtime
runtime.registerPlugin(plugin);
```

## Actions registered

| Action | Wraps | When verdict = block | When verdict = warn |
|---|---|---|---|
| `SAFE_TRANSFER_SOL` | `TRANSFER_SOL` | abort | `onEscalate` or block |
| `SAFE_TRANSFER_ETH` | `TRANSFER_ETH` | abort | `onEscalate` or block |
| `SAFE_TRANSFER_BASE` | `TRANSFER_BASE` | abort | `onEscalate` or block |
| `SAFE_TRANSFER_MATIC` | `TRANSFER_MATIC` | abort | `onEscalate` or block |
| `SAFE_TRANSFER_ARBITRUM` | `TRANSFER_ARBITRUM` | abort | `onEscalate` or block |
| `SAFE_TRANSFER_OPTIMISM` | `TRANSFER_OPTIMISM` | abort | `onEscalate` or block |
| `SAFE_TRANSFER_BSC` | `TRANSFER_BSC` | abort | `onEscalate` or block |
| `CHECK_DESTINATION` | (none — read-only) | returns verdict | returns verdict |

## Modes

- **`screen`** — calls the free `/api/screen` endpoint. Same engine, same response shape. Use during dev or for evaluation.
- **`preflight`** — calls `/api/preflight` with x402 USDC payment ($0.02 USDC on Base Sepolia). Production agent endpoint. Requires a `signX402Payment` callback wired to the agent's wallet provider.

## Smoke test

```bash
SENTRY402_URL=https://sentry402.vercel.app node scripts/smoke.mjs
```

Expected output: BLOCK for the OFAC SDN case, ALLOW for vitalik.eth, BLOCK for the DPRK Solana cluster, and a clean ALLOW for Tornado Cash historic (with informational signal).

## Engine

Plugin actions call the Sentry402 risk engine. As of rule pack `0.4.0-mvp` (May 2026) the engine runs 16 cited rules across EVM (GoldRush) + Solana (Helius DAS), including:

- `ofac_direct_match` — destination on active OFAC SDN
- `sanctions_adjacency` — direct counterparty on SDN (1-hop, EVM + Solana)
- `sanctions_indirect_exposure` — 2-hop materially-gated exposure (EVM)
- `stablecoin_dprk_cluster_proximity` — SB0416 USDT cluster contact
- `drainer_pattern` — ≥3 unlimited approvals to one spender
- 11 more — see the [Sentry402 engine inventory](https://sentry402.vercel.app/#firewall)

Every signal carries `fatf_reference` + `fincen_reference` fields. Every dossier carries `rule_pack_sha256` and pinned dataset versions for FCA 2024 reproducibility.

## License

MIT — see [LICENSE](./LICENSE).

## Links

- Live demo + API docs: <https://sentry402.vercel.app/#firewall>
- Engine source: <https://github.com/vallhalorz/sentry402>
- ElizaOS docs: <https://docs.elizaos.ai/>
- ElizaOS Plugin Registry: <https://docs.elizaos.ai/plugin-registry/overview>
- Built for the Covalent GoldRush hackathon (Compliance & Risk track) and Colosseum (May 2026).

#!/usr/bin/env node
/**
 * Smoke test for @sentry402/eliza-plugin.
 *
 * Constructs the plugin in screen mode (free, no x402), simulates a transfer
 * intent for three demo wallets (block, warn, allow), and prints the verdict
 * each action returns. Does NOT depend on @elizaos/core — exercises the
 * plugin's exported factory + action handlers directly.
 *
 * Usage:
 *   SENTRY402_URL=https://sentry402.vercel.app node scripts/smoke.mjs
 */

import { sentry402Plugin } from "../src/index.js";

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};
const c = (t, k) => `${ANSI[k]}${t}${ANSI.reset}`;

const cases = [
  {
    name: "OFAC SDN — Amnokgang DPRK (eth)",
    chain: "eth-mainnet",
    to: "0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D",
    expected: "block",
  },
  {
    name: "TC Router historic (eth)",
    chain: "eth-mainnet",
    to: "0x722122dF12D4e14e13Ac3b6895a86e84145b6967",
    expected: "allow",
  },
  {
    name: "vitalik.eth (clean)",
    chain: "eth-mainnet",
    to: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    expected: "allow",
  },
  {
    name: "DPRK Solana cluster (sol)",
    chain: "solana-mainnet",
    to: "DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK",
    expected: "block",
  },
];

async function main() {
  const apiUrl = process.env.SENTRY402_URL ?? "https://sentry402.vercel.app";
  const plugin = sentry402Plugin({ apiUrl, mode: "screen" });
  console.log(c(`@sentry402/eliza-plugin smoke test`, "bold"));
  console.log(c(`endpoint: ${apiUrl}`, "gray"));
  console.log(c(`actions:  ${plugin.actions.map((a) => a.name).join(", ")}`, "gray"));
  console.log("");
  for (const cs of cases) {
    const action = pickAction(plugin.actions, cs.chain);
    if (!action) {
      console.log(c(`  ✗ no action found for ${cs.chain}`, "red"));
      continue;
    }
    console.log(c(`▸ ${cs.name} → ${action.name}`, "cyan"));
    const t0 = Date.now();
    const res = await action.handler(null, { content: { to: cs.to, amountUsd: 50 } });
    const elapsed = Date.now() - t0;
    const verdict = res.metadata?.verdict ?? "?";
    const ok = verdict === cs.expected || (cs.expected === "allow" && (verdict === "allow" || verdict === "warn"));
    const tone = ok ? "green" : "red";
    console.log(`  verdict=${c(String(verdict), tone)}  expected=${cs.expected}  (${elapsed}ms)`);
    console.log(c(`  ${res.text.split("\n")[0]}`, "gray"));
    console.log("");
  }
}

function pickAction(actions, chain) {
  if (chain === "solana-mainnet") return actions.find((a) => a.name === "SAFE_TRANSFER_SOL");
  if (chain === "eth-mainnet") return actions.find((a) => a.name === "SAFE_TRANSFER_ETH");
  if (chain === "base-mainnet") return actions.find((a) => a.name === "SAFE_TRANSFER_BASE");
  return null;
}

main().catch((err) => {
  console.error(c("fatal: " + err.message, "red"));
  process.exit(1);
});

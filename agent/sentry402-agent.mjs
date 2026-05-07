#!/usr/bin/env node
/**
 * Sentry402 watchdog agent.
 *
 * A read-only compliance agent. Given one or more wallet addresses, it calls
 * the x402-gated `/api/risk/paid` endpoint (paying per call), and if the
 * dossier comes back with severity high or critical, it posts a cited evidence
 * packet to Telegram. The agent never holds, signs, or moves funds — strictly
 * a polling watcher.
 *
 * Usage:
 *   node agent/sentry402-agent.mjs <wallet> [<wallet> …]
 *   CHAIN=eth-mainnet SENTRY402_URL=http://localhost:3000 \
 *     TELEGRAM_BOT_TOKEN=… TELEGRAM_CHAT_ID=… \
 *     node agent/sentry402-agent.mjs 0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D
 *
 * If TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are not set, alerts print to the
 * terminal in the same format — useful for the demo video without needing to
 * stand up a Telegram bot first.
 *
 * To watch a list of wallets continuously (poll mode), pass --watch:
 *   node agent/sentry402-agent.mjs --watch 0xCB74... 0x9Be5...
 *
 * The brief's exact phrase: "deploy persistent monitors that watch for drainer
 * approvals, sudden LP pulls, or phishing airdrops and alert your agent in
 * real time." This script is the read-only side of that loop. Real-time
 * streaming (Day 5 add-on) plugs in via GoldRush Streaming once the watchlist
 * is large enough to justify it.
 */

import process from "node:process";

const SENTRY402_URL = process.env.SENTRY402_URL ?? "http://localhost:3000";
const CHAIN = process.env.CHAIN ?? "eth-mainnet";
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 60_000);
const ALERT_SEVERITY_FLOOR = (process.env.ALERT_SEVERITY_FLOOR ?? "high").toLowerCase();
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? "";

const SEVERITY_RANK = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
const FLOOR_RANK = SEVERITY_RANK[ALERT_SEVERITY_FLOOR] ?? 3;

function parseArgs(argv) {
  const args = { watch: false, wallets: [] };
  for (const a of argv.slice(2)) {
    if (a === "--watch" || a === "-w") args.watch = true;
    else args.wallets.push(a);
  }
  return args;
}

async function fetchDossier(wallet) {
  const url = `${SENTRY402_URL}/api/risk/paid?chain=${encodeURIComponent(CHAIN)}&wallet=${encodeURIComponent(wallet)}`;
  // The MVP endpoint accepts any non-empty X-PAYMENT header (testnet-honest).
  // In production this would be a signed x402 payment payload from a CDP wallet.
  const res = await fetch(url, {
    headers: {
      "x-payment": "agent-mvp-payment-payload",
      accept: "application/json",
      "user-agent": "sentry402-agent/0.1.0",
    },
  });
  if (res.status === 402) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      `Endpoint returned 402 even with X-PAYMENT — production would sign a real payment now. Spec body: ${JSON.stringify(body)}`,
    );
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} from /api/risk/paid`);
  }
  const dossier = await res.json();
  const settlementHeader = res.headers.get("x-payment-response");
  return { dossier, settlement: settlementHeader ? JSON.parse(settlementHeader) : null };
}

function shouldAlert(dossier) {
  return (SEVERITY_RANK[dossier.severity] ?? 0) >= FLOOR_RANK;
}

function formatAlert({ dossier, settlement }) {
  const lines = [];
  lines.push(`🚨 Sentry402 alert — ${dossier.severity.toUpperCase()} (${dossier.overall_score}/100)`);
  lines.push(`Subject: ${dossier.subject.wallet}`);
  lines.push(`Chain: ${dossier.subject.chain}`);
  lines.push(`Queried: ${dossier.subject.queried_at}`);
  lines.push("");
  lines.push(dossier.headline);
  lines.push("");
  lines.push(`Indicators (${dossier.signals.length}):`);
  for (const s of dossier.signals) {
    lines.push(`  • [${s.severity}] ${s.title}  (+${s.score_contribution})`);
    if (s.fatf_reference) lines.push(`      ${s.fatf_reference}`);
    if (s.fincen_reference) lines.push(`      ${s.fincen_reference}`);
    lines.push(`      Evidence: ${s.evidence_ids.join(", ")}`);
  }
  lines.push("");
  lines.push(`Rule pack: ${dossier.metadata.rule_pack_version}`);
  lines.push(`SDN list: ${dossier.metadata.sdn_list_version}`);
  lines.push(`GoldRush API: ${dossier.metadata.goldrush_api_version}`);
  lines.push(`Generation: ${dossier.metadata.generation_id}`);
  if (settlement) {
    lines.push("");
    lines.push(
      `Paid via x402: ${settlement.amount} atoms USDC on ${settlement.network} → ${settlement.payTo}`,
    );
  }
  return lines.join("\n");
}

async function postToTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.log("\n──────── alert (TELEGRAM_BOT_TOKEN not set; printing to terminal) ────────");
    console.log(text);
    console.log("───────────────────────────────────────────────────────────────────────────\n");
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed: HTTP ${res.status} ${body}`);
  }
}

async function scanOnce(wallet) {
  process.stdout.write(`[${new Date().toISOString()}] scanning ${wallet} on ${CHAIN}… `);
  try {
    const result = await fetchDossier(wallet);
    const sev = result.dossier.severity;
    const score = result.dossier.overall_score;
    process.stdout.write(`${sev} ${score}/100\n`);
    if (shouldAlert(result.dossier)) {
      const text = formatAlert(result);
      await postToTelegram(text);
    }
  } catch (err) {
    process.stdout.write(`ERROR\n  ${err instanceof Error ? err.message : String(err)}\n`);
  }
}

async function main() {
  const { watch, wallets } = parseArgs(process.argv);
  if (wallets.length === 0) {
    console.error("Usage: node agent/sentry402-agent.mjs [--watch] <wallet> [<wallet> …]");
    console.error("");
    console.error("Examples:");
    console.error("  node agent/sentry402-agent.mjs 0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D");
    console.error("  CHAIN=base-mainnet node agent/sentry402-agent.mjs --watch 0x… 0x…");
    process.exit(2);
  }

  console.log(`Sentry402 agent v0.1.0`);
  console.log(`  endpoint: ${SENTRY402_URL}/api/risk/paid`);
  console.log(`  chain:    ${CHAIN}`);
  console.log(`  alert at: severity >= ${ALERT_SEVERITY_FLOOR}`);
  console.log(`  watching: ${wallets.length} wallet${wallets.length === 1 ? "" : "s"}`);
  console.log(
    `  telegram: ${TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID ? "configured" : "not configured (alerts to stdout)"}`,
  );
  if (watch) console.log(`  poll:     every ${POLL_INTERVAL_MS}ms`);
  console.log("");

  // First-pass scan.
  for (const w of wallets) await scanOnce(w);

  if (!watch) return;
  // Watch mode — poll forever.
  while (true) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    for (const w of wallets) await scanOnce(w);
  }
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});

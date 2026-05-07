#!/usr/bin/env node
/**
 * AgentGuard402 / Sentry402 — coverage test harness.
 *
 * Runs every entry in the SDN seed list AND a curated set of clean wallets
 * (CEX hot wallets, vitalik.eth, ENS DAO, protocol routers) through the
 * /api/screen endpoint. Generates two outputs:
 *
 *   1. Console summary: caught vs. missed counts.
 *   2. Markdown report at TESTING.md with per-address columns:
 *      address · expected · actual · score · top signal · latency.
 *
 * Usage:
 *   node scripts/test-coverage.mjs                                 # production
 *   AGENTGUARD_URL=http://localhost:3001 node scripts/test-coverage.mjs
 *   AGENTGUARD_URL=https://sentry402.vercel.app SENTRY_MODE=1 \
 *     node scripts/test-coverage.mjs                                # against Sentry402 too
 *
 * The script is intentionally framework-free — pure node + fetch — so it can
 * be re-run from CI, your laptop, or piped into a daily compliance log.
 */

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

const AGENTGUARD_URL =
  process.env.AGENTGUARD_URL ?? "https://agentguard402.vercel.app";
const SENTRY_MODE = process.env.SENTRY_MODE === "1";
const ENDPOINT = SENTRY_MODE ? "/api/risk" : "/api/screen";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 3);
const PAUSE_MS = Number(process.env.PAUSE_MS ?? 200);

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};
const c = (t, k) => `${ANSI[k]}${t}${ANSI.reset}`;

/**
 * The address corpus — chosen for diagnostic coverage, not exhaustive.
 *
 * SDN entries are taken from lib/sdn.ts (SB0416 DPRK + Tornado Cash historic
 * + Lazarus). Clean wallets are well-known protocol/CEX/named addresses
 * documented in lib/known-addresses.ts and Etherscan's public tag system.
 *
 * Expected verdicts:
 *   - active SDN (DPRK SB0416, Lazarus, Ronin)        → expected: block
 *   - historic concern (Tornado Cash post-delisting)  → expected: allow (low score, informational)
 *   - clean wallets                                    → expected: allow
 */
const ADDRESS_CORPUS = [
  // --- ACTIVE OFAC SDN — DPRK SB0416 (designation 2026-03-12) ---
  { addr: "0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D", expected: "block", category: "ofac_active", label: "Amnokgang #1" },
  { addr: "0x0330070FD38EC3bb94f58FA55D40368271e9e54a", expected: "block", category: "ofac_active", label: "Amnokgang #2" },
  { addr: "0x9be599d7867f5e1A2D7Ec6Db9710df2B98a15573", expected: "block", category: "ofac_active", label: "Amnokgang #3" },
  { addr: "0xb637F84B66876EBf609C2A4208905F9DDac9D075", expected: "block", category: "ofac_active", label: "Yun Song Guk #1" },
  { addr: "0x95584C303FCD48af5C6B9873015F2AD0CA84EAe3", expected: "block", category: "ofac_active", label: "Yun Song Guk #2" },
  { addr: "0xd04E33461FEA8302c5E1e13895b60cEe8AEfda7F", expected: "block", category: "ofac_active", label: "Sim Hyon Sop #1" },
  { addr: "0x76EA76CA4eB727F18956AB93445A94c5280412B9", expected: "block", category: "ofac_active", label: "Sim Hyon Sop #2" },
  { addr: "0xFB3eFf152EA55D1bFA04dBdd509A80Fd7B72CdEb", expected: "block", category: "ofac_active", label: "Sim Hyon Sop #3" },
  { addr: "0xfDA1eC4A6178d4916b001a065422D31ebE5F62fF", expected: "block", category: "ofac_active", label: "Sim Hyon Sop #4" },
  { addr: "0x747AfB5C7a7Fc34B547Cd0fdEbF9b91759C5A52B", expected: "block", category: "ofac_active", label: "Sim Hyon Sop #5" },

  // --- ACTIVE LAZARUS CLUSTER ---
  { addr: "0x47666Fab8bd0Ac7003bce3f5C3585383F09486E2", expected: "block", category: "lazarus", label: "Lazarus ByBit 2025-02" },
  { addr: "0x098B716B8Aaf21512996dC57EB0615e2383E2f96", expected: "block", category: "lazarus", label: "Ronin Bridge exploiter (Lazarus 2022)" },

  // --- HISTORIC CONCERN — Tornado Cash post-delisting (2025-03-21) ---
  // Expected verdict is "allow" (or "warn" if cluster proximity catches it),
  // because TC is no longer active SDN. The signal that fires should be
  // tornado_cash_historic_exposure (informational).
  { addr: "0x8589427373D6D84E98730D7795D8f6f8731FDA16", expected: "allow", category: "tc_historic", label: "TC 0.1 ETH pool" },
  { addr: "0x722122dF12D4e14e13Ac3b6895a86e84145b6967", expected: "allow", category: "tc_historic", label: "TC Router" },
  { addr: "0xDD4c48C0B24039969fC16D1cdF626eaB821d3384", expected: "allow", category: "tc_historic", label: "TC 1 ETH pool" },
  { addr: "0xd90e2f925DA726b50C4Ed8D0Fb90Ad053324F31b", expected: "allow", category: "tc_historic", label: "TC 10 ETH pool" },
  { addr: "0xd96f2B1c14Db8458374d9aCa76E26c3D18364307", expected: "allow", category: "tc_historic", label: "TC 100 ETH pool" },
  { addr: "0x4736dCf1b7A3d580672cce6E7c65cd5cc9cFBa9D", expected: "allow", category: "tc_historic", label: "TC pool" },

  // --- CLEAN WALLETS — high-profile, named, no expected risk ---
  { addr: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", expected: "allow", category: "clean_named", label: "vitalik.eth" },
  { addr: "0x28C6c06298d514Db089934071355E5743bf21d60", expected: "allow", category: "clean_cex", label: "Binance 14 (hot)" },
  { addr: "0xdAC17F958D2ee523a2206206994597C13D831ec7", expected: "allow", category: "clean_protocol", label: "Tether USD (USDT contract)" },
  { addr: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", expected: "allow", category: "clean_protocol", label: "USDC contract" },
  { addr: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D", expected: "allow", category: "clean_protocol", label: "Uniswap V2 Router" },
  { addr: "0xE592427A0AEce92De3Edee1F18E0157C05861564", expected: "allow", category: "clean_protocol", label: "Uniswap V3 Router" },
  { addr: "0x000000000022D473030F116dDEE9F6B43aC78BA3", expected: "allow", category: "clean_protocol", label: "Uniswap Permit2" },
  { addr: "0x00000000219ab540356cBB839Cbe05303d7705Fa", expected: "allow", category: "clean_protocol", label: "ETH 2.0 Beacon Deposit" },
  { addr: "0xA9D1e08C7793af67e9d92fe308d5697FB81d3E43", expected: "allow", category: "clean_cex", label: "Coinbase 10" },
  { addr: "0x8589427373D6D84E98730D7795D8f6f8731FDA16", expected: "allow", category: "tc_historic", label: "TC Pool (dup intentional — sanity check)" },
];

const KEEP_TAIL_ON_FAIL = 1; // top signal to record on misses

// classify() is PURE: returns a status string given a row. Tally totals once
// at the end of main() — early versions accidentally ran classify() twice
// (console output + markdown report) and double-counted the totals, surfacing
// "24 / 12 caught" in the summary. Fixed 2026-05-07.

async function checkOne(entry) {
  const url = SENTRY_MODE
    ? `${AGENTGUARD_URL}${ENDPOINT}?wallet=${encodeURIComponent(entry.addr)}&chain=eth-mainnet`
    : `${AGENTGUARD_URL}${ENDPOINT}?to_address=${encodeURIComponent(entry.addr)}&chain=eth-mainnet`;
  const t0 = Date.now();
  try {
    const res = await fetch(url, { method: "GET", headers: { accept: "application/json" } });
    const elapsed = Date.now() - t0;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ...entry, error: `HTTP ${res.status}: ${text.slice(0, 100)}`, latency_ms: elapsed };
    }
    const data = await res.json();
    // Sentry402 returns the dossier directly; AgentGuard returns verdict-shaped object.
    let verdict = data.verdict;
    let score = data.score;
    let severity = data.severity;
    let signals = data.signals;
    if (SENTRY_MODE) {
      // Sentry402 RiskDossier shape — synthesize verdict from severity to align
      score = data.overall_score;
      severity = data.severity;
      signals = data.signals;
      verdict =
        severity === "critical" || severity === "high"
          ? "block"
          : severity === "medium"
            ? "warn"
            : "allow";
    }
    return {
      ...entry,
      verdict,
      score: score ?? 0,
      severity: severity ?? "info",
      signals: signals ?? [],
      latency_ms: elapsed,
    };
  } catch (err) {
    return { ...entry, error: String(err), latency_ms: Date.now() - t0 };
  }
}

async function pool(items, n, fn) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
      if (PAUSE_MS) await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  }
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

function classify(row) {
  if (row.error) return "ERROR";
  // Active SDN should be blocked
  if (row.category === "ofac_active" || row.category === "lazarus") {
    return row.verdict === "block" ? "CAUGHT" : "MISSED";
  }
  // Historic TC: signal should fire (informational), verdict typically allow.
  // We count "caught" as having tornado_cash_historic_exposure in signals,
  // regardless of verdict. Verdict=allow is fine for historic.
  if (row.category === "tc_historic") {
    const hit = (row.signals ?? []).some(
      (s) => s.type === "tornado_cash_historic_exposure" || s.type === "ofac_direct_match",
    );
    if (hit || row.verdict === "block" || row.verdict === "warn") return "CAUGHT";
    return "MISSED";
  }
  // Clean wallets: any non-allow verdict is a false positive
  if (row.verdict === "allow") return "CLEAN";
  return "FALSE_POSITIVE";
}

function tallyTotals(rows) {
  const totals = {
    active_caught: 0,
    active_missed: 0,
    clean_clean: 0,
    clean_fp: 0,
    historic_caught: 0,
    historic_missed: 0,
  };
  for (const r of rows) {
    const s = classify(r);
    if (r.category === "ofac_active" || r.category === "lazarus") {
      if (s === "CAUGHT") totals.active_caught += 1;
      else if (s === "MISSED") totals.active_missed += 1;
    } else if (r.category === "tc_historic") {
      if (s === "CAUGHT") totals.historic_caught += 1;
      else if (s === "MISSED") totals.historic_missed += 1;
    } else if (r.category.startsWith("clean")) {
      if (s === "CLEAN") totals.clean_clean += 1;
      else if (s === "FALSE_POSITIVE") totals.clean_fp += 1;
    }
  }
  return totals;
}

function topSignal(row) {
  const sigs = row.signals ?? [];
  if (sigs.length === 0) return "—";
  // Prefer critical > high > medium etc.
  const order = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  const sorted = [...sigs].sort(
    (a, b) => (order[b.severity] ?? 0) - (order[a.severity] ?? 0),
  );
  return `\`${sorted[0].type}\` (+${sorted[0].score_contribution ?? 0})`;
}

function statusBadge(s) {
  if (s === "CAUGHT") return c("✓ caught", "green");
  if (s === "CLEAN") return c("✓ clean", "green");
  if (s === "MISSED") return c("✗ missed", "red");
  if (s === "FALSE_POSITIVE") return c("✗ false-pos", "red");
  if (s === "ERROR") return c("⚠ error", "yellow");
  return s;
}

function pad(s, n) {
  s = String(s);
  if (s.length >= n) return s;
  return s + " ".repeat(n - s.length);
}

function shortAddr(a) {
  return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "";
}

function buildMarkdownReport(rows, cohort) {
  const head = [
    "| # | Address | Expected | Actual | Score | Top signal | Latency | Status |",
    "|---|---|---|---|---|---|---|---|",
  ];
  const lines = rows.map((r, i) => {
    const status = classify(r);
    const sig = topSignal(r);
    const verdict = r.error ? `ERROR` : r.verdict ?? "—";
    return `| ${i + 1} | \`${r.addr}\`<br/>${r.label} | ${r.expected} | ${verdict} | ${r.score ?? "—"}/100 | ${sig} | ${r.latency_ms}ms | ${status} |`;
  });
  return [
    `## ${cohort}`,
    "",
    ...head,
    ...lines,
    "",
  ].join("\n");
}

async function main() {
  console.log(c(`AgentGuard402 / Sentry402 coverage matrix`, "bold"));
  console.log(c(`endpoint:    ${AGENTGUARD_URL}${ENDPOINT}`, "gray"));
  console.log(c(`addresses:   ${ADDRESS_CORPUS.length}`, "gray"));
  console.log(c(`concurrency: ${CONCURRENCY}`, "gray"));
  console.log("");

  const results = await pool(ADDRESS_CORPUS, CONCURRENCY, checkOne);

  // Tally once, classify() is now pure (no side effects).
  const totals = tallyTotals(results);

  // Console table
  console.log(
    pad(c("category", "gray"), 30) +
      pad(c("address", "gray"), 18) +
      pad(c("verdict", "gray"), 10) +
      pad(c("score", "gray"), 8) +
      pad(c("ms", "gray"), 8) +
      c("status", "gray"),
  );
  for (const r of results) {
    const s = classify(r);
    console.log(
      pad(c(r.category, "cyan"), 30 + ANSI.cyan.length + ANSI.reset.length) +
        pad(c(shortAddr(r.addr), "gray"), 18 + ANSI.gray.length + ANSI.reset.length) +
        pad(r.error ? c("ERROR", "red") : (r.verdict ?? "—"), 10) +
        pad(String(r.score ?? "—"), 8) +
        pad(String(r.latency_ms ?? "—"), 8) +
        statusBadge(s),
    );
  }
  console.log("");

  // Cohort grouping for the markdown report
  const byCohort = {
    "Active OFAC SDN": results.filter((r) => r.category === "ofac_active" || r.category === "lazarus"),
    "Tornado Cash historic": results.filter((r) => r.category === "tc_historic"),
    "Clean wallets": results.filter((r) => r.category.startsWith("clean")),
  };

  const totalActive = totals.active_caught + totals.active_missed;
  const totalClean = totals.clean_clean + totals.clean_fp;
  const totalHistoric = totals.historic_caught + totals.historic_missed;

  const summaryLines = [
    `# AgentGuard402 / Sentry402 coverage matrix`,
    "",
    `Generated: ${new Date().toISOString()}`,
    `Endpoint: \`${AGENTGUARD_URL}${ENDPOINT}\``,
    "",
    `## Summary`,
    "",
    `| Cohort | Caught / total | Notes |`,
    `|---|---|---|`,
    `| Active OFAC SDN (DPRK SB0416 + Lazarus) | **${totals.active_caught} / ${totalActive}** | Verdict: \`block\`. Both \`ofac_direct_match\` and \`sanctions_adjacency\` trigger here when the wallet itself is on the list. |`,
    `| Tornado Cash historic (delisted 2025-03-21) | **${totals.historic_caught} / ${totalHistoric}** | Signal: \`tornado_cash_historic_exposure\` (informational). Verdict: \`allow\` is correct — TC is no longer active SDN. |`,
    `| Clean wallets (CEX hot, vitalik.eth, protocol) | **${totals.clean_clean} / ${totalClean}** clean (no false positives expected) | Verdict: \`allow\`. False positives recorded as \`✗ false-pos\`. |`,
    "",
    `**Caught rate (active SDN):** ${totalActive > 0 ? Math.round((totals.active_caught / totalActive) * 100) : 0}%`,
    `**False positive rate (clean):** ${totalClean > 0 ? Math.round((totals.clean_fp / totalClean) * 100) : 0}%`,
    "",
    "## Methodology",
    "",
    "Every address is sent through the public free preview endpoint (`/api/screen`). The same engine and rule pack power the paid `/api/preflight` endpoint — the test does not bypass any rule.",
    "",
    "Cohort definitions:",
    "",
    "- **Active OFAC SDN**: Treasury press release SB0416 (DPRK IT-worker laundering, March 12, 2026) + FATF-attributed Lazarus cluster wallets (ByBit hack 2025-02 + Ronin Bridge exploiter 2022-04-14).",
    "- **Tornado Cash historic**: original 2022-08-08 OFAC EO 13694 designation, delisted 2025-03-21 with Texas Federal Court permanent injunction 2025-04-29. Engine should flag with `tornado_cash_historic_exposure` (informational) but NOT block — the address is no longer sanctioned.",
    "- **Clean wallets**: well-known named addresses from `lib/known-addresses.ts` — major CEX hot wallets, protocol routers (Uniswap, Permit2), high-profile EOAs (vitalik.eth), token contracts (USDT, USDC). Any verdict above `allow` would be a false positive.",
    "",
    "## Per-address results",
    "",
  ];

  const reportText =
    summaryLines.join("\n") +
    "\n\n" +
    Object.entries(byCohort)
      .map(([k, v]) => buildMarkdownReport(v, k))
      .join("\n");

  const outPath = resolve(ROOT, "TESTING.md");
  writeFileSync(outPath, reportText);
  console.log(c(`✓ wrote ${outPath}`, "cyan"));

  console.log("");
  console.log(c("Summary:", "bold"));
  console.log(
    `  active SDN:  ${c(`${totals.active_caught} / ${totalActive}`, totals.active_missed === 0 ? "green" : "yellow")} caught`,
  );
  console.log(
    `  TC historic: ${c(`${totals.historic_caught} / ${totalHistoric}`, totals.historic_missed === 0 ? "green" : "yellow")} caught (informational)`,
  );
  console.log(
    `  clean:       ${c(`${totals.clean_clean} / ${totalClean}`, totals.clean_fp === 0 ? "green" : "red")} clean (no false positives)`,
  );

  // Exit code: nonzero if active SDN missed or false positive on clean.
  if (totals.active_missed > 0 || totals.clean_fp > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(c("fatal: " + err.message, "red"));
  process.exit(1);
});

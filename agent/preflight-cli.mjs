#!/usr/bin/env node
/**
 * AgentGuard402 demo CLI.
 *
 * Simulates an AI agent's outbound transfer flow with a pre-flight check.
 * The agent intends to send funds to a destination wallet; before doing so,
 * it calls AgentGuard402's /api/preflight endpoint. Based on the verdict,
 * the agent either proceeds (allow), proceeds with logging (warn), or
 * aborts (block).
 *
 * Usage:
 *   node agent/agentguard-cli.mjs <to_address> [chain]
 *
 * Examples:
 *   # Sanctioned destination — should BLOCK
 *   node agent/agentguard-cli.mjs 0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D
 *
 *   # Clean destination — should ALLOW
 *   node agent/agentguard-cli.mjs 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045
 *
 *   # Custom AgentGuard endpoint
 *   SENTRY402_URL=http://localhost:3000 node agent/agentguard-cli.mjs 0x...
 *
 * The CLI hits the production /api/preflight endpoint with an X-PAYMENT
 * stub header (testnet honest — real production agents would attach a
 * signed x402 payment payload from a CDP wallet).
 */

import process from "node:process";

const SENTRY402_URL = process.env.SENTRY402_URL ?? "https://sentry402.vercel.app";
const CHAIN = process.argv[3] ?? process.env.CHAIN ?? "eth-mainnet";
const TO_ADDRESS = process.argv[2];
const AMOUNT_USD = Number(process.env.AMOUNT_USD ?? 50);
const AGENT_WALLET =
  process.env.AGENT_WALLET ?? "0xAgentDemo000000000000000000000000Demo";

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

function color(text, c) {
  return `${ANSI[c]}${text}${ANSI.reset}`;
}

function box(title, lines, frameColor = "cyan") {
  const width = Math.max(
    title.length + 4,
    ...lines.map((l) => stripAnsi(l).length + 4),
  );
  const top = "┌" + "─".repeat(width - 2) + "┐";
  const bot = "└" + "─".repeat(width - 2) + "┘";
  console.log(color(top, frameColor));
  console.log(
    color("│ ", frameColor) +
      color(title.padEnd(width - 4), "bold") +
      color(" │", frameColor),
  );
  console.log(color("├" + "─".repeat(width - 2) + "┤", frameColor));
  for (const l of lines) {
    const pad = width - 4 - stripAnsi(l).length;
    console.log(
      color("│ ", frameColor) + l + " ".repeat(Math.max(0, pad)) + color(" │", frameColor),
    );
  }
  console.log(color(bot, frameColor));
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

async function main() {
  if (!TO_ADDRESS) {
    console.error(
      "Usage: node agent/agentguard-cli.mjs <to_address> [chain]\n\n" +
        "Examples:\n" +
        "  node agent/agentguard-cli.mjs 0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D    # blocked\n" +
        "  node agent/agentguard-cli.mjs 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045    # allowed",
    );
    process.exit(2);
  }

  console.log("");
  console.log(color("Sentry402 Firewall demo agent", "bold"));
  console.log(color("─────────────────────────────", "gray"));
  console.log(color(`agent:   ${AGENT_WALLET}`, "gray"));
  console.log(color(`intent:  transfer $${AMOUNT_USD.toFixed(2)} → ${TO_ADDRESS} on ${CHAIN}`, "gray"));
  console.log(color(`endpoint: ${SENTRY402_URL}/api/preflight`, "gray"));
  console.log("");

  const t0 = Date.now();
  console.log(color("→ pre-flight check…", "cyan"));

  let res;
  try {
    res = await fetch(`${SENTRY402_URL}/api/preflight`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-payment": "agentguard-cli-demo-payment-payload",
        "user-agent": "sentry402-firewall-cli/0.1.0",
      },
      body: JSON.stringify({
        chain: CHAIN,
        to_address: TO_ADDRESS,
        amount_usd: AMOUNT_USD,
        from_agent: AGENT_WALLET,
      }),
    });
  } catch (err) {
    console.error(color("✗ network error: " + err.message, "red"));
    process.exit(1);
  }

  if (res.status === 402) {
    console.error(color("✗ 402 Payment Required — payment header rejected", "red"));
    const body = await res.json().catch(() => ({}));
    console.error(JSON.stringify(body, null, 2));
    process.exit(1);
  }
  if (!res.ok) {
    console.error(color(`✗ HTTP ${res.status} ${res.statusText}`, "red"));
    const text = await res.text().catch(() => "");
    console.error(text);
    process.exit(1);
  }

  const data = await res.json();
  const elapsed = Date.now() - t0;
  const settlement = res.headers.get("x-payment-response");

  const verdictColor =
    data.verdict === "block" ? "red" : data.verdict === "warn" ? "yellow" : "green";
  const verdictGlyph =
    data.verdict === "block" ? "✗ BLOCK" : data.verdict === "warn" ? "⚠ WARN" : "✓ ALLOW";

  box(
    `${verdictGlyph}    score ${data.score}/100  severity ${data.severity}`,
    [
      color(`reasoning: `, "gray") + data.reasoning,
      "",
      color(`signals (${data.signals.length}):`, "gray"),
      ...data.signals
        .slice(0, 5)
        .map(
          (s) =>
            color("  • ", "gray") +
            color(s.severity.toUpperCase(), s.severity === "critical" || s.severity === "high" ? "red" : s.severity === "medium" ? "yellow" : "green") +
            color(`  ${s.type}  `, "cyan") +
            color(`+${s.score_contribution}  `, "gray") +
            s.title,
        ),
      "",
      color(
        `latency: ${elapsed}ms  ·  rule pack ${data.metadata.rule_pack_version}  ·  sdn list ${data.metadata.sdn_list_version}`,
        "gray",
      ),
      settlement
        ? color(`paid via x402: `, "gray") + color(JSON.parse(settlement).amount + " atoms USDC on " + JSON.parse(settlement).network, "cyan")
        : "",
    ].filter(Boolean),
    verdictColor,
  );

  console.log("");

  if (data.verdict === "block") {
    console.log(color("agent decision: ", "bold") + color("ABORT TRANSFER", "red"));
    console.log(
      color(
        `  the destination matched a critical or high-severity indicator. transfer not executed.`,
        "gray",
      ),
    );
    process.exit(0);
  }
  if (data.verdict === "warn") {
    console.log(color("agent decision: ", "bold") + color("ESCALATE", "yellow"));
    console.log(
      color(
        `  destination matched medium-severity indicators. transfer queued for human review.`,
        "gray",
      ),
    );
    process.exit(0);
  }
  console.log(color("agent decision: ", "bold") + color("PROCEED", "green"));
  console.log(
    color(
      `  destination passed all rules. transfer of $${AMOUNT_USD.toFixed(2)} executing now.`,
      "gray",
    ),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(color("fatal: " + err.message, "red"));
  process.exit(1);
});

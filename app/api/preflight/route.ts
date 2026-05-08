/**
 * POST /api/preflight
 *
 * The single critical endpoint of AgentGuard402. An AI agent calls this
 * BEFORE executing a transfer, passing its intent (destination address,
 * chain, amount). The endpoint runs the destination through the Sentry402
 * risk engine and returns a verdict the agent code can branch on:
 *
 *   {
 *     verdict: "allow" | "warn" | "block",
 *     score: 0-100,
 *     severity: "info" | "low" | "medium" | "high" | "critical",
 *     reasoning: string,
 *     signals: Signal[],   // citation-bound
 *     evidence: { ... },
 *     latency_ms: number,
 *     metadata: { rule_pack_version, sdn_list_version, ... }
 *   }
 *
 * Mapping severity to verdict:
 *   - critical / high  → block  (do NOT proceed with the transfer)
 *   - medium           → warn   (proceed only with elevated approval)
 *   - low / info       → allow  (proceed)
 *
 * x402-gated at $0.02 USDC on Base Sepolia. Hand-rolled (same approach as
 * Sentry402's /api/risk/paid — x402-next had Next 15 ESM issues).
 */

import { NextRequest, NextResponse } from "next/server";
import { buildDossier } from "@/lib/risk-engine";
import { cacheDossier } from "@/lib/store";
import type { ChainName, Severity } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_CHAINS: ChainName[] = [
  "eth-mainnet",
  "base-mainnet",
  "matic-mainnet",
  "bsc-mainnet",
  "arbitrum-mainnet",
  "optimism-mainnet",
  "solana-mainnet",
];

const PAY_TO_ADDRESS =
  process.env.X402_PAY_TO_ADDRESS ??
  "0x0000000000000000000000000000000000000000";
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const PRICE_USDC_ATOMS = process.env.PREFLIGHT_PRICE_ATOMS ?? "20000"; // $0.02

type PreflightIntent = {
  chain: ChainName;
  to_address: string;
  amount_usd?: number;
  /** Optional: agent's own wallet address — included only in the response
   * for round-tripping; AgentGuard does not screen the agent itself here. */
  from_agent?: string;
};

function severityToVerdict(severity: Severity): "allow" | "warn" | "block" {
  if (severity === "critical" || severity === "high") return "block";
  if (severity === "medium") return "warn";
  return "allow";
}

function reasoningFor(severity: Severity, signalCount: number): string {
  if (severity === "critical") {
    return `Destination matched ${signalCount} critical-severity indicator${signalCount === 1 ? "" : "s"}. Active OFAC SDN, drainer pattern, or DPRK cluster contact. Transfer should be aborted.`;
  }
  if (severity === "high") {
    return `Destination matched ${signalCount} high-severity indicator${signalCount === 1 ? "" : "s"}. Likely sanctions adjacency or material approval-attack risk. Block by default.`;
  }
  if (severity === "medium") {
    return `Destination matched ${signalCount} medium-severity indicator${signalCount === 1 ? "" : "s"}. Enhanced review recommended before proceeding; surface to a human approver if your agent is unattended.`;
  }
  if (severity === "low") {
    return `Destination matched ${signalCount} low-severity advisory${signalCount === 1 ? "" : "s"}. Informational only; transfer can proceed under normal policy.`;
  }
  return "Destination passed all rules in the current pack. Transfer can proceed under normal policy.";
}

function paymentRequired(req: NextRequest): NextResponse {
  const body = {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: "base-sepolia",
        maxAmountRequired: PRICE_USDC_ATOMS,
        resource: req.url,
        description:
          "AgentGuard402 pre-flight sanctions check — verdict on whether your agent should proceed with a pending transfer. Citation-bound, deterministic, regulator-defensible.",
        mimeType: "application/json",
        payTo: PAY_TO_ADDRESS,
        maxTimeoutSeconds: 30,
        asset: USDC_BASE_SEPOLIA,
        extra: { name: "USDC", version: "2" },
      },
    ],
    error:
      "X-PAYMENT header is required. AgentGuard402 charges $0.02 per pre-flight check. See https://x402.org for the protocol.",
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    status: 402,
    headers: {
      "content-type": "application/json",
      "x402-version": "1",
    },
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const t0 = Date.now();
  let body: PreflightIntent;
  try {
    body = (await req.json()) as PreflightIntent;
  } catch {
    return NextResponse.json(
      { error: "Body must be JSON: { chain, to_address, amount_usd? }" },
      { status: 400 },
    );
  }

  if (!body || !body.to_address || !body.chain) {
    return NextResponse.json(
      {
        error:
          "Missing required fields. Body: { chain: 'eth-mainnet' | 'base-mainnet' | ..., to_address: '0x...', amount_usd?: number }",
      },
      { status: 400 },
    );
  }
  if (!VALID_CHAINS.includes(body.chain)) {
    return NextResponse.json(
      { error: `Unsupported chain '${body.chain}'. Supported: ${VALID_CHAINS.join(", ")}` },
      { status: 400 },
    );
  }

  // x402 gate. Demo mode accepts any non-empty header.
  const paymentHeader = req.headers.get("x-payment");
  if (!paymentHeader) {
    return paymentRequired(req);
  }

  try {
    const dossier = await buildDossier(body.chain, body.to_address);
    cacheDossier(dossier);
    const verdict = severityToVerdict(dossier.severity);
    const reasoning = reasoningFor(dossier.severity, dossier.signals.length);
    const latency_ms = Date.now() - t0;

    return NextResponse.json(
      {
        verdict,
        score: dossier.overall_score,
        severity: dossier.severity,
        reasoning,
        signals: dossier.signals,
        evidence: dossier.evidence,
        intent: {
          chain: body.chain,
          to_address: body.to_address,
          amount_usd: body.amount_usd ?? null,
          from_agent: body.from_agent ?? null,
        },
        metadata: dossier.metadata,
        latency_ms,
      },
      {
        status: 200,
        headers: {
          "x-payment-response": JSON.stringify({
            settled: true,
            network: "base-sepolia",
            amount: PRICE_USDC_ATOMS,
            asset: USDC_BASE_SEPOLIA,
            payTo: PAY_TO_ADDRESS,
            tx: "0xMVP_PLACEHOLDER",
          }),
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Enable GET as a courtesy — returns the spec body so curl users can see
// the contract before they sign a payment.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return paymentRequired(req);
}

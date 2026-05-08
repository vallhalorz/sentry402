/**
 * GET /api/screen?chain=…&to_address=…
 *
 * Free, public version of /api/preflight. Same response shape, no payment
 * required. Used by the landing page playground so visitors can see the
 * verdict format before integrating. Production agents pay for /api/preflight
 * via x402; this endpoint exists for evaluation and demo purposes.
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

function severityToVerdict(severity: Severity): "allow" | "warn" | "block" {
  if (severity === "critical" || severity === "high") return "block";
  if (severity === "medium") return "warn";
  return "allow";
}

function reasoningFor(severity: Severity, signalCount: number): string {
  if (severity === "critical")
    return `Destination matched ${signalCount} critical-severity indicator${signalCount === 1 ? "" : "s"}. Transfer should be aborted.`;
  if (severity === "high")
    return `Destination matched ${signalCount} high-severity indicator${signalCount === 1 ? "" : "s"}. Block by default.`;
  if (severity === "medium")
    return `Destination matched ${signalCount} medium-severity indicator${signalCount === 1 ? "" : "s"}. Enhanced review recommended.`;
  if (severity === "low")
    return `Destination matched ${signalCount} low-severity advisory${signalCount === 1 ? "" : "s"}. Informational only.`;
  return "Destination passed all rules in the current pack.";
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const t0 = Date.now();
  const url = new URL(req.url);
  const chain = (url.searchParams.get("chain") ?? "eth-mainnet") as ChainName;
  const toAddress = url.searchParams.get("to_address") ?? "";

  if (!toAddress) {
    return NextResponse.json({ error: "to_address param is required" }, { status: 400 });
  }
  if (!VALID_CHAINS.includes(chain)) {
    return NextResponse.json(
      { error: `unsupported chain '${chain}'` },
      { status: 400 },
    );
  }

  try {
    const dossier = await buildDossier(chain, toAddress);
    cacheDossier(dossier);
    const verdict = severityToVerdict(dossier.severity);
    const reasoning = reasoningFor(dossier.severity, dossier.signals.length);
    return NextResponse.json(
      {
        verdict,
        score: dossier.overall_score,
        severity: dossier.severity,
        reasoning,
        signals: dossier.signals,
        evidence: dossier.evidence,
        metadata: dossier.metadata,
        latency_ms: Date.now() - t0,
      },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/sample-dossier
 *
 * Returns a canonical sample dossier so integrators can see exactly what
 * Sentry402 returns without having to pick a wallet address. We pin the
 * sample to the Amnokgang DPRK SDN address — a true OFAC-listed entity —
 * so the dossier always exhibits the highest-severity rule output and
 * gives the reader a worked example of the citation chain.
 *
 * The same shape is what /api/screen and /api/preflight return.
 *
 * Cache for 1 hour on the Vercel edge so the sample endpoint doesn't hit
 * GoldRush + Helius on every request. The underlying engine is
 * deterministic so the cached payload is still accurate.
 */

import { NextResponse } from "next/server";
import { buildDossier } from "@/lib/risk-engine";
import type { Severity } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAMPLE_CHAIN = "eth-mainnet" as const;
const SAMPLE_ADDRESS = "0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D";

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

export async function GET(): Promise<NextResponse> {
  const t0 = Date.now();
  try {
    const dossier = await buildDossier(SAMPLE_CHAIN, SAMPLE_ADDRESS);
    const verdict = severityToVerdict(dossier.severity);
    const reasoning = reasoningFor(dossier.severity, dossier.signals.length);
    const body = {
      _note:
        "This is a canonical sample dossier. The same shape is what /api/screen and /api/preflight return. The subject (Amnokgang Technology Development Company) is on the active OFAC SDN list, so the dossier exhibits the highest-severity rule output.",
      _docs: "https://sentry402.vercel.app/methodology",
      sample_request: {
        method: "GET",
        url: `https://sentry402.vercel.app/api/screen?chain=${SAMPLE_CHAIN}&to_address=${SAMPLE_ADDRESS}`,
      },
      verdict,
      score: dossier.overall_score,
      severity: dossier.severity,
      reasoning,
      signals: dossier.signals,
      evidence: dossier.evidence,
      metadata: dossier.metadata,
      latency_ms: Date.now() - t0,
    };
    return new NextResponse(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        // Vercel edge cache 1 hour, stale-while-revalidate another hour.
        "cache-control": "public, s-maxage=3600, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

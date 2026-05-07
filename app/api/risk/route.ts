/**
 * GET /api/risk?chain=eth-mainnet&wallet=0x…
 *
 * Returns a citation-bound RiskDossier as JSON.
 *
 * x402 wrapper is added in Day 4 — for now this endpoint is open so the
 * dashboard works without payment.
 */

import { NextRequest, NextResponse } from "next/server";
import { buildDossier } from "@/lib/risk-engine";
import { cacheDossier } from "@/lib/store";
import type { ChainName } from "@/lib/types";

// Force runtime evaluation — never prerender. We hit GoldRush per request.
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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const chain = (url.searchParams.get("chain") ?? "eth-mainnet") as ChainName;
  const wallet = url.searchParams.get("wallet") ?? "";

  if (!wallet) {
    return NextResponse.json({ error: "wallet param is required" }, { status: 400 });
  }
  if (!VALID_CHAINS.includes(chain)) {
    return NextResponse.json(
      { error: `unsupported chain '${chain}'. Supported: ${VALID_CHAINS.join(", ")}` },
      { status: 400 },
    );
  }
  // Solana is supported with limited Foundational coverage — see risk engine
  // for the coverage advisory signal that lands in the dossier itself.

  try {
    const dossier = await buildDossier(chain, wallet);
    cacheDossier(dossier);
    return NextResponse.json(dossier, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/risk/paid?chain=…&wallet=…
 *
 * x402-gated version of /api/risk. Implements the x402 protocol per
 * https://x402.org and matches the response shape of GoldRush's own x402
 * proxy on Base Sepolia.
 *
 * - No `X-PAYMENT` header → HTTP 402 + payment-required JSON in body. Agent
 *   reads the JSON, signs the payment, retries with `X-PAYMENT` set.
 * - With `X-PAYMENT` header → handler runs, dossier returned. The MVP accepts
 *   any non-empty payment header in dev; production wires verify against a
 *   facilitator (e.g. https://x402.goldrush.dev or a Coinbase CDP facilitator).
 *
 * We hand-roll the 402 response (rather than depending on `x402-next`) for
 * three reasons:
 *   1. Next.js 15 + Node ESM has a known incompatibility with x402-next v1's
 *      `next/server` import — strict ESM resolution fails on the bare specifier.
 *   2. We control the exact response shape, which makes the demo curl output
 *      readable and on-spec.
 *   3. Zero added attack surface for a 5-day hackathon MVP. Production can
 *      swap in `@x402/next` (v2) once it ships and stabilizes.
 *
 * Settlement: Base Sepolia testnet. Mainnet flip is a single env var change
 * once GoldRush x402 mainnet goes live (per their docs, "coming soon").
 */

import { NextRequest, NextResponse } from "next/server";
import { buildDossier } from "@/lib/risk-engine";
import { cacheDossier } from "@/lib/store";
import type { ChainName } from "@/lib/types";

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

// Receiving wallet for x402 payments. Set X402_PAY_TO_ADDRESS in .env.local to
// your CDP/EVM address. Falls back to the zero address (placeholder — replace
// before production).
const PAY_TO_ADDRESS =
  process.env.X402_PAY_TO_ADDRESS ?? "0x0000000000000000000000000000000000000000";

// USDC on Base Sepolia. From Circle's official deployment list:
// https://developers.circle.com/stablecoins/usdc-on-test-networks
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

// Price for one full risk dossier. USDC has 6 decimals, so $0.05 = 50_000 atoms.
const PRICE_USDC_ATOMS = "50000";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const chain = (url.searchParams.get("chain") ?? "eth-mainnet") as ChainName;
  const wallet = url.searchParams.get("wallet") ?? "";

  // Validate inputs BEFORE charging — agents shouldn't pay for malformed
  // requests. (Mirrors GoldRush's own x402 proxy behavior.)
  if (!wallet) {
    return NextResponse.json({ error: "wallet param is required" }, { status: 400 });
  }
  if (!VALID_CHAINS.includes(chain)) {
    return NextResponse.json(
      { error: `unsupported chain '${chain}'. Supported: ${VALID_CHAINS.join(", ")}` },
      { status: 400 },
    );
  }
  // Solana supported with coverage advisory baked into the dossier.

  // Check x402 payment header. The x402 spec uses `X-PAYMENT` carrying a
  // base64-encoded signed payment payload. We accept any non-empty header in
  // the MVP; production should verify against a facilitator.
  const paymentHeader = req.headers.get("x-payment");
  if (!paymentHeader) {
    // No payment → respond per x402 spec.
    const paymentRequiredBody = {
      x402Version: 1,
      accepts: [
        {
          scheme: "exact",
          network: "base-sepolia",
          maxAmountRequired: PRICE_USDC_ATOMS,
          resource: req.url,
          description:
            "Sentry402 cited risk dossier — deterministic wallet risk score with citation-bound evidence (FATF/FinCEN/MiCA references, FCA 2024 reproducibility metadata).",
          mimeType: "application/json",
          payTo: PAY_TO_ADDRESS,
          maxTimeoutSeconds: 60,
          asset: USDC_BASE_SEPOLIA,
          extra: {
            name: "USDC",
            version: "2",
          },
        },
      ],
      error: "X-PAYMENT header is required. See https://x402.org for protocol details.",
    };
    return new NextResponse(JSON.stringify(paymentRequiredBody, null, 2), {
      status: 402,
      headers: {
        "content-type": "application/json",
        // Echo the price headers some x402 clients sniff before parsing the body.
        "x402-version": "1",
      },
    });
  }

  // Payment present — generate dossier. (MVP: any non-empty payment counts.)
  try {
    const dossier = await buildDossier(chain, wallet);
    cacheDossier(dossier);
    return NextResponse.json(dossier, {
      status: 200,
      headers: {
        // Mirror x402's settlement-response convention so clients can confirm.
        "x-payment-response": JSON.stringify({
          settled: true,
          network: "base-sepolia",
          amount: PRICE_USDC_ATOMS,
          asset: USDC_BASE_SEPOLIA,
          payTo: PAY_TO_ADDRESS,
          // In production this would be the on-chain settlement tx hash.
          tx: "0xMVP_PLACEHOLDER",
        }),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Failed dossier — agent already paid (in production), but this MVP just
    // returns the error. Production handlers should refund or no-op the
    // settlement on failure.
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

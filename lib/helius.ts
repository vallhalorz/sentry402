/**
 * Helius DAS / Enhanced API wrapper.
 *
 * Solana coverage parallel to lib/goldrush.ts. Same Cited<T> contract — every
 * call returns parsed data plus an Evidence record so dossier output remains
 * citation-bound. We pin HELIUS_DAS_VERSION on every Evidence record for
 * FCA 2024 reproducibility, same as we pin goldrush_api_version on the EVM
 * side.
 *
 * RULE: any code that consumes Helius data goes through this wrapper.
 *
 * Why Helius instead of GoldRush for Solana: GoldRush Foundational exposes
 * exactly one Solana endpoint (token balances). Decoded transaction history,
 * counterparty graph tracing, and SPL approval inventory require a Solana-
 * native indexer. Helius DAS + Enhanced Transactions API gives us all three
 * at the free tier (100K req/day) and matches our Cited<T> integration shape.
 */

import {
  type ChainName,
  type Evidence,
  newEvidenceId,
} from "./types";
import { sha256Hex } from "./hash";

// Pinned into Evidence.goldrush_api_version field as `helius:das-1.x` so the
// dossier reproducibility metadata is honest about which Solana data source
// produced each finding.
export const HELIUS_DAS_VERSION = "helius:das-1.0";

const HELIUS_RPC_BASE = "https://mainnet.helius-rpc.com";

function apiKey(): string {
  const k = process.env.HELIUS_API_KEY;
  if (!k) {
    throw new Error(
      "HELIUS_API_KEY is not set. Sign up at https://www.helius.dev (free tier 100K req/day) and add it to .env.local.",
    );
  }
  return k;
}

function rpcUrl(): string {
  return `${HELIUS_RPC_BASE}/?api-key=${apiKey()}`;
}

async function rpc<T>(method: string, params: unknown): Promise<T> {
  const res = await fetch(rpcUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "sentry402", method, params }),
  });
  if (!res.ok) {
    throw new Error(`Helius ${method}: HTTP ${res.status}`);
  }
  const json = (await res.json()) as { error?: { message: string }; result?: T };
  if (json.error) {
    throw new Error(`Helius ${method}: ${json.error.message}`);
  }
  return json.result as T;
}

export type Cited<T> = {
  data: T;
  evidence: Evidence;
};

function buildEvidence(args: {
  endpoint: string;
  endpoint_url: string;
  request_params: Record<string, unknown>;
  response_excerpt: unknown;
  tx_hashes?: string[];
  block_heights?: number[];
}): Evidence {
  const ev: Evidence = {
    id: newEvidenceId(),
    endpoint: args.endpoint,
    endpoint_url: args.endpoint_url,
    request_params: args.request_params,
    response_excerpt: args.response_excerpt,
    tx_hashes: args.tx_hashes ?? [],
    block_heights: args.block_heights ?? [],
    chain: "solana-mainnet" satisfies ChainName,
    goldrush_api_version: HELIUS_DAS_VERSION,
    fetched_at: new Date().toISOString(),
  };
  ev.payload_sha256 = sha256Hex(JSON.stringify(ev.response_excerpt));
  return ev;
}

// ============================================================
// Holdings — getAssetsByOwner (DAS)
// ============================================================

export type SolanaTokenAsset = {
  symbol: string;
  mint: string;
  balance: string;
  quote: number; // USD value (not always populated by DAS — best-effort)
  isNft: boolean;
};

type DasAssetItem = {
  id: string;
  interface?: string;
  content?: { metadata?: { symbol?: string; name?: string } };
  token_info?: {
    symbol?: string;
    decimals?: number;
    balance?: string;
    price_info?: { total_price?: number };
  };
};

type DasAssetsResp = { items: DasAssetItem[]; total?: number };

export async function getSolanaAssets(
  wallet: string,
): Promise<Cited<SolanaTokenAsset[]>> {
  const params = {
    ownerAddress: wallet,
    page: 1,
    limit: 100,
    displayOptions: { showFungible: true, showNativeBalance: true },
  };
  const result = await rpc<DasAssetsResp>("getAssetsByOwner", params);
  const items = result.items ?? [];
  const data: SolanaTokenAsset[] = items.map((it) => {
    const ti = it.token_info ?? {};
    const isNft = it.interface === "V1_NFT" || it.interface === "ProgrammableNFT";
    return {
      symbol: ti.symbol ?? it.content?.metadata?.symbol ?? "?",
      mint: it.id,
      balance: String(ti.balance ?? "0"),
      quote: typeof ti.price_info?.total_price === "number" ? ti.price_info.total_price : 0,
      isNft,
    };
  });
  return {
    data,
    evidence: buildEvidence({
      endpoint: "Helius DAS getAssetsByOwner",
      endpoint_url: `${HELIUS_RPC_BASE}/?method=getAssetsByOwner`,
      request_params: { wallet, limit: 100 },
      response_excerpt: { item_count: items.length, top: data.slice(0, 5) },
    }),
  };
}

// ============================================================
// Activity / Counterparties — getSignaturesForAddress
// ============================================================

export type SolanaSignature = {
  signature: string;
  slot: number;
  blockTime?: number;
  err?: unknown;
};

type SignaturesResp = SolanaSignature[];

export async function getSolanaSignatures(
  wallet: string,
  limit = 100,
): Promise<Cited<SolanaSignature[]>> {
  const result = await rpc<SignaturesResp>("getSignaturesForAddress", [
    wallet,
    { limit },
  ]);
  const txHashes = result.map((s) => s.signature).slice(0, 100);
  return {
    data: result,
    evidence: buildEvidence({
      endpoint: "Solana RPC getSignaturesForAddress (Helius)",
      endpoint_url: `${HELIUS_RPC_BASE}/?method=getSignaturesForAddress`,
      request_params: { wallet, limit },
      response_excerpt: {
        count: result.length,
        earliest_slot: result.length ? result[result.length - 1].slot : null,
        latest_slot: result.length ? result[0].slot : null,
      },
      tx_hashes: txHashes,
    }),
  };
}

/**
 * Decoded counterparty extraction. Helius Enhanced Transactions API parses
 * raw signatures into typed events with from/to/amount fields. We use this
 * to build a counterparty set we can intersect with the SDN list.
 *
 * Endpoint: POST https://api.helius.xyz/v0/transactions?api-key=…
 * Body: { transactions: [signature1, signature2, ...] }
 */
export async function getSolanaEnhancedCounterparties(
  wallet: string,
  signatures: string[],
): Promise<Cited<{ counterparties: string[]; transfers_seen: number }>> {
  if (signatures.length === 0) {
    return {
      data: { counterparties: [], transfers_seen: 0 },
      evidence: buildEvidence({
        endpoint: "Helius Enhanced Transactions (skipped — no signatures)",
        endpoint_url: "https://api.helius.xyz/v0/transactions",
        request_params: { wallet, signatures_provided: 0 },
        response_excerpt: { skipped: true },
      }),
    };
  }
  const url = `https://api.helius.xyz/v0/transactions?api-key=${apiKey()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ transactions: signatures.slice(0, 100) }),
  });
  if (!res.ok) {
    throw new Error(`Helius Enhanced Tx: HTTP ${res.status}`);
  }
  const txs = (await res.json()) as Array<{
    signature: string;
    nativeTransfers?: Array<{ fromUserAccount?: string; toUserAccount?: string; amount?: number }>;
    tokenTransfers?: Array<{
      fromUserAccount?: string;
      toUserAccount?: string;
      mint?: string;
      tokenAmount?: number;
    }>;
  }>;
  const set = new Set<string>();
  let transfersSeen = 0;
  for (const t of txs) {
    for (const nt of t.nativeTransfers ?? []) {
      transfersSeen += 1;
      if (nt.fromUserAccount && nt.fromUserAccount !== wallet) set.add(nt.fromUserAccount);
      if (nt.toUserAccount && nt.toUserAccount !== wallet) set.add(nt.toUserAccount);
    }
    for (const tt of t.tokenTransfers ?? []) {
      transfersSeen += 1;
      if (tt.fromUserAccount && tt.fromUserAccount !== wallet) set.add(tt.fromUserAccount);
      if (tt.toUserAccount && tt.toUserAccount !== wallet) set.add(tt.toUserAccount);
    }
  }
  return {
    data: { counterparties: [...set], transfers_seen: transfersSeen },
    evidence: buildEvidence({
      endpoint: "Helius Enhanced Transactions (parsed counterparties)",
      endpoint_url: "https://api.helius.xyz/v0/transactions",
      request_params: { wallet, signatures_examined: signatures.length },
      response_excerpt: {
        unique_counterparties: set.size,
        transfers_seen: transfersSeen,
      },
      tx_hashes: txs.map((t) => t.signature).slice(0, 50),
    }),
  };
}

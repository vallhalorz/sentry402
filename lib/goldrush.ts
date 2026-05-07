/**
 * GoldRush client wrapper.
 *
 * Wraps @covalenthq/client-sdk so every call returns BOTH the parsed data AND
 * an Evidence record we can attach to a Signal. This is the citation-bound
 * data flow that makes Sentry402's output regulator-defensible.
 *
 * RULE: any code that consumes GoldRush data goes through this wrapper.
 * Rules in the risk engine MUST receive { data, evidence } and never raw SDK
 * responses, otherwise we leak un-cited claims into the dossier.
 */

import { GoldRushClient } from "@covalenthq/client-sdk";
import type { Chain } from "@covalenthq/client-sdk";
import {
  type ChainName,
  type Evidence,
  newEvidenceId,
} from "./types";
import { sha256Hex } from "./hash";

// SDK version — pinned into Evidence.goldrush_api_version so dossier
// reproducibility metadata (FCA 2024) is honest about which version produced
// the score. Keep this in sync with the version in package.json's lockfile.
export const GOLDRUSH_SDK_VERSION = "2.3.8";

let _client: GoldRushClient | null = null;
function client(): GoldRushClient {
  if (_client) return _client;
  const apiKey = process.env.GOLDRUSH_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOLDRUSH_API_KEY is not set. Sign up at https://goldrush.dev (Vibe Coding plan, $10/mo) and add it to .env.local.",
    );
  }
  _client = new GoldRushClient(apiKey);
  return _client;
}

export type Cited<T> = {
  data: T;
  evidence: Evidence;
};

/** Map our ChainName to the SDK's `Chain` type (which accepts the same strings). */
const CHAIN_MAP: Record<ChainName, Chain> = {
  "eth-mainnet": "eth-mainnet",
  "base-mainnet": "base-mainnet",
  "matic-mainnet": "matic-mainnet",
  "bsc-mainnet": "bsc-mainnet",
  "arbitrum-mainnet": "arbitrum-mainnet",
  "optimism-mainnet": "optimism-mainnet",
  "solana-mainnet": "solana-mainnet",
};

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Build an Evidence record from any GoldRush call result. `excerpt` should be
 * the minimal slice that supports a downstream Signal — we deliberately do not
 * embed full responses, both for size and to keep what's quoted in a SAR
 * exhibit narrowly scoped.
 */
function buildEvidence(args: {
  endpoint: string;
  endpoint_url: string;
  request_params: Record<string, unknown>;
  response_excerpt: unknown;
  tx_hashes: string[];
  block_heights: number[];
  chain: ChainName;
}): Evidence {
  const ev: Evidence = {
    id: newEvidenceId(),
    endpoint: args.endpoint,
    endpoint_url: args.endpoint_url,
    request_params: args.request_params,
    response_excerpt: args.response_excerpt,
    tx_hashes: args.tx_hashes,
    block_heights: args.block_heights,
    chain: args.chain,
    goldrush_api_version: GOLDRUSH_SDK_VERSION,
    fetched_at: nowIso(),
  };
  ev.payload_sha256 = sha256Hex(JSON.stringify(ev.response_excerpt));
  return ev;
}

export type WalletTokenBalance = {
  symbol: string;
  balance: string;
  quote: number;
  contract: string;
};

/**
 * Token balances for a wallet.
 */
export async function getTokenBalances(
  chain: ChainName,
  wallet: string,
): Promise<Cited<WalletTokenBalance[]>> {
  const chainName = CHAIN_MAP[chain];
  const resp = await client().BalanceService.getTokenBalancesForWalletAddress(
    chainName,
    wallet,
  );
  if (resp.error) {
    throw new Error(
      `GoldRush getTokenBalances: ${resp.error_message ?? "unknown error"}`,
    );
  }
  const items = resp.data?.items ?? [];
  const data: WalletTokenBalance[] = items.map((it) => ({
    symbol: it?.contract_ticker_symbol ?? "?",
    balance: String(it?.balance ?? "0"),
    quote: typeof (it as { quote?: number } | null)?.quote === "number"
      ? (it as { quote: number }).quote
      : 0,
    contract: it?.contract_address ?? "",
  }));
  const evidence = buildEvidence({
    endpoint: "BalanceService.getTokenBalancesForWalletAddress",
    endpoint_url: `https://api.covalenthq.com/v1/${chainName}/address/${wallet}/balances_v2/`,
    request_params: { chain: chainName, wallet },
    response_excerpt: { item_count: items.length, top: data.slice(0, 5) },
    tx_hashes: [],
    block_heights: [],
    chain,
  });
  return { data, evidence };
}

export type ApprovalRow = {
  tokenSymbol: string;
  tokenAddress: string;
  tokenValueAtRiskQuote: number;
  spender: string;
  spenderLabel: string;
  allowance: string;
  valueAtRiskQuote: number;
  isUnlimited: boolean;
  txHash?: string;
  blockHeight?: number;
  blockSignedAt?: string;
};

const UINT256_MAX =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

/**
 * ERC-20 approvals with USD value-at-risk. The GoldRush primitive that makes
 * drainer-pattern detection cheap.
 */
export async function getApprovals(
  chain: ChainName,
  wallet: string,
): Promise<Cited<ApprovalRow[]>> {
  const chainName = CHAIN_MAP[chain];
  const resp = await client().SecurityService.getApprovals(chainName, wallet);
  if (resp.error) {
    throw new Error(
      `GoldRush getApprovals: ${resp.error_message ?? "unknown error"}`,
    );
  }
  const items = resp.data?.items ?? [];
  const flat: ApprovalRow[] = [];
  const txHashes: string[] = [];
  const blockHeights: number[] = [];
  for (const it of items) {
    if (!it) continue;
    const tokenAddress = it.token_address ?? "";
    const tokenSymbol = it.ticker_symbol ?? "?";
    const tokenValueAtRiskQuote =
      typeof it.value_at_risk_quote === "number" ? it.value_at_risk_quote : 0;
    const spenders = it.spenders ?? [];
    for (const sp of spenders) {
      if (!sp) continue;
      const allowance = String(sp.allowance ?? "0");
      const isUnlimited =
        allowance === UINT256_MAX || allowance.toLowerCase() === "unlimited";
      const txHash = sp.tx_hash ?? undefined;
      const blockHeight =
        typeof sp.block_height === "number" ? sp.block_height : undefined;
      if (txHash) txHashes.push(txHash);
      if (typeof blockHeight === "number") blockHeights.push(blockHeight);
      flat.push({
        tokenSymbol,
        tokenAddress,
        tokenValueAtRiskQuote,
        spender: sp.spender_address ?? "",
        spenderLabel: sp.spender_address_label ?? "",
        allowance,
        valueAtRiskQuote:
          typeof sp.value_at_risk_quote === "number"
            ? sp.value_at_risk_quote
            : 0,
        isUnlimited,
        txHash,
        blockHeight,
        blockSignedAt: sp.block_signed_at
          ? new Date(sp.block_signed_at).toISOString()
          : undefined,
      });
    }
  }
  flat.sort((a, b) => b.valueAtRiskQuote - a.valueAtRiskQuote);
  const evidence = buildEvidence({
    endpoint: "SecurityService.getApprovals",
    endpoint_url: `https://api.covalenthq.com/v1/${chainName}/approvals/${wallet}/`,
    request_params: { chain: chainName, wallet },
    response_excerpt: { item_count: flat.length, top: flat.slice(0, 10) },
    tx_hashes: txHashes.slice(0, 50),
    block_heights: blockHeights.slice(0, 50),
    chain,
  });
  return { data: flat, evidence };
}

export type WalletTransaction = {
  txHash: string;
  blockHeight: number;
  blockSignedAt: string;
  from: string;
  to: string;
  valueQuote: number;
  successful: boolean;
};

/**
 * Wallet's earliest observed transaction.
 *
 * Used by the `fresh_wallet` rule to determine TRUE wallet age, not the
 * misleading "oldest tx in the latest page" heuristic. Without this call,
 * highly-active wallets (vitalik.eth, exchange hot wallets) would be flagged
 * as fresh because their first page of recent txs only spans 1-2 days.
 */
export async function getEarliestTransactionDate(
  chain: ChainName,
  wallet: string,
): Promise<Cited<{ earliestBlockSignedAt: string | null }>> {
  const chainName = CHAIN_MAP[chain];
  const resp = await client().TransactionService.getEarliestTransactionsForAddress(
    chainName,
    wallet,
  );
  if (resp.error) {
    throw new Error(
      `GoldRush getEarliestTransactionDate: ${resp.error_message ?? "unknown error"}`,
    );
  }
  const items = resp.data?.items ?? [];
  // Items come oldest-first from this endpoint; first item is the earliest.
  const earliest = items[0];
  const earliestBlockSignedAt = earliest?.block_signed_at
    ? new Date(earliest.block_signed_at).toISOString()
    : null;
  const txHashes: string[] = [];
  if (earliest?.tx_hash) txHashes.push(earliest.tx_hash);
  const evidence = buildEvidence({
    endpoint: "TransactionService.getEarliestTransactionsForAddress",
    endpoint_url: `https://api.covalenthq.com/v1/${chainName}/address/${wallet}/transactions_v3/earliest/`,
    request_params: { chain: chainName, wallet },
    response_excerpt: {
      earliest_block_signed_at: earliestBlockSignedAt,
      earliest_tx_hash: earliest?.tx_hash ?? null,
      earliest_block_height: earliest?.block_height ?? null,
    },
    tx_hashes: txHashes,
    block_heights:
      typeof earliest?.block_height === "number" ? [earliest.block_height] : [],
    chain,
  });
  return { data: { earliestBlockSignedAt }, evidence };
}

export type DeepCounterpartySet = {
  addresses: string[];
  pages_scanned: number;
  transactions_examined: number;
  has_more: boolean;
};

/**
 * Deep counterparty sweep for sanctions screening.
 *
 * The first-page transaction sample (~100 tx) returned by
 * getRecentTransactions is fast but insufficient for sanctions adjacency
 * when the subject is an active wallet whose interaction with a sanctioned
 * counterparty happened long ago. Sanctioned wallets tend to have low
 * activity, so a sanctioned wallet's first-page sample reaches further back
 * in time than an active wallet's first-page sample — meaning the link
 * shows up from one direction but not the other.
 *
 * This function paginates getAllTransactionsForAddress for up to maxPages
 * (default 5, ~500 tx) and returns the unique counterparty set so the
 * sanctions rules can do a depth-extended check.
 *
 * Cost: O(maxPages) GoldRush calls per scan. We cap at 5 pages to keep
 * scan latency under ~10s and credit usage bounded.
 */
export async function getDeepCounterpartySet(
  chain: ChainName,
  wallet: string,
  maxPages = 5,
): Promise<Cited<DeepCounterpartySet>> {
  const chainName = CHAIN_MAP[chain];
  const subjLower = wallet.toLowerCase();
  const set = new Set<string>();
  let pageCount = 0;
  let txCount = 0;
  let hasMore = false;

  for await (const resp of client().TransactionService.getAllTransactionsForAddress(
    chainName,
    wallet,
  )) {
    if (resp.error) break;
    const items = resp.data?.items ?? [];
    for (const t of items) {
      if (!t) continue;
      const from = t.from_address ?? undefined;
      const to = t.to_address ?? undefined;
      if (from && from.toLowerCase() !== subjLower) {
        set.add(from.toLowerCase());
      }
      if (to && to.toLowerCase() !== subjLower) {
        set.add(to.toLowerCase());
      }
      txCount += 1;
    }
    pageCount += 1;
    if (pageCount >= maxPages) {
      hasMore = Boolean(resp.data?.next);
      break;
    }
  }

  const evidence = buildEvidence({
    endpoint: "TransactionService.getAllTransactionsForAddress (paginated sanctions sweep)",
    endpoint_url: `https://api.covalenthq.com/v1/${chainName}/address/${wallet}/transactions_v3/?pages=${pageCount}`,
    request_params: { chain: chainName, wallet, max_pages: maxPages },
    response_excerpt: {
      pages_scanned: pageCount,
      transactions_examined: txCount,
      unique_counterparties: set.size,
      has_more: hasMore,
    },
    tx_hashes: [],
    block_heights: [],
    chain,
  });

  return {
    data: {
      addresses: [...set],
      pages_scanned: pageCount,
      transactions_examined: txCount,
      has_more: hasMore,
    },
    evidence,
  };
}

/**
 * ERC-20 transfer counterparty sweep for sanctions screening.
 *
 * SB0416 (DPRK) designations and most active OFAC stablecoin entries are
 * USDT addresses. USDT transfers between two wallets are NOT visible as
 * top-level tx counterparties — the top-level tx is `subject → USDT
 * contract`, and the actual sender/receiver pair lives inside the Transfer
 * event log. getDeepCounterpartySet only sees top-level tx, so it cannot
 * catch a wallet that funded an SDN address via USDT.
 *
 * This function uses GoldRush's getErc20TransfersForWalletAddress (which
 * is per-token) to fetch token-transfer counterparties for a specific
 * stablecoin contract. Returns the unique set of addresses that appear
 * as the OTHER side of a Transfer event.
 *
 * Call this for USDT on the active chain in parallel with the top-level
 * sweep — covers the DPRK / SB0416 case.
 */
export async function getErc20TransferCounterparties(
  chain: ChainName,
  wallet: string,
  contractAddress: string,
  maxPages = 3,
): Promise<Cited<DeepCounterpartySet>> {
  const chainName = CHAIN_MAP[chain];
  const subjLower = wallet.toLowerCase();
  const set = new Set<string>();
  let pageCount = 0;
  let txCount = 0;
  let hasMore = false;

  for await (const resp of client().BalanceService.getErc20TransfersForWalletAddress(
    chainName,
    wallet,
    { contractAddress },
  )) {
    if (resp.error) break;
    const items = resp.data?.items ?? [];
    for (const it of items) {
      if (!it) continue;
      // Each block-tx item carries an array of transfer log events. We mine
      // counterparty addresses from those, not the top-level tx.
      const transfers = it.transfers ?? [];
      for (const tr of transfers) {
        if (!tr) continue;
        const f = tr.from_address?.toLowerCase();
        const t = tr.to_address?.toLowerCase();
        if (f && f !== subjLower) set.add(f);
        if (t && t !== subjLower) set.add(t);
        txCount += 1;
      }
    }
    pageCount += 1;
    if (pageCount >= maxPages) {
      hasMore = Boolean(resp.data?.pagination?.has_more);
      break;
    }
  }

  const evidence = buildEvidence({
    endpoint: "BalanceService.getErc20TransfersForWalletAddress (paginated for sanctions sweep)",
    endpoint_url: `https://api.covalenthq.com/v1/${chainName}/address/${wallet}/transfers_v2/?contract-address=${contractAddress}&pages=${pageCount}`,
    request_params: { chain: chainName, wallet, contract: contractAddress, max_pages: maxPages },
    response_excerpt: {
      pages_scanned: pageCount,
      transfers_examined: txCount,
      unique_counterparties: set.size,
      has_more: hasMore,
      contract: contractAddress,
    },
    tx_hashes: [],
    block_heights: [],
    chain,
  });

  return {
    data: {
      addresses: [...set],
      pages_scanned: pageCount,
      transactions_examined: txCount,
      has_more: hasMore,
    },
    evidence,
  };
}

export type TwoHopMatch = {
  /** The 1-hop address (subject's direct counterparty) */
  via: string;
  /** The 2-hop address that matched (counterparty of `via`) */
  hit: string;
  /** USD value of subject ↔ via flow that justified following this branch */
  via_flow_usd: number;
};

export type TwoHopCounterpartySet = {
  /** Unique 2-hop addresses observed across all material 1-hop branches */
  addresses: string[];
  /** Trace of (via, hit) pairs, useful for citation in signal metadata */
  matches: TwoHopMatch[];
  /** How many 1-hop addresses we actually walked (capped) */
  hops_walked: number;
  /** How many 1-hop candidates were skipped because flow < threshold */
  hops_skipped_below_threshold: number;
  /** Total tx examined across all 2-hop walks */
  transactions_examined: number;
};

export type OneHopMaterialAddress = {
  address: string;
  total_flow_usd: number;
};

/**
 * 2-hop counterparty sweep, materially gated.
 *
 * Walks the 2nd-degree counterparty graph, but ONLY for 1-hop counterparties
 * with materially-high flow ($1k+ default). Pure combinatorial expansion is
 * forbidden: an active wallet's 1-hop set can be 100+ addresses, and at 100
 * tx-per-walk that is 10,000 GoldRush calls per scan — unaffordable on
 * Foundational quota and uselessly slow for an x402-priced endpoint.
 *
 * Defensible scope is the FATF Recommendation 16 + INFO Layered-Funds
 * typology framing: only material-flow counterparties matter for sanctions
 * adjacency; "I once interacted with someone who once interacted with a
 * sanctioned wallet" is below evidentiary threshold. By gating at $1k flow,
 * we mirror Chainalysis Reactor and TRM Tactical's default exposure
 * thresholds and stay defensible in a SAR exhibit.
 *
 * Algorithm:
 *   1. Caller filters subject's 1-hop counterparties to those with
 *      total_flow_usd >= material_threshold and passes them in.
 *   2. We cap at maxHops 1-hop candidates (default 30) to bound credit usage.
 *   3. For each, we fetch the recent-tx page (single page, ~100 tx).
 *   4. We collect each unique tx counterparty (excluding subject) as a
 *      candidate 2-hop address.
 *   5. Caller (risk engine) intersects with SDN list.
 *
 * Cost: O(maxHops) GoldRush calls. At default 30 hops × ~150ms per call =
 * ~4.5s p95. Acceptable for an x402-priced agent endpoint.
 */
export async function getMaterialTwoHopCounterparties(
  chain: ChainName,
  subjectWallet: string,
  oneHopAddresses: OneHopMaterialAddress[],
  options: {
    materialThresholdUsd?: number;
    maxHopsToWalk?: number;
  } = {},
): Promise<Cited<TwoHopCounterpartySet>> {
  const chainName = CHAIN_MAP[chain];
  const subjLower = subjectWallet.toLowerCase();
  const materialThresholdUsd = options.materialThresholdUsd ?? 1000;
  const maxHopsToWalk = options.maxHopsToWalk ?? 30;

  // Filter to material-flow only and cap at maxHopsToWalk. Sort descending
  // by flow so the highest-exposure branches are scanned first — if we hit
  // the cap, we're at least scanning the most material counterparties.
  const candidates = oneHopAddresses
    .filter((a) => a.total_flow_usd >= materialThresholdUsd)
    .filter((a) => a.address.toLowerCase() !== subjLower)
    .sort((a, b) => b.total_flow_usd - a.total_flow_usd)
    .slice(0, maxHopsToWalk);
  const skipped = oneHopAddresses.length - candidates.length;

  const allHits: TwoHopMatch[] = [];
  const allAddresses = new Set<string>();
  let totalTxExamined = 0;
  let hopsWalked = 0;

  for (const cand of candidates) {
    try {
      const resp =
        await client().TransactionService.getAllTransactionsForAddressByPage(
          chainName,
          cand.address,
        );
      if (resp.error) continue;
      const items = resp.data?.items ?? [];
      const candLower = cand.address.toLowerCase();
      for (const t of items) {
        if (!t) continue;
        const from = t.from_address?.toLowerCase();
        const to = t.to_address?.toLowerCase();
        if (from && from !== candLower && from !== subjLower) {
          allAddresses.add(from);
          allHits.push({ via: cand.address, hit: from, via_flow_usd: cand.total_flow_usd });
        }
        if (to && to !== candLower && to !== subjLower) {
          allAddresses.add(to);
          allHits.push({ via: cand.address, hit: to, via_flow_usd: cand.total_flow_usd });
        }
        totalTxExamined += 1;
      }
      hopsWalked += 1;
    } catch (_err) {
      // swallow — single counterparty page failure shouldn't kill the sweep
      continue;
    }
  }

  const evidence = buildEvidence({
    endpoint: "TransactionService.getAllTransactionsForAddressByPage (per 1-hop counterparty, 2-hop sweep)",
    endpoint_url: `https://api.covalenthq.com/v1/${chainName}/2-hop-walk/?subject=${subjectWallet}`,
    request_params: {
      chain: chainName,
      subject: subjectWallet,
      one_hop_candidates: oneHopAddresses.length,
      material_threshold_usd: materialThresholdUsd,
      max_hops_to_walk: maxHopsToWalk,
    },
    response_excerpt: {
      hops_walked: hopsWalked,
      hops_skipped_below_threshold: skipped,
      unique_two_hop_addresses: allAddresses.size,
      transactions_examined: totalTxExamined,
    },
    tx_hashes: [],
    block_heights: [],
    chain,
  });

  return {
    data: {
      addresses: [...allAddresses],
      // Dedupe matches on (via, hit) to keep metadata payload bounded
      matches: dedupeMatches(allHits),
      hops_walked: hopsWalked,
      hops_skipped_below_threshold: skipped,
      transactions_examined: totalTxExamined,
    },
    evidence,
  };
}

function dedupeMatches(matches: TwoHopMatch[]): TwoHopMatch[] {
  const seen = new Set<string>();
  const out: TwoHopMatch[] = [];
  for (const m of matches) {
    const key = `${m.via.toLowerCase()}|${m.hit.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

/**
 * Recent transactions — first page only. The SDK's `getAllTransactionsForAddress`
 * is an AsyncIterable of *pages*, not txs; we use `*ByPage` for a clean
 * first-page pull.
 */
export async function getRecentTransactions(
  chain: ChainName,
  wallet: string,
): Promise<Cited<WalletTransaction[]>> {
  const chainName = CHAIN_MAP[chain];
  const resp = await client().TransactionService.getAllTransactionsForAddressByPage(
    chainName,
    wallet,
  );
  if (resp.error) {
    throw new Error(
      `GoldRush getRecentTransactions: ${resp.error_message ?? "unknown error"}`,
    );
  }
  const rawItems = resp.data?.items ?? [];
  const items: WalletTransaction[] = [];
  const txHashes: string[] = [];
  const blockHeights: number[] = [];
  for (const t of rawItems) {
    if (!t || !t.tx_hash) continue;
    items.push({
      txHash: t.tx_hash,
      blockHeight: typeof t.block_height === "number" ? t.block_height : 0,
      blockSignedAt: t.block_signed_at
        ? new Date(t.block_signed_at).toISOString()
        : "",
      from: t.from_address ?? "",
      to: t.to_address ?? "",
      valueQuote: typeof t.value_quote === "number" ? t.value_quote : 0,
      successful: t.successful ?? true,
    });
    txHashes.push(t.tx_hash);
    if (typeof t.block_height === "number") blockHeights.push(t.block_height);
  }
  const evidence = buildEvidence({
    endpoint: "TransactionService.getAllTransactionsForAddressByPage",
    endpoint_url: `https://api.covalenthq.com/v1/${chainName}/address/${wallet}/transactions_v3/`,
    request_params: { chain: chainName, wallet },
    response_excerpt: {
      item_count: items.length,
      first: items.slice(0, 5),
      last: items.slice(-5),
    },
    tx_hashes: txHashes.slice(0, 100),
    block_heights: blockHeights.slice(0, 100),
    chain,
  });
  return { data: items, evidence };
}

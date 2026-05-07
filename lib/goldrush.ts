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

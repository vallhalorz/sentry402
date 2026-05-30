/**
 * Chainalysis Sanctions Oracle — external cross-check.
 *
 * Chainalysis publishes a public, read-only smart contract on Ethereum
 * mainnet that returns `isSanctioned(address) → bool` for any address
 * Chainalysis has indexed as on an active OFAC SDN entry. The contract
 * is the same reference Uniswap, Coinbase Wallet, MetaMask Snaps, and
 * dozens of other consumer apps use at the frontend layer. It is:
 *
 *   - Free (read-only `eth_call`, no gas, no API key)
 *   - Maintained directly by Chainalysis
 *   - Updated promptly after Treasury designations
 *   - Court-admissible (Chainalysis data has been used in U.S. v. Sterlingov
 *     and other federal cases)
 *
 * We call it as an independent cross-check on EVM chains alongside our
 * own SDN list (`lib/sdn.ts`). The dossier surfaces THREE outcomes:
 *
 *   1. Both agree (sanctioned) → confirmation; oracle evidence is attached
 *      to the existing `ofac_direct_match` signal as a second independent
 *      source. "Two independent SDN datasets converge."
 *
 *   2. Oracle says YES, our SDN says NO → critical signal. Treasury may
 *      have designated the address since our last manual SDN sync. This
 *      is the regulator-relevant case: it surfaces designations we missed.
 *
 *   3. Oracle says NO, our SDN says YES → informational. Catches local
 *      stale data (e.g. delisted addresses we forgot to remove). Verdict
 *      remains driven by our SDN match; the disagreement is logged for
 *      compliance review.
 *
 * Contract address (Ethereum mainnet):
 *   0x40C57923924B5c5c5455c48D93317139ADDaC8fb
 *
 * Method:
 *   function isSanctioned(address addr) external view returns (bool)
 *   selector: 0xdf592f7d
 *
 * Reference:
 *   https://go.chainalysis.com/chainalysis-oracle-docs.html
 */

import type { ChainName } from "./types";

/** Read-only contract address on Ethereum mainnet. */
export const CHAINALYSIS_ORACLE_ADDRESS =
  "0x40C57923924B5c5c5455c48D93317139ADDaC8fb";

/** keccak256("isSanctioned(address)") first 4 bytes. */
const IS_SANCTIONED_SELECTOR = "0xdf592f7d";

/**
 * Public Ethereum RPC endpoints (no API key required). We rotate across a
 * small list so a transient outage on one provider doesn't block the
 * cross-check. Ordered by observed reliability in May 2026.
 */
const RPC_FALLBACKS: readonly string[] = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.llamarpc.com",
  "https://rpc.ankr.com/eth",
  "https://cloudflare-eth.com",
];

/** Override via env var so production deploys can pin a paid RPC if desired. */
function resolveRpc(): string[] {
  const override = process.env.SENTRY402_ETH_RPC;
  return override ? [override, ...RPC_FALLBACKS] : Array.from(RPC_FALLBACKS);
}

/** Subset of chains the oracle is published on. */
const SUPPORTED_CHAINS: ChainName[] = [
  "eth-mainnet",
  "base-mainnet",
  "matic-mainnet",
  "bsc-mainnet",
  "arbitrum-mainnet",
  "optimism-mainnet",
];

export type ChainalysisOracleResult = {
  sanctioned: boolean;
  /** RPC endpoint that ultimately returned the answer. */
  rpc_used: string;
  /** Wall-clock latency of the eth_call in ms. */
  latency_ms: number;
  /** The bytes32 raw return value, for evidence transparency. */
  raw_response: string;
  /** Address normalized to lowercase 0x… form (what we asked about). */
  queried_address: string;
};

/**
 * Pad an EVM address (0x-prefixed, 40 hex) to a 32-byte ABI-encoded
 * argument. Throws on bad input — caller is responsible for validation.
 */
function padAddress(addr: string): string {
  const stripped = addr.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(stripped)) {
    throw new Error(`chainalysisOracle: invalid EVM address: ${addr}`);
  }
  return "000000000000000000000000" + stripped;
}

/**
 * Call `isSanctioned(address)` on the Chainalysis Oracle. Falls back
 * across RPC endpoints. Returns null if every fallback failed — the
 * caller should treat that as "cross-check unavailable", not as a
 * negative answer.
 */
export async function checkChainalysisOracle(
  chain: ChainName,
  address: string,
): Promise<ChainalysisOracleResult | null> {
  // Solana addresses are not interpretable by an EVM contract. Skip silently.
  if (!SUPPORTED_CHAINS.includes(chain)) return null;
  const queried = address.toLowerCase();
  const data = `${IS_SANCTIONED_SELECTOR}${padAddress(queried)}`;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to: CHAINALYSIS_ORACLE_ADDRESS, data }, "latest"],
  });
  const t0 = Date.now();
  for (const rpc of resolveRpc()) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));
      if (!res.ok) continue;
      const json: unknown = await res.json();
      if (
        !json ||
        typeof json !== "object" ||
        !("result" in json) ||
        typeof (json as { result: unknown }).result !== "string"
      ) {
        continue;
      }
      const raw = (json as { result: string }).result;
      // 0x000…001 = true, 0x000…000 = false. Anything else = malformed.
      const bn = BigInt(raw);
      if (bn !== 0n && bn !== 1n) continue;
      return {
        sanctioned: bn === 1n,
        rpc_used: rpc,
        latency_ms: Date.now() - t0,
        raw_response: raw,
        queried_address: queried,
      };
    } catch {
      // try the next RPC
      continue;
    }
  }
  return null;
}

/**
 * Pinned version string for dossier metadata, so an auditor can recreate
 * the exact cross-check. The smart contract address + selector are
 * immutable, so the version just changes when our integration logic
 * changes (e.g. fallback RPC list).
 */
export const CHAINALYSIS_ORACLE_VERSION = "2026-05-30-publicnode";

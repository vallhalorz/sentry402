/**
 * Block explorer URL helpers.
 *
 * Compliance officers need primary-source verification for every claim a
 * tool makes. When Sentry402 cites a tx hash or counterparty address, the
 * UI links directly to the canonical block explorer so the officer can
 * audit the underlying chain data without leaving their workflow.
 *
 * Mapping is per-chain: Ethereum → Etherscan, Base → Basescan, etc. Solana
 * uses Solscan (solscan.io) since it is the most widely-used Solana
 * explorer and is what FATF / Treasury press releases tend to link to.
 *
 * Open in a new tab with rel=noreferrer so the destination cannot snoop on
 * the dossier session.
 */

import type { ChainName } from "./types";

const EXPLORERS: Record<ChainName, { name: string; base: string; addressPath: string; txPath: string }> = {
  "eth-mainnet": {
    name: "Etherscan",
    base: "https://etherscan.io",
    addressPath: "/address/",
    txPath: "/tx/",
  },
  "base-mainnet": {
    name: "Basescan",
    base: "https://basescan.org",
    addressPath: "/address/",
    txPath: "/tx/",
  },
  "matic-mainnet": {
    name: "Polygonscan",
    base: "https://polygonscan.com",
    addressPath: "/address/",
    txPath: "/tx/",
  },
  "bsc-mainnet": {
    name: "BscScan",
    base: "https://bscscan.com",
    addressPath: "/address/",
    txPath: "/tx/",
  },
  "arbitrum-mainnet": {
    name: "Arbiscan",
    base: "https://arbiscan.io",
    addressPath: "/address/",
    txPath: "/tx/",
  },
  "optimism-mainnet": {
    name: "Optimistic Etherscan",
    base: "https://optimistic.etherscan.io",
    addressPath: "/address/",
    txPath: "/tx/",
  },
  "solana-mainnet": {
    name: "Solscan",
    base: "https://solscan.io",
    addressPath: "/account/",
    txPath: "/tx/",
  },
};

export function explorerName(chain: ChainName): string {
  return EXPLORERS[chain]?.name ?? "block explorer";
}

export function addressUrl(chain: ChainName, address: string): string {
  const e = EXPLORERS[chain];
  if (!e) return "";
  return `${e.base}${e.addressPath}${address}`;
}

export function txUrl(chain: ChainName, txHash: string): string {
  const e = EXPLORERS[chain];
  if (!e) return "";
  return `${e.base}${e.txPath}${txHash}`;
}

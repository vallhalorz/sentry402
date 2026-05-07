/**
 * Address attribution registry.
 *
 * Curated set of well-known on-chain addresses for compliance officer
 * triage. When the subject wallet or any counterparty matches an entry, the
 * UI surfaces the attribution label instead of just the raw 0x... — so a
 * compliance officer can immediately tell "this wallet sent to a Binance
 * hot wallet" without leaving the dossier.
 *
 * SCOPE: This is a small curated list, not a comprehensive attribution
 * database. Production would integrate ESMA / Chainalysis / TRM /
 * GoldRush's own labeling layer. We intentionally do not claim this is
 * authoritative — labels are best-effort from public sources.
 *
 * SOURCES:
 *   - Etherscan public address tags (https://etherscan.io/labelcloud)
 *   - Arkham Intelligence public entity register
 *   - Issuer official disclosures (Coinbase, Binance, Kraken)
 *   - Protocol team docs (Uniswap, Curve, 1inch, etc.)
 *   - Project ENS / X / verified social claims (vitalik.eth, etc.)
 *
 * Do NOT add OFAC SDN entries here — those live in lib/sdn.ts and trigger
 * critical-severity rules, not informational labels.
 */

export type AddressLabelKind =
  | "exchange_cex"
  | "exchange_dex"
  | "bridge"
  | "router"
  | "stablecoin_contract"
  | "public_figure"
  | "foundation"
  | "infrastructure";

export type AddressLabel = {
  /** Lowercase EVM address. */
  address: string;
  label: string;
  kind: AddressLabelKind;
  /** Source URL or short citation. */
  source: string;
};

export const KNOWN_ADDRESSES: AddressLabel[] = [
  // ===== Public figures =====
  {
    address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
    label: "vitalik.eth (Vitalik Buterin)",
    kind: "public_figure",
    source: "Public ENS, verified X handle",
  },

  // ===== Foundations =====
  {
    address: "0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359",
    label: "Ethereum Foundation",
    kind: "foundation",
    source: "EF official disclosure",
  },

  // ===== CEX hot wallets =====
  {
    address: "0x28c6c06298d514db089934071355e5743bf21d60",
    label: "Binance 14 (hot wallet)",
    kind: "exchange_cex",
    source: "Etherscan public label",
  },
  {
    address: "0x21a31ee1afc51d94c2efccaa2092ad1028285549",
    label: "Binance 15 (hot wallet)",
    kind: "exchange_cex",
    source: "Etherscan public label",
  },
  {
    address: "0xdfd5293d8e347dfe59e90efd55b2956a1343963d",
    label: "Binance 16 (hot wallet)",
    kind: "exchange_cex",
    source: "Etherscan public label",
  },
  {
    address: "0x71660c4005ba85c37ccec55d0c4493e66fe775d3",
    label: "Coinbase 1",
    kind: "exchange_cex",
    source: "Etherscan public label",
  },
  {
    address: "0x503828976d22510aad0201ac7ec88293211d23da",
    label: "Coinbase 2",
    kind: "exchange_cex",
    source: "Etherscan public label",
  },
  {
    address: "0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740",
    label: "Coinbase 3",
    kind: "exchange_cex",
    source: "Etherscan public label",
  },
  {
    address: "0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2",
    label: "FTX (collapsed) recovery wallet",
    kind: "exchange_cex",
    source: "Public bankruptcy disclosure",
  },
  {
    address: "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0",
    label: "Kraken 4",
    kind: "exchange_cex",
    source: "Etherscan public label",
  },
  {
    address: "0xa910f92acdaf488fa6ef02174fb86208ad7722ba",
    label: "Poloniex cold wallet",
    kind: "exchange_cex",
    source: "Etherscan public label",
  },
  {
    address: "0xd24400ae8bfebb18ca49be86258a3c749cf46853",
    label: "Gemini 1",
    kind: "exchange_cex",
    source: "Etherscan public label",
  },
  {
    address: "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43",
    label: "Coinbase 10",
    kind: "exchange_cex",
    source: "Etherscan public label",
  },
  {
    address: "0xfdb16996831753d5331ff813c29a93c76834a0ad",
    label: "OKX 5",
    kind: "exchange_cex",
    source: "Etherscan public label",
  },

  // ===== DEX routers =====
  {
    address: "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",
    label: "Uniswap V2 Router",
    kind: "router",
    source: "Uniswap official docs",
  },
  {
    address: "0xe592427a0aece92de3edee1f18e0157c05861564",
    label: "Uniswap V3 Router",
    kind: "router",
    source: "Uniswap official docs",
  },
  {
    address: "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad",
    label: "Uniswap Universal Router",
    kind: "router",
    source: "Uniswap official docs",
  },
  {
    address: "0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45",
    label: "Uniswap Universal Router 2",
    kind: "router",
    source: "Uniswap official docs",
  },
  {
    address: "0x1111111254eeb25477b68fb85ed929f73a960582",
    label: "1inch V5 Aggregation Router",
    kind: "router",
    source: "1inch docs",
  },
  {
    address: "0x111111125421ca6dc452d289314280a0f8842a65",
    label: "1inch V6 Aggregation Router",
    kind: "router",
    source: "1inch docs",
  },
  {
    address: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5",
    label: "Kyber Aggregator Router",
    kind: "router",
    source: "Kyber docs",
  },
  {
    address: "0xdef1c0ded9bec7f1a1670819833240f027b25eff",
    label: "0x Protocol Exchange Proxy",
    kind: "router",
    source: "0x official docs",
  },

  // ===== Bridges =====
  {
    address: "0x3ee18b2214aff97000d974cf647e54347b1eedca",
    label: "Wormhole Token Bridge",
    kind: "bridge",
    source: "Wormhole official docs",
  },
  {
    address: "0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf",
    label: "Polygon ERC20 Bridge",
    kind: "bridge",
    source: "Polygon official docs",
  },
  {
    address: "0x8731d54e9d02c286767d56ac03e8037c07e01e98",
    label: "Stargate Router (LayerZero)",
    kind: "bridge",
    source: "Stargate / LayerZero docs",
  },
  {
    address: "0xa0c68c638235ee32657e8f720a23cec1bfc77c77",
    label: "Polygon PoS Bridge",
    kind: "bridge",
    source: "Polygon docs",
  },
  {
    address: "0xa0c68c638235ee32657e8f720a23cec1bfc77c77",
    label: "Polygon PoS Bridge",
    kind: "bridge",
    source: "Polygon docs",
  },

  // ===== DEX (CFMM contracts) =====
  {
    address: "0xb4e16d0168e52d35cacd2c6185b44281ec28c9dc",
    label: "Uniswap V2: USDC/ETH pool",
    kind: "exchange_dex",
    source: "Uniswap V2 factory",
  },

  // ===== Stablecoin contracts (informational) =====
  // Stablecoin contracts are also in lib/stablecoin-registry.ts; reproducing
  // a few here so the Holdings panel can label them even when the
  // stablecoin_issuer_compliance rule does not fire.
  {
    address: "0xdac17f958d2ee523a2206206994597c13d831ec7",
    label: "Tether USD (USDT) contract",
    kind: "stablecoin_contract",
    source: "Tether official",
  },
  {
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    label: "USD Coin (USDC) contract",
    kind: "stablecoin_contract",
    source: "Circle official",
  },
  {
    address: "0x6b175474e89094c44da98b954eedeac495271d0f",
    label: "Dai Stablecoin (DAI) contract",
    kind: "stablecoin_contract",
    source: "MakerDAO docs",
  },
  {
    address: "0x6c3ea9036406852006290770bedfcaba0e23a0e8",
    label: "PayPal USD (PYUSD) contract",
    kind: "stablecoin_contract",
    source: "Paxos official",
  },
];

const LOWER_LOOKUP = new Map<string, AddressLabel>();
for (const a of KNOWN_ADDRESSES) {
  LOWER_LOOKUP.set(a.address.toLowerCase(), a);
}

export function lookupAddressLabel(address: string): AddressLabel | null {
  if (!address) return null;
  return LOWER_LOOKUP.get(address.toLowerCase()) ?? null;
}

export const KNOWN_ADDRESSES_VERSION = "2026-05-07-seed";

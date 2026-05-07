/**
 * Stablecoin issuer registry.
 *
 * Maps stablecoin contract addresses (per chain) to issuer compliance posture.
 * Used by the risk engine's stablecoin_issuer_compliance,
 * mica_emt_non_compliant, and non_cooperative_issuer_holdings rules.
 *
 * SOURCES (cited in evidence):
 *   - Tether quarterly attestation reports (https://tether.to/en/transparency/)
 *   - Circle quarterly transparency reports (https://www.circle.com/transparency)
 *   - Paxos transparency dashboard (https://paxos.com/transparency-reports/)
 *   - ESMA MiCA crypto-asset white paper register (post 2024-12-30)
 *   - CSIS December 2025 GENIUS Act FPSI gap analysis
 *   - mrdecentralize Substack November 2025 A7A5 ruble stablecoin coverage
 *   - Chainalysis Crypto Crime Report 2025 / 2026
 *
 * IMPORTANT: contract addresses are stored lowercase for EVM. Solana addresses
 * are case-sensitive base58. Verify addresses against issuer official docs
 * before relying in production — this is a curated hackathon-grade seed list.
 */

export type FreezePolicy =
  /** Active OFAC-aligned freeze cooperation, transparent attestations. */
  | "highly_cooperative"
  /** Cooperative on most fronts, uneven track record across jurisdictions. */
  | "cooperative"
  /** Mixed: limited public transparency or non-uniform freeze response. */
  | "mixed"
  /** No issuer freeze authority by design (decentralized stablecoin). */
  | "decentralized_no_authority"
  /** Designed to evade Western freezes; sanctions evasion vehicle. */
  | "non_cooperative";

export type MicaEmtStatus =
  /** Approved E-Money Token under MiCA Title III. */
  | "emt_approved"
  /** EMT application filed/pending with NCA. */
  | "emt_pending"
  /** No EMT license, not pursuing — circulation in EU after 2026-07-01 restricted. */
  | "emt_not_filed"
  /** Decentralized, structurally cannot meet EMT issuer requirements. */
  | "emt_not_applicable"
  /** Discontinued / retired stablecoin. */
  | "discontinued";

export type StablecoinEntry = {
  ticker: string;
  issuer: string;
  /** Lowercase EVM contract addresses keyed by chain name. */
  evm_addresses: Partial<Record<
    | "eth-mainnet"
    | "base-mainnet"
    | "matic-mainnet"
    | "bsc-mainnet"
    | "arbitrum-mainnet"
    | "optimism-mainnet",
    string
  >>;
  /** Solana mint addresses (base58, case-sensitive). */
  solana_addresses?: string[];
  freeze_policy: FreezePolicy;
  mica_emt_status: MicaEmtStatus;
  /** Cumulative on-chain freeze count from issuer transparency reports. */
  freeze_count_disclosed?: string;
  /** Authoritative source citation. */
  source: string;
  /** ISO date the entry was last verified by curator. */
  verified_at: string;
  /** Optional context notes for compliance reviewer. */
  notes?: string;
};

export const STABLECOIN_REGISTRY: StablecoinEntry[] = [
  // ===== Cooperative issuers (OFAC-aligned, transparent) =====
  {
    ticker: "USDC",
    issuer: "Circle Internet Financial",
    evm_addresses: {
      "eth-mainnet": "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
      "base-mainnet": "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      "matic-mainnet": "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
      "arbitrum-mainnet": "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      "optimism-mainnet": "0x0b2c639c533813f4aa9d7837caf62653d097ff85",
    },
    solana_addresses: ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"],
    freeze_policy: "cooperative",
    mica_emt_status: "emt_approved",
    freeze_count_disclosed: "$60M+ across 200+ addresses (Circle Q4 2025 transparency report)",
    source: "Circle Q4 2025 transparency report; ESMA MiCA EMT register",
    verified_at: "2026-05-07",
  },
  {
    ticker: "EURC",
    issuer: "Circle Internet Financial",
    evm_addresses: {
      "eth-mainnet": "0x1abaea1f7c830bd89acc67ec4af516284b1bc33c",
      "base-mainnet": "0x60a3e35cc302bfa44cb288bc5a4f316fdb1adb42",
    },
    freeze_policy: "cooperative",
    mica_emt_status: "emt_approved",
    source: "ESMA MiCA EMT register; Circle EU operations",
    verified_at: "2026-05-07",
  },
  {
    ticker: "PYUSD",
    issuer: "Paxos Trust Company",
    evm_addresses: {
      "eth-mainnet": "0x6c3ea9036406852006290770bedfcaba0e23a0e8",
    },
    solana_addresses: ["2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo"],
    freeze_policy: "highly_cooperative",
    mica_emt_status: "emt_pending",
    source: "Paxos transparency dashboard; NYDFS limited-purpose trust charter",
    verified_at: "2026-05-07",
    notes: "Confidential Balances on Solana via Token-2022 (April 2025) — auditor-key compliance pattern.",
  },
  {
    ticker: "USDP",
    issuer: "Paxos Trust Company",
    evm_addresses: {
      "eth-mainnet": "0x8e870d67f660d95d5be530380d0ec0bd388289e1",
    },
    freeze_policy: "highly_cooperative",
    mica_emt_status: "emt_not_filed",
    source: "Paxos transparency dashboard",
    verified_at: "2026-05-07",
  },

  // ===== Cooperative-but-uneven issuers =====
  {
    ticker: "USDT",
    issuer: "Tether Limited",
    evm_addresses: {
      "eth-mainnet": "0xdac17f958d2ee523a2206206994597c13d831ec7",
      "matic-mainnet": "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
      "bsc-mainnet": "0x55d398326f99059ff775485246999027b3197955",
      "arbitrum-mainnet": "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
      "optimism-mainnet": "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",
    },
    solana_addresses: ["Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"],
    freeze_policy: "cooperative",
    mica_emt_status: "emt_not_filed",
    freeze_count_disclosed: "~$2B+ across 2,500+ addresses cumulative (Tether attestation Q4 2025)",
    source: "Tether quarterly attestation reports; FATF Targeted Update June 2025",
    verified_at: "2026-05-07",
    notes: "OFAC-cooperative on EVM but historically uneven on Tron and Asian exchange flows. EU circulation restricted post 2026-07-01 absent EMT license.",
  },

  // ===== Decentralized (no issuer freeze authority) =====
  {
    ticker: "DAI",
    issuer: "MakerDAO (decentralized protocol)",
    evm_addresses: {
      "eth-mainnet": "0x6b175474e89094c44da98b954eedeac495271d0f",
      "base-mainnet": "0x50c5725949a6f0c72e6c4a641f24049a917db0cb",
    },
    freeze_policy: "decentralized_no_authority",
    mica_emt_status: "emt_not_applicable",
    source: "MakerDAO governance docs; structural analysis",
    verified_at: "2026-05-07",
    notes: "No central issuer can freeze. Compliance officers should treat decentralized stablecoins as higher-typology-uncertainty for sanctions cases.",
  },
  {
    ticker: "FRAX",
    issuer: "Frax Finance (decentralized protocol)",
    evm_addresses: {
      "eth-mainnet": "0x853d955acef822db058eb8505911ed77f175b99e",
    },
    freeze_policy: "decentralized_no_authority",
    mica_emt_status: "emt_not_applicable",
    source: "Frax Finance governance docs",
    verified_at: "2026-05-07",
  },
  {
    ticker: "LUSD",
    issuer: "Liquity Protocol (decentralized)",
    evm_addresses: {
      "eth-mainnet": "0x5f98805a4e8be255a32880fdec7f6728c6568ba0",
    },
    freeze_policy: "decentralized_no_authority",
    mica_emt_status: "emt_not_applicable",
    source: "Liquity protocol docs",
    verified_at: "2026-05-07",
  },
  {
    ticker: "crvUSD",
    issuer: "Curve Finance (decentralized)",
    evm_addresses: {
      "eth-mainnet": "0xf939e0a03fb07f59a73314e73794be0e57ac1b4e",
    },
    freeze_policy: "decentralized_no_authority",
    mica_emt_status: "emt_not_applicable",
    source: "Curve Finance docs",
    verified_at: "2026-05-07",
  },

  // ===== Mixed-transparency issuers =====
  {
    ticker: "FDUSD",
    issuer: "First Digital Trust (Hong Kong)",
    evm_addresses: {
      "eth-mainnet": "0xc5f0f7b66764f6ec8c8dff7ba683102295e16409",
      "bsc-mainnet": "0xc5f0f7b66764f6ec8c8dff7ba683102295e16409",
    },
    freeze_policy: "mixed",
    mica_emt_status: "emt_not_filed",
    source: "First Digital Trust Hong Kong public disclosures",
    verified_at: "2026-05-07",
    notes: "Asia-focused issuance; limited public freeze-cooperation track record. Compliance officer should request issuer-specific attestation before high-value clearance.",
  },
  {
    ticker: "TUSD",
    issuer: "Techteryx (formerly TrustToken)",
    evm_addresses: {
      "eth-mainnet": "0x0000000000085d4780b73119b644ae5ecd22b376",
    },
    freeze_policy: "mixed",
    mica_emt_status: "emt_not_filed",
    source: "Techteryx public disclosures; multiple historical credibility issues",
    verified_at: "2026-05-07",
  },

  // ===== Discontinued / legacy =====
  {
    ticker: "BUSD",
    issuer: "Paxos Trust Company (issuance halted 2023-02)",
    evm_addresses: {
      "eth-mainnet": "0x4fabb145d64652a948d72533023f6e7a623c7c53",
    },
    freeze_policy: "highly_cooperative",
    mica_emt_status: "discontinued",
    source: "NYDFS Feb 2023 directive; Paxos $48.5M settlement Aug 6, 2025",
    verified_at: "2026-05-07",
    notes: "Issuance halted Feb 2023 by NYDFS directive. Circulating supply minimal but residual holdings indicate aged-funds risk pattern.",
  },

  // ===== Non-cooperative / sanctions-evasion-vehicle =====
  // A7A5 ruble stablecoin — Russian-issued, designed to circulate outside
  // Western freeze authority. Reached $100B+ supply by November 2025
  // (mrdecentralize Substack analysis, CSIS Dec 2025 FPSI report).
  // Contract addresses on Western EVM chains are uncertain — primary
  // circulation is on Tron and domestic Russian rails. We define a sentinel
  // entry so the risk engine can flag if any A7A5-tagged contract is
  // detected. Production deployment should integrate ESMA / Treasury
  // emerging-issuer feeds for accurate contract-address matching.
  {
    ticker: "A7A5",
    issuer: "A7 Holding (Russian Federation)",
    evm_addresses: {
      // Sentinel placeholder — contracts on Western EVM not confirmed
      // public. Rule will not match wallet holdings on EVM unless a
      // confirmed contract address is added here.
    },
    freeze_policy: "non_cooperative",
    mica_emt_status: "emt_not_filed",
    source: "CSIS December 2025 GENIUS Act FPSI gap analysis; mrdecentralize Substack Nov 2025 A7A5 supply analysis",
    verified_at: "2026-05-07",
    notes: "Sanctions-evasion vehicle by design. $100B+ supply by Nov 2025. Primary circulation on Tron. Holding A7A5 is a critical-severity advisory under MiCA Article 17 and FinCEN funnel-account heuristics.",
  },
];

/**
 * Lookup helper — returns matching registry entry for an EVM contract
 * address on a given chain, or null. Lowercases address before matching.
 */
export function lookupStablecoinByContract(
  chain: string,
  contractAddress: string,
): StablecoinEntry | null {
  const norm = contractAddress.toLowerCase();
  for (const entry of STABLECOIN_REGISTRY) {
    const evmHit =
      entry.evm_addresses[chain as keyof typeof entry.evm_addresses];
    if (evmHit && evmHit.toLowerCase() === norm) return entry;
    if (entry.solana_addresses?.includes(contractAddress)) return entry;
  }
  return null;
}

/** Severity weighting per freeze_policy — used by rule weightings. */
export const FREEZE_POLICY_RISK_POINTS: Record<FreezePolicy, number> = {
  highly_cooperative: 0,
  cooperative: 0,
  mixed: 5,
  decentralized_no_authority: 3, // informational, not high
  non_cooperative: 50, // saturating critical
};

export const STABLECOIN_REGISTRY_VERSION = "2026-05-07-seed";

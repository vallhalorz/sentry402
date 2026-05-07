/**
 * Sentry402 — citation-bound risk types.
 *
 * The MOAT: every claim in a risk dossier is bound to an Evidence record that
 * cites the exact GoldRush API endpoint, request, response excerpt, tx hashes,
 * dataset version, and timestamp that produced it. This satisfies the FCA 2024
 * documentation requirement (regulated firms must document which platform
 * version + entity attribution database version produced each compliance
 * decision) and gives compliance officers SAR-defensible exhibits.
 *
 * Do NOT add fields to Signal or RiskDossier that aren't traceable through
 * Evidence. If a fact has no Evidence, it doesn't go in the dossier.
 */

export type ChainName =
  | "eth-mainnet"
  | "base-mainnet"
  | "matic-mainnet"
  | "bsc-mainnet"
  | "arbitrum-mainnet"
  | "optimism-mainnet"
  | "solana-mainnet";

export type Severity = "info" | "low" | "medium" | "high" | "critical";

/**
 * Evidence — atomic, citation-bound proof unit.
 *
 * Every Signal in a dossier MUST cite at least one Evidence by id. Evidence is
 * stored once per dossier and referenced by id from signals.
 */
export type Evidence = {
  id: string; // ev_<short-ulid>
  endpoint: string; // human-readable label, e.g. "SecurityService.getApprovals"
  endpoint_url: string; // full URL that was hit, query string included
  request_params: Record<string, unknown>;
  response_excerpt: unknown; // minimal slice supporting the claim, NOT full response
  tx_hashes: string[];
  block_heights: number[];
  chain: ChainName;
  goldrush_api_version: string; // from response headers if available, else SDK package version
  fetched_at: string; // ISO 8601 UTC
  payload_sha256?: string; // optional integrity hash of the slice
};

/**
 * Signal types — typed enum so rule packs can be added/versioned cleanly.
 */
export type SignalType =
  | "approval_value_at_risk"
  | "unlimited_approval"
  | "drainer_pattern"
  | "sanctions_adjacency"
  | "ofac_direct_match"
  | "tornado_cash_historic_exposure"
  | "counterparty_concentration"
  | "fresh_wallet"
  | "stale_wallet_reactivation"
  | "mev_exposure"
  | "bridge_exposure"
  | "mixer_proximity"
  | "high_velocity"
  | "structuring_pattern"
  | "coverage_advisory"
  | "stablecoin_issuer_compliance"
  | "stablecoin_non_cooperative_issuer"
  | "stablecoin_mica_emt_non_compliant"
  | "stablecoin_issuer_frozen_match"
  | "stablecoin_velocity_typology"
  | "stablecoin_dprk_cluster_proximity";

/**
 * Signal — a single risk finding. Cites Evidence ids.
 *
 * `rationale` should use SAR vocabulary where it applies (structuring, layering,
 * integration, indicia of money laundering). `fatf_reference` and
 * `fincen_reference` make the artifact regulator-defensible.
 */
export type Signal = {
  id: string; // sig_<short-ulid>
  type: SignalType;
  severity: Severity;
  title: string; // short label for UI list
  rationale: string; // 1-3 sentence explanation a CCO would accept
  fatf_reference?: string; // e.g. "FATF Recommendation 16 (Travel Rule)"
  fincen_reference?: string; // e.g. "FinCEN SAR Form 111 — Suspicious Activity Type 31a (Funnel Account)"
  mica_reference?: string; // e.g. "MiCA Article 16 — record-keeping"
  evidence_ids: string[];
  score_contribution: number; // points added to overall_score (0-100 scale)
  metadata?: Record<string, unknown>;
};

/**
 * Top-level holding row surfaced under subject context. Sourced from the
 * GoldRush balances call we already fetch — no extra API call.
 */
export type WalletHolding = {
  symbol: string;
  contract_address: string;
  balance_usd: number;
  /** Optional label if this holding is a known stablecoin (issuer + freeze
   * policy) so the Holdings panel can show inline compliance posture. */
  stablecoin?: { issuer: string; freeze_policy: string };
  /** Optional label if the contract address is a well-known token (USDT
   * official contract, etc.). */
  contract_label?: string;
};

/**
 * Top-level activity row surfaced under subject context. Sourced from the
 * GoldRush transactions call we already fetch.
 */
export type WalletActivity = {
  tx_hash: string;
  block_signed_at: string;
  /** "in" = wallet was recipient; "out" = wallet was sender; "self" = both
   * sides matched the subject (intra-wallet rebalance). */
  direction: "in" | "out" | "self";
  counterparty: string;
  /** Attribution label if counterparty matches lib/known-addresses.ts. */
  counterparty_label?: string;
  value_usd: number;
};

/**
 * Aggregated counterparty summary across the full first page of transaction
 * history (~100 tx). One row per unique counterparty, with inbound vs
 * outbound counts and USD totals so a compliance officer can bulk-screen
 * the export in a spreadsheet without reconstructing per-tx joins.
 */
export type CounterpartyAggregate = {
  address: string;
  /** Attribution label if counterparty matches lib/known-addresses.ts. */
  label?: string;
  inbound_count: number;
  outbound_count: number;
  inbound_usd_total: number;
  outbound_usd_total: number;
  /** ISO 8601 UTC of earliest observed interaction within the sample. */
  first_seen_at: string;
  /** ISO 8601 UTC of most recent observed interaction within the sample. */
  last_seen_at: string;
};

/**
 * RiskDossier — the full report.
 */
export type RiskDossier = {
  subject: {
    wallet: string;
    chain: ChainName;
    queried_at: string; // ISO 8601 UTC
    /** Attribution label if subject matches lib/known-addresses.ts. */
    label?: string;
    /** ISO 8601 timestamp of the wallet's earliest observed on-chain
     * activity, sourced from getEarliestTransactionsForAddress. */
    first_seen_at?: string;
    /** Top holdings by USD value, capped at 10. */
    holdings?: WalletHolding[];
    /** Recent activity, capped at 5. */
    recent_activity?: WalletActivity[];
    /** Full counterparty aggregation across the recent transactions sample. */
    counterparties?: CounterpartyAggregate[];
  };
  overall_score: number; // 0-100, higher = more risk
  severity: Severity;
  headline: string; // 1-line summary for the dashboard
  signals: Signal[];
  evidence: Record<string, Evidence>; // keyed by evidence id
  metadata: DossierMetadata;
};

/**
 * Metadata that satisfies FCA 2024 documentation requirements.
 *
 * `rule_pack_version` + `sdn_list_version` + `goldrush_api_version` are the
 * three pinnable inputs that make a score reproducible.
 */
export type DossierMetadata = {
  rule_pack_version: string; // semver of the rule set used
  rule_pack_sha256: string; // hash of the compiled rule pack
  sdn_list_version: string; // OFAC SDN list version date
  goldrush_api_version: string;
  generator: { name: string; version: string };
  generation_id: string; // unique per dossier (ULID)
  generated_at: string; // ISO 8601 UTC
};

/**
 * Helpers for building dossiers — kept here so call sites don't drift.
 */
export function newEvidenceId(): string {
  return `ev_${randomShortId()}`;
}

export function newSignalId(): string {
  return `sig_${randomShortId()}`;
}

export function newGenerationId(): string {
  return `gen_${randomShortId()}`;
}

function randomShortId(): string {
  // 10-char crockford-ish, sufficient for a single dossier; not cryptographic.
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let out = "";
  for (let i = 0; i < 10; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/**
 * Severity → numeric ordering for sorting and threshold checks.
 */
export const SEVERITY_RANK: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export function scoreToSeverity(score: number): Severity {
  if (score >= 85) return "critical";
  if (score >= 65) return "high";
  if (score >= 40) return "medium";
  if (score >= 15) return "low";
  return "info";
}

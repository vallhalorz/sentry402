/**
 * Rule pack metadata.
 *
 * This file's contents are hashed (sha256) at build time and the hash is
 * stamped into every RiskDossier as `rule_pack_sha256`. Bumping the version
 * string here is the canonical way to record a rule change for FCA 2024
 * documentation purposes. Do NOT silently change weights without bumping.
 */

export const RULE_PACK_VERSION = "0.3.1-mvp";
// 0.3.1: removed dead sanctions_adjacency_hop2 config key. It was defined in
//        RULE_CONFIG but never read by the risk engine (the actual 2-hop rule
//        uses sanctions_indirect_exposure_2hop). The dead key inflated the
//        rule_pack_sha256 hash and misrepresented active rules to auditors.
// 0.3.0: 2-hop materially-gated indirect sanctions exposure rule added.
//        New rule sanctions_indirect_exposure_2hop walks the second-degree
//        counterparty graph but ONLY for 1-hop counterparties with material
//        flow (>= $1k USD bidirectional). Caps at 30 1-hop walks per scan
//        for cost-bounded latency (~5s p95 added when materially-active).
//        Skipped on Solana since 1-hop USD aggregates are unavailable.
//        Defensible scope: FATF Recommendation 16 layered-funds typology;
//        below the $1k threshold, indirect exposure is pure graph noise.
//        SDN seed expanded to ~37 entries with Tornado Cash 2022-08-08
//        original designation (delisted 2025-03-21, retained as historic
//        concern), Ronin Bridge Lazarus 2022-04-14 OFAC designation, and
//        structured designation_date + treasury_ref fields per entry.
//        sdn_list_version bumped to 2026-05-07-tc-expanded.
// 0.2.2: ERC-20 transfer sweep added to sanctions counterparty set. SB0416
//        DPRK addresses are USDT contracts — they appear inside Transfer
//        event logs, NOT as top-level tx counterparties. The deep
//        top-level sweep alone missed wallets that funded SDN addresses
//        via USDT. This release sweeps USDT and USDC transfer histories
//        per chain (3 pages each) and merges those counterparties into
//        the sanctions check set. Now catches the asymmetric "I funded a
//        DPRK USDT address but my recent native ETH tx don't show it"
//        case the user surfaced. Sanctions adjacency rationale notes both
//        top-level and ERC-20 sweep depths.
// 0.2.1: deep counterparty sweep. Sanctions adjacency, Tornado Cash
//        historic exposure, stablecoin issuer-frozen-list match, and DPRK
//        stablecoin cluster proximity now scan up to 5 pages (~500 tx) of
//        transaction history rather than the recent-100 sample. Catches
//        the asymmetric blind spot where an active wallet's recent tx
//        sample no longer contains an old interaction with a low-activity
//        sanctioned counterparty (sanctioned wallets have the link in
//        their sample, but the active subject does not). Activity timeline
//        and high_velocity rule still use the recent-100 sample.
// 0.2.0: stablecoin compliance signals. Six new cited rules wiring the new
//        STABLECOIN_REGISTRY (issuer cooperation profile + MiCA EMT status)
//        and ISSUER_FROZEN_LIST (Tether/Circle/Paxos publicly-disclosed
//        on-chain freezes). Six new SignalType entries. Citation chain:
//        CSIS December 2025 GENIUS Act FPSI report, Tether/Circle/Paxos
//        quarterly transparency reports, ESMA MiCA EMT register, FATF
//        Targeted Update June 2025, Treasury SB0416 March 12, 2026
//        DPRK stablecoin designation. Added STABLECOIN_REGISTRY_VERSION
//        and ISSUER_FROZEN_LIST_VERSION pinning to dossier metadata.
// 0.1.3: added Solana branch with coverage_advisory signal. Solana wallets
//        run only the balances endpoint + active SDN direct-match check, and
//        the dossier carries an explicit advisory that full SPL/decoded-tx
//        coverage requires a Helius supplement (out of MVP scope). EVM
//        coverage unchanged.
// 0.1.2: added ofac_direct_match rule — fires when subject wallet itself is
//        on the active OFAC SDN list (e.g., DPRK IT-worker designations from
//        Treasury SB0416 2026-03-12). Saturates score at 100, severity
//        critical, FATF Rec 6 + FinCEN 31y refs. SDN list bumped to
//        2026-05-07-dprk-mar2026 with 10 active OFAC DPRK addresses added.
// 0.1.1: fresh_wallet rule now sources from getEarliestTransactionsForAddress
//        (true wallet age) instead of first-page-min of recent txs. Eliminates
//        false positive on highly-active wallets like vitalik.eth.
// 0.1.0: initial 7-rule pack (approval VAR, unlimited approvals, drainer
//        pattern, sanctions adjacency hop1, TC historic, fresh wallet, high
//        velocity).

export type RuleConfig = {
  /** Score points added to overall when this rule fires at full intensity. */
  weight: number;
  /** Severity floor — rule emits at this or higher. */
  severity: "info" | "low" | "medium" | "high" | "critical";
  /** Threshold below which the rule does not fire. */
  threshold: number;
};

export const RULE_CONFIG = {
  ofac_direct_match: {
    weight: 100, // saturates the 0-100 score; subject is itself sanctioned
    severity: "critical",
    threshold: 1,
  },
  approval_value_at_risk: {
    weight: 25,
    severity: "high",
    threshold: 1000, // USD value-at-risk in active approvals
  },
  unlimited_approval: {
    weight: 15,
    severity: "medium",
    threshold: 1, // any single unlimited approval to non-known-safe spender
  },
  drainer_pattern: {
    weight: 35,
    severity: "critical",
    threshold: 3, // 3+ unlimited approvals to same spender within window
  },
  sanctions_adjacency_hop1: {
    weight: 60,
    severity: "critical",
    threshold: 1,
  },
  /**
   * 2-hop materially-gated indirect exposure (rule pack 0.3.0).
   * Only fires when at least one 1-hop counterparty had >= threshold USD
   * bidirectional flow with the subject AND that counterparty's own 1-hop
   * set contained an active OFAC SDN address. The threshold here is the
   * 1-hop material-flow gate (USD), NOT the count of indirect hits.
   */
  sanctions_indirect_exposure_2hop: {
    weight: 35,
    severity: "high",
    threshold: 1000, // USD bidirectional flow on the 1-hop edge to qualify for 2-hop walk
  },
  tornado_cash_historic_exposure: {
    weight: 8,
    severity: "low",
    threshold: 1,
  },
  fresh_wallet: {
    weight: 10,
    severity: "low",
    threshold: 7, // wallet age in days
  },
  high_velocity: {
    weight: 12,
    severity: "medium",
    threshold: 50, // tx in last 24h
  },
  // ===== Stablecoin compliance rules (0.2.0-mvp) =====
  stablecoin_issuer_compliance: {
    weight: 8,
    severity: "low", // informational profile of stablecoin holdings
    threshold: 100, // USD value of stablecoin holdings to surface signal
  },
  stablecoin_non_cooperative_issuer: {
    weight: 50, // A7A5 / sanctions-evasion vehicle holdings
    severity: "critical",
    threshold: 1, // any holding
  },
  stablecoin_mica_emt_non_compliant: {
    weight: 10, // EU CASP-relevant only — informational outside EU
    severity: "medium",
    threshold: 1000, // USD concentration in non-EMT stablecoins
  },
  stablecoin_issuer_frozen_match: {
    weight: 35, // counterparty was frozen by issuer — material AML signal
    severity: "high",
    threshold: 1,
  },
  stablecoin_velocity_typology: {
    weight: 18, // DPRK IT-worker funnel pattern
    severity: "medium",
    threshold: 20, // stablecoin tx in last 24h
  },
  stablecoin_dprk_cluster_proximity: {
    weight: 40, // direct interaction with SB0416 stablecoin addresses
    severity: "critical",
    threshold: 1,
  },
} as const satisfies Record<string, RuleConfig>;

export type RuleId = keyof typeof RULE_CONFIG;

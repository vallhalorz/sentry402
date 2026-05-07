/**
 * Rule pack metadata.
 *
 * This file's contents are hashed (sha256) at build time and the hash is
 * stamped into every RiskDossier as `rule_pack_sha256`. Bumping the version
 * string here is the canonical way to record a rule change for FCA 2024
 * documentation purposes. Do NOT silently change weights without bumping.
 */

export const RULE_PACK_VERSION = "0.1.3-mvp";
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
  sanctions_adjacency_hop2: {
    weight: 30,
    severity: "high",
    threshold: 1,
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
} as const satisfies Record<string, RuleConfig>;

export type RuleId = keyof typeof RULE_CONFIG;

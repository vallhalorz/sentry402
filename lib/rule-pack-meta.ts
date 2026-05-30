/**
 * Human-readable metadata for every rule in RULE_CONFIG.
 *
 * Single source of truth for /methodology + /changelog pages and in-app
 * "what fired and why" tooltips. If you add or change a rule in
 * lib/rule-pack.ts, update the matching entry here in the same commit —
 * that way the methodology page never drifts from the engine.
 *
 * Citation fields are the same FATF / FinCEN / MiCA references the engine
 * stamps on every emitted signal. Compliance officers should be able to
 * trace any score component to (a) the rule definition here, (b) the engine
 * code, and (c) the cited regulator reference — without reading TypeScript.
 */

import { RULE_CONFIG, RULE_PACK_VERSION, type RuleId } from "./rule-pack";

export type RuleMeta = {
  id: RuleId;
  /** Severity tier this rule emits when fired. Matches RULE_CONFIG. */
  severity: "info" | "low" | "medium" | "high" | "critical";
  /** Maximum points this rule can contribute to the 0-100 score. */
  weight: number;
  /** Plain-English category the rule belongs to. */
  category:
    | "Sanctions"
    | "External cross-check"
    | "Approvals & drainers"
    | "Stablecoin compliance"
    | "Velocity & freshness"
    | "Mixer & historic exposure";
  /** One-line description for tables. */
  shortDescription: string;
  /** 2-3 sentence narrative a compliance officer would accept. */
  longDescription: string;
  /** What the engine actually looks at on-chain. */
  whatItChecks: string;
  /** When this rule SHOULD NOT be relied on alone. */
  scopeNote?: string;
  /** Regulator citations the engine stamps on every emitted signal. */
  citations: {
    fatf?: string;
    fincen?: string;
    mica?: string;
    treasury?: string;
  };
  /** Where the threshold value comes from in RULE_CONFIG. */
  threshold?: string;
  /** Which version this rule was introduced in. */
  introducedIn: string;
};

export const RULE_PACK_META: readonly RuleMeta[] = [
  // ===== Sanctions =====
  {
    id: "ofac_direct_match",
    severity: "critical",
    weight: 100,
    category: "Sanctions",
    shortDescription:
      "Subject wallet itself is on the active OFAC SDN list.",
    longDescription:
      "Fires when the screened address is itself a Treasury-designated SDN entry. Saturates the score at 100. Per OFAC's 50% rule and Treasury enforcement guidance, all transactions involving the address are prohibited for U.S. persons; any non-U.S. person facilitating such transactions risks secondary sanctions.",
    whatItChecks:
      "Subject address ∈ active SDN list (lib/sdn.ts). Designation date and Treasury reference are stamped on the signal.",
    threshold: "1 (binary)",
    citations: {
      fatf: "FATF Rec 6 — Targeted Financial Sanctions",
      fincen: "FinCEN SAR Form 111, Suspicious Activity Type 31y",
      treasury: "OFAC SDN list (human-readable) + designation press release",
    },
    introducedIn: "0.1.2",
  },
  {
    id: "sanctions_adjacency_hop1",
    severity: "critical",
    weight: 60,
    category: "Sanctions",
    shortDescription:
      "Direct (1-hop) counterparty is on the active OFAC SDN list.",
    longDescription:
      "Fires when the subject's direct counterparty set (incoming and outgoing addresses from the last ~500 transactions, plus USDT/USDC ERC-20 transfer logs) intersects an active SDN entry. Treated as material exposure regardless of the dollar amount of the interaction.",
    whatItChecks:
      "Top-level transaction counterparties (5 pages, ~500 tx) + ERC-20 transfer event sweep (USDT, USDC, 3 pages each) on EVM. Decoded Helius DAS counterparty set on Solana.",
    threshold: "≥ 1 SDN match in counterparty set",
    citations: {
      fatf: "FATF Rec 7 — Targeted Financial Sanctions, Proliferation",
      fincen: "FinCEN SAR Form 111, Type 31y / 31z",
    },
    introducedIn: "0.1.0",
  },
  {
    id: "sanctions_indirect_exposure_2hop",
    severity: "high",
    weight: 35,
    category: "Sanctions",
    shortDescription:
      "Materially-gated 2-hop path to an active SDN address (EVM only).",
    longDescription:
      "Fires when at least one 1-hop counterparty had ≥ $1,000 bidirectional flow with the subject AND that counterparty's own 1-hop set contained an active SDN address. The $1,000 gate exists because below it, 2-hop exposure is statistical noise — almost any active wallet on Ethereum sits within 2 hops of some sanctioned address through DEX routing.",
    whatItChecks:
      "1-hop edges with ≥ $1k USD bidirectional flow are walked one more hop. Capped at 30 walks per scan to bound latency.",
    scopeNote:
      "EVM only. Solana subjects do not fire this rule — 1-hop USD aggregates are not yet computed on the Helius pipeline.",
    threshold: "1-hop edge ≥ $1,000 USD bidirectional; ≥ 1 SDN at hop 2",
    citations: {
      fatf:
        "FATF Recommendation 16 (Wire Transfers / Travel Rule); FATF Targeted Update June 2025 §indirect exposure",
    },
    introducedIn: "0.3.0",
  },
  // ===== External cross-check =====
  {
    id: "external_sanctions_oracle_confirmed",
    severity: "critical",
    weight: 0,
    category: "External cross-check",
    shortDescription:
      "Chainalysis Sanctions Oracle independently agrees the subject is SDN.",
    longDescription:
      "When the subject is on our own SDN list AND the public Chainalysis Sanctions Oracle returns true, we attach the oracle response as a second independent source on the existing direct-match signal. This does not double-count score (the oracle agreement confirms, it does not amplify). The cross-check makes the dossier audit-ready: two independent SDN datasets converge, one of them (Chainalysis) being the same reference Uniswap, Coinbase Wallet, and most major frontends rely on.",
    whatItChecks:
      "eth_call isSanctioned(subject) on the Chainalysis Oracle contract (0x40C57923924B5c5c5455c48D93317139ADDaC8fb), Ethereum mainnet. Read-only, no gas, no API key.",
    scopeNote:
      "EVM only — the oracle contract is not deployed on Solana.",
    threshold: "Both local SDN match and oracle = true",
    citations: {
      treasury:
        "Chainalysis Sanctions Oracle (court-admissible reference; matches OFAC SDN)",
    },
    introducedIn: "0.5.0",
  },
  {
    id: "external_sanctions_oracle_disagreement",
    severity: "critical",
    weight: 80,
    category: "External cross-check",
    shortDescription:
      "Chainalysis Oracle disagrees with the local SDN list — investigate.",
    longDescription:
      "Two directions. (a) ORACLE YES + LOCAL NO: Treasury may have designated the address since our last manual SDN sync. Treated as critical — the dossier flags the wallet as effectively sanctioned even though our local list is silent, so the verdict is block. This is the most regulator-relevant case: it surfaces designations we would otherwise miss between syncs. (b) ORACLE NO + LOCAL YES: emitted at low severity. The verdict is still driven by the local match, but the disagreement is logged so the compliance officer can confirm the address has not been delisted since our last sync.",
    whatItChecks:
      "Compares Chainalysis Oracle result against isSdnAddress(subject) from lib/sdn.ts. Severity is chosen per direction.",
    scopeNote:
      "EVM only. Direction (a) saturates score at 100. Direction (b) does not raise the score but logs the disagreement.",
    threshold: "Either side returns a result the other does not",
    citations: {
      treasury:
        "Chainalysis Sanctions Oracle vs. internal SDN list (lib/sdn.ts, pinned by sdn_list_version)",
    },
    introducedIn: "0.5.0",
  },
  // ===== Approvals & drainers =====
  {
    id: "drainer_pattern",
    severity: "critical",
    weight: 35,
    category: "Approvals & drainers",
    shortDescription:
      "Three or more unlimited token approvals to the same spender.",
    longDescription:
      "A primary mechanism in 2024-2025 drainer attacks: the victim is socially-engineered into granting unlimited ERC-20 approvals to a single attacker-controlled spender, which then sweeps the wallet when liquidity arrives. The rule fires when ≥ 3 unlimited approvals point at the same spender contract.",
    whatItChecks:
      "GoldRush token-approval endpoint per chain. Unlimited = type(uint256).max or 2^256 − 1.",
    threshold: "≥ 3 unlimited approvals to same spender",
    citations: {
      fatf: "FATF Targeted Update June 2025 §unhosted-wallet typologies",
      fincen: "FinCEN SAR Form 111, Type 31z (computer intrusion)",
    },
    introducedIn: "0.1.0",
  },
  {
    id: "approval_value_at_risk",
    severity: "high",
    weight: 25,
    category: "Approvals & drainers",
    shortDescription:
      "Active token approvals expose ≥ $1,000 of value-at-risk.",
    longDescription:
      "Surfaces total USD value-at-risk currently exposed via active ERC-20 approvals across all known spenders. A compromised approval relationship could drain this value without further user authorization.",
    whatItChecks:
      "Sum(approved_amount × current_token_price) across all active approvals to non-known-safe spenders.",
    threshold: "Total VAR ≥ $1,000 USD",
    citations: {
      fatf: "FATF Targeted Update June 2025",
    },
    introducedIn: "0.1.0",
  },
  {
    id: "unlimited_approval",
    severity: "medium",
    weight: 15,
    category: "Approvals & drainers",
    shortDescription:
      "Any single unlimited approval to a non-known-safe spender.",
    longDescription:
      "Catches the precondition of a drainer attack before the full pattern emerges. Many legitimate dApps request bounded approvals; an unlimited approval to a contract we cannot label is a yellow flag, not a red one.",
    whatItChecks:
      "Approval.amount == type(uint256).max and spender not in KNOWN_SAFE_SPENDERS.",
    threshold: "≥ 1 unlimited approval to unknown spender",
    citations: {},
    introducedIn: "0.1.0",
  },
  // ===== Stablecoin compliance =====
  {
    id: "stablecoin_dprk_cluster_proximity",
    severity: "critical",
    weight: 40,
    category: "Stablecoin compliance",
    shortDescription:
      "Direct interaction with an SB0416-designated USDT address.",
    longDescription:
      "Fires when the subject has any direct counterparty interaction with a USDT address designated under Treasury press release SB0416 (March 12, 2026, DPRK IT-worker funnel cluster). Indexed by cluster tag in lib/sdn.ts, not by name match — future DPRK designations can be added with cluster: 'SB0416_DPRK' and the rule will catch them automatically.",
    whatItChecks:
      "Counterparty set ∩ SDN entries where cluster == 'SB0416_DPRK'.",
    threshold: "≥ 1 SB0416 cluster contact",
    citations: {
      treasury: "Treasury SB0416 (2026-03-12) DPRK stablecoin designation",
      fatf: "FATF Targeted Update June 2025 §DPRK IT-worker funnels",
    },
    introducedIn: "0.2.0",
  },
  {
    id: "stablecoin_non_cooperative_issuer",
    severity: "critical",
    weight: 50,
    category: "Stablecoin compliance",
    shortDescription:
      "Holds a stablecoin from a non-cooperative issuer (e.g. A7A5).",
    longDescription:
      "Surfaces holdings of stablecoins whose issuers have publicly declined to honor lawful enforcement requests (freezes, takedowns, KYC disclosures). Includes A7A5 and similar sanctions-evasion-vehicle issuers. Even small holdings are treated as critical because the issuer relationship is unrecoverable from a compliance perspective.",
    whatItChecks:
      "Subject's stablecoin holdings ∩ STABLECOIN_REGISTRY where issuer.cooperation == 'non-cooperative'.",
    threshold: "Any holding > 0",
    citations: {
      fatf: "FATF Targeted Update June 2025 §non-cooperative issuers",
      treasury: "Treasury OFAC stablecoin guidance Dec 2024",
    },
    introducedIn: "0.2.0",
  },
  {
    id: "stablecoin_issuer_frozen_match",
    severity: "high",
    weight: 35,
    category: "Stablecoin compliance",
    shortDescription:
      "Counterparty was publicly frozen by a stablecoin issuer.",
    longDescription:
      "Matches counterparties against the ISSUER_FROZEN_LIST — Tether, Circle, and Paxos addresses publicly disclosed in their quarterly transparency reports as frozen for AML or sanctions concerns. Different from OFAC SDN: these are issuer-level freezes that often precede or supplement government designations.",
    whatItChecks:
      "Counterparty set ∩ ISSUER_FROZEN_LIST entries.",
    threshold: "≥ 1 frozen-address match",
    citations: {
      fatf: "FATF Recommendation 10 — Customer Due Diligence",
      fincen: "FinCEN SAR Form 111, Type 31z",
    },
    introducedIn: "0.2.0",
  },
  {
    id: "stablecoin_velocity_typology",
    severity: "medium",
    weight: 18,
    category: "Stablecoin compliance",
    shortDescription:
      "DPRK IT-worker funnel pattern — high stablecoin transfer velocity.",
    longDescription:
      "Fires when stablecoin (USDT/USDC) transfer count in the last 24h exceeds a threshold derived from the SB0416 designation cluster behaviour — funnel wallets typically show >20 stablecoin tx per day, distinct from genuine high-frequency DeFi users who concentrate on native or wrapped assets.",
    whatItChecks:
      "Count(USDT.transfer + USDC.transfer) on subject in last 24h.",
    threshold: "≥ 20 stablecoin tx in last 24h",
    citations: {
      fatf: "FATF Targeted Update June 2025 §DPRK IT-worker funnels",
    },
    introducedIn: "0.2.0",
  },
  {
    id: "stablecoin_mica_emt_non_compliant",
    severity: "medium",
    weight: 10,
    category: "Stablecoin compliance",
    shortDescription:
      "Concentration in stablecoins not registered as EU MiCA EMTs.",
    longDescription:
      "Informational for non-EU customers; material for EU CASPs. Flags when the subject holds > $1,000 USD in stablecoins whose issuers are not listed on the ESMA EMT register. EU CASPs servicing this subject would face restrictions under MiCA Article 17.",
    whatItChecks:
      "Sum of subject stablecoin holdings in non-EMT issuers.",
    threshold: "≥ $1,000 USD concentration in non-EMT stablecoins",
    citations: {
      mica: "MiCA Regulation (EU) 2023/1114 Article 17; ESMA EMT register",
    },
    introducedIn: "0.2.0",
  },
  {
    id: "stablecoin_issuer_compliance",
    severity: "low",
    weight: 8,
    category: "Stablecoin compliance",
    shortDescription:
      "Informational profile of the subject's stablecoin issuer mix.",
    longDescription:
      "Always low-severity. Provides a cited summary of which stablecoin issuers the subject holds (Tether, Circle, Paxos, etc.) so the dossier reader has a one-glance view of the regulatory venue mix without having to compute it themselves.",
    whatItChecks:
      "Profile of subject stablecoin holdings by issuer (size-weighted).",
    threshold: "≥ $100 USD total stablecoin holdings",
    citations: {},
    introducedIn: "0.2.0",
  },
  // ===== Velocity & freshness =====
  {
    id: "high_velocity",
    severity: "medium",
    weight: 12,
    category: "Velocity & freshness",
    shortDescription: "More than 50 transactions in the last 24 hours.",
    longDescription:
      "High transaction velocity is not in itself a typology, but it gates the difference between a slow-moving custody address and an active operational wallet (trading desk, bot, DEX router). Surfaces the velocity so the analyst can reason about whether the recent-100 tx sample is representative.",
    whatItChecks:
      "Count(tx where block.timestamp > now - 24h) on subject.",
    threshold: "> 50 tx in last 24h",
    citations: {},
    introducedIn: "0.1.0",
  },
  {
    id: "fresh_wallet",
    severity: "low",
    weight: 10,
    category: "Velocity & freshness",
    shortDescription: "Wallet first seen on-chain less than 7 days ago.",
    longDescription:
      "New wallets are not inherently risky, but they have less history to score from. Fires only when the wallet age (first on-chain transaction) is < 7 days AND the wallet is not exhibiting custody behaviour (which would trigger a different signal).",
    whatItChecks:
      "now - subject.first_seen_at < 7 days, and subject is not a known custody address.",
    threshold: "Wallet age < 7 days",
    citations: {},
    introducedIn: "0.1.0",
  },
  // ===== Mixer & historic exposure =====
  {
    id: "tornado_cash_historic_exposure",
    severity: "low",
    weight: 8,
    category: "Mixer & historic exposure",
    shortDescription:
      "Historic interaction with Tornado Cash router contracts.",
    longDescription:
      "Treats Tornado Cash exposure as a low-severity historic flag rather than a sanctions hit. OFAC delisted the original 2022-08-08 Tornado Cash designations on 2025-03-21; we retain the addresses in the SDN registry as 'historic concern' so that analysts can still surface interaction patterns for SAR narrative purposes.",
    whatItChecks:
      "Counterparty set ∩ Tornado Cash router contract list. Marked historic in SDN dataset.",
    scopeNote:
      "OFAC delisting acknowledged — this is informational, not a sanctions hit. Different jurisdictions treat the underlying activity differently.",
    threshold: "≥ 1 historic TC interaction",
    citations: {
      treasury:
        "OFAC delisting press release 2025-03-21 (original designation 2022-08-08)",
    },
    introducedIn: "0.1.0",
  },
] as const;

export type RuleCategory = RuleMeta["category"];

export const RULE_CATEGORIES: RuleCategory[] = [
  "Sanctions",
  "External cross-check",
  "Approvals & drainers",
  "Stablecoin compliance",
  "Velocity & freshness",
  "Mixer & historic exposure",
];

/** Severity → verdict mapping, exposed for the methodology page and FAQ. */
export const SEVERITY_TO_VERDICT = {
  critical: { verdict: "block", agent_action: "Abort transfer. Log generation_id, route to SAR queue." },
  high:     { verdict: "block", agent_action: "Abort. Optional human override only." },
  medium:   { verdict: "warn",  agent_action: "Queue for human approval; attach dossier and signals." },
  low:      { verdict: "allow", agent_action: "Proceed under normal policy. Persist generation_id." },
  info:     { verdict: "allow", agent_action: "Proceed." },
} as const;

/** Sanity check: every entry in RULE_CONFIG must have a meta row. */
export function ruleMetaCoverage(): { covered: string[]; missing: string[] } {
  const covered: string[] = [];
  const missing: string[] = [];
  const metaIds = new Set(RULE_PACK_META.map((r) => r.id));
  for (const id of Object.keys(RULE_CONFIG)) {
    if (metaIds.has(id as RuleId)) covered.push(id);
    else missing.push(id);
  }
  return { covered, missing };
}

export { RULE_PACK_VERSION };

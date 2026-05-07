/**
 * Sentry402 risk engine.
 *
 * Deterministic. Every Signal cites Evidence by id. No LLM. No probabilistic
 * scoring inside this file — all weights and thresholds live in rule-pack.ts
 * and are version-pinned in dossier metadata.
 *
 * Rules implemented in this MVP:
 *   - approval_value_at_risk      (high severity if active approvals expose >$1k)
 *   - unlimited_approval          (medium per unlimited approval to a spender)
 *   - drainer_pattern             (critical if 3+ unlimited approvals to same spender)
 *   - sanctions_adjacency_hop1    (critical if direct counterparty is on SDN/Lazarus)
 *   - tornado_cash_historic       (informational — TC was delisted 2025-03-21)
 *   - fresh_wallet                (low — wallet < 7 days old)
 *   - high_velocity               (medium — >50 tx in last 24h)
 */

import {
  type ChainName,
  type Evidence,
  type RiskDossier,
  type Severity,
  newEvidenceId,
  newGenerationId,
  newSignalId,
  scoreToSeverity,
  type Signal,
} from "./types";
import {
  getApprovals,
  getEarliestTransactionDate,
  getRecentTransactions,
  getTokenBalances,
  GOLDRUSH_SDK_VERSION,
} from "./goldrush";
import {
  isActiveSanctions,
  isHistoricConcern,
  isSdnAddress,
  SDN_LIST_VERSION,
} from "./sdn";
import { RULE_CONFIG, RULE_PACK_VERSION } from "./rule-pack";
import { sha256Hex } from "./hash";

const RULE_PACK_SHA256 = sha256Hex(JSON.stringify({ RULE_PACK_VERSION, RULE_CONFIG }));

export async function buildDossier(
  chain: ChainName,
  wallet: string,
): Promise<RiskDossier> {
  const queriedAt = new Date().toISOString();
  const evidence: Record<string, Evidence> = {};
  const signals: Signal[] = [];

  // ---- Rule: ofac_direct_match ----
  // Subject wallet itself is on the active OFAC SDN list. This is the highest-
  // severity outcome — a direct hit, not a transitive exposure. Cited evidence
  // is the SDN list entry itself (with its source: a Treasury press release or
  // FATF report), NOT a GoldRush API call, since the on-chain data does not
  // tell us about OFAC designations. We construct a synthetic Evidence record
  // pointing to the authoritative source.
  const directHit = isSdnAddress(wallet);
  if (directHit && isActiveSanctions(directHit)) {
    const sdnEvidence: Evidence = {
      id: newEvidenceId(),
      endpoint: "internal:sdn_lookup",
      endpoint_url: "https://home.treasury.gov/policy-issues/financial-sanctions/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists",
      request_params: { wallet, sdn_list_version: SDN_LIST_VERSION },
      response_excerpt: {
        match: {
          address: directHit.address,
          label: directHit.label,
          category: directHit.category,
          source: directHit.source,
          added_at: directHit.added_at,
        },
      },
      tx_hashes: [],
      block_heights: [],
      chain,
      goldrush_api_version: GOLDRUSH_SDK_VERSION,
      fetched_at: new Date().toISOString(),
    };
    evidence[sdnEvidence.id] = sdnEvidence;
    signals.push({
      id: newSignalId(),
      type: "ofac_direct_match",
      severity: "critical",
      title: `Subject wallet on active OFAC SDN list: ${directHit.label}`,
      rationale: `The subject wallet is a direct match on the active OFAC SDN list (${directHit.label}; designation source: ${directHit.source}). This is a Hop-0 sanctions hit, not transitive exposure. Per OFAC's 50% rule and Treasury enforcement guidance, all transactions involving this address are prohibited for U.S. persons, and any non-U.S. person facilitating such transactions risks secondary sanctions. Recommend immediate freeze, SAR filing, and counsel review.`,
      fatf_reference: "FATF Recommendation 6 (Targeted Financial Sanctions related to Terrorism, Terrorist Financing, and Proliferation)",
      fincen_reference: "FinCEN SAR Form 111 — Suspicious Activity Type 31y (Transaction with OFAC sanctioned country/entity)",
      evidence_ids: [sdnEvidence.id],
      score_contribution: 100,
      metadata: {
        sdn_label: directHit.label,
        sdn_category: directHit.category,
        sdn_source: directHit.source,
        sdn_added_at: directHit.added_at,
      },
    });
  }

  // Fetch core data in parallel. Solana coverage on GoldRush Foundational is
  // limited to token balances; approvals/history endpoints would error or
  // return empty for solana-mainnet, so we skip them and add a coverage
  // advisory signal further down.
  const isSolana = chain === "solana-mainnet";
  const [balancesRes, approvalsRes, txsRes, earliestRes] = await Promise.all([
    safe(() => getTokenBalances(chain, wallet)),
    isSolana ? Promise.resolve(null) : safe(() => getApprovals(chain, wallet)),
    isSolana ? Promise.resolve(null) : safe(() => getRecentTransactions(chain, wallet)),
    isSolana ? Promise.resolve(null) : safe(() => getEarliestTransactionDate(chain, wallet)),
  ]);

  // Register evidence for every successful call (even rules that don't fire
  // benefit from having the evidence in the dossier — auditors can confirm we
  // looked).
  if (balancesRes) evidence[balancesRes.evidence.id] = balancesRes.evidence;
  if (approvalsRes) evidence[approvalsRes.evidence.id] = approvalsRes.evidence;
  if (txsRes) evidence[txsRes.evidence.id] = txsRes.evidence;
  if (earliestRes) evidence[earliestRes.evidence.id] = earliestRes.evidence;

  // ---- Rule: approval_value_at_risk + unlimited_approval + drainer_pattern ----
  if (approvalsRes && approvalsRes.data.length > 0) {
    const activeApprovals = approvalsRes.data.filter(
      (a) => Number(a.allowance) > 0,
    );
    const totalVar = activeApprovals.reduce((s, a) => s + a.valueAtRiskQuote, 0);
    const unlimited = activeApprovals.filter((a) => a.isUnlimited);

    if (totalVar >= RULE_CONFIG.approval_value_at_risk.threshold) {
      signals.push({
        id: newSignalId(),
        type: "approval_value_at_risk",
        severity: RULE_CONFIG.approval_value_at_risk.severity,
        title: `Active token approvals expose $${totalVar.toLocaleString(undefined, { maximumFractionDigits: 0 })} value-at-risk`,
        rationale: `The subject wallet currently has ${activeApprovals.length} active ERC-20 approvals to ${new Set(activeApprovals.map((a) => a.spender)).size} unique spenders, with total value-at-risk of $${totalVar.toFixed(2)} based on current GoldRush spot pricing. A compromised approval relationship could drain this value without further user authorization — a primary mechanism in 2024–2025 drainer-attack typologies.`,
        fincen_reference:
          "FinCEN SAR Form 111 — Suspicious Activity Type 35a (Cyber Event)",
        evidence_ids: [approvalsRes.evidence.id],
        score_contribution: scaleScore(
          totalVar,
          RULE_CONFIG.approval_value_at_risk.threshold,
          RULE_CONFIG.approval_value_at_risk.weight,
        ),
        metadata: {
          total_value_at_risk_usd: totalVar,
          active_approval_count: activeApprovals.length,
        },
      });
    }

    if (unlimited.length >= RULE_CONFIG.unlimited_approval.threshold) {
      signals.push({
        id: newSignalId(),
        type: "unlimited_approval",
        severity: RULE_CONFIG.unlimited_approval.severity,
        title: `${unlimited.length} unlimited token approval${unlimited.length === 1 ? "" : "s"} outstanding`,
        rationale: `Unlimited (uint256-max) approvals grant a spender the ability to transfer the entire balance of the approved token. This is contrary to least-privilege hygiene and is the precondition for the most common 2024–2025 drainer typologies. Recommend the subject revoke and re-approve with bounded amounts.`,
        evidence_ids: [approvalsRes.evidence.id],
        score_contribution: Math.min(
          unlimited.length * 5,
          RULE_CONFIG.unlimited_approval.weight,
        ),
        metadata: {
          unlimited_approval_count: unlimited.length,
          spenders: Array.from(new Set(unlimited.map((u) => u.spender))).slice(0, 10),
        },
      });
    }

    // Drainer pattern: 3+ unlimited approvals to same spender.
    const bySpender = new Map<string, number>();
    for (const a of unlimited) {
      bySpender.set(a.spender, (bySpender.get(a.spender) ?? 0) + 1);
    }
    const drainerSpenders = [...bySpender.entries()].filter(
      ([, n]) => n >= RULE_CONFIG.drainer_pattern.threshold,
    );
    if (drainerSpenders.length > 0) {
      signals.push({
        id: newSignalId(),
        type: "drainer_pattern",
        severity: RULE_CONFIG.drainer_pattern.severity,
        title: `Drainer-pattern signature: ≥${RULE_CONFIG.drainer_pattern.threshold} unlimited approvals to a single spender`,
        rationale: `The subject wallet granted ${drainerSpenders[0][1]} unlimited approvals to spender ${drainerSpenders[0][0]}. This pattern is consistent with phishing-drainer compromise (Inferno Drainer, Pink Drainer, Angel Drainer typologies). Indicia of money laundering: layering via approval-and-sweep mechanism.`,
        fincen_reference:
          "FinCEN SAR Form 111 — Suspicious Activity Type 35a (Cyber Event); 31z (Other)",
        evidence_ids: [approvalsRes.evidence.id],
        score_contribution: RULE_CONFIG.drainer_pattern.weight,
        metadata: { drainer_spenders: drainerSpenders },
      });
    }
  }

  // ---- Rule: sanctions_adjacency_hop1 + tornado_cash_historic ----
  if (txsRes && txsRes.data.length > 0) {
    const counterparties = new Set<string>();
    for (const t of txsRes.data) {
      if (t.from && t.from.toLowerCase() !== wallet.toLowerCase())
        counterparties.add(t.from.toLowerCase());
      if (t.to && t.to.toLowerCase() !== wallet.toLowerCase())
        counterparties.add(t.to.toLowerCase());
    }

    const sanctionsHits: { addr: string; entry: ReturnType<typeof isSdnAddress> }[] = [];
    const historicHits: { addr: string; entry: ReturnType<typeof isSdnAddress> }[] = [];
    for (const cp of counterparties) {
      const hit = isSdnAddress(cp);
      if (hit && isActiveSanctions(hit)) sanctionsHits.push({ addr: cp, entry: hit });
      else if (hit && isHistoricConcern(hit)) historicHits.push({ addr: cp, entry: hit });
    }

    if (sanctionsHits.length > 0) {
      signals.push({
        id: newSignalId(),
        type: "sanctions_adjacency",
        severity: RULE_CONFIG.sanctions_adjacency_hop1.severity,
        title: `Direct counterparty on active sanctions list (${sanctionsHits.length} match${sanctionsHits.length === 1 ? "" : "es"})`,
        rationale: `The subject wallet has ≥1 direct on-chain counterparty currently on an active sanctions or designated-cluster list. This is a Hop-1 sanctions adjacency and warrants immediate escalation per OFAC 50% rule and FATF Recommendation 6 guidance. Recommend SAR filing and freeze pending review.`,
        fatf_reference: "FATF Recommendation 6 (Targeted Financial Sanctions)",
        fincen_reference:
          "FinCEN SAR Form 111 — Suspicious Activity Type 31y (Transaction with OFAC sanctioned country/entity)",
        evidence_ids: [txsRes.evidence.id],
        score_contribution: RULE_CONFIG.sanctions_adjacency_hop1.weight,
        metadata: {
          matches: sanctionsHits.map((h) => ({
            address: h.addr,
            label: h.entry?.label,
            category: h.entry?.category,
            source: h.entry?.source,
          })),
        },
      });
    }

    if (historicHits.length > 0) {
      signals.push({
        id: newSignalId(),
        type: "tornado_cash_historic_exposure",
        severity: RULE_CONFIG.tornado_cash_historic_exposure.severity,
        title: `Historic mixer/Tornado-Cash counterparty exposure (informational)`,
        rationale: `The subject wallet has on-chain counterparties on the historic Tornado Cash address list. Note: Tornado Cash was DELISTED from the OFAC SDN list on 2025-03-21 and the Texas Federal Court permanently enjoined re-listing on 2025-04-29. Exposure remains relevant for typology analysis but is NOT an active sanctions hit. Treat as informational unless paired with other indicators.`,
        evidence_ids: [txsRes.evidence.id],
        score_contribution: RULE_CONFIG.tornado_cash_historic_exposure.weight,
        metadata: { matches: historicHits.map((h) => h.addr) },
      });
    }

    // ---- Rule: high_velocity ----
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const last24h = txsRes.data.filter(
      (t) => t.blockSignedAt && new Date(t.blockSignedAt).getTime() > dayAgo,
    );
    if (last24h.length >= RULE_CONFIG.high_velocity.threshold) {
      signals.push({
        id: newSignalId(),
        type: "high_velocity",
        severity: RULE_CONFIG.high_velocity.severity,
        title: `High velocity: ${last24h.length} transactions in the last 24h`,
        rationale: `Transactional velocity exceeds threshold (${RULE_CONFIG.high_velocity.threshold}) within a 24-hour window. While not inherently suspicious, sustained high velocity from a non-protocol address can be an indicator of wash-trading, structuring, or automated funnel-account activity. Recommend velocity baseline comparison.`,
        fincen_reference:
          "FinCEN SAR Form 111 — Suspicious Activity Type 31a (Funnel Account)",
        evidence_ids: [txsRes.evidence.id],
        score_contribution: RULE_CONFIG.high_velocity.weight,
        metadata: { tx_24h: last24h.length },
      });
    }

  }

  // ---- Rule: fresh_wallet ----
  // Uses getEarliestTransactionsForAddress for TRUE wallet age, not the
  // misleading first-page-min heuristic. This avoids false positives on
  // highly-active wallets like vitalik.eth, exchange hot wallets, and OTC
  // desks where the first page of recent txs spans only 1-2 days.
  if (earliestRes && earliestRes.data.earliestBlockSignedAt) {
    const earliestMs = new Date(earliestRes.data.earliestBlockSignedAt).getTime();
    const ageDays = (Date.now() - earliestMs) / (1000 * 60 * 60 * 24);
    if (ageDays < RULE_CONFIG.fresh_wallet.threshold) {
      signals.push({
        id: newSignalId(),
        type: "fresh_wallet",
        severity: RULE_CONFIG.fresh_wallet.severity,
        title: `Fresh wallet — first on-chain activity ${ageDays.toFixed(1)} days ago`,
        rationale: `The wallet's earliest observed transaction on this chain is under ${RULE_CONFIG.fresh_wallet.threshold} days old. Fresh wallets are over-represented in scam-token deployment, drainer-victim funnel, and DPRK IT-worker cluster typologies. Recommend additional KYC/source-of-funds verification before counterparty engagement.`,
        evidence_ids: [earliestRes.evidence.id],
        score_contribution: RULE_CONFIG.fresh_wallet.weight,
        metadata: { age_days: ageDays, earliest_tx: earliestRes.data.earliestBlockSignedAt },
      });
    }
  }

  // Coverage advisory for Solana — be honest in the dossier itself, not just
  // the README. Compliance reviewers should be able to see at a glance that
  // this dossier sampled less data than an EVM dossier would.
  if (isSolana) {
    signals.push({
      id: newSignalId(),
      type: "coverage_advisory",
      severity: "info",
      title: "Solana coverage advisory — limited Foundational API data",
      rationale: `GoldRush Foundational API exposes one Solana endpoint at this time (token balances). Full SPL approval inventory, decoded transaction history, and counterparty graph tracing on Solana require a Helius DAS API supplement, which is on the Sentry402 roadmap. Treat this dossier as a balance snapshot + active-OFAC direct-match check, not a full risk assessment. EVM chains (Ethereum, Base, Polygon, BNB, Arbitrum, Optimism) have full coverage.`,
      evidence_ids: balancesRes ? [balancesRes.evidence.id] : [],
      score_contribution: 0, // advisory only — does not move the score
      metadata: {
        coverage: "limited",
        endpoints_called: balancesRes ? ["BalanceService.getTokenBalancesForWalletAddress"] : [],
        roadmap: "Helius DAS API supplement for SPL approvals, decoded txs, full counterparty trace",
      },
    });
  }

  const overallScore = Math.min(
    100,
    signals.reduce((s, sig) => s + sig.score_contribution, 0),
  );
  const severity = highestSeverity(signals.map((s) => s.severity), overallScore);
  const headline = buildHeadline(signals, overallScore);

  const dossier: RiskDossier = {
    subject: { wallet, chain, queried_at: queriedAt },
    overall_score: overallScore,
    severity,
    headline,
    signals,
    evidence,
    metadata: {
      rule_pack_version: RULE_PACK_VERSION,
      rule_pack_sha256: RULE_PACK_SHA256,
      sdn_list_version: SDN_LIST_VERSION,
      goldrush_api_version: GOLDRUSH_SDK_VERSION,
      generator: { name: "sentry402", version: "0.1.0" },
      generation_id: newGenerationId(),
      generated_at: new Date().toISOString(),
    },
  };
  return dossier;
}

function buildHeadline(signals: Signal[], score: number): string {
  if (signals.length === 0) {
    return `No risk indicators detected at rule pack ${RULE_PACK_VERSION}. Score ${score}/100.`;
  }
  const critical = signals.filter((s) => s.severity === "critical");
  if (critical.length > 0) {
    return `${critical.length} critical indicator${critical.length === 1 ? "" : "s"} — recommend immediate escalation. Score ${score}/100.`;
  }
  const high = signals.filter((s) => s.severity === "high");
  if (high.length > 0) {
    return `${high.length} high-severity indicator${high.length === 1 ? "" : "s"} — enhanced due diligence advised. Score ${score}/100.`;
  }
  return `${signals.length} indicator${signals.length === 1 ? "" : "s"} detected — score ${score}/100.`;
}

function highestSeverity(items: Severity[], score: number): Severity {
  if (items.includes("critical")) return "critical";
  if (items.includes("high")) return "high";
  if (items.includes("medium")) return "medium";
  if (items.includes("low")) return "low";
  return scoreToSeverity(score);
}

function scaleScore(value: number, threshold: number, max: number): number {
  // Saturating linear scale from threshold (0 contribution) to 10x threshold (max).
  const top = threshold * 10;
  if (value <= threshold) return Math.round(max * 0.4); // floor — rule fired, give base
  const t = Math.min(1, (value - threshold) / (top - threshold));
  return Math.round(max * (0.4 + 0.6 * t));
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    // We deliberately swallow individual endpoint failures so a single failed
    // call doesn't block the whole dossier. Future: surface as a dossier-level
    // notice of partial coverage, citation-bound to the failure.
    console.error("[sentry402] endpoint call failed:", err);
    return null;
  }
}

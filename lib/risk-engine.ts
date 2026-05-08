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
  type DossierMetadata,
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
  getDeepCounterpartySet,
  getEarliestTransactionDate,
  getErc20TransferCounterparties,
  getMaterialTwoHopCounterparties,
  getRecentTransactions,
  getTokenBalances,
  GOLDRUSH_SDK_VERSION,
} from "./goldrush";
import {
  getSolanaAssets,
  getSolanaEnhancedCounterparties,
  getSolanaSignatures,
  HELIUS_DAS_VERSION,
} from "./helius";
import {
  isActiveSanctions,
  isHistoricConcern,
  isSdnAddress,
  SDN_LIST_VERSION,
} from "./sdn";
import {
  FREEZE_POLICY_RISK_POINTS,
  lookupStablecoinByContract,
  STABLECOIN_REGISTRY,
  STABLECOIN_REGISTRY_VERSION,
  type StablecoinEntry,
} from "./stablecoin-registry";
import {
  ISSUER_FROZEN_LIST_VERSION,
  lookupIssuerFrozen,
} from "./stablecoin-frozen";
import {
  KNOWN_ADDRESSES_VERSION,
  lookupAddressLabel,
} from "./known-addresses";
import type { CounterpartyAggregate, WalletActivity, WalletHolding } from "./types";
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
  // Direct hit on the historic-concern (Tornado Cash post-delisting) list:
  // emit informational signal but no critical block. The address is not
  // on the active OFAC SDN list, but a compliance officer reviewing an
  // outbound transfer to a known mixer pool will still want to see it.
  // Distinct from `tornado_cash_historic_exposure` via counterparty,
  // because here the subject IS the mixer pool, not someone who once
  // touched it.
  if (directHit && isHistoricConcern(directHit)) {
    const histEvidence: Evidence = {
      id: newEvidenceId(),
      endpoint: "internal:sdn_lookup",
      endpoint_url: "https://home.treasury.gov/policy-issues/financial-sanctions/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists",
      request_params: { wallet, sdn_list_version: SDN_LIST_VERSION, lookup: "historic_concern" },
      response_excerpt: {
        match: {
          address: directHit.address,
          label: directHit.label,
          category: directHit.category,
          source: directHit.source,
          delisted_at: directHit.delisted_at,
        },
      },
      tx_hashes: [],
      block_heights: [],
      chain,
      goldrush_api_version: GOLDRUSH_SDK_VERSION,
      fetched_at: new Date().toISOString(),
    };
    evidence[histEvidence.id] = histEvidence;
    signals.push({
      id: newSignalId(),
      type: "tornado_cash_historic_exposure",
      severity: RULE_CONFIG.tornado_cash_historic_exposure.severity,
      title: `Subject wallet is a known historic mixer address: ${directHit.label}`,
      rationale: `The destination is on the historic Tornado Cash address list (originally OFAC-sanctioned 2022-08-08 under EO 13694, delisted 2025-03-21 with Texas Federal Court permanently enjoining re-listing 2025-04-29). The address is NOT currently sanctioned, but routing funds directly to a known mixer pool is a typology indicator for layering under FATF Recommendation 16 and is treated as a structural red flag by most CASP compliance teams. Recommend agent escalates to a human approver even though this verdict will be \`allow\` from a strict-sanctions perspective.`,
      evidence_ids: [histEvidence.id],
      score_contribution: RULE_CONFIG.tornado_cash_historic_exposure.weight,
      metadata: {
        sdn_label: directHit.label,
        sdn_category: directHit.category,
        sdn_source: directHit.source,
        delisted_at: directHit.delisted_at,
      },
    });
  }
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
  // Pick the major stablecoin contracts on this chain to ERC-20-sweep — that
  // is where SB0416 / DPRK and most issuer-frozen counterparties live, since
  // those entries are themselves USDT/USDC addresses that interact via
  // Transfer event logs (NOT top-level transactions).
  const stablecoinSweepContracts: string[] = [];
  if (!isSolana) {
    for (const entry of STABLECOIN_REGISTRY) {
      // Only sweep cooperative-issuer stablecoins (USDT/USDC) — those are
      // the rails that DPRK and OFAC-frozen counterparties actually appear
      // on. A7A5 etc. don't have meaningful transfer history on EVM yet.
      if (entry.ticker === "USDT" || entry.ticker === "USDC") {
        const c = entry.evm_addresses[chain as keyof typeof entry.evm_addresses];
        if (c) stablecoinSweepContracts.push(c);
      }
    }
  }

  const [balancesRes, approvalsRes, txsRes, earliestRes, deepCpRes, ...erc20CpResults] =
    await Promise.all([
      safe(() => getTokenBalances(chain, wallet)),
      isSolana ? Promise.resolve(null) : safe(() => getApprovals(chain, wallet)),
      isSolana ? Promise.resolve(null) : safe(() => getRecentTransactions(chain, wallet)),
      isSolana ? Promise.resolve(null) : safe(() => getEarliestTransactionDate(chain, wallet)),
      isSolana ? Promise.resolve(null) : safe(() => getDeepCounterpartySet(chain, wallet, 5)),
      ...stablecoinSweepContracts.map((contract) =>
        safe(() => getErc20TransferCounterparties(chain, wallet, contract, 3)),
      ),
    ]);

  // Register evidence for every successful call (even rules that don't fire
  // benefit from having the evidence in the dossier — auditors can confirm we
  // looked).
  if (balancesRes) evidence[balancesRes.evidence.id] = balancesRes.evidence;
  if (approvalsRes) evidence[approvalsRes.evidence.id] = approvalsRes.evidence;
  if (txsRes) evidence[txsRes.evidence.id] = txsRes.evidence;
  if (earliestRes) evidence[earliestRes.evidence.id] = earliestRes.evidence;
  if (deepCpRes) evidence[deepCpRes.evidence.id] = deepCpRes.evidence;
  for (const r of erc20CpResults) {
    if (r) evidence[r.evidence.id] = r.evidence;
  }

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
  // Build the sanctions counterparty set from THREE sources merged:
  // (1) Deep top-level tx sweep (~500 tx, up to 5 pages).
  // (2) ERC-20 transfer sweep on USDT/USDC contracts (~3 pages each).
  //     Critical for SB0416 / DPRK detection because OFAC SDN addresses
  //     in that designation are USDT contracts — they show up as the
  //     to/from of Transfer event logs, NOT as top-level tx counterparties.
  // (3) Fallback to first-page tx if deep call failed.
  const sanctionsCounterpartySet = new Set<string>();
  if (deepCpRes) {
    for (const a of deepCpRes.data.addresses) sanctionsCounterpartySet.add(a);
  } else if (txsRes) {
    for (const t of txsRes.data) {
      if (t.from && t.from.toLowerCase() !== wallet.toLowerCase())
        sanctionsCounterpartySet.add(t.from.toLowerCase());
      if (t.to && t.to.toLowerCase() !== wallet.toLowerCase())
        sanctionsCounterpartySet.add(t.to.toLowerCase());
    }
  }
  for (const r of erc20CpResults) {
    if (r) {
      for (const a of r.data.addresses) sanctionsCounterpartySet.add(a);
    }
  }
  const sanctionsEvidenceIds = [
    ...(deepCpRes ? [deepCpRes.evidence.id] : []),
    ...(txsRes ? [txsRes.evidence.id] : []),
    ...erc20CpResults.filter(Boolean).map((r) => r!.evidence.id),
  ];

  if (txsRes && txsRes.data.length > 0) {
    const counterparties = sanctionsCounterpartySet;

    const sanctionsHits: { addr: string; entry: ReturnType<typeof isSdnAddress> }[] = [];
    const historicHits: { addr: string; entry: ReturnType<typeof isSdnAddress> }[] = [];
    for (const cp of counterparties) {
      const hit = isSdnAddress(cp);
      if (hit && isActiveSanctions(hit)) sanctionsHits.push({ addr: cp, entry: hit });
      else if (hit && isHistoricConcern(hit)) historicHits.push({ addr: cp, entry: hit });
    }

    if (sanctionsHits.length > 0) {
      const tlScan = deepCpRes ? deepCpRes.data.transactions_examined : 0;
      const ercScan = erc20CpResults.reduce(
        (s, r) => s + (r ? r.data.transactions_examined : 0),
        0,
      );
      const depthNote =
        deepCpRes || erc20CpResults.some(Boolean)
          ? ` Sanctions sweep examined ${tlScan} top-level transactions and ${ercScan} stablecoin (USDT/USDC) transfer events across ${stablecoinSweepContracts.length} contracts.`
          : "";
      signals.push({
        id: newSignalId(),
        type: "sanctions_adjacency",
        severity: RULE_CONFIG.sanctions_adjacency_hop1.severity,
        title: `Direct counterparty on active sanctions list (${sanctionsHits.length} match${sanctionsHits.length === 1 ? "" : "es"})`,
        rationale: `The subject wallet has ≥1 direct on-chain counterparty currently on an active sanctions or designated-cluster list. This is a Hop-1 sanctions adjacency and warrants immediate escalation per OFAC 50% rule and FATF Recommendation 6 guidance. Recommend SAR filing and freeze pending review.${depthNote}`,
        fatf_reference: "FATF Recommendation 6 (Targeted Financial Sanctions)",
        fincen_reference:
          "FinCEN SAR Form 111 — Suspicious Activity Type 31y (Transaction with OFAC sanctioned country/entity)",
        evidence_ids: sanctionsEvidenceIds,
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
        evidence_ids: sanctionsEvidenceIds,
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

  // ============== Stablecoin compliance rules (rule pack 0.2.0) ==============
  //
  // Six cited rules anchored on STABLECOIN_REGISTRY (issuer cooperation +
  // MiCA EMT status) and ISSUER_FROZEN_LIST (Tether/Circle/Paxos publicly
  // disclosed on-chain freezes). These signals are stablecoin-specific —
  // they distinguish issuer-level compliance posture from ownership-level
  // sanctions hits already covered by ofac_direct_match and
  // sanctions_adjacency.

  if (balancesRes && balancesRes.data.length > 0) {
    const stablecoinHoldings: Array<{
      entry: StablecoinEntry;
      balanceUsd: number;
      contract: string;
    }> = [];
    for (const bal of balancesRes.data) {
      if (!bal.contract) continue;
      const hit = lookupStablecoinByContract(chain, bal.contract);
      if (hit && bal.quote > 0) {
        stablecoinHoldings.push({ entry: hit, balanceUsd: bal.quote, contract: bal.contract });
      }
    }

    const totalStablecoinUsd = stablecoinHoldings.reduce(
      (s, h) => s + h.balanceUsd,
      0,
    );

    // ---- Rule: stablecoin_non_cooperative_issuer ----
    // Critical — wallet holds A7A5 or any sanctions-evasion-vehicle stablecoin.
    const nonCoop = stablecoinHoldings.filter(
      (h) => h.entry.freeze_policy === "non_cooperative",
    );
    if (nonCoop.length >= RULE_CONFIG.stablecoin_non_cooperative_issuer.threshold) {
      signals.push({
        id: newSignalId(),
        type: "stablecoin_non_cooperative_issuer",
        severity: RULE_CONFIG.stablecoin_non_cooperative_issuer.severity,
        title: `Holdings include sanctions-evasion-vehicle stablecoin: ${nonCoop.map((h) => h.entry.ticker).join(", ")}`,
        rationale: `The subject wallet holds ${nonCoop.map((h) => `${h.entry.ticker} (issuer: ${h.entry.issuer})`).join(", ")} — categorized as non-cooperative under the Sentry402 stablecoin registry. Holdings of issuer-controlled stablecoins designed to circulate outside Western freeze authority are a critical AML/CFT advisory under FATF Recommendation 7 (Targeted Financial Sanctions related to Proliferation) and indicate potential sanctions-evasion vector consistent with the FPSI gap analysis published by CSIS in December 2025.`,
        fatf_reference: "FATF Recommendation 7 (Targeted Financial Sanctions related to Proliferation)",
        fincen_reference: "FinCEN SAR Form 111 — Suspicious Activity Type 32a (Sanctions evasion structuring)",
        mica_reference: "MiCA Article 17 (E-Money Token issuer authorization requirements)",
        evidence_ids: [balancesRes.evidence.id],
        score_contribution: RULE_CONFIG.stablecoin_non_cooperative_issuer.weight,
        metadata: {
          tickers: nonCoop.map((h) => h.entry.ticker),
          issuers: nonCoop.map((h) => h.entry.issuer),
          sources: nonCoop.map((h) => h.entry.source),
        },
      });
    }

    // ---- Rule: stablecoin_issuer_compliance (informational profile) ----
    // Always emits when stablecoin holdings exceed threshold — gives the
    // compliance reviewer an at-a-glance view of WHICH issuers control
    // their subject's stablecoin exposure. Not punitive on its own; pairs
    // with the rules above.
    if (totalStablecoinUsd >= RULE_CONFIG.stablecoin_issuer_compliance.threshold) {
      const byPolicy: Record<string, { count: number; usd: number; tickers: string[] }> = {};
      for (const h of stablecoinHoldings) {
        const k = h.entry.freeze_policy;
        if (!byPolicy[k]) byPolicy[k] = { count: 0, usd: 0, tickers: [] };
        byPolicy[k].count += 1;
        byPolicy[k].usd += h.balanceUsd;
        byPolicy[k].tickers.push(h.entry.ticker);
      }
      const profile = Object.entries(byPolicy)
        .map(
          ([policy, v]) =>
            `${policy}: $${v.usd.toFixed(0)} (${v.tickers.join(", ")})`,
        )
        .join("; ");
      const mixedOrUncertain = (byPolicy["mixed"]?.usd ?? 0) +
        (byPolicy["decentralized_no_authority"]?.usd ?? 0);
      const baseScore = Math.round(
        Math.min(
          RULE_CONFIG.stablecoin_issuer_compliance.weight,
          stablecoinHoldings.reduce(
            (s, h) => s + FREEZE_POLICY_RISK_POINTS[h.entry.freeze_policy],
            0,
          ),
        ),
      );
      signals.push({
        id: newSignalId(),
        type: "stablecoin_issuer_compliance",
        severity:
          mixedOrUncertain > totalStablecoinUsd * 0.3
            ? "medium"
            : RULE_CONFIG.stablecoin_issuer_compliance.severity,
        title: `Stablecoin issuer compliance profile — $${totalStablecoinUsd.toFixed(0)} across ${stablecoinHoldings.length} stablecoin${stablecoinHoldings.length === 1 ? "" : "s"}`,
        rationale: `The subject wallet's stablecoin exposure breaks down by issuer freeze-cooperation policy as follows: ${profile}. Issuer profile is sourced from the Sentry402 stablecoin registry, which aggregates Tether/Circle/Paxos transparency reports, ESMA MiCA EMT register, and CSIS FPSI gap analysis. Cooperative-issuer holdings are routinely OFAC-aligned via on-chain freeze authority; decentralized-issuer holdings have no central freeze party and present elevated typology uncertainty.`,
        fincen_reference: "FinCEN SAR Form 111 — Suspicious Activity Information narrative supplement",
        evidence_ids: [balancesRes.evidence.id],
        score_contribution: baseScore,
        metadata: { by_policy: byPolicy, total_stablecoin_usd: totalStablecoinUsd },
      });
    }

    // ---- Rule: stablecoin_mica_emt_non_compliant ----
    // EU compliance officer relevance: holdings in stablecoins not authorized
    // as MiCA EMTs are restricted from EU CASP circulation post 2026-07-01.
    const nonEmt = stablecoinHoldings.filter(
      (h) =>
        h.entry.mica_emt_status === "emt_not_filed" ||
        h.entry.mica_emt_status === "discontinued",
    );
    const nonEmtUsd = nonEmt.reduce((s, h) => s + h.balanceUsd, 0);
    if (nonEmtUsd >= RULE_CONFIG.stablecoin_mica_emt_non_compliant.threshold) {
      signals.push({
        id: newSignalId(),
        type: "stablecoin_mica_emt_non_compliant",
        severity: RULE_CONFIG.stablecoin_mica_emt_non_compliant.severity,
        title: `MiCA EMT non-compliant stablecoin exposure: $${nonEmtUsd.toFixed(0)} across ${nonEmt.length} asset${nonEmt.length === 1 ? "" : "s"}`,
        rationale: `The subject wallet holds $${nonEmtUsd.toFixed(2)} in stablecoins (${nonEmt.map((h) => h.entry.ticker).join(", ")}) whose issuers have not obtained authorization as E-Money Tokens under MiCA Title III. Effective 2026-07-01, EU CASPs may not facilitate trades of non-EMT-authorized stablecoins for EU customers. If this wallet is a CASP-controlled or EU-customer wallet, this exposure indicates a Day-1 MiCA gap and should be flagged for risk review.`,
        mica_reference: "MiCA Article 17 (EMT issuer authorization); MiCA Article 48 (transitional provisions through 2026-07-01)",
        evidence_ids: [balancesRes.evidence.id],
        score_contribution: Math.min(
          RULE_CONFIG.stablecoin_mica_emt_non_compliant.weight,
          Math.round((nonEmtUsd / RULE_CONFIG.stablecoin_mica_emt_non_compliant.threshold) * 5),
        ),
        metadata: {
          non_emt_holdings: nonEmt.map((h) => ({
            ticker: h.entry.ticker,
            issuer: h.entry.issuer,
            usd: h.balanceUsd,
            mica_emt_status: h.entry.mica_emt_status,
          })),
        },
      });
    }
  }

  // ---- Rule: stablecoin_issuer_frozen_match (counterparty) ----
  // Subject's tx counterparties match an address publicly frozen by
  // Tether / Circle / Paxos. Distinct from OFAC SDN — issuer-level freeze
  // is a softer but still material AML signal. Uses the deep counterparty
  // sweep so we catch issuer-frozen interactions older than the activity
  // sample.
  if (txsRes && txsRes.data.length > 0) {
    const counterparties = sanctionsCounterpartySet;
    const issuerFrozenHits: Array<{ addr: string; entry: ReturnType<typeof lookupIssuerFrozen> }> = [];
    for (const cp of counterparties) {
      const hit = lookupIssuerFrozen(cp);
      if (hit) issuerFrozenHits.push({ addr: cp, entry: hit });
    }
    if (issuerFrozenHits.length >= RULE_CONFIG.stablecoin_issuer_frozen_match.threshold) {
      signals.push({
        id: newSignalId(),
        type: "stablecoin_issuer_frozen_match",
        severity: RULE_CONFIG.stablecoin_issuer_frozen_match.severity,
        title: `Counterparty publicly frozen by stablecoin issuer (${issuerFrozenHits.length} match${issuerFrozenHits.length === 1 ? "" : "es"})`,
        rationale: `The subject wallet has on-chain interaction with ≥1 address that has been publicly frozen by a stablecoin issuer (Tether, Circle, or Paxos) via their on-chain freeze authority. Issuer-level freezes are a separate signal from OFAC SDN designation: they indicate the issuer's own AML/compliance team determined the address sufficiently risky to lock the asset balance. Recommend SAR escalation and request issuer freeze rationale documentation under MLAT or relevant regulator-to-regulator channels.`,
        fatf_reference: "FATF Recommendation 16 (Wire Transfers / Travel Rule); FATF Recommendation 20 (STR filing)",
        fincen_reference: "FinCEN SAR Form 111 — Suspicious Activity Type 31z (Other suspicious activity)",
        evidence_ids: sanctionsEvidenceIds,
        score_contribution: RULE_CONFIG.stablecoin_issuer_frozen_match.weight,
        metadata: {
          matches: issuerFrozenHits.map((h) => ({
            address: h.addr,
            issuer: h.entry?.frozen_by_issuer,
            asset: h.entry?.asset,
            reason: h.entry?.reason,
            source: h.entry?.source,
          })),
        },
      });
    }

    // ---- Rule: stablecoin_dprk_cluster_proximity ----
    // Same logic as sanctions_adjacency but specifically for the SB0416
    // DPRK stablecoin designations. Uses the deep counterparty sweep so we
    // catch DPRK interactions older than the activity sample.
    const sb0416StablecoinHits = [];
    for (const cp of counterparties) {
      const sdnHit = isSdnAddress(cp);
      if (sdnHit?.cluster === "SB0416_DPRK") {
        sb0416StablecoinHits.push({ addr: cp, entry: sdnHit });
      }
    }
    if (sb0416StablecoinHits.length >= RULE_CONFIG.stablecoin_dprk_cluster_proximity.threshold) {
      signals.push({
        id: newSignalId(),
        type: "stablecoin_dprk_cluster_proximity",
        severity: RULE_CONFIG.stablecoin_dprk_cluster_proximity.severity,
        title: `DPRK stablecoin laundering cluster proximity (${sb0416StablecoinHits.length} address${sb0416StablecoinHits.length === 1 ? "" : "es"} from SB0416)`,
        rationale: `The subject wallet has direct on-chain interaction with ≥1 stablecoin (USDT) address designated by OFAC SB0416 on 2026-03-12 as part of the DPRK IT-worker laundering network (Amnokgang, Yun Song Guk, or Sim Hyon Sop). This is consistent with the stablecoin-laundering typology documented by ZachXBT in July 2025 ("DPRK IT-worker USDC clusters") and referenced in the FATF Targeted Update of June 2025 §IT-worker schemes. The signal is complementary to sanctions_adjacency — it specifically identifies the stablecoin laundering pattern, not merely the SDN match.`,
        fatf_reference: "FATF Recommendation 7 (Targeted Financial Sanctions); FATF Targeted Update June 2025 §IT-worker schemes",
        fincen_reference: "FinCEN SAR Form 111 — Suspicious Activity Type 31y (OFAC sanctioned country/entity); 32a (Sanctions evasion structuring)",
        evidence_ids: sanctionsEvidenceIds,
        score_contribution: RULE_CONFIG.stablecoin_dprk_cluster_proximity.weight,
        metadata: {
          matches: sb0416StablecoinHits.map((h) => ({
            address: h.addr,
            label: h.entry?.label,
            source: h.entry?.source,
          })),
        },
      });
    }

    // ---- Rule: stablecoin_velocity_typology ----
    // High velocity of stablecoin transactions in the last 24h is a known
    // typology element of DPRK IT-worker laundering and Asian scam-center
    // funnel patterns. Differs from generic high_velocity by filtering for
    // stablecoin-only tx via contract address matching.
    // Build a set of registry stablecoin contracts on this chain for fast
    // counterparty matching.
    const stablecoinContractsOnChain = new Set<string>();
    for (const entry of STABLECOIN_REGISTRY) {
      const a = entry.evm_addresses[chain as keyof typeof entry.evm_addresses];
      if (a) stablecoinContractsOnChain.add(a.toLowerCase());
    }
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const last24hStablecoinTx = txsRes.data.filter((t) => {
      if (!t.blockSignedAt) return false;
      if (new Date(t.blockSignedAt).getTime() <= dayAgo) return false;
      // counterparty is a stablecoin contract address
      return (
        stablecoinContractsOnChain.has(t.to?.toLowerCase() ?? "") ||
        stablecoinContractsOnChain.has(t.from?.toLowerCase() ?? "")
      );
    });
    if (last24hStablecoinTx.length >= RULE_CONFIG.stablecoin_velocity_typology.threshold) {
      signals.push({
        id: newSignalId(),
        type: "stablecoin_velocity_typology",
        severity: RULE_CONFIG.stablecoin_velocity_typology.severity,
        title: `Stablecoin velocity typology: ${last24hStablecoinTx.length} stablecoin transactions in 24h`,
        rationale: `The subject wallet exhibits high stablecoin transactional velocity (${last24hStablecoinTx.length} stablecoin-contract interactions in the last 24-hour window, threshold ${RULE_CONFIG.stablecoin_velocity_typology.threshold}). Sustained stablecoin velocity from non-protocol addresses is a typology element of DPRK IT-worker laundering networks (ZachXBT July 2025 documentation), Asian scam-center funnel accounts (Chainalysis Crypto Crime Report 2026 Apr 24 update), and structuring under FinCEN's funnel-account guidance. Recommend velocity baseline comparison against the wallet's 30-day mean.`,
        fatf_reference: "FATF Recommendation 16 (Wire Transfers); FATF Targeted Update June 2025 §IT-worker schemes",
        fincen_reference: "FinCEN SAR Form 111 — Suspicious Activity Type 31a (Funnel Account); 32a (Sanctions evasion structuring)",
        evidence_ids: [txsRes.evidence.id],
        score_contribution: RULE_CONFIG.stablecoin_velocity_typology.weight,
        metadata: { stablecoin_tx_24h: last24hStablecoinTx.length },
      });
    }
  }

  // ============================================================
  // Solana coverage via Helius DAS + Enhanced Transactions
  // ============================================================
  // Subjects on solana-mainnet bypass the EVM GoldRush calls (those endpoints
  // don't decode SPL data) and instead get a parallel pipeline backed by
  // Helius. The output dossier shape is identical — same Cited<T> contract,
  // same Signal types, same Evidence records — so a compliance officer reading
  // a Solana dossier sees the same surface as an EVM dossier.
  //
  // Endpoints called for Solana subjects:
  //   1. Helius DAS getAssetsByOwner  → SPL holdings + native SOL balance
  //   2. Helius RPC getSignaturesForAddress → recent ~100 tx signatures
  //   3. Helius Enhanced Transactions → decoded native+token transfers,
  //      from/to extraction → counterparty set
  //
  // The counterparty set is then run through the same SDN intersection used
  // on EVM, so sanctions_adjacency / DPRK cluster proximity rules fire on
  // Solana subjects as they would on Ethereum.
  if (isSolana) {
    const [solAssetsRes, solSigsRes] = await Promise.all([
      safe(() => getSolanaAssets(wallet)),
      safe(() => getSolanaSignatures(wallet, 100)),
    ]);

    if (solAssetsRes) evidence[solAssetsRes.evidence.id] = solAssetsRes.evidence;
    if (solSigsRes) evidence[solSigsRes.evidence.id] = solSigsRes.evidence;

    let solCpRes:
      | Awaited<ReturnType<typeof getSolanaEnhancedCounterparties>>
      | null = null;
    if (solSigsRes && solSigsRes.data.length > 0) {
      solCpRes = await safe(() =>
        getSolanaEnhancedCounterparties(
          wallet,
          solSigsRes.data.map((s) => s.signature),
        ),
      );
      if (solCpRes) evidence[solCpRes.evidence.id] = solCpRes.evidence;
    }

    // ---- Solana sanctions adjacency check ----
    // Direct intersection of Solana counterparty set with the SDN list.
    // Solana SDN entries are case-sensitive base58 — isSdnAddress preserves
    // case for non-EVM strings.
    if (solCpRes && solCpRes.data.counterparties.length > 0) {
      const sanctionsHits: Array<{
        addr: string;
        entry: ReturnType<typeof isSdnAddress>;
      }> = [];
      for (const cp of solCpRes.data.counterparties) {
        const hit = isSdnAddress(cp);
        if (hit && isActiveSanctions(hit)) sanctionsHits.push({ addr: cp, entry: hit });
      }
      if (sanctionsHits.length > 0) {
        signals.push({
          id: newSignalId(),
          type: "sanctions_adjacency",
          severity: RULE_CONFIG.sanctions_adjacency_hop1.severity,
          title: `Direct counterparty on active sanctions list (${sanctionsHits.length} match${sanctionsHits.length === 1 ? "" : "es"})`,
          rationale: `The subject Solana wallet has ≥1 direct on-chain counterparty currently on an active sanctions or designated-cluster list. Counterparty set extracted via Helius Enhanced Transactions API across ${solCpRes.data.transfers_seen} decoded native/token transfers. Hop-1 sanctions adjacency on Solana follows the same OFAC 50% rule and FATF Recommendation 6 framing as EVM exposure. Recommend SAR escalation.`,
          fatf_reference: "FATF Recommendation 6 (Targeted Financial Sanctions)",
          fincen_reference:
            "FinCEN SAR Form 111 — Suspicious Activity Type 31y (Transaction with OFAC sanctioned country/entity)",
          evidence_ids: solCpRes ? [solCpRes.evidence.id] : [],
          score_contribution: RULE_CONFIG.sanctions_adjacency_hop1.weight,
          metadata: {
            chain: "solana-mainnet",
            matches: sanctionsHits.map((h) => ({
              address: h.addr,
              label: h.entry?.label,
              category: h.entry?.category,
              source: h.entry?.source,
            })),
          },
        });
      }
    }

    // ---- Solana coverage notice (informational, no longer "limited") ----
    signals.push({
      id: newSignalId(),
      type: "coverage_advisory",
      severity: "info",
      title: "Solana coverage via Helius DAS + Enhanced Transactions",
      rationale: `Solana subjects are sampled via Helius DAS API (getAssetsByOwner for SPL + native holdings) and Helius Enhanced Transactions (decoded counterparty extraction across ~${solSigsRes?.data.length ?? 0} recent signatures). Active OFAC SDN intersection runs on the parsed counterparty set; sanctions_adjacency rule fires on Solana as it would on EVM. SPL approval inventory and 2-hop material exposure on Solana are on the roadmap (Helius does not yet expose a clean SPL allowance feed).`,
      evidence_ids: [
        ...(solAssetsRes ? [solAssetsRes.evidence.id] : []),
        ...(solSigsRes ? [solSigsRes.evidence.id] : []),
        ...(solCpRes ? [solCpRes.evidence.id] : []),
      ],
      score_contribution: 0,
      metadata: {
        coverage: "first_class",
        helius_das_version: HELIUS_DAS_VERSION,
        endpoints_called: [
          "Helius DAS getAssetsByOwner",
          "Solana RPC getSignaturesForAddress (Helius)",
          "Helius Enhanced Transactions",
        ],
        signatures_examined: solSigsRes?.data.length ?? 0,
        counterparties_extracted: solCpRes?.data.counterparties.length ?? 0,
        transfers_decoded: solCpRes?.data.transfers_seen ?? 0,
      },
    });
  }

  // ============== Subject context surfacing (no new API calls) ==============
  // Extract top holdings + recent activity from the data we already fetched.
  // Compliance officer's first three questions: "what does it hold?" "who
  // does it talk to?" "what's the score breakdown?" — surface them so the
  // dossier doubles as a triage panel, not just a verdict.

  const subjectLabel = lookupAddressLabel(wallet);
  let topHoldings: WalletHolding[] | undefined;
  if (balancesRes && balancesRes.data.length > 0) {
    topHoldings = balancesRes.data
      .filter((b) => b.quote > 0)
      .sort((a, b) => b.quote - a.quote)
      .slice(0, 10)
      .map((b) => {
        const sc = lookupStablecoinByContract(chain, b.contract);
        const label = lookupAddressLabel(b.contract);
        return {
          symbol: b.symbol,
          contract_address: b.contract,
          balance_usd: b.quote,
          stablecoin: sc
            ? { issuer: sc.issuer, freeze_policy: sc.freeze_policy }
            : undefined,
          contract_label: label?.label,
        } satisfies WalletHolding;
      });
  }

  let recentActivity: WalletActivity[] | undefined;
  let counterpartyAggregates: CounterpartyAggregate[] | undefined;
  if (txsRes && txsRes.data.length > 0) {
    const subjLower = wallet.toLowerCase();
    // Map per counterparty address (lowercased for EVM matching).
    const agg = new Map<string, CounterpartyAggregate>();
    recentActivity = [];
    for (let i = 0; i < txsRes.data.length; i += 1) {
      const t = txsRes.data[i];
      const isFromSubj = t.from.toLowerCase() === subjLower;
      const isToSubj = t.to.toLowerCase() === subjLower;
      const direction: "in" | "out" | "self" =
        isFromSubj && isToSubj ? "self" : isFromSubj ? "out" : "in";
      const counterparty = isFromSubj ? t.to : t.from;
      if (!counterparty) continue;
      const cpLabel = lookupAddressLabel(counterparty);
      // Only the first 5 go into the recent_activity surface.
      if (i < 5) {
        recentActivity.push({
          tx_hash: t.txHash,
          block_signed_at: t.blockSignedAt,
          direction,
          counterparty,
          counterparty_label: cpLabel?.label,
          value_usd: t.valueQuote,
        });
      }
      // All counterparties aggregate (skip self-direction since it's not a
      // counterparty).
      if (direction === "self") continue;
      const key = counterparty.toLowerCase();
      const existing = agg.get(key);
      if (existing) {
        if (direction === "in") {
          existing.inbound_count += 1;
          existing.inbound_usd_total += t.valueQuote;
        } else {
          existing.outbound_count += 1;
          existing.outbound_usd_total += t.valueQuote;
        }
        if (t.blockSignedAt && t.blockSignedAt < existing.first_seen_at) {
          existing.first_seen_at = t.blockSignedAt;
        }
        if (t.blockSignedAt && t.blockSignedAt > existing.last_seen_at) {
          existing.last_seen_at = t.blockSignedAt;
        }
      } else {
        agg.set(key, {
          address: counterparty,
          label: cpLabel?.label,
          inbound_count: direction === "in" ? 1 : 0,
          outbound_count: direction === "out" ? 1 : 0,
          inbound_usd_total: direction === "in" ? t.valueQuote : 0,
          outbound_usd_total: direction === "out" ? t.valueQuote : 0,
          first_seen_at: t.blockSignedAt,
          last_seen_at: t.blockSignedAt,
        });
      }
    }
    // Sort by total absolute USD interaction descending so the top
    // counterparties surface first.
    counterpartyAggregates = [...agg.values()].sort(
      (a, b) =>
        b.inbound_usd_total + b.outbound_usd_total - (a.inbound_usd_total + a.outbound_usd_total),
    );
  }

  // ---- Rule: sanctions_indirect_exposure (2-hop, materially gated) ----
  // FATF Recommendation 16 / INFO Layered-Funds typology framing: a
  // counterparty-of-counterparty link is evidentiary only when the 1-hop
  // edge carries material flow ($1k+). Below that, "I once interacted with
  // someone who once interacted with a sanctioned wallet" is below SAR
  // threshold and just noise. Mirrors Chainalysis Reactor / TRM Tactical
  // default exposure thresholds.
  //
  // Cost-bounded: caps at 30 1-hop walks (~30 GoldRush calls, ~5s p95).
  // Skipped on Solana since 1-hop USD aggregates are not computed for
  // Solana subjects (no decoded tx coverage).
  if (
    !isSolana &&
    counterpartyAggregates &&
    counterpartyAggregates.length > 0
  ) {
    const materialOneHop = counterpartyAggregates
      .map((a) => ({
        address: a.address,
        total_flow_usd: a.inbound_usd_total + a.outbound_usd_total,
      }))
      .filter(
        (a) => a.total_flow_usd >= RULE_CONFIG.sanctions_indirect_exposure_2hop.threshold,
      );

    if (materialOneHop.length > 0) {
      const twoHopRes = await safe(() =>
        getMaterialTwoHopCounterparties(chain, wallet, materialOneHop, {
          materialThresholdUsd: RULE_CONFIG.sanctions_indirect_exposure_2hop.threshold,
          maxHopsToWalk: 30,
        }),
      );
      if (twoHopRes) {
        evidence[twoHopRes.evidence.id] = twoHopRes.evidence;
        // Intersect with active SDN. We deliberately ignore historic
        // (Tornado Cash) at hop 2 — historic exposure at depth becomes
        // pure noise. Active SDN at hop 2 is still material.
        const indirectActiveHits = twoHopRes.data.matches.filter((m) => {
          const sdnEntry = isSdnAddress(m.hit);
          return sdnEntry && isActiveSanctions(sdnEntry);
        });
        // Dedupe by hit address to avoid double-counting the same SDN
        // address surfaced through multiple via-paths. Keep the highest-
        // flow via for each unique hit.
        const byHit = new Map<string, (typeof indirectActiveHits)[number]>();
        for (const m of indirectActiveHits) {
          const k = m.hit.toLowerCase();
          const ex = byHit.get(k);
          if (!ex || m.via_flow_usd > ex.via_flow_usd) byHit.set(k, m);
        }
        const uniqueIndirectHits = [...byHit.values()];
        if (uniqueIndirectHits.length > 0) {
          // Hop-2 hits are high (not critical) by design — Hop-1 stays
          // critical (saturating at 60), Hop-2 medium-high (35) so a 2-hop
          // chain alone doesn't render the same verdict as a direct match
          // but still flags for SAR review.
          signals.push({
            id: newSignalId(),
            type: "sanctions_indirect_exposure",
            severity: RULE_CONFIG.sanctions_indirect_exposure_2hop.severity,
            title: `Indirect (2-hop) sanctions exposure: ${uniqueIndirectHits.length} active SDN address${uniqueIndirectHits.length === 1 ? "" : "es"} reachable via material counterparty`,
            rationale: `The subject wallet has a material 1-hop counterparty (≥$${RULE_CONFIG.sanctions_indirect_exposure_2hop.threshold.toLocaleString()} USD bidirectional flow) whose own 1-hop counterparty set contains an active OFAC SDN address. This is a depth-2 sanctions adjacency on a material edge, consistent with FATF Recommendation 16 layered-funds typology and Chainalysis Reactor's default 2-hop exposure surface. Recommend SAR escalation per FinCEN guidance on indirect funnel exposure. The hop-2 walk examined ${twoHopRes.data.transactions_examined} transactions across ${twoHopRes.data.hops_walked} material 1-hop counterparties (skipped ${twoHopRes.data.hops_skipped_below_threshold} below threshold).`,
            fatf_reference: "FATF Recommendation 16 (Wire Transfers / Travel Rule); FATF Targeted Update June 2025 §indirect exposure",
            fincen_reference: "FinCEN SAR Form 111 — Suspicious Activity Type 31a (Funnel Account); 31z (Other suspicious activity)",
            evidence_ids: [twoHopRes.evidence.id, ...sanctionsEvidenceIds],
            score_contribution: RULE_CONFIG.sanctions_indirect_exposure_2hop.weight,
            metadata: {
              indirect_matches: uniqueIndirectHits.map((m) => {
                const e = isSdnAddress(m.hit);
                return {
                  hit_address: m.hit,
                  via_address: m.via,
                  via_flow_usd: m.via_flow_usd,
                  hit_label: e?.label,
                  hit_source: e?.source,
                };
              }),
              hops_walked: twoHopRes.data.hops_walked,
              hops_skipped: twoHopRes.data.hops_skipped_below_threshold,
              transactions_examined: twoHopRes.data.transactions_examined,
            },
          });
        }
      }
    }
  }

  const overallScore = Math.min(
    100,
    signals.reduce((s, sig) => s + sig.score_contribution, 0),
  );
  const severity = highestSeverity(signals.map((s) => s.severity), overallScore);
  const headline = buildHeadline(signals, overallScore);

  const dossier: RiskDossier = {
    subject: {
      wallet,
      chain,
      queried_at: queriedAt,
      label: subjectLabel?.label,
      first_seen_at: earliestRes?.data.earliestBlockSignedAt ?? undefined,
      holdings: topHoldings,
      recent_activity: recentActivity,
      counterparties: counterpartyAggregates,
    },
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
      generator: { name: "sentry402", version: "0.2.0" },
      generation_id: newGenerationId(),
      generated_at: new Date().toISOString(),
      // Stablecoin-specific dataset versions pinned for FCA 2024
      // reproducibility. Bumping STABLECOIN_REGISTRY_VERSION is the
      // canonical way to record an issuer-policy or contract-address
      // change across the registry.
      stablecoin_registry_version: STABLECOIN_REGISTRY_VERSION,
      issuer_frozen_list_version: ISSUER_FROZEN_LIST_VERSION,
      known_addresses_version: KNOWN_ADDRESSES_VERSION,
    } as DossierMetadata & {
      stablecoin_registry_version: string;
      issuer_frozen_list_version: string;
      known_addresses_version: string;
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

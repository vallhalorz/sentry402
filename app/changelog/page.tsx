import type { Metadata } from "next";
import Link from "next/link";
import { RULE_PACK_VERSION } from "@/lib/rule-pack-meta";

export const metadata: Metadata = {
  title: "Rule pack changelog — Sentry402",
  description:
    "Version history for the Sentry402 risk engine rule pack. Each entry records the rule changes, dataset bumps, and reasoning behind the bump.",
  alternates: { canonical: "/changelog" },
};

type Entry = {
  version: string;
  date: string;
  summary: string;
  changes: string[];
  isCurrent?: boolean;
};

const ENTRIES: Entry[] = [
  {
    version: "0.4.0-mvp",
    date: "2026-05-08",
    summary: "Solana first-class coverage via Helius DAS + Enhanced Transactions.",
    isCurrent: true,
    changes: [
      "Solana subjects no longer return a 'limited coverage' advisory — they get a parallel pipeline that calls Helius for SPL + native holdings, recent signatures, and decoded native + token transfer counterparty extraction.",
      "Same Cited<T> / Evidence contract as the EVM side.",
      "sanctions_adjacency rule fires on Solana subjects when their decoded counterparty set intersects an active SDN entry.",
      "SDN seed expanded with two Solana entries: DPRK SB0416 cross-listed + Lazarus Solana cluster from the FATF June 2025 Targeted Update.",
      "helius_das_version pinned in dossier metadata for FCA 2024 reproducibility, parallel to goldrush_api_version on EVM.",
    ],
  },
  {
    version: "0.3.2",
    date: "2026-05-06",
    summary: "DPRK cluster matching becomes data-driven.",
    changes: [
      "stablecoin_dprk_cluster_proximity now matches on the SdnEntry.cluster field instead of brittle label string-matching.",
      "Future DPRK designations only need cluster: 'SB0416_DPRK' in sdn.ts to fire the specific rule — no engine code change required.",
    ],
  },
  {
    version: "0.3.1",
    date: "2026-05-05",
    summary: "Removed a dead config key that was inflating the rule pack hash.",
    changes: [
      "Removed dead sanctions_adjacency_hop2 config key. It was defined in RULE_CONFIG but never read by the risk engine.",
      "The dead key was inflating rule_pack_sha256 and misrepresenting active rules to auditors. SHA-256 now reflects exactly the rules the engine reads.",
    ],
  },
  {
    version: "0.3.0",
    date: "2026-05-04",
    summary: "2-hop materially-gated indirect sanctions exposure.",
    changes: [
      "New rule sanctions_indirect_exposure_2hop walks the second-degree counterparty graph but only for 1-hop counterparties with material flow (≥ $1k USD bidirectional).",
      "Capped at 30 1-hop walks per scan for cost-bounded latency (≈5s p95 added when materially-active).",
      "Skipped on Solana since 1-hop USD aggregates are not yet computed on the Helius pipeline.",
      "Defensible scope: FATF Recommendation 16 layered-funds typology; below the $1k threshold, indirect exposure is pure graph noise.",
      "SDN seed expanded to ≈37 entries with Tornado Cash 2022-08-08 original designation (delisted 2025-03-21, retained as historic concern), Ronin Bridge Lazarus 2022-04-14 OFAC designation, and structured designation_date + treasury_ref fields per entry.",
      "sdn_list_version bumped to 2026-05-07-tc-expanded.",
    ],
  },
  {
    version: "0.2.2",
    date: "2026-05-03",
    summary: "ERC-20 transfer sweep added to sanctions counterparty set.",
    changes: [
      "SB0416 DPRK addresses are USDT contracts — they appear inside Transfer event logs, NOT as top-level tx counterparties.",
      "This release sweeps USDT and USDC transfer histories per chain (3 pages each) and merges those counterparties into the sanctions check set.",
      "Catches the asymmetric 'I funded a DPRK USDT address but my recent native ETH tx don't show it' case.",
      "Sanctions adjacency rationale notes both top-level and ERC-20 sweep depths.",
    ],
  },
  {
    version: "0.2.1",
    date: "2026-05-02",
    summary: "Deep counterparty sweep for sanctions checks.",
    changes: [
      "Sanctions adjacency, Tornado Cash historic exposure, stablecoin issuer-frozen-list match, and DPRK stablecoin cluster proximity now scan up to 5 pages (~500 tx) of transaction history rather than the recent-100 sample.",
      "Catches the asymmetric blind spot where an active wallet's recent tx sample no longer contains an old interaction with a low-activity sanctioned counterparty.",
      "Activity timeline and high_velocity rule still use the recent-100 sample.",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-05-01",
    summary: "Stablecoin compliance signals.",
    changes: [
      "Six new cited rules wired to STABLECOIN_REGISTRY (issuer cooperation profile + MiCA EMT status) and ISSUER_FROZEN_LIST (Tether / Circle / Paxos publicly-disclosed on-chain freezes).",
      "Citation chain: CSIS December 2025 GENIUS Act FPSI report; Tether / Circle / Paxos quarterly transparency reports; ESMA MiCA EMT register; FATF Targeted Update June 2025; Treasury SB0416 March 12, 2026 DPRK stablecoin designation.",
      "Added STABLECOIN_REGISTRY_VERSION and ISSUER_FROZEN_LIST_VERSION pinning to dossier metadata.",
    ],
  },
  {
    version: "0.1.3",
    date: "2026-04-28",
    summary: "Solana branch with coverage advisory (pre-Helius).",
    changes: [
      "Solana wallets run only the balances endpoint + active SDN direct-match check.",
      "Dossier carries an explicit advisory that full SPL / decoded-tx coverage requires a Helius supplement (out of MVP scope at the time).",
      "Superseded by 0.4.0-mvp which delivers full Helius coverage.",
    ],
  },
  {
    version: "0.1.2",
    date: "2026-04-25",
    summary: "ofac_direct_match — subject is itself sanctioned.",
    changes: [
      "Fires when the subject wallet is on the active OFAC SDN list (e.g., DPRK IT-worker designations from Treasury SB0416 2026-03-12).",
      "Saturates score at 100, severity critical, FATF Rec 6 + FinCEN 31y references.",
      "SDN list bumped to 2026-05-07-dprk-mar2026 with 10 active OFAC DPRK addresses added.",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <div className="space-y-10 max-w-3xl mx-auto pb-12">
      {/* ---------------- Hero ---------------- */}
      <section className="space-y-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">
          Rule pack changelog · current {RULE_PACK_VERSION}
        </div>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">
          Rule pack version history.
        </h1>
        <p className="text-ink-500 text-lg leading-relaxed max-w-2xl">
          Every rule change, dataset bump, and weight adjustment is logged here.{" "}
          <strong>Bumping the rule pack version is the canonical record of a methodology change.</strong>{" "}
          If you cached a score under a previous pack version, the dossier you saved carries the
          version string + SHA-256 so an auditor can recreate exactly which rules ran.
        </p>
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <Link
            href="/methodology"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-paper-100 border border-paper-200 text-ink-700 hover:bg-paper-200 transition-colors"
          >
            ← Back to methodology
          </Link>
          <a
            href="https://github.com/vallhalorz/sentry402/blob/main/lib/rule-pack.ts"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-paper-100 border border-paper-200 text-ink-700 hover:bg-paper-200 transition-colors"
          >
            Rule pack source on GitHub →
          </a>
        </div>
      </section>

      {/* ---------------- Entries ---------------- */}
      <section className="space-y-6">
        {ENTRIES.map((e) => (
          <article
            key={e.version}
            id={`v${e.version}`}
            className="scroll-mt-20 rounded-xl border border-paper-200 bg-white p-5 shadow-card"
          >
            <header className="flex items-start justify-between gap-3 flex-wrap mb-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="hash text-base font-semibold text-ink-900">{e.version}</code>
                  {e.isCurrent && (
                    <span className="inline-block uppercase text-[10px] font-semibold tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5">
                      current
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink-700">{e.summary}</p>
              </div>
              <span className="hash text-xs text-ink-500 shrink-0">{e.date}</span>
            </header>
            <ul className="text-sm text-ink-700 space-y-1.5 list-disc pl-5 leading-relaxed mt-3">
              {e.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}

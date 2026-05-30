import type { Metadata } from "next";
import Link from "next/link";
import {
  RULE_PACK_META,
  RULE_PACK_VERSION,
  RULE_CATEGORIES,
  SEVERITY_TO_VERDICT,
  type RuleCategory,
  type RuleMeta,
} from "@/lib/rule-pack-meta";

export const metadata: Metadata = {
  title: "Methodology — Sentry402",
  description:
    "How Sentry402 scores wallet risk: every rule, its severity, its weight, what the engine checks on-chain, and the regulator citation it carries.",
  alternates: { canonical: "/methodology" },
};

const SEV_COLOR: Record<RuleMeta["severity"], string> = {
  critical: "bg-rose-50 text-rose-800 border-rose-200",
  high: "bg-amber-50 text-amber-800 border-amber-200",
  medium: "bg-yellow-50 text-yellow-800 border-yellow-200",
  low: "bg-emerald-50 text-emerald-800 border-emerald-200",
  info: "bg-sky-50 text-sky-800 border-sky-200",
};

const VERDICT_COLOR = {
  block: "text-rose-700",
  warn: "text-amber-700",
  allow: "text-emerald-700",
} as const;

export default function MethodologyPage() {
  const totalRules = RULE_PACK_META.length;
  const criticalCount = RULE_PACK_META.filter((r) => r.severity === "critical").length;
  const highCount = RULE_PACK_META.filter((r) => r.severity === "high").length;
  const totalContribution = RULE_PACK_META.reduce((s, r) => s + r.weight, 0);

  return (
    <div className="space-y-12 max-w-4xl mx-auto pb-12">
      {/* ---------------- Hero ---------------- */}
      <section className="space-y-3">
        <div className="text-[10px] uppercase tracking-[0.18em] text-ink-400 font-semibold">
          Methodology · rule pack {RULE_PACK_VERSION}
        </div>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">
          How Sentry402 scores wallet risk.
        </h1>
        <p className="text-ink-500 text-lg leading-relaxed max-w-2xl">
          {totalRules} deterministic rules, severity-weighted, citation-bound. The same engine runs
          the free <code className="hash text-xs bg-paper-100 px-1.5 py-0.5 rounded">/api/screen</code>{" "}
          endpoint, the x402-gated{" "}
          <code className="hash text-xs bg-paper-100 px-1.5 py-0.5 rounded">/api/preflight</code>{" "}
          verdict for AI agents, and the dossier you see on the homepage. No LLM in the scoring
          path; the rule pack version + its SHA-256 are pinned to every dossier so you can
          re-run the same score against the same inputs months later (FCA 2024 reproducibility model).
        </p>
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <Link
            href="/#screening"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-paper-100 border border-paper-200 text-ink-700 hover:bg-paper-200 transition-colors"
          >
            ← Back to dashboard
          </Link>
          <Link
            href="/changelog"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-paper-100 border border-paper-200 text-ink-700 hover:bg-paper-200 transition-colors"
          >
            Changelog
          </Link>
          <a
            href="https://github.com/vallhalorz/sentry402/blob/main/lib/rule-pack.ts"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-paper-100 border border-paper-200 text-ink-700 hover:bg-paper-200 transition-colors"
          >
            Engine source on GitHub →
          </a>
          <a
            href="/api/sample-dossier"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-paper-100 border border-paper-200 text-ink-700 hover:bg-paper-200 transition-colors"
          >
            Sample dossier JSON →
          </a>
        </div>
      </section>

      {/* ---------------- Numbers ---------------- */}
      <section className="grid sm:grid-cols-4 gap-3">
        <Stat label="Rules in pack" value={String(totalRules)} />
        <Stat label="Critical rules" value={String(criticalCount)} />
        <Stat label="High-severity" value={String(highCount)} />
        <Stat label="Categories" value={String(RULE_CATEGORIES.length)} />
      </section>

      {/* ---------------- How the score adds up ---------------- */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">How the score adds up</h2>
        <p className="text-ink-700 leading-relaxed">
          Each rule contributes a fixed maximum number of points when it fires.
          Contributions sum, then the displayed score is capped at 100. Severity is taken from the
          highest single rule that fired, not from the sum. We chose this design so that a wallet
          with one critical hit and zero noise rules reads <em>obviously</em> critical, instead of
          being averaged down by neutral signals.
        </p>
        <div className="rounded-xl border border-paper-200 bg-white p-5 shadow-card space-y-3">
          <div className="text-xs uppercase tracking-wider text-ink-500 font-medium">
            Worked example · OFAC SDN address (Amnokgang DPRK)
          </div>
          <ul className="text-sm space-y-1.5 hash">
            <li className="flex justify-between border-b border-paper-100 py-1">
              <span><span className="text-rose-700">●</span> ofac_direct_match</span>
              <span className="tabular-nums text-ink-700">+100</span>
            </li>
            <li className="flex justify-between border-b border-paper-100 py-1">
              <span><span className="text-rose-700">●</span> sanctions_adjacency_hop1</span>
              <span className="tabular-nums text-ink-700">+60</span>
            </li>
            <li className="flex justify-between border-b border-paper-100 py-1">
              <span><span className="text-rose-700">●</span> stablecoin_dprk_cluster_proximity</span>
              <span className="tabular-nums text-ink-700">+40</span>
            </li>
            <li className="flex justify-between py-2 font-semibold text-ink-900">
              <span>Total contribution</span>
              <span className="tabular-nums">200</span>
            </li>
            <li className="flex justify-between border-t border-paper-200 pt-2">
              <span className="font-medium">Displayed score (capped at 100)</span>
              <span className="tabular-nums font-semibold text-rose-700">100</span>
            </li>
            <li className="flex justify-between text-xs text-ink-500 pt-1">
              <span>Verdict (from severity, not sum)</span>
              <span className="uppercase font-semibold text-rose-700">block</span>
            </li>
          </ul>
        </div>
        <p className="text-xs text-ink-500">
          Theoretical maximum across all {totalRules} rules is {totalContribution}, but no real
          dossier should hit that — it would require the subject to be sanctioned AND a drainer
          AND a DPRK-cluster contact AND a non-cooperative-issuer holder simultaneously. The cap
          exists so the displayed number remains comparable across dossiers.
        </p>
      </section>

      {/* ---------------- Severity → verdict ---------------- */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Severity → verdict mapping</h2>
        <p className="text-ink-700 leading-relaxed">
          The screening dossier reports the highest-severity signal that fired. The Firewall
          endpoint folds severity into a single verdict an AI agent can branch on. Bias toward{" "}
          <em>warn</em> at the medium tier is intentional: FATF's risk-based approach and
          FinCEN's April 2026 NPRM both prefer enhanced review over a hard block at borderline
          signals.
        </p>
        <div className="rounded-xl border border-paper-200 bg-white overflow-hidden shadow-card">
          <table className="w-full text-sm">
            <thead className="bg-paper-50 border-b border-paper-200">
              <tr className="text-left text-xs uppercase tracking-wider text-ink-500">
                <th className="px-4 py-2 font-medium">Severity</th>
                <th className="px-4 py-2 font-medium">Verdict</th>
                <th className="px-4 py-2 font-medium">Recommended agent action</th>
              </tr>
            </thead>
            <tbody>
              {(Object.keys(SEVERITY_TO_VERDICT) as Array<keyof typeof SEVERITY_TO_VERDICT>).map(
                (sev) => {
                  const { verdict, agent_action } = SEVERITY_TO_VERDICT[sev];
                  return (
                    <tr key={sev} className="border-b border-paper-100 last:border-b-0">
                      <td className="px-4 py-3 hash">
                        <span
                          className={`inline-block uppercase text-[11px] font-semibold tracking-wider ${
                            sev === "critical" || sev === "high"
                              ? "text-rose-700"
                              : sev === "medium"
                                ? "text-amber-700"
                                : "text-emerald-700"
                          }`}
                        >
                          {sev}
                        </span>
                      </td>
                      <td className={`px-4 py-3 hash font-semibold ${VERDICT_COLOR[verdict]}`}>
                        {verdict}
                      </td>
                      <td className="px-4 py-3 text-ink-700">{agent_action}</td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- The 15 rules ---------------- */}
      <section className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              The {totalRules} rules in pack {RULE_PACK_VERSION}
            </h2>
            <p className="text-ink-500 text-sm mt-1">
              Every signal Sentry402 emits originates from exactly one rule below. The rule ID
              you see in the dossier (
              <code className="hash text-xs bg-paper-100 px-1 py-0.5 rounded">type</code> field)
              matches the heading you can deep-link to here.
            </p>
          </div>
        </div>

        {RULE_CATEGORIES.map((cat) => {
          const rules = RULE_PACK_META.filter((r) => r.category === cat);
          if (rules.length === 0) return null;
          return (
            <div key={cat} className="space-y-4">
              <h3 className="text-xs uppercase tracking-[0.16em] text-ink-500 font-semibold border-b border-paper-200 pb-2">
                {cat} · {rules.length} rule{rules.length === 1 ? "" : "s"}
              </h3>
              <div className="grid gap-3">
                {rules.map((r) => (
                  <RuleCard key={r.id} rule={r} />
                ))}
              </div>
            </div>
          );
        })}
      </section>

      {/* ---------------- What we don't cover ---------------- */}
      <section className="space-y-3 rounded-xl border border-paper-200 bg-paper-50 p-5">
        <h2 className="text-2xl font-semibold tracking-tight">What this pack does NOT cover yet</h2>
        <p className="text-ink-700 leading-relaxed">
          Honest scope statement. The rule pack is targeted at the highest-leverage AML and
          sanctions typologies in scope for the current set of regulator references — it is{" "}
          <em>not</em> a Chainalysis substitute. Gaps a compliance officer should know about
          before relying on Sentry402 in production:
        </p>
        <ul className="text-sm text-ink-700 space-y-2 list-disc pl-5 leading-relaxed">
          <li>
            <strong>Privacy mixers beyond Tornado Cash</strong> — Aztec, Railgun, and chain-native
            privacy pools are not in the SDN dataset yet. Out of scope for the May 2026 build.
          </li>
          <li>
            <strong>MPC / smart-account custody attribution</strong> — Safe modules, Squads
            multi-sigs, and AA bundlers are not yet labelled. The score treats them as
            unknown-custody.
          </li>
          <li>
            <strong>Cross-chain bridge graph</strong> — sanctions adjacency does not yet follow
            funds through Wormhole, LayerZero, or LiFi. A 2-hop walk that crosses a bridge will
            stop at the bridge contract.
          </li>
          <li>
            <strong>Solana 2-hop indirect exposure</strong> — the{" "}
            <code className="hash text-xs bg-paper-100 px-1 py-0.5 rounded">
              sanctions_indirect_exposure_2hop
            </code>{" "}
            rule is EVM-only because Solana 1-hop USD aggregates are not yet computed.
          </li>
          <li>
            <strong>Real-time SDN sync</strong> — the SDN dataset (
            <code className="hash text-xs bg-paper-100 px-1 py-0.5 rounded">2026-05-07-tc-expanded</code>
            ) is hand-curated to 37 high-signal entries for this hackathon scope. A production
            deploy would replace this with a daily Treasury sync.
          </li>
          <li>
            <strong>Behavioural ML</strong> — no machine-learning signals. We chose deterministic
            rules so that scores are reproducible across the same inputs. ML signals can be added
            later as a separate, clearly-labelled rule family.
          </li>
        </ul>
      </section>

      {/* ---------------- Versioning & reproducibility ---------------- */}
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Versioning & reproducibility</h2>
        <p className="text-ink-700 leading-relaxed">
          Every dossier carries three pinned versions in its{" "}
          <code className="hash text-xs bg-paper-100 px-1 py-0.5 rounded">metadata</code> field:
        </p>
        <ul className="text-sm text-ink-700 space-y-1.5 list-disc pl-5 leading-relaxed">
          <li>
            <code className="hash text-xs bg-paper-100 px-1 py-0.5 rounded">rule_pack_version</code> +{" "}
            <code className="hash text-xs bg-paper-100 px-1 py-0.5 rounded">rule_pack_sha256</code> —
            the rule definitions
          </li>
          <li>
            <code className="hash text-xs bg-paper-100 px-1 py-0.5 rounded">sdn_list_version</code> — the
            SDN dataset (e.g. <code className="hash text-xs bg-paper-100 px-1 py-0.5 rounded">2026-05-07-tc-expanded</code>)
          </li>
          <li>
            <code className="hash text-xs bg-paper-100 px-1 py-0.5 rounded">goldrush_api_version</code> +{" "}
            <code className="hash text-xs bg-paper-100 px-1 py-0.5 rounded">helius_das_version</code> — the
            on-chain data sources
          </li>
        </ul>
        <p className="text-ink-700 leading-relaxed">
          Bumping the rule pack version is the canonical way to record a rule change for FCA 2024
          documentation purposes. The version string + SHA-256 give an auditor everything they
          need to recreate the exact rule pack at the moment the score was generated.
        </p>
      </section>

      {/* ---------------- Citations ---------------- */}
      <section className="space-y-3">
        <h2 className="text-2xl font-semibold tracking-tight">Regulatory references</h2>
        <p className="text-ink-700 leading-relaxed text-sm">
          Frameworks the rule pack cites. Each emitted signal carries the specific reference
          inline, so the dossier reader can trace any flag back to its regulator basis without
          leaving the page.
        </p>
        <ul className="text-sm space-y-1.5">
          <li>
            <a
              href="https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatf-recommendations.html"
              target="_blank"
              rel="noreferrer"
              className="text-accent-dark hover:text-accent border-b border-ink-300"
            >
              FATF Recommendations 6, 7, 16
            </a>{" "}
            — targeted financial sanctions; Travel Rule
          </li>
          <li>
            <a
              href="https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Targeted-update-virtual-assets-vasps-2025.html"
              target="_blank"
              rel="noreferrer"
              className="text-accent-dark hover:text-accent border-b border-ink-300"
            >
              FATF Targeted Update June 2025 — Virtual Assets / VASPs
            </a>
          </li>
          <li>
            <a
              href="https://www.fincen.gov/sites/default/files/shared/FinCEN_SAR_ElectronicFilingInstructions-Stand_Alone_doc.pdf"
              target="_blank"
              rel="noreferrer"
              className="text-accent-dark hover:text-accent border-b border-ink-300"
            >
              FinCEN SAR Form 111
            </a>{" "}
            — Suspicious Activity Type 31y / 31z
          </li>
          <li>
            <a
              href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1114"
              target="_blank"
              rel="noreferrer"
              className="text-accent-dark hover:text-accent border-b border-ink-300"
            >
              MiCA Regulation (EU) 2023/1114 Article 17
            </a>{" "}
            — EMT-issuer compliance
          </li>
          <li>
            <a
              href="https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists"
              target="_blank"
              rel="noreferrer"
              className="text-accent-dark hover:text-accent border-b border-ink-300"
            >
              OFAC SDN list
            </a>{" "}
            + Treasury press release{" "}
            <a
              href="https://home.treasury.gov/news/press-releases/sb0416"
              target="_blank"
              rel="noreferrer"
              className="text-accent-dark hover:text-accent border-b border-ink-300"
            >
              SB0416 (2026-03-12)
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}

/* ============================================================
 * Sub-components
 * ============================================================ */

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-paper-200 bg-white p-4 shadow-card">
      <div className="text-3xl font-semibold tabular-nums text-ink-900">{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-ink-500 mt-1">{label}</div>
    </div>
  );
}

function RuleCard({ rule }: { rule: RuleMeta }) {
  return (
    <article
      id={`rule-${rule.id}`}
      className="scroll-mt-20 rounded-xl border border-paper-200 bg-white p-5 shadow-card space-y-3"
    >
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`inline-block uppercase text-[10px] font-semibold tracking-wider px-2 py-0.5 rounded border ${SEV_COLOR[rule.severity]}`}>
              {rule.severity}
            </span>
            <code className="hash text-xs text-ink-500">{rule.id}</code>
          </div>
          <h4 className="font-semibold text-ink-900 leading-snug">{rule.shortDescription}</h4>
        </div>
        <div className="text-right shrink-0">
          <div className="hash tabular-nums text-2xl font-semibold text-ink-900">+{rule.weight}</div>
          <div className="text-[10px] uppercase tracking-wider text-ink-500">max contribution</div>
        </div>
      </header>

      <p className="text-sm text-ink-700 leading-relaxed">{rule.longDescription}</p>

      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-xs">
        <div>
          <dt className="uppercase tracking-wider text-ink-500 font-medium mb-0.5">
            What the engine checks
          </dt>
          <dd className="text-ink-700">{rule.whatItChecks}</dd>
        </div>
        {rule.threshold && (
          <div>
            <dt className="uppercase tracking-wider text-ink-500 font-medium mb-0.5">Threshold</dt>
            <dd className="text-ink-700 hash">{rule.threshold}</dd>
          </div>
        )}
        {rule.scopeNote && (
          <div className="sm:col-span-2">
            <dt className="uppercase tracking-wider text-ink-500 font-medium mb-0.5">Scope note</dt>
            <dd className="text-ink-700 italic">{rule.scopeNote}</dd>
          </div>
        )}
        <div className="sm:col-span-2">
          <dt className="uppercase tracking-wider text-ink-500 font-medium mb-0.5">Citations</dt>
          <dd className="text-ink-700 space-y-0.5">
            {rule.citations.fatf && (
              <div>
                <span className="inline-block uppercase text-[10px] font-semibold tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-1.5 py-0.5 mr-2">
                  FATF
                </span>
                {rule.citations.fatf}
              </div>
            )}
            {rule.citations.fincen && (
              <div>
                <span className="inline-block uppercase text-[10px] font-semibold tracking-wider bg-violet-50 text-violet-700 border border-violet-200 rounded px-1.5 py-0.5 mr-2">
                  FinCEN
                </span>
                {rule.citations.fincen}
              </div>
            )}
            {rule.citations.mica && (
              <div>
                <span className="inline-block uppercase text-[10px] font-semibold tracking-wider bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 mr-2">
                  MiCA
                </span>
                {rule.citations.mica}
              </div>
            )}
            {rule.citations.treasury && (
              <div>
                <span className="inline-block uppercase text-[10px] font-semibold tracking-wider bg-slate-100 text-slate-700 border border-slate-200 rounded px-1.5 py-0.5 mr-2">
                  Treasury
                </span>
                {rule.citations.treasury}
              </div>
            )}
            {!rule.citations.fatf &&
              !rule.citations.fincen &&
              !rule.citations.mica &&
              !rule.citations.treasury && (
                <div className="text-ink-500 italic">
                  Operational signal — no regulator citation required.
                </div>
              )}
          </dd>
        </div>
        <div className="sm:col-span-2 text-ink-500 italic">
          Introduced in rule pack {rule.introducedIn}.
        </div>
      </dl>
    </article>
  );
}

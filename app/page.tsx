"use client";

import { useEffect, useState } from "react";
import type {
  ChainName,
  RiskDossier,
  Severity,
  WalletActivity,
  WalletHolding,
} from "@/lib/types";
import { addressUrl, explorerName, txUrl } from "@/lib/block-explorer";

const SEVERITY_COLOR: Record<Severity, string> = {
  info: "#6366f1",
  low: "#10b981",
  medium: "#f59e0b",
  high: "#f97316",
  critical: "#dc2626",
};

const SEVERITY_BG: Record<Severity, string> = {
  info: "bg-signal-info",
  low: "bg-signal-low",
  medium: "bg-signal-medium",
  high: "bg-signal-high",
  critical: "bg-signal-critical",
};

const SEVERITY_BORDER: Record<Severity, string> = {
  info: "border-signal-info/30",
  low: "border-signal-low/30",
  medium: "border-signal-medium/40",
  high: "border-signal-high/40",
  critical: "border-signal-critical/50",
};

const FREEZE_POLICY_LABEL: Record<string, { text: string; color: string }> = {
  highly_cooperative: { text: "highly cooperative", color: "bg-signal-low/15 text-signal-low" },
  cooperative: { text: "cooperative", color: "bg-signal-low/15 text-signal-low" },
  mixed: { text: "mixed", color: "bg-signal-medium/15 text-signal-medium" },
  decentralized_no_authority: {
    text: "decentralized",
    color: "bg-signal-info/15 text-signal-info",
  },
  non_cooperative: {
    text: "non-cooperative",
    color: "bg-signal-critical/15 text-signal-critical",
  },
};

type RecentScan = {
  wallet: string;
  chain: ChainName;
  score: number;
  severity: Severity;
  timestamp: number;
};

const RECENTS_KEY = "sentry402:recent";
const RECENTS_MAX = 5;

function loadRecents(): RecentScan[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as RecentScan[]) : [];
  } catch {
    return [];
  }
}
function saveRecents(rs: RecentScan[]) {
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(rs.slice(0, RECENTS_MAX)));
  } catch {
    /* localStorage disabled */
  }
}

const EVM_RE = /^0x[a-fA-F0-9]{40}$/;
const SOLANA_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

function validateAddress(input: string, chain: ChainName): { ok: boolean; reason?: string } {
  if (!input) return { ok: false, reason: "Address is required" };
  if (chain === "solana-mainnet") {
    if (!SOLANA_RE.test(input)) {
      return {
        ok: false,
        reason: "Solana addresses are 32 to 44 base58 characters, not 0x-prefixed.",
      };
    }
    return { ok: true };
  }
  if (!EVM_RE.test(input)) {
    if (input.endsWith(".eth") || input.endsWith(".lens")) return { ok: true };
    return {
      ok: false,
      reason: "EVM addresses are 0x followed by 40 hex characters. ENS / Lens names also accepted.",
    };
  }
  return { ok: true };
}

export default function Home() {
  const [wallet, setWallet] = useState("");
  const [chain, setChain] = useState<ChainName>("eth-mainnet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dossier, setDossier] = useState<RiskDossier | null>(null);
  const [origin, setOrigin] = useState("http://localhost:3000");
  const [recents, setRecents] = useState<RecentScan[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
    setRecents(loadRecents());
  }, []);

  const validation = validateAddress(wallet.trim(), chain);

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      const trimmed = text.trim();
      if (trimmed) setWallet(trimmed);
    } catch {
      /* clipboard not available */
    }
  }

  async function runScan(e: React.FormEvent) {
    e.preventDefault();
    if (!validation.ok) {
      setError(validation.reason ?? "Invalid address");
      return;
    }
    setLoading(true);
    setError(null);
    setDossier(null);
    try {
      const res = await fetch(
        `/api/risk?chain=${encodeURIComponent(chain)}&wallet=${encodeURIComponent(wallet.trim())}`,
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const data: RiskDossier = await res.json();
      setDossier(data);
      // Persist to recently-scanned.
      const next: RecentScan = {
        wallet: data.subject.wallet,
        chain: data.subject.chain,
        score: data.overall_score,
        severity: data.severity,
        timestamp: Date.now(),
      };
      const dedup = [next, ...recents.filter((r) => r.wallet !== next.wallet || r.chain !== next.chain)];
      const trimmed = dedup.slice(0, RECENTS_MAX);
      setRecents(trimmed);
      saveRecents(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function clearRecents() {
    setRecents([]);
    saveRecents([]);
  }

  return (
    <div className="space-y-8">
      <section className="hero-gradient rounded-2xl px-6 py-10 sm:py-14 -mx-6 sm:mx-0 no-print">
        <div className="max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-paper-100 border border-paper-200 px-3 py-1 text-xs text-ink-500">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-signal-low" />
            <span>Live demo. Powered by GoldRush. Pay-per-call via x402.</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">
            Wallet risk, defensible to a regulator.
          </h1>
          <p className="text-ink-500 text-lg leading-relaxed max-w-2xl">
            Paste any wallet. Sentry402 returns a cited risk dossier. Every flag links to the exact
            GoldRush API call, transaction hash, and dataset version that produced it. Built for
            compliance teams who need defensible scoring without a $30K enterprise contract.
          </p>
        </div>
      </section>

      <SeverityLegend />
      <MiniFAQ />

      <form
        onSubmit={runScan}
        className="rounded-xl border border-paper-200 bg-white p-5 shadow-card space-y-4 no-print"
        noValidate
      >
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-500 font-medium mb-2 block">
            Wallet address
          </span>
          <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3">
            <div className="relative">
              <input
                type="text"
                value={wallet}
                onChange={(e) => setWallet(e.target.value)}
                placeholder="0x... or Solana base58 address"
                required
                aria-label="Wallet address"
                aria-invalid={wallet.length > 0 && !validation.ok}
                className={`hash w-full rounded-lg border pl-4 pr-10 py-2.5 outline-none focus:ring-2 transition ${
                  wallet.length > 0 && !validation.ok
                    ? "border-signal-high focus:border-signal-high focus:ring-signal-high/20"
                    : "border-paper-200 focus:border-brand focus:ring-brand/20"
                }`}
              />
              <button
                type="button"
                onClick={pasteFromClipboard}
                title="Paste from clipboard"
                aria-label="Paste from clipboard"
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-7 w-7 rounded text-ink-400 hover:text-ink-900 hover:bg-paper-100 transition"
              >
                <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                  <path d="M3 4.5A1.5 1.5 0 014.5 3H6a2 2 0 014 0h1.5A1.5 1.5 0 0113 4.5V12a2 2 0 01-2 2H5a2 2 0 01-2-2V4.5zM8 3a1 1 0 100 2 1 1 0 000-2z" />
                </svg>
              </button>
            </div>
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value as ChainName)}
              aria-label="Blockchain network"
              className="rounded-lg border border-paper-200 px-3 py-2.5 bg-white cursor-pointer hover:border-ink-400 transition"
            >
              <option value="eth-mainnet">Ethereum</option>
              <option value="base-mainnet">Base</option>
              <option value="matic-mainnet">Polygon</option>
              <option value="bsc-mainnet">BNB Chain</option>
              <option value="arbitrum-mainnet">Arbitrum</option>
              <option value="optimism-mainnet">Optimism</option>
              <option value="solana-mainnet">Solana (advisory)</option>
            </select>
            <button
              type="submit"
              disabled={loading || !wallet || !validation.ok}
              className="rounded-lg bg-ink-900 text-paper-50 px-5 py-2.5 font-medium hover:bg-ink-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {loading ? "Scanning..." : "Generate dossier"}
            </button>
          </div>
          {wallet.length > 0 && !validation.ok && (
            <p className="mt-2 text-xs text-signal-high">{validation.reason}</p>
          )}
        </label>

        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wider text-ink-500 font-medium">
            Try a demo wallet
          </p>
          <div className="flex flex-wrap gap-2">
            <DemoChip
              onPick={(a) => {
                setWallet(a);
                setChain("eth-mainnet");
              }}
              addr="0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D"
              tone="critical"
              label="OFAC SDN"
              note="Amnokgang DPRK, 2026-03-12"
            />
            <DemoChip
              onPick={(a) => {
                setWallet(a);
                setChain("eth-mainnet");
              }}
              addr="0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
              tone="low"
              label="vitalik.eth"
              note="public, clean"
            />
            <DemoChip
              onPick={(a) => {
                setWallet(a);
                setChain("solana-mainnet");
              }}
              addr="DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK"
              tone="info"
              label="Solana wallet"
              note="coverage advisory demo"
            />
            <DemoChip
              onPick={(a) => {
                setWallet(a);
                setChain("eth-mainnet");
              }}
              addr="0x28C6c06298d514Db089934071355E5743bf21d60"
              tone="info"
              label="Binance 14"
              note="CEX hot wallet attribution"
            />
            <DemoChip
              onPick={(a) => {
                setWallet(a);
                setChain("eth-mainnet");
              }}
              addr="0xd04E33461FEA8302c5E1e13895b60cEe8AEfda7F"
              tone="critical"
              label="OFAC Sim Hyon Sop"
              note="DPRK/KKBC, 2026-03-12"
            />
          </div>
        </div>

        {recents.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-paper-200">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-wider text-ink-500 font-medium">
                Recently scanned in this browser
              </p>
              <button
                type="button"
                onClick={clearRecents}
                className="text-xs text-ink-400 hover:text-ink-700 transition"
              >
                Clear
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recents.map((r) => (
                <button
                  key={`${r.chain}:${r.wallet}`}
                  type="button"
                  onClick={() => {
                    setWallet(r.wallet);
                    setChain(r.chain);
                  }}
                  title={`${r.wallet} on ${r.chain}, ${r.severity} ${r.score}/100`}
                  className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs transition ${SEVERITY_BORDER[r.severity]} bg-white hover:bg-paper-100`}
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: SEVERITY_COLOR[r.severity] }}
                  />
                  <span className="hash text-[11px] text-ink-500">
                    {r.wallet.slice(0, 6)}...{r.wallet.slice(-4)}
                  </span>
                  <span className="tabular-nums text-ink-700 font-medium">{r.score}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-lg border-l-4 border-signal-high bg-signal-high/5 p-4 text-sm text-ink-700"
        >
          <p className="font-medium text-signal-high">Scan failed</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {loading && <DossierSkeleton />}
      {dossier && <DossierView d={dossier} />}

      <section className="rounded-xl border border-brand/20 bg-gradient-to-br from-paper-100 to-white p-6 space-y-3 shadow-card no-print">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-brand/10 text-brand">
            <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 14a6 6 0 110-12 6 6 0 010 12zm-1-9h2v6H9V7zm0-3h2v2H9V4z" />
            </svg>
          </span>
          <h2 className="text-sm uppercase tracking-wider text-ink-500 font-medium">
            Agent rail. Pay-per-call via x402.
          </h2>
        </div>
        <p className="text-sm text-ink-700 leading-relaxed">
          The dashboard above is free for compliance officers to evaluate. AI agents and production
          integrations call <code className="hash text-xs bg-paper-100 px-1.5 py-0.5 rounded">/api/risk/paid</code>{" "}
          instead. Same response, but x402-gated at $0.05 per dossier on Base Sepolia. No API key,
          no signup, no monthly contract.
        </p>
        <pre className="hash text-xs bg-ink-900 text-paper-50 border border-ink-700 rounded-lg p-4 overflow-x-auto leading-relaxed">
{`curl -i '${origin}/api/risk/paid?chain=eth-mainnet&wallet=0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D'
# HTTP/1.1 402 Payment Required  (no payment attached)
# x402 payment-required JSON in body

curl -i -H 'X-PAYMENT: <signed-payment-payload>' \\
  '${origin}/api/risk/paid?chain=eth-mainnet&wallet=0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D'
# HTTP/1.1 200 OK
# cited RiskDossier JSON, x-payment-response settlement header`}
        </pre>
        <p className="text-xs text-ink-400">
          GoldRush&apos;s own x402 service is also live on Base Sepolia today. Mainnet is &ldquo;coming
          soon&rdquo; per their docs. We do not pretend testnet USDC is real settlement.
        </p>
      </section>
    </div>
  );
}

function SeverityLegend() {
  const [open, setOpen] = useState(false);
  const rows: Array<{ sev: Severity; range: string; meaning: string; action: string }> = [
    { sev: "info", range: "0", meaning: "Informational signal only.", action: "No action; retain for audit trail." },
    { sev: "low", range: "1-39", meaning: "Reviewed; low concern.", action: "File in case management. Re-scan on material change." },
    { sev: "medium", range: "40-64", meaning: "Enhanced due diligence.", action: "Document, watchlist, monitor for escalation." },
    { sev: "high", range: "65-84", meaning: "Escalate.", action: "EDD + open case. Plan SAR within filing window." },
    { sev: "critical", range: "85-100", meaning: "SAR / freeze.", action: "Freeze, file SAR within 24h, notify counsel." },
  ];
  return (
    <details
      className="rounded-xl border border-paper-200 bg-white shadow-card no-print group"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer select-none px-5 py-3 flex items-center gap-3 text-sm">
        <span aria-hidden className="inline-flex items-center justify-center h-6 w-6 rounded bg-brand/10 text-brand">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 6zm0-2.5a.75.75 0 100 1.5.75.75 0 000-1.5z" />
          </svg>
        </span>
        <span className="font-medium text-ink-700">What does each severity mean?</span>
        <span className="text-xs text-ink-400 ml-auto">
          {open ? "Hide" : "Show severity legend"}
        </span>
      </summary>
      <div className="px-5 pb-4 pt-2 border-t border-paper-200">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-separate border-spacing-y-1">
            <thead>
              <tr className="text-ink-400 uppercase tracking-wider">
                <th className="font-medium pr-3">Severity</th>
                <th className="font-medium pr-3">Score range</th>
                <th className="font-medium pr-3">Meaning</th>
                <th className="font-medium">Typical action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.sev}>
                  <td className="pr-3 align-top">
                    <SeverityBadge severity={r.sev} />
                  </td>
                  <td className="pr-3 align-top hash text-ink-500">{r.range}</td>
                  <td className="pr-3 align-top text-ink-700">{r.meaning}</td>
                  <td className="align-top text-ink-700">{r.action}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

function DemoChip({
  onPick,
  addr,
  tone,
  label,
  note,
}: {
  onPick: (s: string) => void;
  addr: string;
  tone: Severity;
  label: string;
  note?: string;
}) {
  const toneClasses: Record<Severity, string> = {
    info: "bg-signal-info/10 text-signal-info border-signal-info/30 hover:bg-signal-info/15",
    low: "bg-signal-low/10 text-signal-low border-signal-low/30 hover:bg-signal-low/15",
    medium: "bg-signal-medium/10 text-signal-medium border-signal-medium/30 hover:bg-signal-medium/15",
    high: "bg-signal-high/10 text-signal-high border-signal-high/30 hover:bg-signal-high/15",
    critical: "bg-signal-critical/10 text-signal-critical border-signal-critical/30 hover:bg-signal-critical/15",
  };
  return (
    <button
      type="button"
      onClick={() => onPick(addr)}
      title={addr}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition ${toneClasses[tone]}`}
    >
      <span aria-hidden className="hash text-[11px] opacity-80">
        {addr.slice(0, 6)}...{addr.slice(-4)}
      </span>
      <span className="text-ink-700">{label}</span>
      {note && <span className="text-ink-400">{note}</span>}
    </button>
  );
}

function DossierView({ d }: { d: RiskDossier }) {
  const ofacHit = d.signals.find((s) => s.type === "ofac_direct_match");
  return (
    <article className="space-y-6 animate-in fade-in duration-300">
      {ofacHit && <OfacBanner signal={ofacHit} />}
      <FreshnessBanner d={d} />
      <SeverityCounter d={d} />
      <ScoreCard d={d} />
      <ScoreBreakdown d={d} />
      <ActionRecommendation d={d} />
      <SubjectContext d={d} />
      <SignalsList d={d} />
      <MetadataCard d={d} />
      <div className="flex flex-wrap gap-3 no-print">
        <a
          href={`/api/risk/export?id=${d.metadata.generation_id}&format=json`}
          className="inline-flex items-center gap-2 rounded-lg border border-ink-700 px-4 py-2.5 text-sm font-medium hover:bg-ink-900 hover:text-paper-50 transition"
          download
        >
          <ExportIcon />
          Export JSON
        </a>
        <a
          href={`/api/risk/export?id=${d.metadata.generation_id}&format=pdf`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-ink-700 px-4 py-2.5 text-sm font-medium hover:bg-ink-900 hover:text-paper-50 transition"
        >
          <ExportIcon />
          Export SAR-style PDF
        </a>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg border border-ink-700 px-4 py-2.5 text-sm font-medium hover:bg-ink-900 hover:text-paper-50 transition"
        >
          <PrintIcon />
          Print exhibit
        </button>
        <a
          href={addressUrl(d.subject.chain, d.subject.wallet)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-paper-300 px-4 py-2.5 text-sm font-medium text-ink-700 hover:border-ink-700 hover:text-ink-900 transition"
        >
          <ExternalIcon />
          Open in {explorerName(d.subject.chain)}
        </a>
      </div>
    </article>
  );
}

function FreshnessBanner({ d }: { d: RiskDossier }) {
  type ExtMeta = typeof d.metadata & {
    stablecoin_registry_version?: string;
    issuer_frozen_list_version?: string;
    known_addresses_version?: string;
  };
  const meta = d.metadata as ExtMeta;
  const freshness = `OFAC SDN ${meta.sdn_list_version}`;
  return (
    <div className="rounded-lg border border-paper-200 bg-paper-100/50 px-4 py-2 text-xs text-ink-500 flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-signal-low" />
        <span className="text-ink-700 font-medium">Datasets current</span>
      </span>
      <span className="hash">{freshness}</span>
      {meta.stablecoin_registry_version && (
        <span className="hash">Stablecoin registry {meta.stablecoin_registry_version}</span>
      )}
      {meta.known_addresses_version && (
        <span className="hash">Known addresses {meta.known_addresses_version}</span>
      )}
      <span className="ml-auto">Re-runnable against pinned versions</span>
    </div>
  );
}

function OfacBanner({ signal }: { signal: import("@/lib/types").Signal }) {
  return (
    <div
      role="alert"
      className="rounded-xl border-l-4 border-signal-critical bg-signal-critical/10 p-5 shadow-card flex items-start gap-4 severity-critical-pulse"
    >
      <span
        aria-hidden
        className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-signal-critical text-white shrink-0 mt-0.5"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
          <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 5h2v8h-2V7zm0 10h2v2h-2v-2z" />
        </svg>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-signal-critical font-bold">
          Active OFAC SDN match · Hop-0 sanctions hit
        </p>
        <h2 className="mt-1 text-xl sm:text-2xl font-semibold text-ink-900 leading-tight">
          {signal.title}
        </h2>
        <p className="mt-2 text-sm text-ink-700 leading-relaxed">
          Per OFAC&apos;s 50% rule and Treasury enforcement guidance, all transactions involving
          this address are prohibited for U.S. persons, and any non-U.S. person facilitating such
          transactions risks secondary sanctions. Recommend immediate freeze, SAR filing, and
          counsel review. Evidence and primary sources are below.
        </p>
      </div>
    </div>
  );
}

function SeverityCounter({ d }: { d: RiskDossier }) {
  if (d.signals.length === 0) return null;
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const s of d.signals) counts[s.severity] += 1;
  const order: Severity[] = ["critical", "high", "medium", "low", "info"];
  return (
    <div className="flex flex-wrap gap-2 text-xs">
      {order.map((sev) => (
        <span
          key={sev}
          className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 ${SEVERITY_BORDER[sev]} bg-white`}
          title={`${counts[sev]} ${sev} indicators`}
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: SEVERITY_COLOR[sev] }}
          />
          <span className="tabular-nums font-semibold text-ink-900">{counts[sev]}</span>
          <span className="uppercase tracking-wider text-ink-500">{sev}</span>
        </span>
      ))}
    </div>
  );
}

function ScoreCard({ d }: { d: RiskDossier }) {
  const color = SEVERITY_COLOR[d.severity];
  const isCritical = d.severity === "critical";
  const explorerLink = addressUrl(d.subject.chain, d.subject.wallet);
  return (
    <header
      className={`rounded-xl border-l-4 ${SEVERITY_BORDER[d.severity]} bg-white p-6 shadow-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6`}
      style={{ borderLeftColor: color }}
    >
      <div className="space-y-1.5 flex-1 min-w-0">
        <p className="text-xs uppercase tracking-wider text-ink-400 font-medium">
          Subject of report
        </p>
        {d.subject.label && (
          <p className="text-base font-semibold text-ink-900">{d.subject.label}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={explorerLink}
            target="_blank"
            rel="noreferrer"
            className="hash text-sm sm:text-base text-ink-700 hover:text-brand hover:underline transition break-all"
            title={`Open on ${explorerName(d.subject.chain)}`}
          >
            {d.subject.wallet}
          </a>
          <CopyButton text={d.subject.wallet} title="Copy address" />
        </div>
        <p className="text-xs text-ink-500">
          {d.subject.chain} · queried {new Date(d.subject.queried_at).toUTCString()}
        </p>
        {d.subject.first_seen_at && (
          <p className="text-xs text-ink-500">
            <span className="text-ink-400">First seen on-chain:</span>{" "}
            {new Date(d.subject.first_seen_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
            {" "}
            <span className="text-ink-400">({timeAgo(d.subject.first_seen_at)})</span>
          </p>
        )}
        <p className="mt-3 text-sm text-ink-700 leading-relaxed">{d.headline}</p>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <AnimatedScoreCircle score={d.overall_score} severity={d.severity} />
        <div className="flex flex-col items-start gap-1.5">
          <SeverityBadge severity={d.severity} pulse={isCritical} />
          <span className="text-xs text-ink-400">out of 100</span>
        </div>
      </div>
    </header>
  );
}

function AnimatedScoreCircle({ score, severity }: { score: number; severity: Severity }) {
  const [displayed, setDisplayed] = useState(0);
  useEffect(() => {
    setDisplayed(0);
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    function tick(t: number) {
      const k = Math.min(1, (t - start) / dur);
      // Ease-out cubic.
      const eased = 1 - Math.pow(1 - k, 3);
      setDisplayed(Math.round(score * eased));
      if (k < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);
  return <ScoreCircle score={displayed} severity={severity} />;
}

function ScoreBreakdown({ d }: { d: RiskDossier }) {
  if (d.signals.length === 0) return null;
  const total = d.signals.reduce((s, sig) => s + sig.score_contribution, 0);
  if (total === 0) return null;
  const sorted = [...d.signals].sort((a, b) => b.score_contribution - a.score_contribution);
  return (
    <section className="rounded-xl border border-paper-200 bg-white p-5 shadow-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-ink-500 font-medium">
          Score breakdown
        </h3>
        <span className="text-xs text-ink-400">
          total contribution {total} · displayed score {d.overall_score} (capped at 100)
        </span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-paper-100" role="img" aria-label="Score breakdown by signal">
        {sorted.map((s) => (
          <div
            key={s.id}
            title={`${s.type}: +${s.score_contribution}`}
            style={{
              width: `${(s.score_contribution / total) * 100}%`,
              backgroundColor: SEVERITY_COLOR[s.severity],
            }}
          />
        ))}
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">
        {sorted.map((s) => (
          <li key={s.id} className="flex items-center gap-2 truncate">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: SEVERITY_COLOR[s.severity] }}
            />
            <span className="hash text-ink-500 truncate">{s.type}</span>
            <span className="ml-auto tabular-nums text-ink-700 font-medium">
              +{s.score_contribution}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const ACTION_GUIDE: Record<Severity, { title: string; steps: string[]; tone: string }> = {
  critical: {
    title: "Recommended next steps",
    tone: "border-signal-critical/30 bg-signal-critical/5",
    steps: [
      "Freeze the subject wallet across all your firm-controlled rails immediately.",
      "File a SAR / STR within the local regulatory window (US: 30 days, EU MiCA: as soon as practicable).",
      "Escalate to the compliance lead and notify counsel before any external communication.",
      "Preserve the dossier JSON and PDF as exhibits with the generation_id intact.",
    ],
  },
  high: {
    title: "Recommended next steps",
    tone: "border-signal-high/30 bg-signal-high/5",
    steps: [
      "Apply enhanced due diligence and request source-of-funds documentation before any further interaction.",
      "Open an internal case in your case-management system and link the dossier generation_id.",
      "Plan a SAR filing within the regulatory window if any indicator confirms.",
      "Notify the compliance lead; counsel review optional unless escalation criteria met.",
    ],
  },
  medium: {
    title: "Recommended next steps",
    tone: "border-signal-medium/30 bg-signal-medium/5",
    steps: [
      "Add the subject to a watchlist and monitor for escalation triggers.",
      "Document findings in the case file; SAR filing is typically not required at this severity unless other signals exist.",
      "Re-scan after 30 days or on material counterparty change.",
    ],
  },
  low: {
    title: "Recommended next steps",
    tone: "border-signal-low/30 bg-signal-low/5",
    steps: [
      "File the dossier in the case management system for record-keeping.",
      "No immediate action; informational profile only.",
      "Re-scan if the wallet's role changes (e.g. counterparty in a high-value transaction).",
    ],
  },
  info: {
    title: "No action required",
    tone: "border-signal-info/30 bg-signal-info/5",
    steps: [
      "This is an informational dossier. No suspicious activity indicators triggered against the current rule pack.",
      "Retain for audit trail; the dossier is reproducible against the pinned dataset versions.",
    ],
  },
};

function ActionRecommendation({ d }: { d: RiskDossier }) {
  const guide = ACTION_GUIDE[d.severity];
  if (!guide) return null;
  return (
    <section className={`rounded-xl border-l-4 ${guide.tone} p-5 shadow-card`} style={{ borderLeftColor: SEVERITY_COLOR[d.severity] }}>
      <div className="flex items-center gap-2 mb-3">
        <SeverityBadge severity={d.severity} />
        <h3 className="text-sm font-semibold text-ink-900">{guide.title}</h3>
      </div>
      <ol className="space-y-2 text-sm text-ink-700 leading-relaxed list-decimal list-inside">
        {guide.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
      <p className="text-[11px] text-ink-400 mt-3">
        Guidance is generic and not a substitute for jurisdiction-specific compliance counsel.
        Apply your firm&apos;s policies and consult the relevant regulator framework before acting.
      </p>
    </section>
  );
}

function SubjectContext({ d }: { d: RiskDossier }) {
  const hasHoldings = (d.subject.holdings?.length ?? 0) > 0;
  const hasActivity = (d.subject.recent_activity?.length ?? 0) > 0;
  if (!hasHoldings && !hasActivity) return null;
  return (
    <section className="grid lg:grid-cols-2 gap-4">
      {hasHoldings && <HoldingsCard holdings={d.subject.holdings ?? []} chain={d.subject.chain} />}
      {hasActivity && <ActivityCard activity={d.subject.recent_activity ?? []} chain={d.subject.chain} />}
    </section>
  );
}

function HoldingsCard({ holdings, chain }: { holdings: WalletHolding[]; chain: ChainName }) {
  const totalUsd = holdings.reduce((s, h) => s + h.balance_usd, 0);
  return (
    <div className="rounded-xl border border-paper-200 bg-white p-5 shadow-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-ink-500 font-medium">
          Holdings · top {holdings.length}
        </h3>
        <span className="text-xs text-ink-400 tabular-nums">
          ${totalUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })} total
        </span>
      </div>
      <ul className="divide-y divide-paper-200">
        {holdings.map((h) => (
          <li key={h.contract_address} className="flex items-center gap-3 py-2.5">
            <TokenAvatar symbol={h.symbol} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm text-ink-900">{h.symbol}</span>
                {h.stablecoin && (
                  <span
                    className={`inline-flex items-center text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium ${FREEZE_POLICY_LABEL[h.stablecoin.freeze_policy]?.color ?? "bg-paper-100 text-ink-500"}`}
                    title={`${h.stablecoin.issuer} · ${h.stablecoin.freeze_policy.replace(/_/g, " ")}`}
                  >
                    {FREEZE_POLICY_LABEL[h.stablecoin.freeze_policy]?.text ?? h.stablecoin.freeze_policy}
                  </span>
                )}
              </div>
              <a
                href={addressUrl(chain, h.contract_address)}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-ink-400 truncate hover:text-brand hover:underline transition"
                title={`Open on ${explorerName(chain)}`}
              >
                {h.contract_label ?? h.contract_address}
              </a>
            </div>
            <span className="hash text-sm tabular-nums text-ink-700 shrink-0">
              ${h.balance_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TokenAvatar({ symbol }: { symbol: string }) {
  const letter = (symbol || "?").slice(0, 1).toUpperCase();
  let h = 0;
  for (let i = 0; i < symbol.length; i += 1) h = (h * 31 + symbol.charCodeAt(i)) % 360;
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center h-7 w-7 rounded-full text-[10px] font-bold text-white shrink-0"
      style={{ backgroundColor: `hsl(${h} 45% 50%)` }}
    >
      {letter}
    </span>
  );
}

function ActivityCard({ activity, chain }: { activity: WalletActivity[]; chain: ChainName }) {
  return (
    <div className="rounded-xl border border-paper-200 bg-white p-5 shadow-card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs uppercase tracking-wider text-ink-500 font-medium">
          Recent activity · last {activity.length}
        </h3>
      </div>
      <ul className="divide-y divide-paper-200">
        {activity.map((a) => (
          <li key={a.tx_hash} className="flex items-center gap-3 py-2.5">
            <DirectionIcon direction={a.direction} />
            <div className="flex-1 min-w-0">
              <p className="text-sm">
                <span className="text-ink-700">
                  {a.direction === "in" ? "from " : a.direction === "out" ? "to " : "self · "}
                </span>
                <a
                  href={addressUrl(chain, a.counterparty)}
                  target="_blank"
                  rel="noreferrer"
                  className="hash text-ink-900 hover:text-brand hover:underline transition"
                  title={a.counterparty}
                >
                  {a.counterparty_label ?? `${a.counterparty.slice(0, 8)}...${a.counterparty.slice(-4)}`}
                </a>
              </p>
              <p className="text-[11px] text-ink-400">
                {timeAgo(a.block_signed_at)} ·{" "}
                <a
                  href={txUrl(chain, a.tx_hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="hash hover:text-brand hover:underline transition"
                  title={`Open tx on ${explorerName(chain)}`}
                >
                  {a.tx_hash.slice(0, 10)}...
                </a>
              </p>
            </div>
            <span className="hash text-sm tabular-nums text-ink-700 shrink-0">
              ${a.value_usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DirectionIcon({ direction }: { direction: WalletActivity["direction"] }) {
  const cfg = {
    in: { color: "bg-signal-low/15 text-signal-low", path: "M5 10h10m0 0l-4-4m4 4l-4 4" },
    out: { color: "bg-signal-high/15 text-signal-high", path: "M15 10H5m0 0l4 4m-4-4l4-4" },
    self: { color: "bg-signal-info/15 text-signal-info", path: "M5 10h10M5 10l4-4m-4 4l4 4" },
  }[direction];
  return (
    <span
      aria-hidden
      className={`inline-flex items-center justify-center h-7 w-7 rounded-full shrink-0 ${cfg.color}`}
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
        <path d={cfg.path} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function timeAgo(iso: string): string {
  if (!iso) return "unknown time";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "future";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function ScoreCircle({ score, severity }: { score: number; severity: Severity }) {
  const color = SEVERITY_COLOR[severity];
  const pct = Math.max(2, Math.min(100, score));
  return (
    <div
      className="relative inline-flex items-center justify-center h-20 w-20 rounded-full score-arc"
      style={
        {
          "--score-color": color,
          "--score-pct": `${pct}%`,
        } as React.CSSProperties
      }
      role="progressbar"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Risk score ${score} out of 100, severity ${severity}`}
    >
      <div className="absolute inset-1.5 rounded-full bg-white flex items-center justify-center">
        <span className="text-2xl font-semibold tabular-nums" style={{ color }}>
          {score}
        </span>
      </div>
    </div>
  );
}

function SeverityBadge({ severity, pulse }: { severity: Severity; pulse?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-medium text-white px-2.5 py-1 rounded ${SEVERITY_BG[severity]} ${pulse ? "severity-critical-pulse" : ""}`}
    >
      <SeverityIcon severity={severity} />
      {severity}
    </span>
  );
}

function SignalsList({ d }: { d: RiskDossier }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-wider text-ink-500 font-medium">
          Suspicious activity indicators ({d.signals.length})
        </h2>
        {d.signals.length > 0 && (
          <span className="text-xs text-ink-400">sorted by score contribution</span>
        )}
      </div>
      {d.signals.length === 0 ? (
        <div className="rounded-lg border border-paper-200 bg-paper-100 p-6 text-center">
          <p className="text-sm text-ink-500">
            No indicators detected at the current rule pack. The wallet was checked against every
            rule in the pack and the supporting GoldRush API responses are still attached as
            evidence below.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {[...d.signals]
            .sort((a, b) => b.score_contribution - a.score_contribution)
            .map((s) => (
              <li
                key={s.id}
                className={`rounded-xl border ${SEVERITY_BORDER[s.severity]} bg-white p-4 shadow-card space-y-3`}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <SeverityBadge severity={s.severity} />
                  <span className="hash text-xs text-ink-500">{s.type}</span>
                  <span className="ml-auto tabular-nums text-sm font-semibold text-ink-700">
                    +{s.score_contribution}
                  </span>
                </div>
                <p className="font-medium text-ink-900">{s.title}</p>
                <p className="text-sm text-ink-700 leading-relaxed">{s.rationale}</p>
                <div className="flex flex-wrap gap-2">
                  {s.fatf_reference && <RefChip kind="fatf" text={s.fatf_reference} />}
                  {s.fincen_reference && <RefChip kind="fincen" text={s.fincen_reference} />}
                  {s.mica_reference && <RefChip kind="mica" text={s.mica_reference} />}
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-ink-500 hover:text-ink-900 select-none">
                    Evidence ({s.evidence_ids.length})
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {s.evidence_ids.map((eid) => {
                      const e = d.evidence[eid];
                      if (!e) return null;
                      return (
                        <li
                          key={eid}
                          className="border-l-2 border-paper-200 pl-3 hash space-y-0.5"
                        >
                          <p className="text-ink-700 font-medium">{e.endpoint}</p>
                          <p className="text-ink-400 truncate" title={e.endpoint_url}>
                            {e.endpoint_url}
                          </p>
                          {e.tx_hashes.slice(0, 3).map((tx) => (
                            <p key={tx} className="text-ink-500">
                              <a
                                href={txUrl(d.subject.chain, tx)}
                                target="_blank"
                                rel="noreferrer"
                                className="hover:text-brand hover:underline transition"
                              >
                                tx {tx.slice(0, 10)}...{tx.slice(-6)}
                              </a>
                            </p>
                          ))}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}

function refLink(kind: "fatf" | "fincen" | "mica", text: string): string {
  // Map citation text to the most-relevant primary-source URL. Falls back
  // to the index page if no specific recommendation/article is matched.
  const t = text.toLowerCase();
  if (kind === "fatf") {
    if (/recommendation\s+6/.test(t))
      return "https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Targeted-financial-sanctions-related-to-terrorism-and-terrorist-financing.html";
    if (/recommendation\s+7/.test(t))
      return "https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Targeted-financial-sanctions-related-to-proliferation.html";
    if (/recommendation\s+16|travel\s+rule|wire\s+transfers/.test(t))
      return "https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Updated-guidance-rba-virtual-assets-2021.html";
    if (/recommendation\s+20|str\s+filing/.test(t))
      return "https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Reporting-of-suspicious-transactions.html";
    if (/targeted\s+update.*2025|it.?worker/.test(t))
      return "https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Targeted-update-virtual-assets-vasps-2025.html";
    return "https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatf-recommendations.html";
  }
  if (kind === "fincen") {
    if (/sar\s+form\s+111|form\s+111/.test(t))
      return "https://www.fincen.gov/sites/default/files/shared/FinCEN_SAR_ElectronicFilingInstructions-Stand_Alone_doc.pdf";
    return "https://www.fincen.gov/resources/statutes-regulations/guidance";
  }
  if (kind === "mica") {
    if (/article\s+17|emt/.test(t))
      return "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1114";
    if (/article\s+36/.test(t))
      return "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1114";
    if (/article\s+48/.test(t))
      return "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1114";
    return "https://www.esma.europa.eu/policy-activities/digital-finance-and-innovation/markets-crypto-assets-mica";
  }
  return "";
}

function RefChip({ kind, text }: { kind: "fatf" | "fincen" | "mica"; text: string }) {
  const styles = {
    fatf: "bg-reg-fatf/10 text-reg-fatf border-reg-fatf/30 hover:bg-reg-fatf/15",
    fincen: "bg-reg-fincen/10 text-reg-fincen border-reg-fincen/30 hover:bg-reg-fincen/15",
    mica: "bg-reg-mica/10 text-reg-mica border-reg-mica/30 hover:bg-reg-mica/15",
  } as const;
  const label = { fatf: "FATF", fincen: "FinCEN", mica: "MiCA" }[kind];
  const href = refLink(kind, text);
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`Open ${label} primary source`}
      className={`inline-flex items-start gap-1.5 rounded-md border px-2 py-1 text-[11px] leading-snug transition ${styles[kind]}`}
    >
      <span className="font-semibold uppercase tracking-wider text-[10px] mt-px">{label}</span>
      <span className="text-ink-700">{text.replace(/^FATF\s+|^FinCEN\s+|^MiCA\s+/, "")}</span>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        fill="currentColor"
        className="h-2.5 w-2.5 mt-0.5 opacity-60 shrink-0"
      >
        <path d="M3 3h4v1H4v4H3V3zm6 0v6H3v-1h5V4H6V3h3z" />
      </svg>
    </a>
  );
}

function MetadataCard({ d }: { d: RiskDossier }) {
  type ExtMeta = typeof d.metadata & {
    stablecoin_registry_version?: string;
    issuer_frozen_list_version?: string;
    known_addresses_version?: string;
  };
  const meta = d.metadata as ExtMeta;
  const [showRules, setShowRules] = useState(false);
  return (
    <section className="rounded-xl border border-reg-fca/20 bg-reg-fca/5 p-5 text-xs leading-relaxed">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-reg-fca/15 text-reg-fca">
          <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-3 w-3">
            <path
              fillRule="evenodd"
              d="M10 2a8 8 0 100 16 8 8 0 000-16zm3.707 6.707a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <h3 className="uppercase tracking-wider font-medium text-reg-fca">
          Reproducibility metadata · FCA 2024
        </h3>
        <button
          type="button"
          onClick={() => setShowRules((s) => !s)}
          className="ml-auto inline-flex items-center gap-1 text-reg-fca hover:underline no-print"
          aria-expanded={showRules}
        >
          <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
            <path
              fillRule="evenodd"
              d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 6zm0-2.5a.75.75 0 100 1.5.75.75 0 000-1.5z"
              clipRule="evenodd"
            />
          </svg>
          <span>{showRules ? "Hide rule pack contents" : "What is in the rule pack?"}</span>
        </button>
      </div>
      {showRules && <RulePackContents />}
      <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-ink-700">
        <MetaRow
          label="Rule pack"
          value={`${meta.rule_pack_version} · sha256 ${meta.rule_pack_sha256.slice(0, 12)}...`}
        />
        <MetaRow label="OFAC SDN list" value={meta.sdn_list_version} />
        {meta.stablecoin_registry_version && (
          <MetaRow label="Stablecoin registry" value={meta.stablecoin_registry_version} />
        )}
        {meta.issuer_frozen_list_version && (
          <MetaRow label="Issuer frozen list" value={meta.issuer_frozen_list_version} />
        )}
        {meta.known_addresses_version && (
          <MetaRow label="Known addresses" value={meta.known_addresses_version} />
        )}
        <MetaRow label="GoldRush API" value={meta.goldrush_api_version} />
        <MetaRow label="Generator" value={`${meta.generator.name} ${meta.generator.version}`} />
        <MetaRow label="Generation id" value={meta.generation_id} copyable />
        <MetaRow label="Generated" value={new Date(meta.generated_at).toUTCString()} />
      </dl>
    </section>
  );
}

function RulePackContents() {
  // Single source of truth for the rule pack contents shown to compliance
  // reviewers. Reflects lib/rule-pack.ts. Edit both when adding rules.
  const RULES: Array<{
    id: string;
    severity: Severity;
    weight: number;
    purpose: string;
  }> = [
    { id: "ofac_direct_match", severity: "critical", weight: 100, purpose: "Subject wallet itself is on the active OFAC SDN list." },
    { id: "sanctions_adjacency", severity: "critical", weight: 60, purpose: "Subject has a direct counterparty on the active sanctions list." },
    { id: "stablecoin_dprk_cluster_proximity", severity: "critical", weight: 40, purpose: "Direct interaction with the SB0416 DPRK USDT addresses." },
    { id: "stablecoin_non_cooperative_issuer", severity: "critical", weight: 50, purpose: "Holdings include a sanctions-evasion-vehicle stablecoin (e.g. A7A5)." },
    { id: "drainer_pattern", severity: "critical", weight: 35, purpose: "≥3 unlimited approvals to a single spender (drainer signature)." },
    { id: "stablecoin_issuer_frozen_match", severity: "high", weight: 35, purpose: "Counterparty publicly frozen by Tether / Circle / Paxos." },
    { id: "approval_value_at_risk", severity: "high", weight: 25, purpose: "Active token approvals expose ≥$1k in USD value-at-risk." },
    { id: "stablecoin_velocity_typology", severity: "medium", weight: 18, purpose: "≥20 stablecoin transactions in last 24h (DPRK IT-worker typology)." },
    { id: "unlimited_approval", severity: "medium", weight: 15, purpose: "Any unlimited (uint256-max) ERC-20 approval is outstanding." },
    { id: "high_velocity", severity: "medium", weight: 12, purpose: "≥50 transactions in last 24h." },
    { id: "stablecoin_mica_emt_non_compliant", severity: "medium", weight: 10, purpose: "≥$1k in stablecoins whose issuer has not obtained MiCA EMT authorization." },
    { id: "fresh_wallet", severity: "low", weight: 10, purpose: "First on-chain activity less than 7 days ago (true wallet age)." },
    { id: "tornado_cash_historic_exposure", severity: "low", weight: 8, purpose: "Counterparty on the historic Tornado Cash list (delisted 2025-03-21, informational only)." },
    { id: "stablecoin_issuer_compliance", severity: "low", weight: 8, purpose: "Informational profile of stablecoin holdings by issuer freeze policy." },
    { id: "coverage_advisory", severity: "info", weight: 0, purpose: "Solana coverage advisory: limited Foundational API data." },
  ];
  const SEV_RANK: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  const sorted = [...RULES].sort(
    (a, b) => SEV_RANK[b.severity] - SEV_RANK[a.severity] || b.weight - a.weight,
  );
  return (
    <div className="border-t border-reg-fca/20 pt-3 mt-2 space-y-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-ink-500 leading-relaxed max-w-2xl">
          The current rule pack contains {sorted.length} rules. Each fires deterministically based
          on data fetched from GoldRush plus pinned static datasets (OFAC SDN, stablecoin registry,
          known-addresses, issuer-frozen list). Rule weights and thresholds are version-pinned
          via <code className="hash">rule_pack_sha256</code> so a re-run against the same versions
          returns the same dossier.
        </p>
        <a
          href="https://github.com/vallhalorz/sentry402/blob/main/lib/rule-pack.ts"
          target="_blank"
          rel="noreferrer"
          className="text-reg-fca hover:underline shrink-0"
        >
          View source on GitHub →
        </a>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] text-left border-separate border-spacing-y-1">
          <thead>
            <tr className="text-ink-400 uppercase tracking-wider">
              <th className="font-medium pr-3">Rule</th>
              <th className="font-medium pr-3">Severity</th>
              <th className="font-medium pr-3 text-right">Max weight</th>
              <th className="font-medium">Purpose</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td className="pr-3 align-top hash text-ink-700">{r.id}</td>
                <td className="pr-3 align-top">
                  <SeverityBadge severity={r.severity} />
                </td>
                <td className="pr-3 align-top tabular-nums text-right text-ink-700">{r.weight}</td>
                <td className="align-top text-ink-700">{r.purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MetaRow({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-ink-400 shrink-0">{label}:</dt>
      <dd className="hash text-ink-700 truncate flex-1" title={value}>
        {value}
      </dd>
      {copyable && <CopyButton text={value} title={`Copy ${label}`} small />}
    </div>
  );
}

function CopyButton({ text, title, small }: { text: string; title: string; small?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={copied ? "Copied" : title}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard not available */
        }
      }}
      className={`inline-flex items-center justify-center rounded text-ink-400 hover:text-ink-900 hover:bg-paper-100 transition no-print ${small ? "h-5 w-5" : "h-7 w-7"}`}
      aria-label={title}
    >
      {copied ? (
        <svg viewBox="0 0 16 16" fill="currentColor" className={small ? "h-3 w-3" : "h-3.5 w-3.5"}>
          <path
            fillRule="evenodd"
            d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" fill="currentColor" className={small ? "h-3 w-3" : "h-3.5 w-3.5"}>
          <path d="M3 4.5A1.5 1.5 0 014.5 3H10a1.5 1.5 0 011.5 1.5V5h.5A1.5 1.5 0 0113.5 6.5v6A1.5 1.5 0 0112 14H7.5A1.5 1.5 0 016 12.5V12h-.5A1.5 1.5 0 014 10.5v-6zM5.5 4a.5.5 0 00-.5.5v6a.5.5 0 00.5.5H6V6.5A1.5 1.5 0 017.5 5h2.5v-.5a.5.5 0 00-.5-.5h-4zm2 2a.5.5 0 00-.5.5v6a.5.5 0 00.5.5H12a.5.5 0 00.5-.5v-6a.5.5 0 00-.5-.5H7.5z" />
        </svg>
      )}
    </button>
  );
}

function DossierSkeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="h-8 rounded-lg bg-paper-100" />
      <div className="h-32 rounded-xl bg-paper-100" />
      <div className="h-16 rounded-xl bg-paper-100" />
      <div className="grid lg:grid-cols-2 gap-4">
        <div className="h-48 rounded-xl bg-paper-100" />
        <div className="h-48 rounded-xl bg-paper-100" />
      </div>
      <div className="h-24 rounded-xl bg-paper-100" />
    </div>
  );
}

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "critical" || severity === "high") {
    return (
      <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
        <path d="M7.001 2a1 1 0 011.998 0v6a1 1 0 01-1.998 0V2zm.999 12a1.25 1.25 0 100-2.5 1.25 1.25 0 000 2.5z" />
      </svg>
    );
  }
  if (severity === "medium") {
    return (
      <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
        <path
          fillRule="evenodd"
          d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7 4h2v5H7V4zm0 7h2v2H7v-2z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  if (severity === "low") {
    return (
      <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
        <path
          fillRule="evenodd"
          d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm3.5 5.354L7.5 11.146 4.5 8.146l1.146-1.146L7.5 8.854l2.854-2.854L11.5 6.854z"
          clipRule="evenodd"
        />
      </svg>
    );
  }
  return (
    <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
      <path
        fillRule="evenodd"
        d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM8 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 018 6zm0-2.5a.75.75 0 100 1.5.75.75 0 000-1.5z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M10 1.5a.75.75 0 01.75.75v9.69l2.97-2.97a.75.75 0 011.06 1.06l-4.25 4.25a.75.75 0 01-1.06 0L5.22 10.03a.75.75 0 011.06-1.06l2.97 2.97V2.25A.75.75 0 0110 1.5z" />
      <path d="M3.75 14a.75.75 0 01.75.75V17a.5.5 0 00.5.5h10a.5.5 0 00.5-.5v-2.25a.75.75 0 011.5 0V17a2 2 0 01-2 2H5a2 2 0 01-2-2v-2.25a.75.75 0 01.75-.75z" />
    </svg>
  );
}

function PrintIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M5 4a2 2 0 012-2h6a2 2 0 012 2v2h1a2 2 0 012 2v5a2 2 0 01-2 2h-1v1a2 2 0 01-2 2H7a2 2 0 01-2-2v-1H4a2 2 0 01-2-2V8a2 2 0 012-2h1V4zm2 0v2h6V4H7zm0 8v4h6v-4H7z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5z"
        clipRule="evenodd"
      />
      <path
        fillRule="evenodd"
        d="M6.194 12.753a.75.75 0 001.06.053L16.5 4.44v2.81a.75.75 0 001.5 0v-4.5a.75.75 0 00-.75-.75h-4.5a.75.75 0 000 1.5h2.553L6.14 11.693a.75.75 0 00.053 1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}

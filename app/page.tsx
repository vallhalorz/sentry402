"use client";

import { useEffect, useState } from "react";
import type {
  ChainName,
  CounterpartyAggregate,
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

type Tab = "screening" | "counterparties" | "firewall";

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
  const [tab, setTab] = useState<Tab>("screening");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
      // Read tab from URL hash so the tab is shareable.
      const h = window.location.hash.replace("#", "");
      if (h === "counterparties" || h === "screening" || h === "firewall") setTab(h);
    }
    setRecents(loadRecents());
  }, []);

  function changeTab(next: Tab) {
    setTab(next);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${next}`);
    }
  }

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
            <span>Live demo · Multi-chain · Pay-per-call via x402</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight">
            Wallet risk, defensible to a regulator.
          </h1>
          <p className="text-ink-500 text-lg leading-relaxed max-w-2xl">
            Paste any wallet — EVM or Solana. Sentry402 returns a cited risk dossier. Every flag
            links to the exact{" "}
            <a href="https://goldrush.dev" target="_blank" rel="noreferrer" className="border-b border-ink-300 hover:text-accent-dark hover:border-accent-dark transition-colors">GoldRush</a>{" "}
            (EVM) or{" "}
            <a href="https://www.helius.dev" target="_blank" rel="noreferrer" className="border-b border-ink-300 hover:text-accent-dark hover:border-accent-dark transition-colors">Helius DAS</a>{" "}
            (Solana) API call, transaction hash, and dataset version that produced it. Built for
            compliance teams who need defensible scoring without a $30K enterprise contract.
          </p>
        </div>
      </section>

      <StackSection />

      <TabNav tab={tab} onChange={changeTab} />

      {tab === "screening" && (
        <>
          <SeverityLegend />
          <MiniFAQ />
        </>
      )}

      {tab !== "firewall" && (
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
              <option value="solana-mainnet">Solana</option>
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
              tone="critical"
              label="OFAC SDN (Solana)"
              note="DPRK SB0416 cross-listed, 2026-03-12 — full Helius coverage"
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
      )}

      {tab !== "firewall" && error && (
        <div
          role="alert"
          className="rounded-lg border-l-4 border-signal-high bg-signal-high/5 p-4 text-sm text-ink-700"
        >
          <p className="font-medium text-signal-high">Scan failed</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {tab !== "firewall" && loading && <DossierSkeleton />}
      {dossier && tab === "screening" && <DossierView d={dossier} />}
      {dossier && tab === "counterparties" && <CounterpartyExposureView d={dossier} />}
      {!dossier && !loading && tab === "counterparties" && (
        <div className="rounded-xl border border-paper-200 bg-paper-100 p-8 text-center space-y-2">
          <p className="text-sm text-ink-700 font-medium">No wallet scanned yet</p>
          <p className="text-xs text-ink-500 max-w-md mx-auto leading-relaxed">
            Paste a wallet above and click &ldquo;Generate dossier&rdquo;. The counterparty
            exposure view will populate with the unique counterparty list aggregated from the
            most recent ~100 transactions, with one-click CSV export for bulk screening.
          </p>
        </div>
      )}

      {tab === "firewall" && <FirewallView origin={origin} />}

      {tab === "screening" && (
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
      )}
    </div>
  );
}

function TabNav({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const tabs: Array<{ id: Tab; label: string; sublabel: string }> = [
    {
      id: "screening",
      label: "Screening",
      sublabel: "Cited risk dossier on a single wallet",
    },
    {
      id: "counterparties",
      label: "Counterparty exposure",
      sublabel: "Full counterparty list with one-click CSV export",
    },
    {
      id: "firewall",
      label: "Firewall",
      sublabel: "x402 pre-flight verdict for AI agents · $0.02 / call",
    },
  ];
  return (
    <nav
      className="rounded-xl border border-paper-200 bg-white p-1 shadow-card flex gap-1 no-print"
      role="tablist"
      aria-label="Sentry402 modes"
    >
      {tabs.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`flex-1 rounded-lg px-4 py-3 text-left transition ${
              active
                ? "bg-ink-900 text-paper-50"
                : "text-ink-700 hover:bg-paper-100"
            }`}
          >
            <div className="text-sm font-semibold tracking-tight">{t.label}</div>
            <div
              className={`text-[11px] mt-0.5 ${
                active ? "text-paper-200" : "text-ink-400"
              }`}
            >
              {t.sublabel}
            </div>
          </button>
        );
      })}
    </nav>
  );
}

function CounterpartyExposureView({ d }: { d: RiskDossier }) {
  const counterparties = d.subject.counterparties ?? [];
  const hasData = counterparties.length > 0;
  const totalIn = counterparties.reduce((s, c) => s + c.inbound_usd_total, 0);
  const totalOut = counterparties.reduce((s, c) => s + c.outbound_usd_total, 0);
  const totalInteractions = counterparties.reduce(
    (s, c) => s + c.inbound_count + c.outbound_count,
    0,
  );
  const inboundOnly = counterparties.filter(
    (c) => c.inbound_count > 0 && c.outbound_count === 0,
  ).length;
  const outboundOnly = counterparties.filter(
    (c) => c.outbound_count > 0 && c.inbound_count === 0,
  ).length;
  const both = counterparties.filter(
    (c) => c.inbound_count > 0 && c.outbound_count > 0,
  ).length;

  function downloadCsv() {
    const csv = buildCounterpartyCsv(counterparties, d.subject.wallet, d.subject.chain);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safe = d.subject.wallet.slice(0, 10);
    a.download = `sentry402-counterparties-${d.subject.chain}-${safe}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <article className="space-y-6 animate-in fade-in duration-300">
      <header className="rounded-xl border border-paper-200 bg-white p-6 shadow-card flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-xs uppercase tracking-wider text-ink-400 font-medium">
            Counterparty exposure for
          </p>
          {d.subject.label && (
            <p className="text-base font-semibold text-ink-900">{d.subject.label}</p>
          )}
          <a
            href={addressUrl(d.subject.chain, d.subject.wallet)}
            target="_blank"
            rel="noreferrer"
            className="hash text-sm text-ink-700 hover:text-brand hover:underline transition break-all"
            title={`Open on ${explorerName(d.subject.chain)}`}
          >
            {d.subject.wallet}
          </a>
          <p className="text-xs text-ink-500">
            {d.subject.chain} · sampled from the most recent ~100 transactions
          </p>
        </div>
        <button
          type="button"
          onClick={downloadCsv}
          disabled={!hasData}
          className="inline-flex items-center gap-2 rounded-lg bg-ink-900 text-paper-50 px-5 py-2.5 text-sm font-medium hover:bg-ink-800 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0 no-print"
        >
          <svg aria-hidden viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
            <path d="M8 1.5a.75.75 0 01.75.75v7.69l1.97-1.97a.75.75 0 011.06 1.06l-3.25 3.25a.75.75 0 01-1.06 0L4.22 9.03a.75.75 0 011.06-1.06l1.97 1.97V2.25A.75.75 0 018 1.5z" />
            <path d="M3 12.5a.75.75 0 01.75.75V14a.5.5 0 00.5.5h7.5a.5.5 0 00.5-.5v-.75a.75.75 0 011.5 0V14a2 2 0 01-2 2h-7.5a2 2 0 01-2-2v-.75a.75.75 0 01.75-.75z" />
          </svg>
          Download CSV ({counterparties.length} {counterparties.length === 1 ? "row" : "rows"})
        </button>
      </header>

      {!hasData ? (
        <div className="rounded-xl border border-paper-200 bg-paper-100 p-8 text-center">
          <p className="text-sm text-ink-700 font-medium">No counterparties detected</p>
          <p className="text-xs text-ink-500 max-w-md mx-auto leading-relaxed mt-2">
            The first-page transaction sample for this wallet returned no counterparty addresses.
            This is unusual — it can happen with brand-new wallets, contract addresses with no
            external transfers, or chains where GoldRush coverage is limited.
          </p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              label="Unique counterparties"
              value={counterparties.length.toString()}
              tone="info"
            />
            <StatCard
              label="Total interactions"
              value={totalInteractions.toString()}
              tone="info"
              sub={`${inboundOnly} inbound-only · ${outboundOnly} outbound-only · ${both} both`}
            />
            <StatCard
              label="Inbound USD"
              value={`$${totalIn.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              tone="low"
            />
            <StatCard
              label="Outbound USD"
              value={`$${totalOut.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
              tone="high"
            />
          </section>

          <section className="rounded-xl border border-paper-200 bg-white shadow-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-paper-100 text-[10px] uppercase tracking-wider text-ink-500">
                  <tr>
                    <th className="text-left font-medium px-4 py-3">Counterparty</th>
                    <th className="text-right font-medium px-3 py-3">In</th>
                    <th className="text-right font-medium px-3 py-3">Out</th>
                    <th className="text-right font-medium px-3 py-3">Inbound USD</th>
                    <th className="text-right font-medium px-3 py-3">Outbound USD</th>
                    <th className="text-right font-medium px-3 py-3">Net (out − in)</th>
                    <th className="text-right font-medium px-4 py-3">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-paper-200">
                  {counterparties.map((c) => {
                    const net = c.outbound_usd_total - c.inbound_usd_total;
                    const netColor =
                      net > 0
                        ? "text-signal-high"
                        : net < 0
                          ? "text-signal-low"
                          : "text-ink-500";
                    return (
                      <tr key={c.address} className="hover:bg-paper-100/40 transition">
                        <td className="px-4 py-3 align-top">
                          {c.label && (
                            <p className="text-sm font-medium text-ink-900 truncate max-w-[260px]">
                              {c.label}
                            </p>
                          )}
                          <a
                            href={addressUrl(d.subject.chain, c.address)}
                            target="_blank"
                            rel="noreferrer"
                            className="hash text-[11px] text-ink-500 hover:text-brand hover:underline transition truncate block max-w-[260px]"
                            title={c.address}
                          >
                            {c.address}
                          </a>
                        </td>
                        <td className="text-right px-3 py-3 tabular-nums text-signal-low">
                          {c.inbound_count > 0 ? c.inbound_count : "—"}
                        </td>
                        <td className="text-right px-3 py-3 tabular-nums text-signal-high">
                          {c.outbound_count > 0 ? c.outbound_count : "—"}
                        </td>
                        <td className="text-right px-3 py-3 tabular-nums hash text-ink-700">
                          ${c.inbound_usd_total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td className="text-right px-3 py-3 tabular-nums hash text-ink-700">
                          ${c.outbound_usd_total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td className={`text-right px-3 py-3 tabular-nums hash ${netColor}`}>
                          {net >= 0 ? "+" : ""}
                          ${Math.abs(net).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </td>
                        <td className="text-right px-4 py-3 text-xs text-ink-500">
                          {c.last_seen_at ? timeAgo(c.last_seen_at) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-lg border border-paper-200 bg-paper-100/50 px-4 py-3 text-xs text-ink-500 leading-relaxed">
            <p>
              <strong className="text-ink-700">CSV columns:</strong> address, label, inbound_count,
              outbound_count, inbound_usd_total, outbound_usd_total, net_outbound_usd,
              first_seen_utc, last_seen_utc. The CSV header includes meta lines (#-prefixed) with
              subject_wallet, chain, generated_at, and unique_counterparties for provenance when
              the file is opened in a spreadsheet.
            </p>
          </section>
        </>
      )}
    </article>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone: Severity;
}) {
  const toneClasses: Record<Severity, string> = {
    info: "border-signal-info/30 bg-signal-info/5",
    low: "border-signal-low/30 bg-signal-low/5",
    medium: "border-signal-medium/30 bg-signal-medium/5",
    high: "border-signal-high/30 bg-signal-high/5",
    critical: "border-signal-critical/30 bg-signal-critical/5",
  };
  return (
    <div className={`rounded-xl border ${toneClasses[tone]} p-4`}>
      <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink-900 tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-ink-500 mt-1 leading-snug">{sub}</p>}
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

function MiniFAQ() {
  const faqs = [
    {
      q: "What does Sentry402 NOT do?",
      a: "Sentry402 is read-only. It does not freeze funds, broadcast transactions, take custody, or contact regulators on your behalf. It produces a deterministic, citation-bound dossier that a compliance officer uses to decide on next action under their own firm's policies.",
    },
    {
      q: "Is this legal advice?",
      a: "No. The action recommendations are generic compliance heuristics aligned with FATF / FinCEN / MiCA conventions. Apply your firm's policies and consult counsel before acting on any indicator. The disclaimer is in every dossier and the SAR-style PDF export.",
    },
    {
      q: "How do I integrate the API?",
      a: "Two endpoints. /api/risk is free for the dashboard. /api/risk/paid is x402-gated at $0.05 per dossier on Base Sepolia, designed for AI agents and production integrations. See the curl examples in the Agent rail section below the form.",
    },
    {
      q: "How is this different from Chainalysis or TRM?",
      a: "Sentry402 is built around citation-or-die: every score component traces to a specific GoldRush API call, transaction hash, and pinned dataset version, so a compliance officer can reproduce the dossier and defend it in front of a regulator. The full rule pack is open and inspectable. No $30K seat, no opaque attribution graph.",
    },
  ];
  return (
    <details className="rounded-xl border border-paper-200 bg-white shadow-card no-print group">
      <summary className="cursor-pointer select-none px-5 py-3 flex items-center gap-3 text-sm">
        <span aria-hidden className="inline-flex items-center justify-center h-6 w-6 rounded bg-reg-fincen/10 text-reg-fincen">
          <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
            <path
              fillRule="evenodd"
              d="M5.55 5.55a2.5 2.5 0 014.9.9c0 1.5-1.5 2-1.95 2.85V10h-1V9c0-1 1.5-1.6 1.95-2.55a1.5 1.5 0 10-2.95-.4l-.95.5zM8 12.5a.75.75 0 100-1.5.75.75 0 000 1.5z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <span className="font-medium text-ink-700">Frequently asked</span>
        <span className="text-xs text-ink-400 ml-auto group-open:hidden">Show 4 questions</span>
        <span className="text-xs text-ink-400 ml-auto hidden group-open:inline">Hide</span>
      </summary>
      <div className="px-5 pb-4 pt-2 border-t border-paper-200 space-y-4">
        {faqs.map((f) => (
          <div key={f.q}>
            <p className="text-sm font-medium text-ink-900">{f.q}</p>
            <p className="text-sm text-ink-700 leading-relaxed mt-1">{f.a}</p>
          </div>
        ))}
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
      <div
        className="flex h-3 rounded-full overflow-hidden bg-paper-100"
        role="img"
        aria-label="Score breakdown by signal"
      >
        {sorted.map((s) => (
          <div
            key={s.id}
            title={`${humanizeSignalType(s.type)}: +${s.score_contribution}`}
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
            <span className="text-ink-700 truncate" title={s.type}>
              {humanizeSignalType(s.type)}
            </span>
            <span className="ml-auto tabular-nums text-ink-700 font-medium">
              +{s.score_contribution}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SubjectContext({ d }: { d: RiskDossier }) {
  const hasHoldings = (d.subject.holdings?.length ?? 0) > 0;
  const hasActivity = (d.subject.recent_activity?.length ?? 0) > 0;
  if (!hasHoldings && !hasActivity) return null;
  return (
    <section className="grid lg:grid-cols-2 gap-4 items-start">
      {hasHoldings && <HoldingsCard holdings={d.subject.holdings ?? []} chain={d.subject.chain} />}
      {hasActivity && <ActivityCard activity={d.subject.recent_activity ?? []} chain={d.subject.chain} />}
    </section>
  );
}

function buildCounterpartyCsv(
  rows: CounterpartyAggregate[],
  subjectWallet: string,
  chain: ChainName,
): string {
  const header = [
    "address",
    "label",
    "inbound_count",
    "outbound_count",
    "inbound_usd_total",
    "outbound_usd_total",
    "net_outbound_usd",
    "first_seen_utc",
    "last_seen_utc",
  ].join(",");
  const meta = [
    `# Sentry402 counterparty export`,
    `# subject_wallet=${subjectWallet}`,
    `# chain=${chain}`,
    `# generated_at=${new Date().toISOString()}`,
    `# unique_counterparties=${rows.length}`,
  ].join("\n");
  const lines = rows.map((r) =>
    [
      r.address,
      csvEscape(r.label ?? ""),
      r.inbound_count.toString(),
      r.outbound_count.toString(),
      r.inbound_usd_total.toFixed(2),
      r.outbound_usd_total.toFixed(2),
      (r.outbound_usd_total - r.inbound_usd_total).toFixed(2),
      r.first_seen_at,
      r.last_seen_at,
    ].join(","),
  );
  return [meta, header, ...lines].join("\n");
}

function csvEscape(s: string): string {
  if (s == null) return "";
  if (/[,"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
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

const SIGNAL_TYPE_HUMAN: Record<string, string> = {
  ofac_direct_match: "OFAC direct match",
  sanctions_adjacency: "Sanctions adjacency",
  approval_value_at_risk: "Approval value-at-risk",
  unlimited_approval: "Unlimited approval",
  drainer_pattern: "Drainer pattern signature",
  tornado_cash_historic_exposure: "Tornado Cash historic exposure",
  counterparty_concentration: "Counterparty concentration",
  fresh_wallet: "Fresh wallet",
  stale_wallet_reactivation: "Stale wallet reactivation",
  mev_exposure: "MEV exposure",
  bridge_exposure: "Bridge exposure",
  mixer_proximity: "Mixer proximity",
  high_velocity: "High transaction velocity",
  structuring_pattern: "Structuring pattern",
  coverage_advisory: "Coverage advisory",
  stablecoin_issuer_compliance: "Stablecoin issuer compliance profile",
  stablecoin_non_cooperative_issuer: "Non-cooperative stablecoin issuer",
  stablecoin_mica_emt_non_compliant: "MiCA EMT non-compliant",
  stablecoin_issuer_frozen_match: "Issuer-frozen counterparty",
  stablecoin_velocity_typology: "Stablecoin velocity typology",
  stablecoin_dprk_cluster_proximity: "DPRK stablecoin cluster proximity",
};

function humanizeSignalType(type: string): string {
  return (
    SIGNAL_TYPE_HUMAN[type] ??
    type
      .split("_")
      .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : ""))
      .join(" ")
  );
}

function SignalsList({ d }: { d: RiskDossier }) {
  const evidenceCount = Object.keys(d.evidence).length;
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
        <div className="rounded-lg border border-paper-200 bg-paper-100 p-6 space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center h-6 w-6 rounded bg-signal-low/15 text-signal-low">
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path
                  fillRule="evenodd"
                  d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zm3.5 5.354L7.5 11.146 4.5 8.146l1.146-1.146L7.5 8.854l2.854-2.854L11.5 6.854z"
                  clipRule="evenodd"
                />
              </svg>
            </span>
            <p className="font-medium text-sm text-ink-900">No indicators triggered</p>
          </div>
          <p className="text-sm text-ink-700 leading-relaxed">
            The subject wallet was checked against all 15 rules in rule pack{" "}
            <code className="hash text-xs bg-white px-1 py-0.5 rounded">
              {d.metadata.rule_pack_version}
            </code>{" "}
            and none triggered against the active datasets. {evidenceCount} GoldRush API call
            {evidenceCount === 1 ? "" : "s"} were captured and remain attached as evidence to
            satisfy the FCA 2024 documentation requirement.
          </p>
          <p className="text-xs text-ink-400 leading-relaxed">
            This is a clean dossier under the current rule pack and dataset versions. It does not
            mean the wallet is risk-free in absolute terms; new rules, list updates, or fresh
            on-chain activity may change the result on a re-scan.
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
                  <span
                    className="text-sm font-medium text-ink-700"
                    title={`Signal type id: ${s.type}`}
                  >
                    {humanizeSignalType(s.type)}
                  </span>
                  <span className="hash text-[10px] text-ink-400 uppercase tracking-wider">
                    {s.type}
                  </span>
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
    { id: "coverage_advisory", severity: "info", weight: 0, purpose: "Coverage notice: which data sources were sampled. Helius DAS on Solana, GoldRush on EVM." },
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

/* ============================================================
 * Firewall tab — pre-flight x402 verdict for AI agents
 * Same risk engine as Screening, different surface and price.
 * ============================================================ */
type Verdict = "allow" | "warn" | "block";
type FirewallResp = {
  verdict: Verdict;
  score: number;
  severity: Severity;
  reasoning: string;
  signals: Array<{
    id: string;
    type: string;
    severity: Severity;
    title: string;
    rationale: string;
    fatf_reference?: string;
    fincen_reference?: string;
    score_contribution: number;
  }>;
  metadata: {
    rule_pack_version: string;
    sdn_list_version: string;
    rule_pack_sha256?: string;
    generation_id?: string;
    generated_at?: string;
  };
  latency_ms: number;
};

const VERDICT_LABEL: Record<Verdict, string> = {
  allow: "ALLOW",
  warn: "WARN",
  block: "BLOCK",
};
const VERDICT_BG: Record<Verdict, string> = {
  allow: "bg-signal-low",
  warn: "bg-signal-medium",
  block: "bg-signal-critical",
};
const VERDICT_TEXT: Record<Verdict, string> = {
  allow: "text-signal-low",
  warn: "text-signal-medium",
  block: "text-signal-critical",
};
const VERDICT_BORDER: Record<Verdict, string> = {
  allow: "border-signal-low/40",
  warn: "border-signal-medium/40",
  block: "border-signal-critical/50",
};

function FirewallView({ origin }: { origin: string }) {
  const [chain, setChain] = useState<ChainName>("eth-mainnet");
  const [toAddress, setToAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FirewallResp | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(
        `/api/screen?chain=${encodeURIComponent(chain)}&to_address=${encodeURIComponent(toAddress.trim())}`,
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const data: FirewallResp = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 no-print">
      {/* Intro card */}
      <section className="rounded-xl border border-brand/20 bg-gradient-to-br from-paper-100 to-white p-6 space-y-3 shadow-card">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-brand/10 text-brand">
            <ShieldIcon />
          </span>
          <h2 className="text-sm uppercase tracking-wider text-ink-500 font-medium">
            Sentry402 Firewall · pre-flight verdict for AI agents
          </h2>
        </div>
        <p className="text-sm text-ink-700 leading-relaxed">
          The Screening tab is for compliance officers reading a full RiskDossier.
          The Firewall tab is for AI agents that need a single{" "}
          <code className="hash text-xs bg-paper-100 px-1.5 py-0.5 rounded">verdict</code>{" "}
          before signing a transfer. Same 16-rule engine, same citation-bound output,
          but distilled to <code className="hash text-xs bg-paper-100 px-1.5 py-0.5 rounded">allow / warn / block</code>{" "}
          and gated at $0.02 per call via x402. Multi-chain coverage:{" "}
          <span className="text-ink-900 font-medium">EVM</span> via{" "}
          <a href="https://goldrush.dev" target="_blank" rel="noreferrer" className="text-accent-dark hover:text-accent border-b border-ink-300">GoldRush</a>{" "}
          and <span className="text-ink-900 font-medium">Solana</span> via{" "}
          <a href="https://www.helius.dev" target="_blank" rel="noreferrer" className="text-accent-dark hover:text-accent border-b border-ink-300">Helius DAS</a>.
        </p>
        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <a
            href="https://github.com/vallhalorz/sentry402/tree/main/eliza-plugin"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-brand/30 bg-brand/5 text-brand hover:bg-brand/10 transition-colors"
          >
            <span className="hash text-[11px]">@sentry402/eliza-plugin</span>
            <span className="text-ink-500">→ ElizaOS agents drop-in</span>
          </a>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-paper-100 border border-paper-200 text-ink-500">
            <span className="hash text-[11px]">npm install</span>
            <span className="hidden sm:inline">— SAFE_TRANSFER_SOL, SAFE_TRANSFER_ETH, …</span>
          </span>
        </div>
        <p className="text-xs text-ink-500 leading-relaxed pt-1">
          Previously published as a separate product, AgentGuard402. Merged into
          Sentry402 on 2026-05-08.
        </p>
      </section>

      {/* Playground */}
      <section className="rounded-xl border border-paper-200 bg-white p-5 shadow-card space-y-4">
        <form onSubmit={check} className="space-y-4">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-500 font-medium mb-2 block">
              Destination address (where the agent is about to send funds)
            </span>
            <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3">
              <input
                type="text"
                value={toAddress}
                onChange={(e) => setToAddress(e.target.value)}
                placeholder="0x… "
                required
                aria-label="Destination address"
                className="hash rounded-lg border border-paper-200 px-4 py-2.5 outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 transition"
              />
              <select
                value={chain}
                onChange={(e) => setChain(e.target.value as ChainName)}
                aria-label="Chain"
                className="rounded-lg border border-paper-200 px-3 py-2.5 bg-white cursor-pointer hover:border-ink-400 transition text-sm"
              >
                <option value="eth-mainnet">Ethereum</option>
                <option value="base-mainnet">Base</option>
                <option value="matic-mainnet">Polygon</option>
                <option value="bsc-mainnet">BNB Chain</option>
                <option value="arbitrum-mainnet">Arbitrum</option>
                <option value="optimism-mainnet">Optimism</option>
                <option value="solana-mainnet">Solana</option>
              </select>
              <button
                type="submit"
                disabled={loading || !toAddress}
                className="rounded-lg bg-ink-900 text-paper-50 px-5 py-2.5 font-medium hover:bg-ink-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {loading ? "Checking…" : "Pre-flight"}
              </button>
            </div>
          </label>

          <div className="space-y-2 pt-2 border-t border-paper-200">
            <p className="text-xs uppercase tracking-wider text-ink-500 font-medium">
              Quick demos
            </p>
            <div className="flex flex-wrap gap-2">
              <FirewallDemoChip onPick={setToAddress} addr="0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D" tone="block" label="Amnokgang DPRK" expected="block" />
              <FirewallDemoChip onPick={setToAddress} addr="0xd04E33461FEA8302c5E1e13895b60cEe8AEfda7F" tone="block" label="Sim Hyon Sop" expected="block" />
              <FirewallDemoChip onPick={setToAddress} addr="0x722122dF12D4e14e13Ac3b6895a86e84145b6967" tone="warn" label="TC Router (historic)" expected="allow" />
              <FirewallDemoChip onPick={setToAddress} addr="0x28C6c06298d514Db089934071355E5743bf21d60" tone="allow" label="Binance 14" expected="allow" />
              <FirewallDemoChip onPick={setToAddress} addr="0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" tone="allow" label="vitalik.eth" expected="allow" />
            </div>
          </div>
        </form>
      </section>

      {error && (
        <div role="alert" className="rounded-lg border-l-4 border-signal-high bg-signal-high/5 p-4 text-sm text-ink-700">
          <p className="font-medium text-signal-high">Pre-flight failed</p>
          <p className="mt-1 hash text-xs">{error}</p>
        </div>
      )}

      {result && <FirewallVerdictView r={result} />}

      {/* API spec block */}
      <section className="rounded-xl border border-paper-200 bg-white p-6 space-y-4 shadow-card">
        <div>
          <h3 className="text-sm uppercase tracking-wider text-ink-500 font-medium mb-1">
            Two endpoints. Same engine.
          </h3>
          <p className="text-sm text-ink-700 leading-relaxed">
            Free preview for evaluation. x402-gated production endpoint for agents.
            Identical response shape — what you build against on the free tier works
            in production.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-paper-200 text-left text-xs uppercase tracking-wider text-ink-500">
                <th className="py-2 pr-3 font-medium">Method · Path</th>
                <th className="py-2 pr-3 font-medium">Auth</th>
                <th className="py-2 pr-3 font-medium">Price</th>
                <th className="py-2 font-medium">Use</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-paper-200">
                <td className="py-3 pr-3">
                  <span className="hash text-ink-900">GET /api/screen</span>
                  <div className="text-[11px] text-ink-500 mt-0.5">?chain=eth-mainnet&amp;to_address=0x…</div>
                </td>
                <td className="py-3 pr-3 text-xs text-ink-700">none</td>
                <td className="py-3 pr-3 hash text-xs text-signal-low">free</td>
                <td className="py-3 text-xs text-ink-700">Evaluation, landing, dev.</td>
              </tr>
              <tr className="border-b border-paper-200">
                <td className="py-3 pr-3">
                  <span className="hash text-ink-900">POST /api/preflight</span>
                  <div className="text-[11px] text-ink-500 mt-0.5">X-PAYMENT: &lt;signed x402 USDC&gt;</div>
                </td>
                <td className="py-3 pr-3 hash text-xs text-ink-700">x402</td>
                <td className="py-3 pr-3 hash text-xs text-signal-critical">$0.02 USDC</td>
                <td className="py-3 text-xs text-ink-700">Production agent endpoint. Base Sepolia.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <pre className="hash text-xs bg-ink-900 text-paper-50 border border-ink-700 rounded-lg p-4 overflow-x-auto leading-relaxed">
{`// agent.ts — TypeScript integration
async function safeTransfer(to, usd) {
  const r = await fetch('${origin}/api/preflight', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-PAYMENT': await signX402Payment(),
    },
    body: JSON.stringify({
      chain: 'eth-mainnet',
      to_address: to, amount_usd: usd,
    }),
  }).then(r => r.json());

  if (r.verdict === 'block') throw r;
  if (r.verdict === 'warn') return queueForApproval(r);
  return agent.transfer(to, usd);
}`}
        </pre>

        {/* Verdict spec */}
        <div className="space-y-2 pt-2">
          <h4 className="text-xs uppercase tracking-wider text-ink-500 font-medium">
            Verdict spec · agent action per severity
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-paper-200 text-left text-xs uppercase tracking-wider text-ink-500">
                  <th className="py-2 pr-3 font-medium">Severity</th>
                  <th className="py-2 pr-3 font-medium">Verdict</th>
                  <th className="py-2 font-medium">Recommended agent action</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-paper-200">
                  <td className="py-2 pr-3 hash text-xs uppercase text-signal-critical font-semibold">critical</td>
                  <td className="py-2 pr-3 hash text-xs text-signal-critical font-semibold">block</td>
                  <td className="py-2 text-xs text-ink-700">Abort transfer. Do not retry. Log <code className="hash">generation_id</code>; route to SAR queue.</td>
                </tr>
                <tr className="border-b border-paper-200">
                  <td className="py-2 pr-3 hash text-xs uppercase text-signal-high">high</td>
                  <td className="py-2 pr-3 hash text-xs text-signal-critical">block</td>
                  <td className="py-2 text-xs text-ink-700">Abort. Optional: human override only.</td>
                </tr>
                <tr className="border-b border-paper-200">
                  <td className="py-2 pr-3 hash text-xs uppercase text-signal-medium">medium</td>
                  <td className="py-2 pr-3 hash text-xs text-signal-medium">warn</td>
                  <td className="py-2 text-xs text-ink-700">Queue for human approval; attach the dossier and signals.</td>
                </tr>
                <tr className="border-b border-paper-200">
                  <td className="py-2 pr-3 hash text-xs uppercase text-ink-500">low</td>
                  <td className="py-2 pr-3 hash text-xs text-signal-low">allow</td>
                  <td className="py-2 text-xs text-ink-700">Proceed under normal policy. Persist <code className="hash">generation_id</code>.</td>
                </tr>
                <tr>
                  <td className="py-2 pr-3 hash text-xs uppercase text-ink-500">info</td>
                  <td className="py-2 pr-3 hash text-xs text-signal-low">allow</td>
                  <td className="py-2 text-xs text-ink-700">Proceed.</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-ink-500 italic max-w-prose">
            Bias toward <code className="hash">warn</code> is intentional. FATF&apos;s
            risk-based approach and FinCEN April 2026 NPRM both prefer enhanced review
            over hard blocks at the medium tier.
          </p>
        </div>
      </section>

      {/* Why not the CDP Facilitator */}
      <section className="rounded-xl border border-paper-200 border-l-4 border-l-brand bg-paper-100 p-5 shadow-card">
        <h3 className="text-sm uppercase tracking-wider text-ink-500 font-medium mb-2">
          What about Coinbase&apos;s free check?
        </h3>
        <p className="text-sm text-ink-700 leading-relaxed">
          Coinbase blocks the obvious sanctioned wallets at checkout, for free. Sentry402
          catches the harder cases — wallets that <em>funded</em> a sanctioned address,
          wallets on EU/UK lists Coinbase doesn&apos;t track, wallets just drained by phishing.
          We don&apos;t replace it; we sit beside it.
        </p>
      </section>
    </div>
  );
}

function FirewallDemoChip({
  onPick, addr, tone, label, expected,
}: {
  onPick: (s: string) => void;
  addr: string;
  tone: "allow" | "warn" | "block";
  label: string;
  expected: Verdict;
}) {
  const cls =
    tone === "block"
      ? "bg-signal-critical/10 text-signal-critical border-signal-critical/30 hover:bg-signal-critical/15"
      : tone === "warn"
        ? "bg-signal-medium/10 text-signal-medium border-signal-medium/30 hover:bg-signal-medium/15"
        : "bg-signal-low/10 text-signal-low border-signal-low/30 hover:bg-signal-low/15";
  return (
    <button
      type="button"
      onClick={() => onPick(addr)}
      title={addr}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium transition ${cls}`}
    >
      <span aria-hidden className="hash text-[11px] opacity-80">
        {addr.slice(0, 6)}…{addr.slice(-4)}
      </span>
      <span className="text-ink-700">{label}</span>
      <span className="text-ink-400">→ {expected}</span>
    </button>
  );
}

function FirewallVerdictView({ r }: { r: FirewallResp }) {
  const v = r.verdict;
  return (
    <article className="space-y-4 animate-in fade-in duration-300">
      <header className={`rounded-xl border-l-4 ${VERDICT_BORDER[v]} bg-white p-6 shadow-card flex items-center gap-5`}>
        <div className={`inline-flex items-center justify-center h-16 w-16 rounded-full ${VERDICT_BG[v]} text-white shrink-0`}>
          {v === "block" && (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z" />
            </svg>
          )}
          {v === "warn" && (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
              <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
            </svg>
          )}
          {v === "allow" && (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-2xl sm:text-3xl font-bold tracking-tight ${VERDICT_TEXT[v]}`}>
            {VERDICT_LABEL[v]}
          </p>
          <p className="text-xs uppercase tracking-wider text-ink-400 font-medium mt-1 hash">
            severity {r.severity} · score {r.score}/100 · {r.latency_ms}ms · pack {r.metadata.rule_pack_version}
          </p>
          <p className="text-sm text-ink-700 mt-2 leading-relaxed">{r.reasoning}</p>
        </div>
      </header>

      {r.signals.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wider text-ink-500 font-medium">
            Cited signals · {r.signals.length}
          </h3>
          <ul className="space-y-2">
            {r.signals.slice(0, 6).map((s) => (
              <li key={s.id} className="rounded-lg border border-paper-200 bg-white p-3 shadow-card">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="uppercase tracking-wider font-semibold text-ink-700">{s.severity}</span>
                  <span className="hash text-ink-500">{s.type}</span>
                  <span className="ml-auto tabular-nums font-semibold text-ink-700 hash">+{s.score_contribution}</span>
                </div>
                <p className="text-sm font-medium text-ink-900 mt-1">{s.title}</p>
                <p className="text-xs text-ink-500 mt-1 leading-relaxed line-clamp-3">{s.rationale}</p>
                {(s.fatf_reference || s.fincen_reference) && (
                  <p className="hash text-[10.5px] text-ink-500 mt-2 italic">
                    {s.fatf_reference} {s.fincen_reference ? `· ${s.fincen_reference}` : ""}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

/* ============================================================
 * StackSection — 4-card monochrome integrations strip
 * (GoldRush · Helius · x402 · ElizaOS)
 *
 * Logos are stylized monochrome SVG approximations, not exact brand
 * marks. Hover lifts to accent color so the editorial palette holds.
 * ============================================================ */
function StackSection() {
  const items: Array<{
    name: string;
    role: string;
    detail: string;
    href: string;
    icon: React.ReactNode;
  }> = [
    {
      name: "GoldRush",
      role: "EVM data",
      detail: "6 chains · approvals · tx history",
      href: "https://goldrush.dev",
      icon: <GoldRushIcon />,
    },
    {
      name: "Helius",
      role: "Solana data",
      detail: "DAS · enhanced tx · counterparty",
      href: "https://www.helius.dev",
      icon: <HeliusIcon />,
    },
    {
      name: "x402",
      role: "Payment rail",
      detail: "$0.02–$0.05 USDC · Base Sepolia",
      href: "https://x402.org",
      icon: <X402Icon />,
    },
    {
      name: "ElizaOS",
      role: "Agent SDK",
      detail: "@sentry402/eliza-plugin · npm",
      href: "https://github.com/vallhalorz/sentry402/tree/main/eliza-plugin",
      icon: <ElizaIcon />,
    },
  ];
  return (
    <section className="no-print">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-[0.16em] text-ink-400 font-semibold">
          Stack
        </span>
        <span className="text-ink-300 text-xs">·</span>
        <span className="text-xs text-ink-500">data, rail, distribution</span>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((it) => (
          <a
            key={it.name}
            href={it.href}
            target="_blank"
            rel="noreferrer"
            className="group rounded-lg border border-paper-200 bg-white p-4 hover:border-ink-400 hover:shadow-card transition-all"
          >
            <div className="flex items-center gap-2.5 mb-2">
              <span className="inline-flex items-center justify-center h-7 w-7 text-ink-700 group-hover:text-accent-dark transition-colors">
                {it.icon}
              </span>
              <span className="text-sm font-semibold tracking-tight text-ink-900">
                {it.name}
              </span>
            </div>
            <p className="text-xs text-ink-700 font-medium">{it.role}</p>
            <p className="text-[11px] text-ink-500 mt-0.5 hash leading-relaxed">
              {it.detail}
            </p>
          </a>
        ))}
      </div>
    </section>
  );
}

/* ---- Stylized monochrome SVG marks ---- */

function GoldRushIcon() {
  // Stylized "G" inside a circle — gold-rush coin reference
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M16.2 9.3C15.5 8 13.9 7.2 12.1 7.2C9.3 7.2 7.2 9.3 7.2 12C7.2 14.7 9.3 16.8 12.1 16.8C14 16.8 15.5 15.8 16.3 14.3H12.3V12.5H17.3V14.5C16.3 16.5 14.4 17.8 12.1 17.8C8.6 17.8 6 15.2 6 12C6 8.7 8.6 6 12.1 6C14.4 6 16.4 7.2 17.3 8.9L16.2 9.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function HeliusIcon() {
  // Sun / radial burst — Helius is named for the Greek sun
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <line x1="12" y1="2.5" x2="12" y2="5.5" />
        <line x1="12" y1="18.5" x2="12" y2="21.5" />
        <line x1="2.5" y1="12" x2="5.5" y2="12" />
        <line x1="18.5" y1="12" x2="21.5" y2="12" />
        <line x1="5.2" y1="5.2" x2="7.3" y2="7.3" />
        <line x1="16.7" y1="16.7" x2="18.8" y2="18.8" />
        <line x1="5.2" y1="18.8" x2="7.3" y2="16.7" />
        <line x1="16.7" y1="7.3" x2="18.8" y2="5.2" />
      </g>
    </svg>
  );
}

function X402Icon() {
  // Stylized "402" wordmark — HTTP 402 Payment Required protocol
  return (
    <svg viewBox="0 0 28 24" fill="none" className="h-5 w-7">
      <text
        x="14"
        y="15"
        textAnchor="middle"
        fontFamily='"JetBrains Mono", ui-monospace, monospace'
        fontSize="11"
        fontWeight="700"
        fill="currentColor"
        letterSpacing="-0.03em"
      >
        402
      </text>
      <line
        x1="3"
        y1="20"
        x2="25"
        y2="20"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ElizaIcon() {
  // Simple chip / agent — geometric frame with two eye-dots
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
      <rect
        x="5"
        y="5"
        width="14"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="9.5" cy="11" r="1.2" fill="currentColor" />
      <circle cx="14.5" cy="11" r="1.2" fill="currentColor" />
      <path
        d="M9.5 15.2c.7.6 1.6 1 2.5 1s1.8-.4 2.5-1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <line x1="2" y1="9" x2="5" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="2" y1="15" x2="5" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="19" y1="9" x2="22" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="19" y1="15" x2="22" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path
        fillRule="evenodd"
        d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zM11 14a1 1 0 11-2 0 1 1 0 012 0zm0-7a1 1 0 10-2 0v3a1 1 0 102 0V7z"
        clipRule="evenodd"
      />
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

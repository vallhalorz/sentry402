"use client";

import { useEffect, useState } from "react";
import type { RiskDossier } from "@/lib/types";

export default function Home() {
  const [wallet, setWallet] = useState("");
  const [chain, setChain] = useState("eth-mainnet");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dossier, setDossier] = useState<RiskDossier | null>(null);
  // Dynamic origin so deployed (vercel.app) curl examples render correctly.
  // SSR-safe default; effect updates after mount.
  const [origin, setOrigin] = useState("http://localhost:3000");
  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin);
  }, []);

  async function runScan(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setDossier(null);
    try {
      const res = await fetch(
        `/api/risk?chain=${encodeURIComponent(chain)}&wallet=${encodeURIComponent(wallet)}`,
      );
      if (!res.ok) {
        const body = await res.text();
        throw new Error(body || `HTTP ${res.status}`);
      }
      const data: RiskDossier = await res.json();
      setDossier(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-10">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          Wallet risk, defensible to a regulator.
        </h1>
        <p className="text-ink-500 max-w-2xl">
          Paste any wallet. Sentry402 returns a cited risk dossier — every flag links to the exact
          GoldRush API call, transaction hash, and dataset version that produced it. Designed for
          compliance teams who can&apos;t afford a $30K Chainalysis seat but still have to defend a
          SAR.
        </p>
      </section>

      <form
        onSubmit={runScan}
        className="rounded-xl border border-paper-200 bg-white p-5 shadow-sm space-y-4"
      >
        <div className="grid sm:grid-cols-[1fr_auto_auto] gap-3">
          <input
            type="text"
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            placeholder="0x… or Solana address"
            required
            className="hash rounded-md border border-paper-200 px-3 py-2 outline-none focus:border-ink-500"
          />
          <select
            value={chain}
            onChange={(e) => setChain(e.target.value)}
            className="rounded-md border border-paper-200 px-3 py-2 bg-white"
          >
            <option value="eth-mainnet">Ethereum</option>
            <option value="base-mainnet">Base</option>
            <option value="matic-mainnet">Polygon</option>
            <option value="bsc-mainnet">BNB Chain</option>
            <option value="arbitrum-mainnet">Arbitrum</option>
            <option value="optimism-mainnet">Optimism</option>
            <option value="solana-mainnet">Solana (balances + advisory)</option>
          </select>
          <button
            type="submit"
            disabled={loading || !wallet}
            className="rounded-md bg-ink-900 text-paper-50 px-4 py-2 disabled:opacity-50"
          >
            {loading ? "Scanning…" : "Generate dossier"}
          </button>
        </div>
        <p className="text-xs text-ink-500 leading-relaxed">
          Demo wallets:{" "}
          <DemoChip onPick={setWallet} addr="0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D" />
          <span className="text-signal-critical font-semibold"> ← OFAC SDN (Amnokgang DPRK, 2026-03-12)</span>
          <br />
          <DemoChip onPick={setWallet} addr="0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" /> (vitalik.eth — clean)
          {" · "}
          <DemoChip onPick={setWallet} addr="DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK" /> (Solana — coverage advisory)
        </p>
      </form>

      {error && (
        <div className="rounded-lg border border-signal-high bg-signal-high/5 p-4 text-sm text-signal-high">
          {error}
        </div>
      )}

      {dossier && <DossierView d={dossier} />}

      <section className="rounded-xl border border-paper-200 bg-paper-100 p-5 text-sm text-ink-700 space-y-2">
        <h2 className="text-xs uppercase tracking-wider text-ink-500">
          Agent rail · pay-per-call via x402
        </h2>
        <p>
          The dashboard above is free for compliance officers to evaluate. AI agents and production integrations
          call <code className="hash text-xs">/api/risk/paid</code> instead — same response, but x402-gated at
          $0.05 per dossier on Base Sepolia. No API key, no signup, no monthly contract.
        </p>
        <pre className="hash text-xs bg-white border border-paper-200 rounded p-3 overflow-x-auto">
{`curl -i '${origin}/api/risk/paid?chain=eth-mainnet&wallet=0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D'
# → HTTP/1.1 402 Payment Required  (no payment attached)
# → x402 payment-required JSON in body

curl -i -H 'X-PAYMENT: <signed-payment-payload>' \\
  '${origin}/api/risk/paid?chain=eth-mainnet&wallet=0xcB74874f1e06Fcf80A306e06e5379A44B488bA2D'
# → HTTP/1.1 200 OK
# → cited RiskDossier JSON (same shape as /api/risk)`}
        </pre>
        <p className="text-xs text-ink-500">
          GoldRush&apos;s own x402 service is also live on Base Sepolia today; mainnet is &ldquo;coming soon&rdquo; per
          their docs. We don&apos;t pretend testnet USDC is real settlement.
        </p>
      </section>
    </div>
  );
}

function DemoChip({ onPick, addr }: { onPick: (s: string) => void; addr: string }) {
  return (
    <button
      type="button"
      onClick={() => onPick(addr)}
      className="hash text-xs underline hover:text-ink-900"
    >
      {addr.slice(0, 6)}…{addr.slice(-4)}
    </button>
  );
}

function DossierView({ d }: { d: RiskDossier }) {
  const sevColor = {
    info: "bg-signal-info",
    low: "bg-signal-low",
    medium: "bg-signal-medium",
    high: "bg-signal-high",
    critical: "bg-signal-critical",
  }[d.severity];

  return (
    <article className="space-y-6">
      <header className="rounded-xl border border-paper-200 bg-white p-6 flex items-start justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-wider text-ink-500">Subject of report</p>
          <p className="hash text-lg">{d.subject.wallet}</p>
          <p className="text-xs text-ink-500 mt-1">
            {d.subject.chain} · queried {new Date(d.subject.queried_at).toUTCString()}
          </p>
          <p className="mt-3 text-sm">{d.headline}</p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-semibold tabular-nums">{d.overall_score}</div>
          <div className={`mt-1 inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-white px-2 py-0.5 rounded ${sevColor}`}>
            {d.severity}
          </div>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-wider text-ink-500">
          Suspicious activity indicators ({d.signals.length})
        </h2>
        {d.signals.length === 0 ? (
          <p className="text-sm text-ink-500">No indicators detected at current rule pack.</p>
        ) : (
          <ul className="space-y-3">
            {d.signals.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-paper-200 bg-white p-4 space-y-2"
              >
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider">
                  <span className={`px-1.5 py-0.5 rounded text-white ${
                    {
                      info: "bg-signal-info",
                      low: "bg-signal-low",
                      medium: "bg-signal-medium",
                      high: "bg-signal-high",
                      critical: "bg-signal-critical",
                    }[s.severity]
                  }`}>
                    {s.severity}
                  </span>
                  <span className="text-ink-500">{s.type}</span>
                  <span className="ml-auto tabular-nums text-ink-500">+{s.score_contribution}</span>
                </div>
                <p className="font-medium">{s.title}</p>
                <p className="text-sm text-ink-700">{s.rationale}</p>
                <div className="text-xs text-ink-500 space-x-3">
                  {s.fatf_reference && <span>{s.fatf_reference}</span>}
                  {s.fincen_reference && <span>{s.fincen_reference}</span>}
                  {s.mica_reference && <span>{s.mica_reference}</span>}
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-ink-500 hover:text-ink-900">
                    Evidence ({s.evidence_ids.length})
                  </summary>
                  <ul className="mt-2 space-y-1 hash">
                    {s.evidence_ids.map((eid) => {
                      const e = d.evidence[eid];
                      if (!e) return null;
                      return (
                        <li key={eid} className="border-l-2 border-paper-200 pl-2">
                          <p className="text-ink-700">{e.endpoint}</p>
                          <p className="text-ink-500 truncate">{e.endpoint_url}</p>
                          {e.tx_hashes.slice(0, 3).map((tx) => (
                            <p key={tx}>tx {tx.slice(0, 10)}…{tx.slice(-6)}</p>
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

      <section className="rounded-xl border border-paper-200 bg-paper-100 p-4 text-xs text-ink-500 space-y-1">
        <p className="uppercase tracking-wider">Reproducibility metadata (FCA 2024)</p>
        <p>Rule pack: {d.metadata.rule_pack_version} · sha256 {d.metadata.rule_pack_sha256.slice(0, 12)}…</p>
        <p>OFAC SDN list version: {d.metadata.sdn_list_version}</p>
        <p>GoldRush API version: {d.metadata.goldrush_api_version}</p>
        <p>Generator: {d.metadata.generator.name} {d.metadata.generator.version}</p>
        <p>Generation id: {d.metadata.generation_id} · generated {d.metadata.generated_at}</p>
      </section>

      <div className="flex gap-3">
        <a
          href={`/api/risk/export?id=${d.metadata.generation_id}&format=json`}
          className="rounded-md border border-ink-700 px-4 py-2 text-sm hover:bg-ink-900 hover:text-paper-50"
          download
        >
          Export JSON
        </a>
        <a
          href={`/api/risk/export?id=${d.metadata.generation_id}&format=pdf`}
          className="rounded-md border border-ink-700 px-4 py-2 text-sm hover:bg-ink-900 hover:text-paper-50"
        >
          Export SAR-style PDF
        </a>
      </div>
    </article>
  );
}

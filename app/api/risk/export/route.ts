/**
 * GET /api/risk/export?id=<generation_id>&format=json|pdf
 *
 * `format=json` — returns the cached RiskDossier verbatim (machine-readable
 * SAR exhibit attachment).
 *
 * `format=pdf` — returns a print-styled HTML page that auto-invokes the
 * browser print dialog. Designed to mirror FinCEN SAR Form 111 sectioning so a
 * compliance officer can save the resulting PDF as an evidence exhibit.
 *
 * We deliberately don't ship a server-side PDF generator (puppeteer/playwright)
 * for the hackathon MVP — it adds 200MB+ of dependencies and a Chromium
 * runtime, neither of which is justified by a 5-day demo. Browser print → PDF
 * produces a higher-fidelity document anyway.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCachedDossier } from "@/lib/store";
import type { RiskDossier, Signal } from "@/lib/types";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();

  if (!id) {
    return NextResponse.json({ error: "id param is required" }, { status: 400 });
  }

  const dossier = getCachedDossier(id);
  if (!dossier) {
    return NextResponse.json(
      {
        error:
          "Dossier not found in cache. Re-run the scan to regenerate. Note: cache TTL is 30 minutes.",
      },
      { status: 404 },
    );
  }

  if (format === "json") {
    return new NextResponse(JSON.stringify(dossier, null, 2), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="sentry402-${dossier.metadata.generation_id}.json"`,
      },
    });
  }

  if (format === "pdf" || format === "html") {
    const html = renderSarHtml(dossier);
    return new NextResponse(html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
      },
    });
  }

  return NextResponse.json({ error: `unsupported format '${format}'` }, { status: 400 });
}

/**
 * SAR-style HTML mirroring FinCEN SAR Form 111 sectioning.
 *
 * Sections:
 *   1. Subject of Report (Form 111 Part I analog)
 *   2. Suspicious Activity Information (Part II analog)
 *   3. Activity Characterization (Part II §32 analog)
 *   4. Evidence Appendix (every cited GoldRush call)
 *   5. Reproducibility Metadata (FCA 2024 documentation requirement)
 */
function renderSarHtml(d: RiskDossier): string {
  const sevColor: Record<string, string> = {
    info: "#5b6b85",
    low: "#3b8c66",
    medium: "#c89320",
    high: "#c25b3f",
    critical: "#a01f1f",
  };
  const escape = (s: string) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c));
  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toUTCString();
    } catch {
      return iso;
    }
  };
  const signalRows = d.signals
    .map(
      (s: Signal) => `
        <tr class="sig-row">
          <td><span class="sev" style="background:${sevColor[s.severity] ?? "#5b6b85"}">${s.severity}</span></td>
          <td><strong>${escape(s.title)}</strong>
            <div class="rationale">${escape(s.rationale)}</div>
            <div class="refs">
              ${s.fatf_reference ? `<span>${escape(s.fatf_reference)}</span>` : ""}
              ${s.fincen_reference ? `<span>${escape(s.fincen_reference)}</span>` : ""}
              ${s.mica_reference ? `<span>${escape(s.mica_reference)}</span>` : ""}
            </div>
            <div class="ev-list">Evidence: ${s.evidence_ids.map((id) => `<code>${escape(id)}</code>`).join(", ")}</div>
          </td>
          <td class="num">+${s.score_contribution}</td>
        </tr>`,
    )
    .join("");

  const evidenceRows = Object.values(d.evidence)
    .map(
      (e) => `
        <tr>
          <td><code>${escape(e.id)}</code></td>
          <td>${escape(e.endpoint)}<div class="url"><code>${escape(e.endpoint_url)}</code></div></td>
          <td><code>${escape(e.chain)}</code></td>
          <td class="num">${e.tx_hashes.length}</td>
          <td>${escape(fmtDate(e.fetched_at))}</td>
        </tr>`,
    )
    .join("");

  const meta = d.metadata;
  return `<!doctype html>
<html><head>
<meta charset="utf-8" />
<title>Sentry402 Risk Dossier — ${escape(d.subject.wallet)}</title>
<style>
  @page { size: letter; margin: 0.75in; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #0b0f17; max-width: 7.5in; margin: 0 auto; padding: 24px; line-height: 1.45; }
  h1 { font-size: 22px; margin: 0 0 4px 0; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: #3a4658; border-bottom: 1px solid #e7e5dc; padding-bottom: 4px; margin-top: 28px; }
  .header { display: flex; justify-content: space-between; align-items: start; gap: 24px; padding-bottom: 12px; border-bottom: 2px solid #0b0f17; }
  .form-id { font-size: 10px; color: #5b6b85; text-transform: uppercase; letter-spacing: 0.08em; }
  .score { text-align: right; }
  .score-num { font-size: 36px; font-weight: 600; line-height: 1; }
  .sev { display: inline-block; padding: 2px 8px; color: white; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; border-radius: 3px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 6px 8px; background: #f4f3ee; border-bottom: 1px solid #e7e5dc; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #3a4658; }
  td { padding: 8px; border-bottom: 1px solid #f4f3ee; vertical-align: top; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  code { font-family: ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace; font-size: 11px; background: #f4f3ee; padding: 1px 4px; border-radius: 2px; }
  .url code { word-break: break-all; }
  .rationale { margin-top: 4px; color: #1a2230; font-size: 12px; }
  .refs { margin-top: 4px; font-size: 11px; color: #5b6b85; }
  .refs span { margin-right: 12px; }
  .ev-list { margin-top: 4px; font-size: 11px; color: #5b6b85; }
  .meta { background: #f4f3ee; padding: 12px; font-size: 11px; line-height: 1.6; margin-top: 28px; border-radius: 4px; }
  .footer-note { margin-top: 16px; font-size: 10px; color: #5b6b85; line-height: 1.5; }
  @media print { .noprint { display: none; } }
</style>
</head><body>
<button class="noprint" onclick="window.print()" style="float:right;padding:6px 12px;border:1px solid #0b0f17;background:#0b0f17;color:#fafaf7;cursor:pointer;border-radius:4px;">Save as PDF</button>

<div class="header">
  <div>
    <div class="form-id">Sentry402 — Risk Dossier (SAR-style exhibit)</div>
    <h1 style="margin-top:6px;">Subject of report</h1>
    <div><code>${escape(d.subject.wallet)}</code></div>
    <div style="font-size:11px;color:#5b6b85;margin-top:4px;">${escape(d.subject.chain)} · queried ${escape(fmtDate(d.subject.queried_at))}</div>
    <p style="font-size:13px;margin-top:12px;">${escape(d.headline)}</p>
  </div>
  <div class="score">
    <div class="score-num">${d.overall_score}</div>
    <div style="margin-top:4px;"><span class="sev" style="background:${sevColor[d.severity] ?? "#5b6b85"}">${d.severity}</span></div>
    <div style="font-size:10px;color:#5b6b85;margin-top:8px;">out of 100</div>
  </div>
</div>

<h2>Suspicious Activity Indicators (${d.signals.length})</h2>
${
  d.signals.length === 0
    ? `<p style="font-size:12px;color:#5b6b85;">No indicators detected at rule pack ${escape(meta.rule_pack_version)}.</p>`
    : `<table>
        <thead><tr><th style="width:80px;">Severity</th><th>Indicator</th><th style="width:80px;text-align:right;">Score</th></tr></thead>
        <tbody>${signalRows}</tbody>
      </table>`
}

<h2>Evidence Appendix (${Object.keys(d.evidence).length} GoldRush API call${Object.keys(d.evidence).length === 1 ? "" : "s"})</h2>
<table>
  <thead><tr><th>Evidence ID</th><th>Endpoint</th><th>Chain</th><th style="text-align:right;">Tx refs</th><th>Fetched</th></tr></thead>
  <tbody>${evidenceRows}</tbody>
</table>
<p class="footer-note">Each evidence record carries a sha256 of its response excerpt for integrity verification, and is bound to the GoldRush SDK version below. Re-running this scan against the same versions will produce a deterministic dossier.</p>

<h2>Reproducibility Metadata (FCA 2024)</h2>
<div class="meta">
  <div><strong>Rule pack:</strong> ${escape(meta.rule_pack_version)} · sha256 <code>${escape(meta.rule_pack_sha256.slice(0, 24))}…</code></div>
  <div><strong>OFAC SDN list version:</strong> ${escape(meta.sdn_list_version)}</div>
  <div><strong>GoldRush API version:</strong> ${escape(meta.goldrush_api_version)}</div>
  <div><strong>Generator:</strong> ${escape(meta.generator.name)} ${escape(meta.generator.version)}</div>
  <div><strong>Generation ID:</strong> <code>${escape(meta.generation_id)}</code></div>
  <div><strong>Generated:</strong> ${escape(fmtDate(meta.generated_at))}</div>
</div>

<p class="footer-note" style="margin-top:32px;">
  Sentry402 is a deterministic, citation-bound wallet-risk tool. Outputs on this exhibit are the result of a fixed rule pack applied to GoldRush API responses captured at the time stamped above. This document does not constitute legal advice or a finalized SAR. Use as a supporting exhibit alongside your firm's compliance review.
</p>

<script>
  if (new URLSearchParams(window.location.search).get("autoprint") === "1") {
    setTimeout(() => window.print(), 400);
  }
</script>
</body></html>`;
}

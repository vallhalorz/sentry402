/**
 * OpenGraph and Twitter Card preview image. Rendered server-side at request
 * time using Next.js's built-in ImageResponse. Shown when the Sentry402 URL
 * is shared on X / Slack / Discord / etc.
 *
 * Kept minimal and serious to match the compliance-tool aesthetic — no
 * marketing flourishes. Brand mark + tagline + sponsor credit.
 */
import { ImageResponse } from "next/og";

export const alt = "Sentry402 — Audit-grade wallet risk, powered by GoldRush";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          backgroundColor: "#fafaf7",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          color: "#0b0f17",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: "linear-gradient(135deg,#f5c542,#d4a017)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0b0f17",
              fontWeight: 800,
              fontSize: 28,
            }}
          >
            S
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: 30, fontWeight: 700, letterSpacing: -0.4 }}>Sentry402</span>
            <span style={{ fontSize: 16, color: "#5b6b85" }}>audit-grade wallet risk</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 950 }}>
          <h1
            style={{
              fontSize: 72,
              fontWeight: 600,
              letterSpacing: -1.5,
              lineHeight: 1.05,
              margin: 0,
              color: "#0b0f17",
            }}
          >
            Wallet risk,
            <br />
            defensible to a regulator.
          </h1>
          <p style={{ fontSize: 26, color: "#3a4658", margin: 0, lineHeight: 1.4 }}>
            Cited risk dossiers. 15 rules. Pay-per-call via x402.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 18,
            color: "#5b6b85",
          }}
        >
          <span>sentry402.vercel.app</span>
          <span>powered by GoldRush · built for the Covalent hackathon</span>
        </div>
      </div>
    ),
    { ...size },
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentry402 — Audit-grade wallet risk, powered by GoldRush",
  description:
    "Pay-per-call wallet risk and counterparty due-diligence. Every score citation-bound to a GoldRush API call. Built for compliance teams priced out of $30K+ enterprise contracts.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper-50 text-ink-900 antialiased">
        <header className="border-b border-paper-200 bg-paper-100">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent" />
              <span className="font-semibold tracking-tight">Sentry402</span>
              <span className="text-xs text-ink-500 hidden sm:inline">
                audit-grade wallet risk
              </span>
            </div>
            <div className="text-xs text-ink-500">
              powered by{" "}
              <a
                href="https://goldrush.dev"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-ink-900"
              >
                GoldRush
              </a>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 py-8 text-xs text-ink-500 border-t border-paper-200 mt-16">
          <p>
            Sentry402 is a research preview. Outputs are deterministic and citation-bound — every
            score links to a specific GoldRush API call, transaction hash, and dataset version.
            Designed to satisfy FCA 2024 documentation requirements for compliance decisions.
          </p>
        </footer>
      </body>
    </html>
  );
}

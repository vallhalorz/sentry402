import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentry402 · Audit-grade wallet risk, powered by GoldRush",
  description:
    "Pay-per-call wallet risk and counterparty due-diligence. Every score citation-bound to a GoldRush API call. Built for compliance teams who need defensible scoring without a $30K enterprise contract.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper-50 text-ink-900 antialiased">
        <header className="border-b border-paper-200 bg-paper-100 sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-paper-100/80">
          <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-accent-light to-accent text-ink-900 font-bold text-sm shadow-sm"
              >
                S
              </span>
              <div className="flex items-baseline gap-2">
                <span className="font-semibold tracking-tight text-base">Sentry402</span>
                <span className="text-xs text-ink-400 hidden sm:inline">
                  audit-grade wallet risk
                </span>
              </div>
            </div>
            <div className="text-xs text-ink-500 flex items-center gap-1.5">
              <span>powered by</span>
              <a
                href="https://goldrush.dev"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-accent-dark hover:text-accent transition-colors"
              >
                GoldRush
              </a>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 py-8 text-xs text-ink-400 border-t border-paper-200 mt-16 leading-relaxed">
          <p>
            Sentry402 is a research preview. Outputs are deterministic and citation-bound. Every
            score links to a specific GoldRush API call, transaction hash, and dataset version.
            Designed to satisfy FCA 2024 documentation requirements for compliance decisions.
          </p>
        </footer>
      </body>
    </html>
  );
}

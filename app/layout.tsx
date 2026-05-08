import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentry402 · Audit-grade wallet risk + agent firewall",
  description:
    "Pay-per-call wallet risk and a pre-flight firewall for AI agents. Multi-chain (EVM + Solana) via GoldRush and Helius DAS. Every flag citation-bound. Built for compliance teams who need defensible scoring without a $30K enterprise contract.",
  metadataBase: new URL("https://sentry402.vercel.app"),
  openGraph: {
    title: "Sentry402 · Audit-grade wallet risk + agent firewall",
    description:
      "Cited risk dossiers + agent pre-flight verdict. EVM (GoldRush) + Solana (Helius DAS). Pay-per-call via x402.",
    url: "https://sentry402.vercel.app",
    siteName: "Sentry402",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sentry402 · Audit-grade wallet risk + agent firewall",
    description:
      "Cited risk dossiers + agent pre-flight verdict. Multi-chain (EVM + Solana). Pay-per-call via x402.",
  },
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
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-gradient-to-br from-accent-light to-accent shadow-sm"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5">
                  <path
                    d="M12 2.5l7.5 3v6.4c0 4.6-3.2 8.7-7.5 9.9C7.7 20.6 4.5 16.5 4.5 11.9V5.5L12 2.5z"
                    fill="#0b0f17"
                    fillOpacity="0.85"
                  />
                  <path
                    d="M9.5 12.2l1.6 1.7 3.4-3.7"
                    stroke="#fafaf7"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div className="flex items-baseline gap-2">
                <span className="font-semibold tracking-tight text-base">Sentry402</span>
                <span className="text-xs text-ink-400 hidden sm:inline">
                  audit-grade wallet risk
                </span>
              </div>
            </div>
            <div className="text-xs text-ink-500 flex items-center gap-1.5 flex-wrap">
              <span>data:</span>
              <a
                href="https://goldrush.dev"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-accent-dark hover:text-accent transition-colors"
              >
                GoldRush
              </a>
              <span className="text-ink-300">·</span>
              <a
                href="https://www.helius.dev"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-accent-dark hover:text-accent transition-colors"
              >
                Helius
              </a>
              <span className="text-ink-300 hidden sm:inline">·</span>
              <span className="hidden sm:inline">rail:</span>
              <a
                href="https://x402.org"
                target="_blank"
                rel="noreferrer"
                className="hidden sm:inline font-medium text-accent-dark hover:text-accent transition-colors"
              >
                x402
              </a>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-10">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 py-8 text-xs text-ink-500 border-t border-paper-200 mt-16 leading-relaxed">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3">
            <a
              href="https://github.com/vallhalorz/sentry402"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink-900 transition"
            >
              GitHub
            </a>
            <span className="text-ink-300">·</span>
            <a
              href="https://www.npmjs.com/package/@sentry402/eliza-plugin"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink-900 transition"
            >
              ElizaOS plugin
            </a>
            <span className="text-ink-300">·</span>
            <a
              href="https://goldrush.dev/docs"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink-900 transition"
            >
              GoldRush docs
            </a>
            <span className="text-ink-300">·</span>
            <a
              href="https://docs.helius.dev/"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink-900 transition"
            >
              Helius docs
            </a>
            <span className="text-ink-300">·</span>
            <a
              href="https://x402.org"
              target="_blank"
              rel="noreferrer"
              className="hover:text-ink-900 transition"
            >
              x402
            </a>
          </div>
          <p className="text-[11px] text-ink-400 max-w-2xl">
            Sentry402 is a research preview. Risk scores are deterministic — every flag links to
            the API call that produced it. Not legal advice.
          </p>
        </footer>
      </body>
    </html>
  );
}

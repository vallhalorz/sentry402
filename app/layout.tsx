import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentry402 · Audit-grade wallet risk, powered by GoldRush",
  description:
    "Pay-per-call wallet risk and counterparty due-diligence. Every score citation-bound to a GoldRush API call. Built for compliance teams who need defensible scoring without a $30K enterprise contract.",
  metadataBase: new URL("https://sentry402.vercel.app"),
  openGraph: {
    title: "Sentry402 · Audit-grade wallet risk",
    description:
      "Cited risk dossiers for compliance teams. Every score links to the exact GoldRush API call, transaction hash, and dataset version. Pay-per-call via x402.",
    url: "https://sentry402.vercel.app",
    siteName: "Sentry402",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sentry402 · Audit-grade wallet risk",
    description:
      "Cited risk dossiers for compliance teams. Pay-per-call via x402, built on @goldrushdev.",
    creator: "@goldrushdev",
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
        <footer className="mx-auto max-w-6xl px-6 py-10 text-xs text-ink-500 border-t border-paper-200 mt-16 leading-relaxed space-y-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2">
                FATF
              </h3>
              <ul className="space-y-1">
                <li>
                  <a
                    href="https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Fatf-recommendations.html"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-ink-900 transition"
                  >
                    FATF Recommendations
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.fatf-gafi.org/en/publications/Fatfrecommendations/Targeted-update-virtual-assets-vasps-2025.html"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-ink-900 transition"
                  >
                    Targeted Update June 2025 (VAs / VASPs)
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2">
                FinCEN
              </h3>
              <ul className="space-y-1">
                <li>
                  <a
                    href="https://www.fincen.gov/sites/default/files/shared/FinCEN_SAR_ElectronicFilingInstructions-Stand_Alone_doc.pdf"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-ink-900 transition"
                  >
                    SAR Form 111 filing instructions
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.fincen.gov/resources/statutes-regulations/guidance"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-ink-900 transition"
                  >
                    FinCEN guidance index
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2">
                EU MiCA
              </h3>
              <ul className="space-y-1">
                <li>
                  <a
                    href="https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R1114"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-ink-900 transition"
                  >
                    Regulation (EU) 2023/1114 (MiCA)
                  </a>
                </li>
                <li>
                  <a
                    href="https://www.esma.europa.eu/policy-activities/digital-finance-and-innovation/markets-crypto-assets-mica"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-ink-900 transition"
                  >
                    ESMA MiCA portal &amp; EMT register
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold mb-2">
                US Treasury / OFAC
              </h3>
              <ul className="space-y-1">
                <li>
                  <a
                    href="https://ofac.treasury.gov/specially-designated-nationals-and-blocked-persons-list-sdn-human-readable-lists"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-ink-900 transition"
                  >
                    OFAC SDN list (human-readable)
                  </a>
                </li>
                <li>
                  <a
                    href="https://home.treasury.gov/news/press-releases/sb0416"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-ink-900 transition"
                  >
                    Press release SB0416 (DPRK 2026-03-12)
                  </a>
                </li>
                <li>
                  <a
                    href="https://goldrush.dev/docs"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-ink-900 transition"
                  >
                    GoldRush API documentation
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <p className="text-[11px] text-ink-400 max-w-3xl pt-4 border-t border-paper-200">
            Sentry402 is a research preview. Outputs are deterministic and citation-bound. Every
            score links to a specific GoldRush API call, transaction hash, and dataset version.
            Designed to satisfy FCA 2024 documentation requirements for compliance decisions. This
            tool does not provide legal advice; consult your firm&apos;s compliance lead and counsel
            before acting on any indicator.
          </p>
        </footer>
      </body>
    </html>
  );
}

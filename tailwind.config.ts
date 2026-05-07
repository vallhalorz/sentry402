import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Compliance-tool palette. Restrained ink/paper neutrals plus strategic
        // color accents for severity, regulators, and trust signals. Designed
        // to feel serious enough for a regulator review while still being
        // welcoming to non-AML readers.
        ink: {
          900: "#0b0f17",
          800: "#111722",
          700: "#1a2230",
          600: "#252f40",
          500: "#3a4658",
          400: "#5b6b85",
          300: "#7d8aa3",
        },
        paper: {
          50: "#fafaf7",
          100: "#f4f3ee",
          200: "#e7e5dc",
          300: "#d6d3c4",
        },
        // Signal severity. Calibrated for both color-vision accessibility
        // (distinct hue + lightness across scale) and conventional compliance
        // semantics (red = critical action, amber = review).
        signal: {
          info: "#6366f1",      // indigo: informational, no action
          low: "#10b981",       // emerald: reviewed, low concern
          medium: "#f59e0b",    // amber: enhanced due diligence
          high: "#f97316",      // orange: escalate
          critical: "#dc2626",  // red: SAR / freeze
        },
        // Regulation reference chip colors. Each regulator gets a distinct
        // hue so an analyst can spot at a glance what kind of citation is
        // attached to a signal (FATF Recommendations, FinCEN forms, MiCA
        // articles, FCA guidance).
        reg: {
          fatf: "#0284c7",      // sky blue: FATF
          fincen: "#7c3aed",    // violet: FinCEN
          mica: "#db2777",      // pink: MiCA
          fca: "#059669",       // teal: FCA
        },
        // Trust accent. Used sparingly for primary CTA and the "powered by
        // GoldRush" footer credit. We keep the GoldRush-adjacent gold so the
        // sponsor association reads.
        accent: {
          DEFAULT: "#d4a017",
          dark: "#a37b0b",
          light: "#f5c542",
        },
        // Brand. Subtle blue used for x402 / agent-rail CTAs to differentiate
        // from compliance scoring. Keeps the visual hierarchy clean.
        brand: {
          DEFAULT: "#1e40af",
          light: "#3b82f6",
          dark: "#1e3a8a",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto"],
        mono: ["ui-monospace", "SF Mono", "Menlo", "Monaco", "Consolas"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(11, 15, 23, 0.04), 0 4px 16px rgba(11, 15, 23, 0.06)",
        glow: "0 0 0 3px rgba(212, 160, 23, 0.15)",
      },
    },
  },
  plugins: [],
};

export default config;

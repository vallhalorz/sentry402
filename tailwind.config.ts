import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Compliance-tool palette — restrained, regulator-friendly.
        ink: {
          900: "#0b0f17",
          800: "#111722",
          700: "#1a2230",
          600: "#252f40",
          500: "#3a4658",
        },
        paper: {
          50: "#fafaf7",
          100: "#f4f3ee",
          200: "#e7e5dc",
        },
        signal: {
          info: "#5b6b85",
          low: "#3b8c66",
          medium: "#c89320",
          high: "#c25b3f",
          critical: "#a01f1f",
        },
        accent: {
          DEFAULT: "#d4a017", // GoldRush-adjacent gold
          dark: "#a37b0b",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto"],
        mono: ["ui-monospace", "SF Mono", "Menlo", "Monaco", "Consolas"],
      },
    },
  },
  plugins: [],
};

export default config;

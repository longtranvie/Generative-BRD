import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#ffffff",
        bg2: "#f8faff",
        card: "#ffffff",
        line: "#e2e8f0",
        line2: "#cbd5e1",
        ink: "#0f172a",
        muted: "#64748b",
        sub: "#94a3b8",
        accent: "#4f46e5",
        accent2: "#0891b2",
        accent3: "#7c3aed",
        good: "#059669",
        danger: "#dc2626",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        card: "20px",
        btn: "12px",
        chip: "100px",
      },
      boxShadow: {
        card: "0 1px 4px rgba(0,0,0,.04)",
        cardHover: "0 8px 28px rgba(79,70,229,.10)",
        cta: "0 4px 14px rgba(79,70,229,.22)",
        ctaLg: "0 10px 30px rgba(79,70,229,.25)",
      },
      letterSpacing: {
        tightest: "-.03em",
        tighter2: "-.02em",
      },
      backgroundImage: {
        "gradient-cta": "linear-gradient(135deg, #4f46e5, #0891b2)",
        "gradient-cta-2": "linear-gradient(135deg, #7c3aed, #4f46e5)",
      },
    },
  },
  plugins: [],
};

export default config;

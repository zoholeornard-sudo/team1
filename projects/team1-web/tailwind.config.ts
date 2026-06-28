import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // team1 brand palette
        brand: {
          50: "#eef7ff",
          100: "#d9ecff",
          200: "#bce0ff",
          300: "#8ecdff",
          400: "#53b0ff",
          500: "#2b8fff",
          600: "#146ef5",
          700: "#0d58e1",
          800: "#1147b6",
          900: "#143f8f",
          950: "#112857",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f8fafc",
          border: "#e2e8f0",
        },
        success: "#10b981",
        warning: "#f59e0b",
        critical: "#ef4444",
        info: "#3b82f6",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

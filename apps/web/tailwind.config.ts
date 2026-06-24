import type { Config } from "tailwindcss";

// 疗愈调性:低饱和暖色 + 大留白。色板偏砂米/暖陶,避免高对比刺激。
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        sand: {
          50: "#faf7f2",
          100: "#f3ece1",
          200: "#e7dac7",
          300: "#d6c2a4",
        },
        clay: {
          400: "#c79a7a",
          500: "#b07d5c",
          600: "#8f6243",
        },
        sage: {
          400: "#9bb0a0",
          500: "#7c9483",
        },
        ink: {
          700: "#4a443d",
          800: "#33302b",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "system-ui",
          "-apple-system",
          "PingFang SC",
          "Microsoft YaHei",
          "sans-serif",
        ],
      },
      borderRadius: {
        bubble: "1.25rem",
      },
      maxWidth: {
        reading: "42rem",
      },
      keyframes: {
        "breathe": {
          "0%, 100%": { opacity: "0.4", transform: "scale(0.98)" },
          "50%": { opacity: "0.8", transform: "scale(1.02)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        breathe: "breathe 4s ease-in-out infinite",
        "fade-up": "fade-up 0.4s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;

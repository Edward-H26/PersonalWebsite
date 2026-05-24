import type { Config } from "tailwindcss"

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        cyber: {
          indigo: "#4f46e5",
          violet: "#8b5cf6",
          cyan: "#06b6d4",
          magenta: "#ec4899",
          dark: "#0a0a0f",
        },
        glass: {
          DEFAULT: "rgba(15, 15, 25, 0.6)",
          border: "rgba(139, 92, 246, 0.3)",
        },
        category: {
          research: "#06b6d4",
          publication: "#8b5cf6",
          experience: "#10b981",
          project: "#f59e0b",
          skill: "#ec4899",
        },
      },
      fontFamily: {
        orbitron: ["Orbitron", "monospace"],
        rajdhani: ["Rajdhani", "sans-serif"],
      },
      animation: {
        "fade-up": "fadeUp 0.6s ease-out forwards",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      backdropBlur: {
        xs: "2px",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(0.16, 1, 0.3, 1)",
        bounce: "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      transitionDuration: {
        "400": "400ms",
        "600": "600ms",
        "800": "800ms",
      },
    },
  },
  plugins: [],
} satisfies Config

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
        slideIn: "slideIn 1s forwards",
        pulse: "pulse 0.5s ease-in-out infinite alternate",
        dataFlow: "dataFlow 20s linear infinite",
        float: "float 6s ease-in-out infinite",
        glow: "glow 2s ease-in-out infinite alternate",
        "gradient-shift": "gradientShift 15s ease infinite",
        "blob-1": "blob1 20s ease-in-out infinite",
        "blob-2": "blob2 25s ease-in-out infinite",
        "blob-3": "blob3 22s ease-in-out infinite",
        "fade-in": "fadeIn 0.6s ease-out forwards",
        "fade-up": "fadeUp 0.6s ease-out forwards",
        "slide-left": "slideLeft 0.6s ease-out forwards",
        "slide-right": "slideRight 0.6s ease-out forwards",
        "border-glow": "borderGlow 3s ease-in-out infinite",
        "status-pulse": "statusPulse 2s ease-in-out infinite",
      },
      keyframes: {
        slideIn: {
          "0%": { opacity: "0", transform: "translateY(30px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        dataFlow: {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "200% 50%" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-20px)" },
        },
        glow: {
          "0%": { boxShadow: "0 0 20px rgba(139, 92, 246, 0.3)" },
          "100%": { boxShadow: "0 0 40px rgba(139, 92, 246, 0.6)" },
        },
        gradientShift: {
          "0%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
          "100%": { backgroundPosition: "0% 50%" },
        },
        blob1: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(30px, -20px) scale(1.05)" },
          "66%": { transform: "translate(-20px, 20px) scale(0.95)" },
        },
        blob2: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(-25px, 25px) scale(0.95)" },
          "66%": { transform: "translate(25px, -15px) scale(1.05)" },
        },
        blob3: {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(20px, 20px) scale(1.02)" },
          "66%": { transform: "translate(-15px, -25px) scale(0.98)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideLeft: {
          "0%": { opacity: "0", transform: "translateX(30px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        slideRight: {
          "0%": { opacity: "0", transform: "translateX(-30px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        borderGlow: {
          "0%, 100%": { boxShadow: "0 0 20px rgba(139, 92, 246, 0.3), inset 0 0 20px rgba(139, 92, 246, 0.05)" },
          "50%": { boxShadow: "0 0 30px rgba(6, 182, 212, 0.4), inset 0 0 30px rgba(6, 182, 212, 0.08)" },
        },
        statusPulse: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.6", transform: "scale(1.2)" },
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

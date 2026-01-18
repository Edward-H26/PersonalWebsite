import { memo } from "react"
import { useReducedMotion } from "@/hooks/useReducedMotion"

interface GradientBackgroundProps {
  className?: string
  variant?: "hero" | "subtle" | "vibrant" | "dark"
}

export const GradientBackground = memo(function GradientBackground({
  className = "",
  variant = "hero",
}: GradientBackgroundProps) {
  const prefersReducedMotion = useReducedMotion()

  const variantStyles = getVariantStyles(variant)

  return (
    <div
      className={`fixed inset-0 pointer-events-none overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <div
        className={`absolute inset-0 ${prefersReducedMotion ? "" : "animate-gradient-shift"}`}
        style={{
          background: variantStyles.primary,
          backgroundSize: prefersReducedMotion ? "100% 100%" : "400% 400%",
        }}
      />

      <div
        className={`absolute inset-0 ${prefersReducedMotion ? "" : "animate-blob-1"}`}
        style={{
          background: variantStyles.blob1,
          filter: "blur(80px)",
          opacity: variantStyles.blobOpacity,
        }}
      />

      <div
        className={`absolute inset-0 ${prefersReducedMotion ? "" : "animate-blob-2"}`}
        style={{
          background: variantStyles.blob2,
          filter: "blur(100px)",
          opacity: variantStyles.blobOpacity * 0.8,
        }}
      />

      <div
        className={`absolute inset-0 ${prefersReducedMotion ? "" : "animate-blob-3"}`}
        style={{
          background: variantStyles.blob3,
          filter: "blur(120px)",
          opacity: variantStyles.blobOpacity * 0.6,
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at center, transparent 0%, rgba(10, 10, 15, 0.4) 70%, rgba(10, 10, 15, 0.8) 100%)",
        }}
      />
    </div>
  )
})

function getVariantStyles(variant: string) {
  switch (variant) {
    case "subtle":
      return {
        primary: "linear-gradient(135deg, rgba(10, 10, 15, 1) 0%, rgba(15, 15, 25, 1) 50%, rgba(10, 10, 15, 1) 100%)",
        blob1: "radial-gradient(circle at 20% 30%, rgba(79, 70, 229, 0.15) 0%, transparent 50%)",
        blob2: "radial-gradient(circle at 80% 60%, rgba(6, 182, 212, 0.12) 0%, transparent 50%)",
        blob3: "radial-gradient(circle at 50% 80%, rgba(139, 92, 246, 0.1) 0%, transparent 50%)",
        blobOpacity: 0.6,
      }

    case "vibrant":
      return {
        primary: "linear-gradient(135deg, #13294B 0%, #0455A4 25%, #4f46e5 50%, #8b5cf6 75%, #06b6d4 100%)",
        blob1: "radial-gradient(circle at 25% 25%, rgba(79, 70, 229, 0.5) 0%, transparent 50%)",
        blob2: "radial-gradient(circle at 75% 50%, rgba(6, 182, 212, 0.4) 0%, transparent 50%)",
        blob3: "radial-gradient(circle at 40% 75%, rgba(236, 72, 153, 0.35) 0%, transparent 50%)",
        blobOpacity: 0.8,
      }

    case "dark":
      return {
        primary: "linear-gradient(180deg, rgba(10, 10, 15, 1) 0%, rgba(5, 5, 10, 1) 100%)",
        blob1: "radial-gradient(circle at 30% 20%, rgba(79, 70, 229, 0.08) 0%, transparent 50%)",
        blob2: "radial-gradient(circle at 70% 70%, rgba(6, 182, 212, 0.06) 0%, transparent 50%)",
        blob3: "radial-gradient(circle at 50% 50%, rgba(139, 92, 246, 0.05) 0%, transparent 50%)",
        blobOpacity: 0.4,
      }

    case "hero":
    default:
      return {
        primary: "linear-gradient(135deg, #13294B 0%, #0a0a0f 30%, #0455A4 60%, #0a0a0f 80%, #13294B 100%)",
        blob1: "radial-gradient(circle at 20% 30%, rgba(79, 70, 229, 0.25) 0%, transparent 50%)",
        blob2: "radial-gradient(circle at 80% 50%, rgba(6, 182, 212, 0.2) 0%, transparent 50%)",
        blob3: "radial-gradient(circle at 50% 80%, rgba(139, 92, 246, 0.18) 0%, transparent 50%)",
        blobOpacity: 0.7,
      }
  }
}

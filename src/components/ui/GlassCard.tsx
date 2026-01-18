import { forwardRef, type ReactNode, type CSSProperties } from "react"
import { useReducedMotion } from "@/hooks/useReducedMotion"

interface GlassCardProps {
  children: ReactNode
  className?: string
  variant?: "default" | "elevated" | "subtle" | "vibrant"
  hoverEffect?: "lift" | "glow" | "scale" | "none"
  borderGlow?: boolean
  onClick?: () => void
  style?: CSSProperties
}

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  function GlassCard(
    {
      children,
      className = "",
      variant = "default",
      hoverEffect = "lift",
      borderGlow = false,
      onClick,
      style,
    },
    ref
  ) {
    const prefersReducedMotion = useReducedMotion()

    const variantStyles = getVariantStyles(variant)
    const hoverClass = getHoverClass(hoverEffect, prefersReducedMotion)
    const glowClass = borderGlow && !prefersReducedMotion ? "glass-card-border-glow" : ""

    return (
      <div
        ref={ref}
        className={`glass-card ${variantStyles.className} ${hoverClass} ${glowClass} ${className}`}
        style={{
          ...variantStyles.style,
          ...style,
        }}
        onClick={onClick}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
      >
        {children}
      </div>
    )
  }
)

function getVariantStyles(variant: string): { className: string; style: CSSProperties } {
  switch (variant) {
    case "elevated":
      return {
        className: "liquid-glass-panel",
        style: {
          "--glass-bg-alpha": 0.15,
          "--glass-before-opacity": 0.28,
          "--glass-after-opacity": 0.26,
        } as CSSProperties,
      }

    case "subtle":
      return {
        className: "liquid-glass-panel",
        style: {
          "--glass-bg-alpha": 0.08,
          "--glass-before-opacity": 0.15,
          "--glass-after-opacity": 0.12,
        } as CSSProperties,
      }

    case "vibrant":
      return {
        className: "liquid-glass-panel glass-card-vibrant",
        style: {
          "--glass-bg-alpha": 0.18,
          "--glass-before-opacity": 0.35,
          "--glass-after-opacity": 0.3,
        } as CSSProperties,
      }

    default:
      return {
        className: "liquid-glass-panel",
        style: {
          "--glass-bg-alpha": 0.12,
          "--glass-before-opacity": 0.24,
          "--glass-after-opacity": 0.24,
        } as CSSProperties,
      }
  }
}

function getHoverClass(effect: string, reducedMotion: boolean): string {
  if (reducedMotion) return ""

  switch (effect) {
    case "lift":
      return "glass-card-hover-lift"
    case "glow":
      return "glass-card-hover-glow"
    case "scale":
      return "glass-card-hover-scale"
    default:
      return ""
  }
}

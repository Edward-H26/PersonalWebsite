import React, { forwardRef, type ReactNode, type ButtonHTMLAttributes } from "react"
import { useMagneticEffect } from "@/hooks/useMagneticEffect"
import { useReducedMotion } from "@/hooks/useReducedMotion"

interface MagneticButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode
  variant?: "primary" | "secondary" | "ghost" | "outline"
  size?: "sm" | "md" | "lg"
  magneticStrength?: number
  magneticRadius?: number
}

export const MagneticButton = forwardRef<HTMLButtonElement, MagneticButtonProps>(
  function MagneticButton(
    {
      children,
      className = "",
      variant = "primary",
      size = "md",
      magneticStrength = 0.35,
      magneticRadius = 100,
      ...props
    },
    forwardedRef
  ) {
    const prefersReducedMotion = useReducedMotion()
    const { ref, onMouseMove, onMouseLeave, style } = useMagneticEffect<HTMLButtonElement>({
      strength: magneticStrength,
      radius: magneticRadius,
    })

    const variantClass = getVariantClass(variant)
    const sizeClass = getSizeClass(size)

    const combinedRef = (node: HTMLButtonElement | null) => {
      (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node
      if (typeof forwardedRef === "function") {
        forwardedRef(node)
      } else if (forwardedRef) {
        forwardedRef.current = node
      }
    }

    return (
      <button
        ref={combinedRef}
        className={`magnetic-button ${variantClass} ${sizeClass} ${className}`}
        onMouseMove={prefersReducedMotion ? undefined : onMouseMove}
        onMouseLeave={prefersReducedMotion ? undefined : onMouseLeave}
        style={prefersReducedMotion ? undefined : style}
        {...props}
      >
        <span className="magnetic-button-content">{children}</span>
      </button>
    )
  }
)

function getVariantClass(variant: string): string {
  switch (variant) {
    case "primary":
      return "magnetic-button-primary"
    case "secondary":
      return "magnetic-button-secondary"
    case "ghost":
      return "magnetic-button-ghost"
    case "outline":
      return "magnetic-button-outline"
    default:
      return "magnetic-button-primary"
  }
}

function getSizeClass(size: string): string {
  switch (size) {
    case "sm":
      return "magnetic-button-sm"
    case "lg":
      return "magnetic-button-lg"
    default:
      return "magnetic-button-md"
  }
}

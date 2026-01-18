import { memo } from "react"

interface NoiseOverlayProps {
  opacity?: number
  className?: string
  blendMode?: "overlay" | "soft-light" | "multiply" | "screen"
}

export const NoiseOverlay = memo(function NoiseOverlay({
  opacity = 0.03,
  className = "",
  blendMode = "overlay",
}: NoiseOverlayProps) {
  const blendModeClass = {
    overlay: "mix-blend-overlay",
    "soft-light": "mix-blend-soft-light",
    multiply: "mix-blend-multiply",
    screen: "mix-blend-screen",
  }[blendMode]

  return (
    <div
      className={`fixed inset-0 pointer-events-none z-[999] ${blendModeClass} ${className}`}
      style={{ opacity }}
      aria-hidden="true"
    >
      <svg
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <defs>
          <filter id="noise-filter" x="0%" y="0%" width="100%" height="100%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.85"
              numOctaves="4"
              stitchTiles="stitch"
              result="noise"
            />
            <feColorMatrix
              type="saturate"
              values="0"
              in="noise"
              result="mono"
            />
          </filter>
        </defs>
        <rect
          width="100%"
          height="100%"
          filter="url(#noise-filter)"
          fill="transparent"
        />
      </svg>
    </div>
  )
})

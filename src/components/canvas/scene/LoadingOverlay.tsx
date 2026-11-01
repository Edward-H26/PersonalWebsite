import { type CSSProperties, useEffect, useState } from "react"
import { DEFAULT_SKY_HOUR, skyAt } from "@/components/canvas/environment/skyPalette"
import { announcedPercent, fogDensity, voyageColours, voyagePosition } from "./voyage"
import { ISLAND_SILHOUETTE, SHIP_SILHOUETTE, SHIP_STERN_LANTERN, type Silhouette } from "./voyageArt"

/** The overlay's fade in loader.css; once it has run, the overlay leaves the page. */
const FADE_MS = 700
const LABEL = "Sailing to the island"
/** A low swell, ten crests across a box that stretches to the width of the screen. */
const WAVE_PATH = `M0 6 Q25 2 50 6 ${Array.from({ length: 19 }, (_, i) => `T${100 + i * 50} 6`).join(" ")}`
const LANTERN_STYLE: CSSProperties = { left: `${SHIP_STERN_LANTERN.x * 100}%`, top: `${SHIP_STERN_LANTERN.y * 100}%` }

function SilhouetteArt({ art, className }: { art: Silhouette; className: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${art.width} ${art.height}`} aria-hidden="true" focusable="false">
      <path d={art.path} />
    </svg>
  )
}

function Wave({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 1000 12" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <path d={WAVE_PATH} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * The full-screen loader, "Ship to the island" (DESIGN.md section 11): the REVA ship sails along the
 * wave line towards the island, its position being the download progress, while the island comes out
 * of the fog. The ship hops on the CIS rhythm with its stern lantern pulsing (keyframes.css), and
 * screen readers hear the progress in steps of ten. When the island is ready the overlay fades out.
 */
export function LoadingOverlay({ visible, progress }: { visible: boolean; progress: number }) {
  const [hasFaded, setHasFaded] = useState(false)
  // The sky of the hour the island opens at, read once, so the loader fades into the same sky.
  const [skyColours] = useState(() => voyageColours(skyAt(DEFAULT_SKY_HOUR)))

  useEffect(() => {
    if (visible) return
    const timer = window.setTimeout(() => setHasFaded(true), FADE_MS)
    return () => window.clearTimeout(timer)
  }, [visible])

  if (hasFaded) return null

  const voyageStyle = { ...skyColours, "--voyage": voyagePosition(progress), "--fog": fogDensity(progress) } as CSSProperties

  return (
    <div className="voyage" data-visible={visible} style={voyageStyle}>
      <div className="voyage-island" aria-hidden="true">
        <SilhouetteArt art={ISLAND_SILHOUETTE} className="voyage-island-haze" />
        <SilhouetteArt art={ISLAND_SILHOUETTE} className="voyage-island-shape" />
        <div className="voyage-fog" />
      </div>

      <div className="voyage-carrier" aria-hidden="true">
        <div className="voyage-ship">
          <div className="voyage-hop">
            <div className="voyage-squash">
              <SilhouetteArt art={SHIP_SILHOUETTE} className="voyage-ship-shape" />
              <span className="voyage-lantern" style={LANTERN_STYLE} />
            </div>
          </div>
        </div>
      </div>

      <div className="voyage-depths" aria-hidden="true" />
      <Wave className="voyage-wave" />
      <div className="voyage-wake" aria-hidden="true">
        <Wave className="voyage-wake-line" />
      </div>

      <p className="voyage-label" aria-hidden="true">
        <span className="voyage-label-title">{LABEL}</span>
        <span className="voyage-label-percent">{`${Math.round(progress)}%`}</span>
      </p>
      <p className="sr-only" role="status" aria-live="polite">{`${LABEL}, ${announcedPercent(progress)}%`}</p>
    </div>
  )
}

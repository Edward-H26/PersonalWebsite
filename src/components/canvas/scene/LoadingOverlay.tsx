import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react"
import { useWorldLoading } from "@/hooks/useWorldLoading"
import { VOYAGE_COLOURS, announcedPercent, fogDensity, voyagePosition } from "./voyage"
import { ISLAND_SILHOUETTE, SHIP_SILHOUETTE, SHIP_STERN_LANTERN, type Silhouette } from "./voyageArt"

/** The overlay's fade in loader.css; once it has run, the overlay leaves the page. */
const FADE_MS = 700
const LABEL = "Sailing to the island"
/** A low swell, ten crests across a box that stretches to the width of the screen. */
const WAVE_PATH = `M0 6 Q25 2 50 6 ${Array.from({ length: 19 }, (_, i) => `T${100 + i * 50} 6`).join(" ")}`
const LANTERN_STYLE: CSSProperties = { left: `${SHIP_STERN_LANTERN.x * 100}%`, top: `${SHIP_STERN_LANTERN.y * 100}%` }
const VOYAGE_STYLE = { ...VOYAGE_COLOURS, "--voyage": voyagePosition(0), "--fog": fogDensity(0) } as CSSProperties

function announcement(percent: number) {
  return `${LABEL}, ${announcedPercent(percent)}%`
}

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
 * wave line towards the island, its position being the load's progress, while the island comes out
 * of the fog. The ship hops on the CIS rhythm with its stern lantern pulsing (keyframes.css), and
 * screen readers hear the progress in steps of ten. When the island is ready the overlay fades out.
 * The progress reaches the page by direct writes, so a frame of it costs React nothing.
 */
export function LoadingOverlay() {
  const overlay = useRef<HTMLDivElement>(null)
  const percentLabel = useRef<HTMLSpanElement>(null)
  const status = useRef<HTMLParagraphElement>(null)
  const [hasFaded, setHasFaded] = useState(false)

  const paint = useCallback((percent: number) => {
    overlay.current?.style.setProperty("--voyage", String(voyagePosition(percent)))
    overlay.current?.style.setProperty("--fog", String(fogDensity(percent)))
    if (percentLabel.current) percentLabel.current.textContent = `${Math.round(percent)}%`
    const announced = announcement(percent)
    if (status.current && status.current.textContent !== announced) status.current.textContent = announced
  }, [])

  const visible = useWorldLoading(paint)

  useEffect(() => {
    if (visible) return
    const timer = window.setTimeout(() => setHasFaded(true), FADE_MS)
    return () => window.clearTimeout(timer)
  }, [visible])

  if (hasFaded) return null

  return (
    <div ref={overlay} className="voyage" data-visible={visible} style={VOYAGE_STYLE}>
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
        <span ref={percentLabel} className="voyage-label-percent">
          0%
        </span>
      </p>
      <p ref={status} className="sr-only" role="status" aria-live="polite">
        {announcement(0)}
      </p>
    </div>
  )
}

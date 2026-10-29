import type { CSSProperties } from "react"
import { withBase } from "@/utils/assets"

const POSTER = withBase("/intro/island-loop-poster.svg")
// On phones the progress line and label sit above the home indicator instead of beside the deck.
const LINE_CLASS_MOBILE = "absolute left-6 right-6 world-loader-line-wrap"
const LINE_CLASS_DESKTOP =
  "absolute left-6 right-6 sm:left-[46%] sm:right-[90px] top-[62%] sm:top-[44%] -translate-y-1/2 world-loader-line-wrap"
const LABEL_CLASS_MOBILE = "absolute left-6 right-6 text-center"
const LABEL_CLASS_DESKTOP =
  "absolute left-6 right-6 sm:left-[46%] sm:right-[90px] top-[54%] sm:top-[38%] -translate-y-1/2 text-center sm:text-right"

/** The full-screen loader: poster, aurora and a determinate progress line, faded out once the island is ready. */
export function LoadingOverlay({ visible, progress, isMobile }: { visible: boolean; progress: number; isMobile: boolean }) {
  const lineStyle: CSSProperties = {
    ["--world-loader-progress" as string]: `${progress}%`,
    ...(isMobile
      ? {
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)"
        }
      : {})
  }
  const labelStyle: CSSProperties | undefined = isMobile ? { bottom: "calc(env(safe-area-inset-bottom, 0px) + 44px)" } : undefined

  return (
    <div
      className="absolute inset-0 pointer-events-none transition-opacity duration-700 world-loader-overlay z-[360] sm:z-0"
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden="true"
    >
      <div className="absolute inset-0 world-loader-backdrop" />

      <div className="absolute inset-0 world-loader-aurora" />
      <div className="absolute inset-0 world-loader-glow-field" />

      <img
        className="absolute inset-0 w-full h-full object-cover"
        src={POSTER}
        alt=""
        style={{ filter: "brightness(1.1) saturate(1.1)" }}
      />

      <div className={isMobile ? LINE_CLASS_MOBILE : LINE_CLASS_DESKTOP} data-mode="determinate" style={lineStyle}>
        <div className="world-loader-line-track">
          <div className="world-loader-line-fill" />
        </div>
      </div>

      <div className={isMobile ? LABEL_CLASS_MOBILE : LABEL_CLASS_DESKTOP} style={labelStyle}>
        <div className="world-loader-title">Initializing</div>
        <div className="world-loader-subtitle">{`${Math.round(progress)}%`}</div>
      </div>
    </div>
  )
}

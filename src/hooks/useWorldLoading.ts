import { useEffect, useState } from "react"
import { useIsMobile } from "@/hooks/useIsMobile"
import { useWorldStore } from "@/store/worldStore"

/** A load that sits at 99% or more for this long counts as finished. */
const STALL_AFTER_MS = 4000
/** Phones keep the overlay up at least this long so a fast load does not flash. */
const MIN_OVERLAY_MS_MOBILE = 1200
const MIN_OVERLAY_MS_DESKTOP = 0
/** The displayed percentage eases towards the real one by this fraction per frame, and snaps when closer than this. */
const PROGRESS_EASING = 0.12
const PROGRESS_SNAP = 0.2

/** One frame of the displayed percentage on its way to the real one. */
function easedPercent(shown: number, target: number) {
  const gap = target - shown
  return Math.abs(gap) < PROGRESS_SNAP ? target : shown + gap * PROGRESS_EASING
}

/**
 * Drives the loading overlay from one animation-frame loop, which only reads the store: it eases the displayed
 * percentage towards the load's progress and hands each new value to `paint`, treats a stalled load as finished, and
 * lifts the overlay once the island is ready and the percentage has arrived at 100. React state changes only at the lift.
 */
export function useWorldLoading(paint: (percent: number) => void) {
  const isMobile = useIsMobile()
  const [isVisible, setVisible] = useState(true)
  // Read once: a window resized across the breakpoint must not restart the loop, and the percentage with it.
  const [minOverlayMs] = useState(isMobile ? MIN_OVERLAY_MS_MOBILE : MIN_OVERLAY_MS_DESKTOP)

  useEffect(() => {
    let frame = 0
    let shown = 0
    let lastMovedAt = performance.now()
    const startedAt = lastMovedAt

    const tick = (now: number) => {
      const { loadProgress, isEarthSceneReady, isLoaderBypassed, setLoaderBypassed } = useWorldStore.getState()
      const isFinished = isEarthSceneReady || isLoaderBypassed
      const target = isFinished ? 100 : loadProgress * 100
      const next = easedPercent(shown, target)
      if (next !== shown) {
        shown = next
        lastMovedAt = now
        paint(shown)
      }
      if (target >= 99 && now - lastMovedAt > STALL_AFTER_MS) setLoaderBypassed(true)
      if (isFinished && shown >= 100 && now - startedAt >= minOverlayMs) {
        setVisible(false)
        return
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [minOverlayMs, paint])

  useEffect(() => {
    useWorldStore.getState().setLoadingOverlayVisible(isVisible)
  }, [isVisible])

  return isVisible
}

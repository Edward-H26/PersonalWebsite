/**
 * The travel direction shown by the camera is locked from the first clear scroll movement
 * between two slides, so small jitters mid-transition cannot flip it.
 */

/** Floor of the movement that locks a direction. */
export const TRAVEL_DIR_MIN_PX = 1.5
/** The lock threshold also scales with the slide height. */
export const TRAVEL_DIR_HEIGHT_FRACTION = 0.003

export type ScrollDirection = 1 | -1

export function getTravelDirThresholdPx(pageHeight: number) {
  return Math.max(TRAVEL_DIR_MIN_PX, pageHeight * TRAVEL_DIR_HEIGHT_FRACTION)
}

/** Keeps an existing lock; otherwise locks the direction of a movement at least `thresholdPx` long. */
export function lockScrollDirection(current: ScrollDirection | null, deltaScrollTop: number, thresholdPx: number) {
  if (current != null) return current
  if (Math.abs(deltaScrollTop) < thresholdPx) return null
  return deltaScrollTop > 0 ? 1 : -1
}

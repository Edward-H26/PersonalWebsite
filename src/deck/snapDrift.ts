/**
 * Watches a deck that is resting on a slide and asks for a correction when the browser left it
 * a few pixels off the snap point for several consecutive frames.
 */

/** Consecutive still frames on a slide before a drift correction is considered. */
export const SNAP_SETTLE_FRAMES = 5
/** Frame-to-frame movement below this counts as still. */
export const SNAP_STILL_DELTA_PX = 0.6
/** Drift from the snap point that triggers a correction. */
export const SNAP_CORRECTION_PX = 6

export type SnapDriftState = {
  settledFrames: number
  lastSnapIndex: number | null
  /** Each slide is corrected at most once per visit. */
  lastCorrectedIndex: number | null
}

export type SnapDriftInput = {
  /** Settled on a slide with no programmatic jump or wrap in flight. */
  isResting: boolean
  index: number
  deltaScrollTop: number
  driftPx: number
  isCooldownOver: boolean
}

export function createSnapDriftState(): SnapDriftState {
  return { settledFrames: 0, lastSnapIndex: null, lastCorrectedIndex: null }
}

/** Advances the drift tracker by one frame; returns true when the deck should be re-aligned. Mutates `state`. */
export function trackSnapDrift(state: SnapDriftState, input: SnapDriftInput) {
  if (!input.isResting) {
    state.settledFrames = 0
    state.lastSnapIndex = null
    return false
  }

  if (state.lastSnapIndex !== input.index) {
    state.settledFrames = 0
    state.lastCorrectedIndex = null
    state.lastSnapIndex = input.index
  }
  state.settledFrames = Math.abs(input.deltaScrollTop) < SNAP_STILL_DELTA_PX ? state.settledFrames + 1 : 0

  const shouldCorrect =
    state.settledFrames >= SNAP_SETTLE_FRAMES &&
    state.lastCorrectedIndex !== input.index &&
    input.driftPx > SNAP_CORRECTION_PX &&
    input.isCooldownOver
  if (shouldCorrect) state.lastCorrectedIndex = input.index
  return shouldCorrect
}

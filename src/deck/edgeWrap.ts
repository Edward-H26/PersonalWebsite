/**
 * Decides when native scrolling past the first or last real slide (into a sentinel) should wrap
 * the deck. An edge is armed once the deck rests on it; a wrap then needs fresh user input that
 * arrived after the arming and a push past the pre-wrap threshold in the matching direction.
 */

/** Fraction of a slide past the edge slide at which a wrap starts. */
export const PRE_WRAP_THRESHOLD = 0.08
/** User input older than this no longer counts as the cause of a scroll. */
export const RECENT_INPUT_WINDOW_MS = 300

export type EdgeArmState = {
  top: boolean
  bottom: boolean
  /** When the current edge was armed by a settled scroll end, or null when not armed. */
  armedAtMs: number | null
  /** Set by the scroll-end timer so the next settled frame can stamp `armedAtMs`. */
  armRequested: boolean
}

export type EdgeWrapDirection = "up" | "down" | null

export function createEdgeArmState(): EdgeArmState {
  return { top: false, bottom: false, armedAtMs: null, armRequested: false }
}

/** Updates which edge is armed from a settled frame. Mutates `state`; no-op while scrolling. */
export function updateEdgeArming(
  state: EdgeArmState,
  input: { isSettledOnSnap: boolean; index: number; firstRealIndex: number; lastRealIndex: number; now: number }
) {
  if (!input.isSettledOnSnap) return
  const atTopEdge = input.index === input.firstRealIndex
  const atBottomEdge = input.index === input.lastRealIndex
  state.top = atTopEdge
  state.bottom = atBottomEdge
  if (state.armRequested && (atTopEdge || atBottomEdge)) {
    state.armedAtMs = input.now
    state.armRequested = false
  } else if (!atTopEdge && !atBottomEdge) {
    state.armedAtMs = null
    state.armRequested = false
  }
}

/** Clears the armed edges once a wrap starts. Leaves a pending arm request untouched. */
export function disarmEdges(state: EdgeArmState) {
  state.top = false
  state.bottom = false
  state.armedAtMs = null
}

/** Input that arrived after the edge was armed and within the recent-input window. */
export function hasFreshUserInput(armedAtMs: number | null, lastUserInputAtMs: number, now: number) {
  const hasRecentUserInput = now - lastUserInputAtMs < RECENT_INPUT_WINDOW_MS
  return armedAtMs != null && lastUserInputAtMs > armedAtMs && hasRecentUserInput
}

export type EdgeWrapInput = {
  armed: EdgeArmState
  hasFreshInput: boolean
  scrollDirLock: 1 | -1 | null
  deltaScrollTop: number
  lastDeltaSign: number
  pagePos: number
  firstRealIndex: number
  lastRealIndex: number
}

/** Which way the deck should wrap on this frame, if at all. */
export function resolveEdgeWrap(input: EdgeWrapInput): EdgeWrapDirection {
  const isMovingUp = input.scrollDirLock === -1 || input.deltaScrollTop < 0 || input.lastDeltaSign < 0
  const isMovingDown = input.scrollDirLock === 1 || input.deltaScrollTop > 0 || input.lastDeltaSign > 0

  if (input.armed.top && input.hasFreshInput && isMovingUp && input.pagePos <= input.firstRealIndex - PRE_WRAP_THRESHOLD) {
    return "up"
  }
  if (input.armed.bottom && input.hasFreshInput && isMovingDown && input.pagePos >= input.lastRealIndex + PRE_WRAP_THRESHOLD) {
    return "down"
  }
  return null
}

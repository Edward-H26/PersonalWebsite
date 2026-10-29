/**
 * Timing of a wrap: the jump from the last slide back to the overview (or the reverse) that
 * makes the deck endless. One wrap at a time, with a lock while it runs and a cooldown after
 * it lands during which scroll events are pinned to the landing slide.
 */

/** No second wrap may start for this long after one begins. */
export const WRAP_LOCK_MS = 800
/** Cooldown after landing on any slide other than the overview. */
export const DEFAULT_WRAP_COOLDOWN_MS = 380
/** Longer cooldown after landing on the overview, whose camera descent takes longer to settle. */
export const OVERVIEW_WRAP_COOLDOWN_MS = 650
/** Fraction of the remaining distance covered per scroll event while easing onto the target. */
export const WRAP_EASING = 0.2

export type WrapState = {
  inProgress: boolean
  lockUntilMs: number
  /** Slide the current wrap is easing onto, or null when no wrap is landing. */
  targetIndex: number | null
  /** Slide the most recent wrap landed on; pins scroll events during the cooldown. */
  lastTargetIndex: number | null
  lastEndedAtMs: number
  cooldownUntilMs: number
}

export function createWrapState(): WrapState {
  return { inProgress: false, lockUntilMs: 0, targetIndex: null, lastTargetIndex: null, lastEndedAtMs: 0, cooldownUntilMs: 0 }
}

/** True while a wrap runs or the post-start lock holds, so no other wrap or page step may begin. */
export function isWrapBlocked(state: WrapState, now: number) {
  return state.inProgress || now < state.lockUntilMs
}

/** Records the start of a wrap towards `targetIndex`. Mutates `state`. */
export function beginWrap(state: WrapState, targetIndex: number, now: number) {
  state.inProgress = true
  state.lockUntilMs = now + WRAP_LOCK_MS
  state.targetIndex = targetIndex
  state.lastTargetIndex = targetIndex
}

/** Landing on the overview earns the longer cooldown. */
export function getWrapCooldownMs(targetIndex: number | null, firstRealIndex: number) {
  return targetIndex === firstRealIndex ? OVERVIEW_WRAP_COOLDOWN_MS : DEFAULT_WRAP_COOLDOWN_MS
}

/** Marks the wrap as landed and starts its cooldown. Mutates `state`. */
export function finishWrap(state: WrapState, now: number, firstRealIndex: number) {
  state.targetIndex = null
  state.lastEndedAtMs = now
  state.cooldownUntilMs = now + getWrapCooldownMs(state.lastTargetIndex, firstRealIndex)
}

/** One easing step of the scroll position towards the wrap target. */
export function easeScrollTowards(current: number, target: number) {
  return current + (target - current) * WRAP_EASING
}

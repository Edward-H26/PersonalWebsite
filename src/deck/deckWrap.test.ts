import { describe, expect, it } from "vitest"
import {
  DEFAULT_WRAP_COOLDOWN_MS,
  OVERVIEW_WRAP_COOLDOWN_MS,
  WRAP_EASING,
  WRAP_LOCK_MS,
  beginWrap,
  createWrapState,
  easeScrollTowards,
  finishWrap,
  getWrapCooldownMs,
  isWrapBlocked
} from "./deckWrap"

describe("wrap state", () => {
  it("starts unblocked and blocks while a wrap runs or the lock holds", () => {
    const state = createWrapState()
    expect(isWrapBlocked(state, 0)).toBe(false)
    beginWrap(state, 30, 1000)
    expect(state).toMatchObject({ inProgress: true, targetIndex: 30, lastTargetIndex: 30, lockUntilMs: 1000 + WRAP_LOCK_MS })
    expect(isWrapBlocked(state, 1100)).toBe(true)
    state.inProgress = false
    expect(isWrapBlocked(state, 1000 + WRAP_LOCK_MS - 1)).toBe(true)
    expect(isWrapBlocked(state, 1000 + WRAP_LOCK_MS)).toBe(false)
  })

  it("lands with a cooldown that is longer on the overview", () => {
    const state = createWrapState()
    beginWrap(state, 1, 1000)
    finishWrap(state, 1500, 1)
    expect(state.targetIndex).toBeNull()
    expect(state.lastTargetIndex).toBe(1)
    expect(state.lastEndedAtMs).toBe(1500)
    expect(state.cooldownUntilMs).toBe(1500 + OVERVIEW_WRAP_COOLDOWN_MS)

    beginWrap(state, 30, 3000)
    finishWrap(state, 3400, 1)
    expect(state.cooldownUntilMs).toBe(3400 + DEFAULT_WRAP_COOLDOWN_MS)
  })
})

describe("getWrapCooldownMs", () => {
  it("picks the overview cooldown only for the first real slide", () => {
    expect(getWrapCooldownMs(1, 1)).toBe(OVERVIEW_WRAP_COOLDOWN_MS)
    expect(getWrapCooldownMs(30, 1)).toBe(DEFAULT_WRAP_COOLDOWN_MS)
    expect(getWrapCooldownMs(null, 1)).toBe(DEFAULT_WRAP_COOLDOWN_MS)
  })
})

describe("easeScrollTowards", () => {
  it("closes a fixed fraction of the remaining distance", () => {
    expect(easeScrollTowards(0, 100)).toBe(100 * WRAP_EASING)
    expect(easeScrollTowards(100, 100)).toBe(100)
    expect(easeScrollTowards(100, 0)).toBe(100 - 100 * WRAP_EASING)
  })
})

import { describe, expect, it } from "vitest"
import {
  PRE_WRAP_THRESHOLD,
  RECENT_INPUT_WINDOW_MS,
  createEdgeArmState,
  disarmEdges,
  hasFreshUserInput,
  resolveEdgeWrap,
  updateEdgeArming
} from "./edgeWrap"

const edges = { firstRealIndex: 1, lastRealIndex: 30 }

describe("updateEdgeArming", () => {
  it("arms the edge the deck rests on once a scroll end requested it", () => {
    const state = createEdgeArmState()
    updateEdgeArming(state, { ...edges, isSettledOnSnap: true, index: 1, now: 100 })
    expect(state).toMatchObject({ top: true, bottom: false, armedAtMs: null })
    state.armRequested = true
    updateEdgeArming(state, { ...edges, isSettledOnSnap: true, index: 1, now: 200 })
    expect(state).toMatchObject({ top: true, bottom: false, armedAtMs: 200, armRequested: false })
  })

  it("ignores frames that are still scrolling and clears the arm away from the edges", () => {
    const state = createEdgeArmState()
    state.armRequested = true
    updateEdgeArming(state, { ...edges, isSettledOnSnap: false, index: 1, now: 100 })
    expect(state).toMatchObject({ top: false, armedAtMs: null, armRequested: true })
    updateEdgeArming(state, { ...edges, isSettledOnSnap: true, index: 30, now: 100 })
    expect(state).toMatchObject({ bottom: true, armedAtMs: 100 })
    updateEdgeArming(state, { ...edges, isSettledOnSnap: true, index: 12, now: 300 })
    expect(state).toMatchObject({ top: false, bottom: false, armedAtMs: null, armRequested: false })
  })

  it("disarms without dropping a pending request", () => {
    const state = { top: true, bottom: false, armedAtMs: 5, armRequested: true }
    disarmEdges(state)
    expect(state).toEqual({ top: false, bottom: false, armedAtMs: null, armRequested: true })
  })
})

describe("hasFreshUserInput", () => {
  it("needs an armed edge, input after the arming and input inside the recent window", () => {
    expect(hasFreshUserInput(null, 500, 600)).toBe(false)
    expect(hasFreshUserInput(400, 300, 600)).toBe(false)
    expect(hasFreshUserInput(400, 500, 500 + RECENT_INPUT_WINDOW_MS)).toBe(false)
    expect(hasFreshUserInput(400, 500, 500 + RECENT_INPUT_WINDOW_MS - 1)).toBe(true)
  })
})

describe("resolveEdgeWrap", () => {
  const base = {
    armed: { top: true, bottom: true, armedAtMs: 0, armRequested: false },
    hasFreshInput: true,
    scrollDirLock: null,
    deltaScrollTop: 0,
    lastDeltaSign: 0,
    pagePos: 15,
    ...edges
  }

  it("wraps up past the first slide and down past the last, in the direction of travel", () => {
    expect(resolveEdgeWrap({ ...base, pagePos: 1 - PRE_WRAP_THRESHOLD, deltaScrollTop: -2 })).toBe("up")
    expect(resolveEdgeWrap({ ...base, pagePos: 1 - PRE_WRAP_THRESHOLD, lastDeltaSign: -1 })).toBe("up")
    expect(resolveEdgeWrap({ ...base, pagePos: 1 - PRE_WRAP_THRESHOLD, scrollDirLock: -1 })).toBe("up")
    expect(resolveEdgeWrap({ ...base, pagePos: 30 + PRE_WRAP_THRESHOLD, deltaScrollTop: 2 })).toBe("down")
    expect(resolveEdgeWrap({ ...base, pagePos: 30 + PRE_WRAP_THRESHOLD, scrollDirLock: 1 })).toBe("down")
  })

  it("stays put without an armed edge, fresh input, movement or enough overshoot", () => {
    const up = { ...base, pagePos: 1 - PRE_WRAP_THRESHOLD, deltaScrollTop: -2 }
    expect(resolveEdgeWrap({ ...up, armed: { ...base.armed, top: false } })).toBeNull()
    expect(resolveEdgeWrap({ ...up, hasFreshInput: false })).toBeNull()
    expect(resolveEdgeWrap({ ...up, deltaScrollTop: 0 })).toBeNull()
    expect(resolveEdgeWrap({ ...up, pagePos: 1 - PRE_WRAP_THRESHOLD / 2 })).toBeNull()
    expect(resolveEdgeWrap({ ...base, pagePos: 30 + PRE_WRAP_THRESHOLD, deltaScrollTop: -2 })).toBeNull()
  })
})

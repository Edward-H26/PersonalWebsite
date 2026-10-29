import { describe, expect, it } from "vitest"
import { SNAP_CORRECTION_PX, SNAP_SETTLE_FRAMES, SNAP_STILL_DELTA_PX, createSnapDriftState, trackSnapDrift } from "./snapDrift"

const resting = { isResting: true, index: 3, deltaScrollTop: 0, driftPx: SNAP_CORRECTION_PX + 1, isCooldownOver: true }

describe("trackSnapDrift", () => {
  it("asks for a correction once the deck has been still on a drifted slide long enough", () => {
    const state = createSnapDriftState()
    const results: boolean[] = []
    for (let frame = 0; frame < SNAP_SETTLE_FRAMES + 2; frame += 1) results.push(trackSnapDrift(state, resting))
    expect(results.indexOf(true)).toBe(SNAP_SETTLE_FRAMES - 1)
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(state.lastCorrectedIndex).toBe(3)
  })

  it("restarts the count when the deck moves or leaves the slide", () => {
    const state = createSnapDriftState()
    for (let frame = 0; frame < SNAP_SETTLE_FRAMES - 1; frame += 1) trackSnapDrift(state, resting)
    expect(trackSnapDrift(state, { ...resting, deltaScrollTop: SNAP_STILL_DELTA_PX })).toBe(false)
    expect(state.settledFrames).toBe(0)
    for (let frame = 0; frame < SNAP_SETTLE_FRAMES - 1; frame += 1) trackSnapDrift(state, resting)
    expect(trackSnapDrift(state, { ...resting, isResting: false })).toBe(false)
    expect(state.lastSnapIndex).toBeNull()
    expect(trackSnapDrift(state, { ...resting, index: 4 })).toBe(false)
    expect(state.lastSnapIndex).toBe(4)
  })

  it("never corrects a slide that sits close enough, during a cooldown, or twice", () => {
    const state = createSnapDriftState()
    for (let frame = 0; frame < SNAP_SETTLE_FRAMES; frame += 1) {
      expect(trackSnapDrift(state, { ...resting, driftPx: SNAP_CORRECTION_PX })).toBe(false)
    }
    expect(trackSnapDrift(state, { ...resting, isCooldownOver: false })).toBe(false)
    expect(trackSnapDrift(state, resting)).toBe(true)
    expect(trackSnapDrift(state, resting)).toBe(false)
    trackSnapDrift(state, { ...resting, index: 5 })
    expect(state.lastCorrectedIndex).toBeNull()
  })
})

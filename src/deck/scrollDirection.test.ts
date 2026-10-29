import { describe, expect, it } from "vitest"
import { TRAVEL_DIR_HEIGHT_FRACTION, TRAVEL_DIR_MIN_PX, getTravelDirThresholdPx, lockScrollDirection } from "./scrollDirection"

describe("getTravelDirThresholdPx", () => {
  it("scales with the slide height but never drops below the floor", () => {
    expect(getTravelDirThresholdPx(900)).toBe(900 * TRAVEL_DIR_HEIGHT_FRACTION)
    expect(getTravelDirThresholdPx(100)).toBe(TRAVEL_DIR_MIN_PX)
  })
})

describe("lockScrollDirection", () => {
  it("locks the first clear movement and then keeps the lock", () => {
    expect(lockScrollDirection(null, 1, 2)).toBeNull()
    expect(lockScrollDirection(null, 2, 2)).toBe(1)
    expect(lockScrollDirection(null, -5, 2)).toBe(-1)
    expect(lockScrollDirection(1, -50, 2)).toBe(1)
    expect(lockScrollDirection(-1, 0, 2)).toBe(-1)
  })
})

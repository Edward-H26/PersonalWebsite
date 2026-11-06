import { describe, expect, it } from "vitest"
import { fract, loopDelta } from "./math"

describe("loopDelta", () => {
  it("is the plain difference for nearby points", () => {
    expect(loopDelta(0.2, 0.3)).toBeCloseTo(0.1, 12)
    expect(loopDelta(0.3, 0.2)).toBeCloseTo(-0.1, 12)
  })

  it("goes the short way across the loop's seam", () => {
    expect(loopDelta(0.95, 0.05)).toBeCloseTo(0.1, 12)
    expect(loopDelta(0.05, 0.95)).toBeCloseTo(-0.1, 12)
    expect(loopDelta(0.98, 1)).toBeCloseTo(0.02, 12)
    expect(loopDelta(1, 0)).toBe(0)
  })

  it("never steps more than half way round", () => {
    for (let from = 0; from <= 1; from += 0.07) {
      for (let to = 0; to <= 1; to += 0.11) {
        expect(Math.abs(loopDelta(from, to))).toBeLessThanOrEqual(0.5)
      }
    }
  })
})

describe("fract", () => {
  it("wraps any value onto [0, 1)", () => {
    expect(fract(1.25)).toBeCloseTo(0.25, 12)
    expect(fract(-0.25)).toBeCloseTo(0.75, 12)
    expect(fract(1)).toBe(0)
  })
})

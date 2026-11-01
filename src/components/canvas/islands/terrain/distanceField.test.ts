import { describe, expect, it } from "vitest"
import { DistanceField } from "./distanceField"

describe("DistanceField", () => {
  it("measures the straight-line distance to the nearest seed", () => {
    const field = new DistanceField({ origin: [0, 0], size: [100, 80] }, 1, [
      [20, 20],
      [80, 60]
    ])
    expect(field.sample(20, 20)).toBe(0)
    expect(field.sample(23, 24)).toBeCloseTo(5, 6)
    expect(field.sample(80, 40)).toBeCloseTo(20, 6)
    expect(field.sample(0, 0)).toBeCloseTo(Math.hypot(20, 20), 6)
  })

  it("stays within half a cell's diagonal on a coarse grid", () => {
    const seeds: Array<[number, number]> = Array.from({ length: 50 }, (_, i) => [10 + i, 30 + 0.3 * i])
    const field = new DistanceField({ origin: [0, 0], size: [120, 90] }, 2, seeds)
    for (const [x, y] of [
      [5, 5],
      [40, 70],
      [100, 20],
      [61.5, 44.3]
    ]) {
      const exact = Math.min(...seeds.map(([sx, sy]) => Math.hypot(sx - x, sy - y)))
      expect(Math.abs(field.sample(x, y) - exact)).toBeLessThanOrEqual(Math.SQRT2 + 1e-6)
    }
  })

  it("holds its edge value beyond its region", () => {
    const field = new DistanceField({ origin: [0, 0], size: [50, 50] }, 1, [[25, 25]])
    expect(field.sample(-10, 25)).toBeCloseTo(field.sample(0, 25), 6)
    expect(field.sample(80, 25)).toBeCloseTo(field.sample(50, 25), 6)
  })

  it("covers a region that starts off the map's origin", () => {
    const field = new DistanceField({ origin: [-40, -20], size: [80, 60] }, 2, [[-30, 0]])
    expect(field.sample(-30, 0)).toBeCloseTo(0, 6)
    expect(field.sample(-30, 30)).toBeCloseTo(30, 6)
    expect(field.columns).toBe(41)
    expect(field.cellDistance(5, 10)).toBeCloseTo(0, 6)
  })
})

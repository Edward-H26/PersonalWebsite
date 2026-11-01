import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { OCEAN_SIZE, type Shore, buildSeaGeometry, seaRingRadii } from "./seaGeometry"

/** A round island of radius 150 about (10, -20). */
const ROUND: Shore = { centre: { x: 10, z: -20 }, nearestWater: 150, distance: (x, z) => Math.hypot(x - 10, z + 20) - 150 }

describe("seaRingRadii", () => {
  it("steps four units at a time near the island and widens further out", () => {
    const radii = seaRingRadii(100, 5000)
    expect(radii[0]).toBe(100)
    expect(radii[1] - radii[0]).toBeCloseTo(4, 9)
    const steps = radii.slice(1).map((r, i) => r - radii[i])
    for (let i = 1; i < steps.length; i += 1) expect(steps[i]).toBeGreaterThanOrEqual(steps[i - 1] - 1e-9)
    expect(radii[radii.length - 1]).toBeGreaterThanOrEqual(5000)
  })
})

describe("buildSeaGeometry", () => {
  const geometry = buildSeaGeometry(ROUND)
  const position = geometry.getAttribute("position")
  const shore = geometry.getAttribute("aShore")

  it("tags every vertex with its distance from the shore, the innermost ring tucked under the land", () => {
    let nearest = Number.POSITIVE_INFINITY
    let worstError = 0
    let highest = 0
    for (let v = 0; v < position.count; v += 1) {
      worstError = Math.max(worstError, Math.abs(shore.getX(v) - ROUND.distance(position.getX(v), position.getZ(v))))
      highest = Math.max(highest, Math.abs(position.getY(v)))
      nearest = Math.min(nearest, shore.getX(v))
    }
    expect(worstError).toBeLessThan(0.01)
    expect(highest).toBe(0)
    expect(nearest).toBeLessThan(0)
    expect(nearest).toBeGreaterThan(-10)
  })

  it("reaches out to half the ocean's size", () => {
    let farthest = 0
    for (let v = 0; v < position.count; v += 1) {
      farthest = Math.max(farthest, Math.hypot(position.getX(v) - ROUND.centre.x, position.getZ(v) - ROUND.centre.z))
    }
    expect(farthest).toBeGreaterThanOrEqual(OCEAN_SIZE / 2)
  })

  it("faces every triangle up at the sky", () => {
    const index = geometry.getIndex()!
    const a = new THREE.Vector3()
    const b = new THREE.Vector3()
    const c = new THREE.Vector3()
    const normal = new THREE.Vector3()
    let facingDown = 0
    for (let i = 0; i < index.count; i += 3) {
      a.fromBufferAttribute(position, index.getX(i))
      b.fromBufferAttribute(position, index.getX(i + 1))
      c.fromBufferAttribute(position, index.getX(i + 2))
      normal.crossVectors(b.sub(a), c.sub(a))
      if (normal.y <= 0) facingDown += 1
    }
    expect(facingDown).toBe(0)
  })
})

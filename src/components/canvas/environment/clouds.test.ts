import { describe, expect, it } from "vitest"
import {
  CLOUD_BANK,
  CLOUD_DRIFT_SPEED,
  CLOUD_REGION,
  MANUSCRIPT_CLOUD_LOBES,
  buildCloudGeometry,
  cloudShadowSources,
  driftedCloud
} from "./clouds"
import { WIND_DIRECTION } from "./wind"

describe("the manuscript cloud", () => {
  const geometry = buildCloudGeometry()
  const position = geometry.getAttribute("position")
  const normal = geometry.getAttribute("normal")

  it("sits on a flat base, its lobes spanning the frame from -1 to 1", () => {
    let lowest = Infinity
    let onBase = 0
    for (let v = 0; v < position.count; v += 1) {
      lowest = Math.min(lowest, position.getY(v))
      expect(Math.abs(position.getX(v))).toBeLessThanOrEqual(1)
      if (position.getY(v) === 0) {
        onBase += 1
        expect(normal.getY(v)).toBeLessThan(0)
      }
    }
    expect(lowest).toBe(0)
    expect(onBase).toBeGreaterThan(position.count / 10)
    expect(position.count).toBe(MANUSCRIPT_CLOUD_LOBES.length * 180 * 3)
  })
})

describe("the cloud drift", () => {
  const cloud = CLOUD_BANK[0]

  it("carries the clouds with the shared wind at the drift speed", () => {
    const later = driftedCloud(cloud, 10)
    expect(later.x - cloud.x).toBeCloseTo(WIND_DIRECTION.x * CLOUD_DRIFT_SPEED * 10, 6)
    expect(later.z - cloud.z).toBeCloseTo(WIND_DIRECTION.y * CLOUD_DRIFT_SPEED * 10, 6)
  })

  it("brings a cloud leaving downwind back upwind, shrinking it away at the edge first", () => {
    for (const seconds of [0, 300, 900, 2400, 9000]) {
      for (const placement of CLOUD_BANK) {
        const { x, z, keep } = driftedCloud(placement, seconds)
        expect(Math.abs(x)).toBeLessThanOrEqual(CLOUD_REGION)
        expect(Math.abs(z)).toBeLessThanOrEqual(CLOUD_REGION)
        expect(keep).toBeGreaterThanOrEqual(0)
        expect(keep).toBeLessThanOrEqual(1)
      }
    }
    expect(driftedCloud({ x: 0, z: CLOUD_REGION - 1 }, 0).keep).toBeLessThan(0.01)
  })

  it("stays put while time stands still", () => {
    expect(driftedCloud(cloud, 0)).toMatchObject({ x: cloud.x, z: cloud.z, keep: 1 })
  })

  it("gives section 12 a shadow source for every cloud, where it has drifted and as wide as it is kept", () => {
    const sources = cloudShadowSources(120)
    expect(sources).toHaveLength(CLOUD_BANK.length)
    CLOUD_BANK.forEach((placement, i) => {
      const { x, z, keep } = driftedCloud(placement, 120)
      expect(sources[i]).toEqual({ x, z, radius: (placement.width / 2) * keep })
    })
  })
})

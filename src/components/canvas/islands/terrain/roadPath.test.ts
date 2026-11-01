import { describe, expect, it } from "vitest"
import { RoadPath } from "./roadPath"
import { mapToScene } from "./terrainData"
import { TERRAIN } from "./terrainFixture"

describe("the ring road as a path", () => {
  const ring = new RoadPath(TERRAIN.roads.ring, TERRAIN.map)
  const walk = new RoadPath(TERRAIN.roads.ring, TERRAIN.map, 10)

  it("starts at the quay and closes on itself", () => {
    const quay = mapToScene(TERRAIN.map, ...TERRAIN.points.quay)
    expect(ring.closed).toBe(true)
    expect(
      ring
        .getPointAt(0)
        .toArray()
        .map((v, i) => v - quay[i])
    ).toEqual([0, 0, 0].map(() => expect.closeTo(0, 2)))
    expect(ring.getPointAt(1).distanceTo(ring.getPointAt(0))).toBeLessThan(1e-6)
    expect(ring.getPointAt(1.25).distanceTo(ring.getPointAt(0.25))).toBeLessThan(1e-6)
  })

  it("measures its plan length in scene units", () => {
    expect(ring.length).toBeCloseTo(TERRAIN.roads.ring.lengthPx * TERRAIN.map.unitsPerPx)
  })

  it("crosses the stream mouth on the stone bridge, about 1.5 m above the water", () => {
    const [mouthX, mouthY] = TERRAIN.points.mouth
    const [x, , z] = mapToScene(TERRAIN.map, mouthX, mouthY)
    const deck = ring.getPointAt(ring.nearestT(x, z)).y
    const water = TERRAIN.stream.points[TERRAIN.stream.points.length - 1][2] * TERRAIN.map.heightScale
    expect((deck - water) / TERRAIN.map.unitsPerMetre).toBeCloseTo(1.5, 0)
  })

  it("rounds its corners into a walk that stays on the 7 m road", () => {
    for (const [x, y, , , t] of TERRAIN.roads.ring.points) {
      const [sx, , sz] = mapToScene(TERRAIN.map, x, y)
      const p = walk.getPointAt(t)
      expect(Math.hypot(p.x - sx, p.z - sz) / TERRAIN.map.unitsPerMetre).toBeLessThan(2.5)
    }
  })

  it("turns the walk at most 5 degrees a pixel, under half as sharply as the centreline", () => {
    const step = 1 / TERRAIN.roads.ring.lengthPx
    let sharpest = 0
    let sharpestRoad = 0
    for (let t = 0; t < 1; t += step) {
      const here = walk.getTangentAt(t)
      expect(here.length()).toBeCloseTo(1)
      sharpest = Math.max(sharpest, here.angleTo(walk.getTangentAt(t + step)))
      sharpestRoad = Math.max(sharpestRoad, ring.getTangentAt(t).angleTo(ring.getTangentAt(t + step)))
    }
    expect(sharpest).toBeLessThan((5 * Math.PI) / 180)
    expect(sharpestRoad).toBeGreaterThan(sharpest * 2)
  })

  it("finds the t of a place beside the road", () => {
    const [x, , z] = mapToScene(TERRAIN.map, 452, 418)
    const t = ring.nearestT(x, z)
    const square = TERRAIN.roads.ring.points.find((row) => row[0] === 450 && row[1] === 420)
    expect(t).toBeCloseTo(square ? square[4] : t, 2)
  })
})

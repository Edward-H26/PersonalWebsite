import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { EARTH_ISLAND, EARTH_ROUTE_POINTS } from "@/config"
import {
  BRANCH_WIDTH,
  ISLAND_OUTLINE_SEGMENTS,
  ISLAND_SHORE_RADIUS,
  PATH_WIDTH,
  SIDE_ROAD_OVERRUN,
  buildIslandOutline,
  distanceInsideOutline,
  distanceToRoadEdge,
  getTrackFrameAt,
  junctionPoints,
  makeCliffGeometry,
  makeIslandTopGeometry,
  makePathRibbonGeometry,
  makeSideRoadCurve,
  pushClearOfRoads,
  sampleRoadNetwork,
  scatterOnIsland,
  surfaceHeight,
  trackPointAt
} from "./islandGeometry"

const scale = EARTH_ISLAND.scale
const routeCurve = new THREE.CatmullRomCurve3(
  EARTH_ROUTE_POINTS.map((p) => new THREE.Vector3(p[0] / scale, p[1] / scale, p[2] / scale)),
  false,
  "catmullrom",
  0.5
)
const outline = buildIslandOutline(routeCurve, scale)

function roadDistance(x: number, z: number) {
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i <= 400; i += 1) {
    const p = trackPointAt(routeCurve, i / 400, scale)
    best = Math.min(best, Math.hypot(p.x - x, p.z - z))
  }
  return best
}

describe("island outline", () => {
  it("is a solid landmass: every direction has a coastline", () => {
    expect(outline.radii).toHaveLength(ISLAND_OUTLINE_SEGMENTS)
    for (const r of outline.radii) expect(r).toBeGreaterThan(ISLAND_SHORE_RADIUS)
  })

  it("keeps the whole road at least the shore margin inland (no pit, no road over water)", () => {
    for (let i = 0; i <= 200; i += 1) {
      const p = trackPointAt(routeCurve, i / 200, scale)
      expect(distanceInsideOutline(outline, p.x, p.z)).toBeGreaterThan(ISLAND_SHORE_RADIUS - 8)
    }
  })

  it("covers the island centre, which used to be a hole", () => {
    expect(distanceInsideOutline(outline, outline.centerX, outline.centerZ)).toBeGreaterThan(40)
  })

  it("has a consistent perimeter measurement", () => {
    expect(outline.arcLengths[ISLAND_OUTLINE_SEGMENTS]).toBeCloseTo(outline.perimeter, 6)
    expect(outline.perimeter).toBeGreaterThan(2 * Math.PI * Math.min(...outline.radii))
  })
})

describe("terrain and cliff geometry", () => {
  const topY = 14
  const top = makeIslandTopGeometry(outline, (x, z) => topY + surfaceHeight(x, z, scale))
  const cliff = makeCliffGeometry(outline, (x, z) => topY + surfaceHeight(x, z, scale), topY - 42)

  it("builds an indexed top mesh with uv1 for ambient occlusion", () => {
    expect(top.index).not.toBeNull()
    expect(top.attributes.uv1).toBeDefined()
    expect(top.boundingSphere).not.toBeNull()
  })

  it("keeps the cliff rim exactly on the terrain rim so there is no gap", () => {
    const cliffPositions = cliff.attributes.position
    const topPositions = top.attributes.position
    const rings = topPositions.count - 1
    const rimStart = rings - ISLAND_OUTLINE_SEGMENTS + 1
    for (let i = 0; i < ISLAND_OUTLINE_SEGMENTS; i += 4) {
      const cliffRow0 = i * 15
      const rimVertex = rimStart + i
      expect(cliffPositions.getX(cliffRow0)).toBeCloseTo(topPositions.getX(rimVertex), 5)
      expect(cliffPositions.getY(cliffRow0)).toBeCloseTo(topPositions.getY(rimVertex), 5)
      expect(cliffPositions.getZ(cliffRow0)).toBeCloseTo(topPositions.getZ(rimVertex), 5)
    }
  })

  it("puts the cliff base below the waterline", () => {
    const positions = cliff.attributes.position
    let minY = Number.POSITIVE_INFINITY
    for (let i = 0; i < positions.count; i += 1) minY = Math.min(minY, positions.getY(i))
    expect(minY).toBeLessThan(0)
  })
})

describe("roads", () => {
  const interior = [new THREE.Vector3(24, 0, 10), new THREE.Vector3(-6, 0, 6), new THREE.Vector3(-30, 0, 4)]
  const east = junctionPoints(routeCurve, 0.385, scale, interior[0])
  const west = junctionPoints(routeCurve, 0.735, scale, interior[2])
  const branch = makeSideRoadCurve([east.onRoad, east.approach, ...interior, west.approach, west.onRoad])

  it("starts and ends a side road on the main road centreline", () => {
    expect(roadDistance(east.onRoad.x, east.onRoad.z)).toBeLessThan(0.5)
    expect(roadDistance(west.onRoad.x, west.onRoad.z)).toBeLessThan(0.5)
  })

  it("approaches the main road at a right angle", () => {
    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const perp = new THREE.Vector3()
    const side = new THREE.Vector3()
    getTrackFrameAt(routeCurve, 0.385, point, tangent, perp, side, scale)
    const approach = east.approach.clone().sub(east.onRoad).normalize()
    expect(Math.abs(approach.dot(tangent))).toBeLessThan(0.02)
  })

  it("overruns the centreline by less than half the main road width so the end stays hidden", () => {
    const start = branch.getPointAt(0)
    const end = branch.getPointAt(1)
    expect(start.distanceTo(east.onRoad)).toBeCloseTo(SIDE_ROAD_OVERRUN, 3)
    expect(end.distanceTo(west.onRoad)).toBeCloseTo(SIDE_ROAD_OVERRUN, 3)
    expect(SIDE_ROAD_OVERRUN).toBeLessThan(PATH_WIDTH / 2)
  })

  it("keeps the side road inland along its whole length", () => {
    for (let i = 0; i <= 50; i += 1) {
      const p = branch.getPointAt(i / 50)
      expect(distanceInsideOutline(outline, p.x, p.z)).toBeGreaterThan(10)
    }
  })

  it("builds ribbons with square-tiling UVs along the road", () => {
    const ribbon = makePathRibbonGeometry(branch, BRANCH_WIDTH, 40, 0.2, scale, false)
    const uvs = ribbon.attributes.uv
    expect(ribbon.attributes.position.count).toBe(82)
    for (let i = 1; i <= 40; i += 1) {
      expect(uvs.getY(i * 2)).toBeGreaterThan(uvs.getY((i - 1) * 2))
    }
    expect(uvs.getX(1) - uvs.getX(0)).toBeCloseTo(BRANCH_WIDTH / 9, 6)
  })

  it("reports negative edge distance on the road surface and positive beside it", () => {
    const samples = sampleRoadNetwork([{ curve: routeCurve, halfWidth: PATH_WIDTH / 2, followCameraTrack: true }], scale)
    const onRoad = trackPointAt(routeCurve, 0.3, scale)
    expect(distanceToRoadEdge(onRoad.x, onRoad.z, samples)).toBeLessThan(0)
    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const perp = new THREE.Vector3()
    const side = new THREE.Vector3()
    getTrackFrameAt(routeCurve, 0.3, point, tangent, perp, side, scale)
    const beside = point.clone().addScaledVector(perp, 12)
    expect(distanceToRoadEdge(beside.x, beside.z, samples)).toBeGreaterThan(7)
  })

  it("pushes a point off the road until it clears the edge", () => {
    const samples = sampleRoadNetwork([{ curve: routeCurve, halfWidth: PATH_WIDTH / 2, followCameraTrack: true }], scale)
    const onRoad = trackPointAt(routeCurve, 0.6, scale)
    const moved = pushClearOfRoads(onRoad.x + 0.3, onRoad.z, 3, samples)
    expect(distanceToRoadEdge(moved.x, moved.z, samples)).toBeGreaterThanOrEqual(2.9)
    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const perp = new THREE.Vector3()
    const side = new THREE.Vector3()
    getTrackFrameAt(routeCurve, 0.6, point, tangent, perp, side, scale)
    const clear = point.clone().addScaledVector(perp, 12)
    expect(pushClearOfRoads(clear.x, clear.z, 3, samples)).toEqual({ x: clear.x, z: clear.z })
  })
})

describe("scatterOnIsland", () => {
  const samples = sampleRoadNetwork([{ curve: routeCurve, halfWidth: PATH_WIDTH / 2, followCameraTrack: true }], scale)
  const footprints = [{ x: 0, z: 0, radius: 30 }]
  const options = { count: 120, seed: 5, radius: 1.5, shoreMargin: 6, roadClearance: 2, minScale: 0.8, maxScale: 1.2 }
  const placed = scatterOnIsland(outline, samples, footprints, options)

  it("is deterministic for a seed", () => {
    expect(scatterOnIsland(outline, samples, footprints, options)).toEqual(placed)
    expect(scatterOnIsland(outline, samples, footprints, { ...options, seed: 6 })).not.toEqual(placed)
  })

  it("keeps every instance on land, off the road, and out of footprints", () => {
    expect(placed.length).toBe(120)
    for (const p of placed) {
      expect(distanceInsideOutline(outline, p.x, p.z)).toBeGreaterThanOrEqual(6)
      expect(distanceToRoadEdge(p.x, p.z, samples)).toBeGreaterThanOrEqual(3.5)
      expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(31.5)
      expect(p.scale).toBeGreaterThanOrEqual(0.8)
      expect(p.scale).toBeLessThanOrEqual(1.2)
    }
  })

  it("keeps instances apart from each other", () => {
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        expect(Math.hypot(placed[i].x - placed[j].x, placed[i].z - placed[j].z)).toBeGreaterThanOrEqual(1.8)
      }
    }
  })

  it("returns fewer instances rather than violating constraints when space runs out", () => {
    const crowded = scatterOnIsland(outline, samples, [{ x: outline.centerX, z: outline.centerZ, radius: 200 }], { ...options, count: 10 })
    expect(crowded).toHaveLength(0)
  })
})

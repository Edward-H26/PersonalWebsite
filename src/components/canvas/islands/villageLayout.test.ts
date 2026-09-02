import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { EARTH_ISLAND, EARTH_ROUTE_POINTS } from "@/config"
import {
  BRANCH_WIDTH,
  PATH_WIDTH,
  buildIslandOutline,
  distanceInsideOutline,
  distanceToRoadEdge,
  junctionPoints,
  makeSideRoadCurve,
  sampleRoadNetwork,
  surfaceHeight,
  trackPointAt
} from "./islandGeometry"
import { GRASS_SCATTERS, INTERIOR_BUILDINGS, ROAD_BUILDINGS, buildVillageLayout } from "./villageLayout"

const scale = EARTH_ISLAND.scale
const routeCurve = new THREE.CatmullRomCurve3(
  EARTH_ROUTE_POINTS.map((p) => new THREE.Vector3(p[0] / scale, p[1] / scale, p[2] / scale)),
  false,
  "catmullrom",
  0.5
)
const outline = buildIslandOutline(routeCurve, scale)
const interior = [new THREE.Vector3(24, 0, 10), new THREE.Vector3(-6, 0, 6), new THREE.Vector3(-30, 0, 4)]
const east = junctionPoints(routeCurve, 0.385, scale, interior[0])
const west = junctionPoints(routeCurve, 0.735, scale, interior[2])
const branch = makeSideRoadCurve([east.onRoad, east.approach, ...interior, west.approach, west.onRoad])
const from = junctionPoints(routeCurve, 0.995, scale, trackPointAt(routeCurve, 0.006, scale))
const to = junctionPoints(routeCurve, 0.006, scale, trackPointAt(routeCurve, 0.995, scale))
const link = makeSideRoadCurve([from.onRoad, from.approach, to.approach, to.onRoad])
const roads = sampleRoadNetwork(
  [
    { curve: routeCurve, halfWidth: PATH_WIDTH / 2, followCameraTrack: true },
    { curve: branch, halfWidth: BRANCH_WIDTH / 2, followCameraTrack: false },
    { curve: link, halfWidth: BRANCH_WIDTH / 2, followCameraTrack: false }
  ],
  scale
)
const topY = 14
const layout = buildVillageLayout({
  routeCurve,
  outline,
  roads,
  worldScale: scale,
  sampleGroundY: (x, z) => topY + surfaceHeight(x, z, scale)
})

describe("buildVillageLayout", () => {
  it("places every building and prop on land", () => {
    for (const p of [...layout.buildings, ...layout.props]) {
      expect(distanceInsideOutline(outline, p.position[0], p.position[2])).toBeGreaterThan(0)
    }
    expect(layout.buildings).toHaveLength(ROAD_BUILDINGS.length + INTERIOR_BUILDINGS.length)
  })

  it("keeps buildings clear of the roads by their footprint", () => {
    for (const b of layout.buildings) {
      const radius = (b.fitHeight ?? 10) * 0.45
      expect(distanceToRoadEdge(b.position[0], b.position[2], roads)).toBeGreaterThanOrEqual(radius)
    }
  })

  it("keeps rocks, stumps, and trees off the road surface", () => {
    for (const group of layout.instanced) {
      if (!/Trees|boulders|mossRocks|stumps/.test(group.key)) continue
      for (const instance of group.instances) {
        expect(distanceToRoadEdge(instance.position[0], instance.position[2], roads)).toBeGreaterThan(0.5)
      }
    }
  })

  it("does not put any scattered object inside a building footprint", () => {
    const buildingFootprints = layout.buildings.map((b) => ({ x: b.position[0], z: b.position[2], radius: (b.fitHeight ?? 10) * 0.45 }))
    for (const group of layout.instanced) {
      if (/seaMarkers|fences|lanterns|barrels|crates|cypress/.test(group.key)) continue
      for (const instance of group.instances) {
        for (const f of buildingFootprints) {
          expect(Math.hypot(f.x - instance.position[0], f.z - instance.position[2])).toBeGreaterThan(f.radius * 0.95)
        }
      }
    }
  })

  it("scatters the requested amount of grass and flowers", () => {
    const grassKeys = new Set(GRASS_SCATTERS.map((s) => s.key))
    const grassCount = layout.instanced.filter((g) => grassKeys.has(g.key)).reduce((sum, g) => sum + g.instances.length, 0)
    expect(grassCount).toBeGreaterThanOrEqual(GRASS_SCATTERS.reduce((sum, s) => sum + s.count, 0) * 0.9)
  })

  it("sits every land object on the terrain surface", () => {
    for (const p of [...layout.buildings, ...layout.props]) {
      const ground = topY + surfaceHeight(p.position[0], p.position[2], scale)
      expect(Math.abs(p.position[1] - ground)).toBeLessThan(0.5)
    }
  })

  it("floats the harbor in the sea beyond the coastline", () => {
    for (const p of layout.harbor) {
      expect(distanceInsideOutline(outline, p.position[0], p.position[2])).toBeLessThan(0)
      expect(p.position[1]).toBeLessThan(1)
    }
    const markers = layout.instanced.find((g) => g.key === "seaMarkers")!
    expect(markers.instances).toHaveLength(2)
    for (const m of markers.instances) expect(distanceInsideOutline(outline, m.position[0], m.position[2])).toBeLessThan(0)
  })

  it("is deterministic across builds", () => {
    const again = buildVillageLayout({ routeCurve, outline, roads, worldScale: scale, sampleGroundY: (x, z) => topY + surfaceHeight(x, z, scale) })
    expect(again.instanced.map((g) => g.instances.length)).toEqual(layout.instanced.map((g) => g.instances.length))
    expect(again.buildings).toEqual(layout.buildings)
  })
})

// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import * as THREE from "three"
import { buildHarbor } from "@/components/canvas/islands/layout/harbor"
import { islandOverviewScene } from "@/components/canvas/islands/layout/overview"
import { loadIslandTerrain } from "@/components/canvas/islands/terrain/terrainFixture"
import { TerrainSite } from "@/components/canvas/islands/terrain/terrainSite"
import { type OverviewScene, getOverviewFraming } from "./overviewFraming"

const FOV = 55
const MARGIN = 12
const HERO_CARD_RIGHT = 592

let scene: OverviewScene
/** The coastline at sea level, in world units. */
let coast: THREE.Vector3[]

beforeAll(async () => {
  const site = new TerrainSite(await loadIslandTerrain())
  scene = islandOverviewScene(site, buildHarbor(site))
  coast = site.terrain.data.coast.outline.map((point) => {
    const [x, z] = site.scene(point)
    return new THREE.Vector3(x, 0, z)
  })
})

function project(width: number, height: number, points: readonly THREE.Vector3[]) {
  const framing = getOverviewFraming(scene, width, height, FOV)
  const camera = new THREE.PerspectiveCamera(FOV, width / height, 0.1, 20000)
  camera.position.copy(framing.position)
  camera.setViewOffset(width, height, framing.viewOffset.x, framing.viewOffset.y, width, height)
  camera.lookAt(framing.lookAt)
  camera.updateMatrixWorld(true)
  return points.map((p) => {
    const v = p.clone().project(camera)
    return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height }
  })
}

const VIEWPORTS: [number, number][] = [
  [1440, 900],
  [1280, 800],
  [1920, 1080],
  [1024, 768],
  [768, 1024],
  [412, 839],
  [390, 844]
]

describe("getOverviewFraming", () => {
  it.each(VIEWPORTS)("keeps the whole island, up to its skyline, and the harbor on a %ix%i screen with a margin", (width, height) => {
    for (const p of project(width, height, scene.phonePoints)) {
      expect(p.x).toBeGreaterThan(MARGIN)
      expect(p.x).toBeLessThan(width - MARGIN)
      expect(p.y).toBeGreaterThan(MARGIN)
      expect(p.y).toBeLessThan(height - MARGIN)
    }
  })

  it("keeps the island to the right of the hero card on a laptop screen", () => {
    for (const p of project(1440, 900, coast)) expect(p.x).toBeGreaterThan(HERO_CARD_RIGHT)
  })

  it("keeps the camera direction and look-at target of the bird's-eye view", () => {
    const wide = getOverviewFraming(scene, 1440, 900, FOV)
    const narrow = getOverviewFraming(scene, 412, 839, FOV)
    expect(narrow.lookAt.toArray()).toEqual(wide.lookAt.toArray())
    const direction = (f: typeof wide) => f.lookAt.clone().sub(f.position).normalize()
    // The cross product's length is the sine of the angle between them, exact down to rounding, where
    // angleTo's acos cannot resolve anything finer than 1.5e-8.
    expect(direction(narrow).cross(direction(wide)).length()).toBeLessThan(1e-9)
  })
})

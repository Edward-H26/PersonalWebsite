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
const HERO_CARD = { right: 592, bottom: 481 }

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

const WIDE: [number, number][] = [
  [1440, 900],
  [1280, 800],
  [1920, 1080],
  [1024, 768],
  [768, 1024]
]
const PHONES: [number, number][] = [
  [412, 839],
  [390, 844]
]
const VIEWPORTS = [...WIDE, ...PHONES]

/** Where the horizon crosses the screen, in CSS pixels from the top. */
function horizonY(width: number, height: number) {
  const framing = getOverviewFraming(scene, width, height, FOV)
  const ahead = framing.lookAt.clone().sub(framing.position).setY(0).normalize().multiplyScalar(1e6)
  return project(width, height, [framing.position.clone().add(ahead)])[0].y
}

/** How far the camera looks down from the horizontal, in degrees. */
function elevation(framing: { position: THREE.Vector3; lookAt: THREE.Vector3 }) {
  const direction = framing.lookAt.clone().sub(framing.position)
  return THREE.MathUtils.radToDeg(Math.atan2(-direction.y, Math.hypot(direction.x, direction.z)))
}

describe("getOverviewFraming", () => {
  it.each(VIEWPORTS)("keeps the whole island, up to its skyline, and the harbor on a %ix%i screen with a margin", (width, height) => {
    for (const p of project(width, height, scene.points)) {
      expect(p.x).toBeGreaterThan(MARGIN)
      expect(p.x).toBeLessThan(width - MARGIN)
      expect(p.y).toBeGreaterThan(MARGIN)
      expect(p.y).toBeLessThan(height - MARGIN)
    }
  })

  it.each(WIDE)("keeps the island and the harbor clear of the hero card on a %ix%i screen", (width, height) => {
    for (const p of project(width, height, scene.points)) expect(p.x > HERO_CARD.right || p.y > HERO_CARD.bottom).toBe(true)
  })

  it("fills two thirds of a laptop screen's width with the island, the sea and the sky above it", () => {
    const shore = project(1440, 900, coast)
    const xs = shore.map((p) => p.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan((2 / 3) * 1440)
    expect(horizonY(1440, 900)).toBeGreaterThan(0)
    expect(horizonY(1440, 900)).toBeLessThan(Math.min(...shore.map((p) => p.y)))
  })

  it.each(PHONES)(
    "spans nine tenths of a %ix%i phone's width with the island and the harbor, the horizon a third down",
    (width, height) => {
      const xs = project(width, height, scene.points).map((p) => p.x)
      expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.9 * width, 0)
      expect(horizonY(width, height)).toBeCloseTo(height / 3, 0)
    }
  )

  it("looks down 18 degrees from one direction at one target on every screen", () => {
    const wide = getOverviewFraming(scene, 1440, 900, FOV)
    const narrow = getOverviewFraming(scene, 412, 839, FOV)
    expect(elevation(wide)).toBeCloseTo(18, 6)
    expect(narrow.lookAt.toArray()).toEqual(wide.lookAt.toArray())
    const direction = (f: typeof wide) => f.lookAt.clone().sub(f.position).normalize()
    // The cross product's length is the sine of the angle between them, exact down to rounding, where
    // angleTo's acos cannot resolve anything finer than 1.5e-8.
    expect(direction(narrow).cross(direction(wide)).length()).toBeLessThan(1e-9)
  })
})

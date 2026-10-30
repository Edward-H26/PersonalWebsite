import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { EARTH_ISLAND, EARTH_ROUTE_POINTS } from "@/config"
import { buildIslandOutline, surfaceHeight } from "@/components/canvas/islands/islandGeometry"
import { harborBounds } from "@/components/canvas/islands/village/harbor"
import { getOverviewFraming } from "./overviewFraming"

const FOV = 55
const MARGIN = 12
const HERO_CARD_RIGHT = 592
const scale = EARTH_ISLAND.scale
const routeCurve = new THREE.CatmullRomCurve3(
  EARTH_ROUTE_POINTS.map((p) => new THREE.Vector3(p[0] / scale, p[1] / scale, p[2] / scale)),
  false,
  "catmullrom",
  0.5
)
const outline = buildIslandOutline(routeCurve, scale)

// The coastline at the cliff top and at the waterline, in world units.
const coast = outline.radii.flatMap((r, i) => {
  const theta = (i / outline.radii.length) * Math.PI * 2
  const x = outline.centerX + Math.cos(theta) * r
  const z = outline.centerZ + Math.sin(theta) * r
  return [new THREE.Vector3(x * scale, (14 + surfaceHeight(x, z, scale)) * scale, z * scale), new THREE.Vector3(x * scale, 0, z * scale)]
})
const harbor = harborBounds(outline)
const harborRing = Array.from({ length: 24 }, (_, i) => {
  const theta = (i / 24) * Math.PI * 2
  return new THREE.Vector3((harbor.x + Math.cos(theta) * harbor.radius) * scale, 0, (harbor.z + Math.sin(theta) * harbor.radius) * scale)
})

function project(width: number, height: number, points: THREE.Vector3[]) {
  const framing = getOverviewFraming(width, height, FOV)
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
  it.each(VIEWPORTS)("keeps the whole island and the harbor on a %ix%i screen with a margin", (width, height) => {
    for (const p of project(width, height, [...coast, ...harborRing])) {
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
    const wide = getOverviewFraming(1440, 900, FOV)
    const narrow = getOverviewFraming(412, 839, FOV)
    expect(narrow.lookAt.toArray()).toEqual(wide.lookAt.toArray())
    const direction = (f: typeof wide) => f.lookAt.clone().sub(f.position).normalize()
    expect(direction(narrow).angleTo(direction(wide))).toBeLessThan(1e-9)
  })
})

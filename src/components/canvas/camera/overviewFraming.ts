import { CatmullRomCurve3, MathUtils, Vector3 } from "three"
import { EARTH_ISLAND, EARTH_ROUTE_POINTS } from "@/config"
import { buildIslandOutline } from "@/components/canvas/islands/islandGeometry"
import { harborBounds } from "@/components/canvas/islands/village/harbor"
import { BIRD_EYE_CAMERA_CONFIG } from "./birdEyeCameraConfig"

type Sphere = { center: Vector3; radius: number }
/** A screen rectangle in CSS pixels, measured from the top left of the viewport. */
type ScreenRect = { left: number; top: number; right: number; bottom: number }
/** Where the island and the harbor may appear on the overview slide. */
type Layout = { island: ScreenRect; harbor: ScreenRect }

export type OverviewFraming = {
  position: Vector3
  lookAt: Vector3
  /** Lens shift in CSS pixels for PerspectiveCamera.setViewOffset; it moves the picture, not the camera. */
  viewOffset: { x: number; y: number }
}

// Heights above sea level, in world units: the tallest trees and towers on the hill, and the ship's masts.
const ISLAND_RELIEF = 72
const HARBOR_RELIEF = 45

// The overview slide's own layout, in CSS pixels (OverviewPage, Navigation, SectionNav). From the md
// breakpoint the hero card sits at left 32 and top 128, 560 wide and about 353 tall, under a menu bar that
// ends at 74, with section dots 30 from the right edge. Below it the card spans the top of the screen and
// the menu bar sits at the bottom.
const DESKTOP_MIN_WIDTH = 768
const DESKTOP_CARD = { right: 592, bottom: 481 }
const DESKTOP_TOP = 96
const DESKTOP_RIGHT_INSET = 56
const DESKTOP_GAP = 24
const PHONE_CARD_BOTTOM_FRACTION = 0.52
const PHONE_BOTTOM_INSET = 72
const PHONE_MARGIN = 16

const UP = new Vector3(0, 1, 0)
const BISECTION_STEPS = 40

let cachedSpheres: { island: Sphere; harbor: Sphere } | null = null

/** Bounding spheres of the island (coastline, cliffs, hill and props) and of the harbor, in world units. */
function sceneSpheres() {
  if (cachedSpheres) return cachedSpheres
  const s = EARTH_ISLAND.scale
  const route = new CatmullRomCurve3(
    EARTH_ROUTE_POINTS.map((p) => new Vector3(p[0] / s, p[1] / s, p[2] / s)),
    false,
    "catmullrom",
    0.5
  )
  const outline = buildIslandOutline(route, s)
  const harbor = harborBounds(outline)
  cachedSpheres = {
    island: {
      center: new Vector3(outline.centerX * s, ISLAND_RELIEF / 2, outline.centerZ * s),
      radius: Math.hypot(Math.max(...outline.radii) * s, ISLAND_RELIEF / 2)
    },
    harbor: {
      center: new Vector3(harbor.x * s, HARBOR_RELIEF / 2, harbor.z * s),
      radius: Math.hypot(harbor.radius * s, HARBOR_RELIEF / 2)
    }
  }
  return cachedSpheres
}

/**
 * The places the island may take: beside the hero card on wide screens, or below it, whichever lets the
 * island be drawn larger. Phones only have the band between the card and the bottom menu bar.
 */
function candidateLayouts(width: number, height: number): Layout[] {
  if (width < DESKTOP_MIN_WIDTH) {
    const band = {
      left: PHONE_MARGIN,
      top: height * PHONE_CARD_BOTTOM_FRACTION,
      right: width - PHONE_MARGIN,
      bottom: height - PHONE_BOTTOM_INSET
    }
    return [{ island: band, harbor: band }]
  }
  const right = width - DESKTOP_RIGHT_INSET
  const bottom = height - DESKTOP_GAP
  const below = { left: DESKTOP_GAP, top: DESKTOP_CARD.bottom + DESKTOP_GAP, right, bottom }
  return [
    {
      island: { left: DESKTOP_CARD.right + DESKTOP_GAP, top: DESKTOP_TOP, right, bottom },
      harbor: { left: DESKTOP_GAP, top: DESKTOP_TOP, right, bottom }
    },
    { island: below, harbor: below }
  ]
}

/** Tangent-space interval covered by a sphere `offset` to the side of the view axis at `depth`. */
function tangentRange(offset: number, depth: number, radius: number): [number, number] {
  const spread = radius * Math.sqrt(offset * offset + depth * depth - radius * radius)
  const denom = depth * depth - radius * radius
  return [(offset * depth - spread) / denom, (offset * depth + spread) / denom]
}

/**
 * Keeps the bird's-eye direction and look-at target and solves for the camera distance and lens shift:
 * the smallest distance at which some shift puts every sphere inside its screen rectangle, found by
 * bisection, with the shift centred in the range that still fits.
 */
function fitLayout(layout: Layout, width: number, height: number, fovDeg: number) {
  const lookAt = new Vector3(...BIRD_EYE_CAMERA_CONFIG.lookAt)
  const forward = lookAt
    .clone()
    .sub(new Vector3(...BIRD_EYE_CAMERA_CONFIG.position))
    .normalize()
  const right = forward.clone().cross(UP).normalize()
  const up = right.clone().cross(forward)
  const tanY = Math.tan(MathUtils.degToRad(fovDeg) / 2)
  const tanX = tanY * (width / height)
  const spheres = sceneSpheres()
  const targets = [
    { sphere: spheres.island, rect: layout.island },
    { sphere: spheres.harbor, rect: layout.harbor }
  ].map(({ sphere, rect }) => {
    const rel = sphere.center.clone().sub(lookAt)
    return {
      x: rel.dot(right),
      y: rel.dot(up),
      z: rel.dot(forward),
      radius: sphere.radius,
      // Rectangle edges in normalized device coordinates, y up.
      x0: (2 * rect.left) / width - 1,
      x1: (2 * rect.right) / width - 1,
      y0: 1 - (2 * rect.bottom) / height,
      y1: 1 - (2 * rect.top) / height
    }
  })

  const shiftRange = (distance: number) => {
    let xLow = Number.NEGATIVE_INFINITY
    let xHigh = Number.POSITIVE_INFINITY
    let yLow = Number.NEGATIVE_INFINITY
    let yHigh = Number.POSITIVE_INFINITY
    for (const t of targets) {
      const depth = t.z + distance
      if (depth <= t.radius) return null
      const [ax, bx] = tangentRange(t.x, depth, t.radius)
      const [ay, by] = tangentRange(t.y, depth, t.radius)
      xLow = Math.max(xLow, bx - tanX * t.x1)
      xHigh = Math.min(xHigh, ax - tanX * t.x0)
      yLow = Math.max(yLow, by - tanY * t.y1)
      yHigh = Math.min(yHigh, ay - tanY * t.y0)
    }
    return xLow <= xHigh && yLow <= yHigh ? { x: (xLow + xHigh) / 2, y: (yLow + yHigh) / 2 } : null
  }

  let near = Math.max(...targets.map((t) => t.radius - t.z))
  let far = near + 100 * spheres.island.radius
  for (let i = 0; i < BISECTION_STEPS; i += 1) {
    const mid = (near + far) / 2
    if (shiftRange(mid)) far = mid
    else near = mid
  }
  const shift = shiftRange(far) ?? { x: 0, y: 0 }
  return {
    distance: far,
    framing: {
      position: lookAt.clone().addScaledVector(forward, -far),
      lookAt,
      viewOffset: { x: (shift.x * width) / (2 * tanX), y: (-shift.y * height) / (2 * tanY) }
    }
  }
}

/** The overview camera for a viewport: the whole island in view beside or below the hero card. */
export function getOverviewFraming(width: number, height: number, fovDeg: number): OverviewFraming {
  const fits = candidateLayouts(width, height).map((layout) => fitLayout(layout, width, height, fovDeg))
  fits.sort((a, b) => a.distance - b.distance)
  return fits[0].framing
}

import { MathUtils, Sphere, Vector3 } from "three"
import { BIRD_EYE_CAMERA_CONFIG } from "./birdEyeCameraConfig"

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

/**
 * What the overview keeps in view, in world units: bounding spheres of the island and of the harbour
 * for wide screens, and the points phones fit across their width.
 */
export type OverviewScene = { island: Sphere; harbor: Sphere; phonePoints: readonly Vector3[] }

// The overview slide's own layout, in CSS pixels (OverviewPage, Navigation). From the md breakpoint the
// hero card sits at left 32 and top 128, 560 wide and about 353 tall, under a menu bar that ends at 74, and
// the island keeps clear of the right edge. Below it the menu bar sits at the top, 49 tall from 12, and the
// card follows from 73 and is about 372 tall, which leaves the island the band from 457 to the bottom edge.
const DESKTOP_MIN_WIDTH = 768
const DESKTOP_CARD = { right: 592, bottom: 481 }
const DESKTOP_TOP = 96
const DESKTOP_RIGHT_INSET = 56
const DESKTOP_GAP = 24
const PHONE_BAND_TOP = 457
const PHONE_BOTTOM_INSET = 16
/** Share of a phone's width that the island and the harbour span together. */
const PHONE_WIDTH_FILL = 0.9

const UP = new Vector3(0, 1, 0)
const BISECTION_STEPS = 40

/**
 * The overview's scene from the island's coastline at sea level, the height its peak, castle and
 * trees reach, and the corners of the harbour's pier, ship and marks.
 */
export function overviewScene(coast: readonly Vector3[], relief: number, harborCorners: readonly Vector3[]): OverviewScene {
  const coastline = coast.flatMap((p) => [p.clone().setY(0), p.clone().setY(relief)])
  return {
    island: new Sphere().setFromPoints(coastline),
    harbor: new Sphere().setFromPoints([...harborCorners]),
    phonePoints: [...coastline, ...harborCorners]
  }
}

/** The bird's-eye look-at target and the camera's axes, shared by every framing. */
function cameraBasis() {
  const lookAt = new Vector3(...BIRD_EYE_CAMERA_CONFIG.lookAt)
  const forward = lookAt
    .clone()
    .sub(new Vector3(...BIRD_EYE_CAMERA_CONFIG.position))
    .normalize()
  const right = forward.clone().cross(UP).normalize()
  const up = right.clone().cross(forward)
  return { lookAt, forward, right, up }
}

/** The places the island may take beside or below the hero card on wide screens. */
function candidateLayouts(width: number, height: number): Layout[] {
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
function fitLayout(scene: OverviewScene, layout: Layout, width: number, height: number, fovDeg: number) {
  const { lookAt, forward, right, up } = cameraBasis()
  const tanY = Math.tan(MathUtils.degToRad(fovDeg) / 2)
  const tanX = tanY * (width / height)
  const targets = [
    { sphere: scene.island, rect: layout.island },
    { sphere: scene.harbor, rect: layout.harbor }
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
  let far = near + 100 * scene.island.radius
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

/**
 * Phones: the camera backs off until the island and the harbour span PHONE_WIDTH_FILL of the screen's
 * width, and the lens shift centres them across the screen and in the band below the card. It measures
 * their points rather than the bounding spheres, whose round extent is mostly open water.
 */
function fitPhone(scene: OverviewScene, width: number, height: number, fovDeg: number): OverviewFraming {
  const { lookAt, forward, right, up } = cameraBasis()
  const tanY = Math.tan(MathUtils.degToRad(fovDeg) / 2)
  const tanX = tanY * (width / height)
  const points = scene.phonePoints.map((p) => {
    const rel = p.clone().sub(lookAt)
    return { x: rel.dot(right), y: rel.dot(up), z: rel.dot(forward) }
  })
  // The tangent-space interval the points cover along one camera axis, seen from `distance` behind the target.
  const extent = (axis: "x" | "y", distance: number) => {
    const tangents = points.map((p) => p[axis] / (p.z + distance))
    return { low: Math.min(...tangents), high: Math.max(...tangents) }
  }

  let near = Math.max(...points.map((p) => -p.z))
  let far = near + 100 * scene.island.radius
  for (let i = 0; i < BISECTION_STEPS; i += 1) {
    const mid = (near + far) / 2
    const { low, high } = extent("x", mid)
    if (high - low <= 2 * tanX * PHONE_WIDTH_FILL) far = mid
    else near = mid
  }

  const horizontal = extent("x", far)
  const vertical = extent("y", far)
  const bandCentre = 1 - (PHONE_BAND_TOP + height - PHONE_BOTTOM_INSET) / height
  const shift = { x: (horizontal.low + horizontal.high) / 2, y: (vertical.low + vertical.high) / 2 - bandCentre * tanY }
  return {
    position: lookAt.clone().addScaledVector(forward, -far),
    lookAt,
    viewOffset: { x: (shift.x * width) / (2 * tanX), y: (-shift.y * height) / (2 * tanY) }
  }
}

/** The overview camera for a viewport: the whole island in view beside or below the hero card. */
export function getOverviewFraming(scene: OverviewScene, width: number, height: number, fovDeg: number): OverviewFraming {
  if (width < DESKTOP_MIN_WIDTH) return fitPhone(scene, width, height, fovDeg)
  const fits = candidateLayouts(width, height).map((layout) => fitLayout(scene, layout, width, height, fovDeg))
  fits.sort((a, b) => a.distance - b.distance)
  return fits[0].framing
}

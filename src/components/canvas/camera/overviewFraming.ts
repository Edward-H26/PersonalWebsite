import { MathUtils, Vector3 } from "three"
import { BIRD_EYE_CAMERA_CONFIG } from "./birdEyeCameraConfig"

export type OverviewFraming = {
  position: Vector3
  lookAt: Vector3
  /** Lens shift in CSS pixels for PerspectiveCamera.setViewOffset; it moves the picture, not the camera. */
  viewOffset: { x: number; y: number }
}

/**
 * What the overview keeps in view, in world units: the coastline at sea level and at the height of the
 * island's skyline, and the corners of the harbour's pier, ship and marks.
 */
export type OverviewScene = { points: readonly Vector3[] }

// The overview slide's own layout, in CSS pixels (OverviewPage, Navigation). From the md breakpoint the
// hero card sits at left 32 and top 128, 560 wide and about 353 tall, under a menu bar that ends at 74, and
// the island keeps clear of the right edge and the card. Below it the menu bar sits at the top, 49 tall from 12,
// and the card follows from 73 and is about 372 tall, which leaves the island the band from 457 to the bottom edge.
const DESKTOP_MIN_WIDTH = 768
const DESKTOP_CARD = { right: 592, bottom: 481 }
const DESKTOP_TOP = 96
const DESKTOP_RIGHT_INSET = 56
const DESKTOP_GAP = 24
const PHONE_BAND_TOP = 457
/** Share of a phone's width that the island and the harbour span together. */
const PHONE_WIDTH_FILL = 0.9
/** Where the horizon sits on a phone, as a share of the screen's height from the top. */
const PHONE_HORIZON_FROM_TOP = 1 / 3

const UP = new Vector3(0, 1, 0)
const BISECTION_STEPS = 40

/**
 * The overview's scene from the island's coastline at sea level, the height its peak, castle and
 * trees reach, and the corners of the harbour's pier, ship and marks.
 */
export function overviewScene(coast: readonly Vector3[], relief: number, harborCorners: readonly Vector3[]): OverviewScene {
  const coastline = coast.flatMap((p) => [p.clone().setY(0), p.clone().setY(relief)])
  return { points: [...coastline, ...harborCorners] }
}

/** The tangents of half the field of view, across and up, for a viewport. */
function lensFor(width: number, height: number, fovDeg: number) {
  const tanY = Math.tan(MathUtils.degToRad(fovDeg) / 2)
  return { tanX: tanY * (width / height), tanY }
}

/**
 * The bird's-eye look-at target and the camera's axes, shared by every framing, with the scene's points in
 * those axes relative to the target, and how far the bisections may have to back off for them.
 */
function cameraSpace(scene: OverviewScene) {
  const { from, lookAt: target, elevationDeg } = BIRD_EYE_CAMERA_CONFIG
  const lookAt = new Vector3(...target)
  const pitch = MathUtils.degToRad(elevationDeg)
  const bearing = new Vector3(lookAt.x - from[0], 0, lookAt.z - from[1]).normalize()
  const forward = bearing.multiplyScalar(Math.cos(pitch)).setY(-Math.sin(pitch))
  const right = forward.clone().cross(UP).normalize()
  const up = right.clone().cross(forward)
  const points = scene.points.map((p) => {
    const rel = p.clone().sub(lookAt)
    return { x: rel.dot(right), y: rel.dot(up), z: rel.dot(forward) }
  })
  const reach = Math.max(...points.map((p) => Math.hypot(p.x, p.y, p.z)))
  return { lookAt, forward, points, near: Math.max(...points.map((p) => -p.z)), far: 100 * reach }
}

/** The overview's camera `distance` behind its target, with a lens shift given in tangents. */
function framingAt(
  { lookAt, forward }: Pick<ReturnType<typeof cameraSpace>, "lookAt" | "forward">,
  distance: number,
  shift: { x: number; y: number },
  width: number,
  height: number,
  { tanX, tanY }: ReturnType<typeof lensFor>
): OverviewFraming {
  return {
    position: lookAt.clone().addScaledVector(forward, -distance),
    lookAt,
    viewOffset: { x: (shift.x * width) / (2 * tanX), y: (-shift.y * height) / (2 * tanY) }
  }
}

/**
 * Wide screens: the camera comes as close as it can while every point stays on screen and clear of the
 * hero card, so the island fills the frame right of the card and may run on beneath it. The lens shift
 * holds it in the bottom right corner, furthest from the card, with the harbour along the bottom edge and
 * the sea and the sky above. The closest distance is found by bisection.
 */
function fitBesideCard(scene: OverviewScene, width: number, height: number, fovDeg: number): OverviewFraming {
  const space = cameraSpace(scene)
  const lens = lensFor(width, height, fovDeg)
  // The shift that puts the right-most point at the right inset and the lowest at the bottom gap.
  const anchoredShift = (distance: number) => ({
    x: Math.max(...space.points.map((p) => p.x / (p.z + distance))) - lens.tanX * (1 - (2 * DESKTOP_RIGHT_INSET) / width),
    y: Math.min(...space.points.map((p) => p.y / (p.z + distance))) + lens.tanY * (1 - (2 * DESKTOP_GAP) / height)
  })
  const fits = (distance: number) => {
    const shift = anchoredShift(distance)
    return space.points.every((p) => {
      const x = ((p.x / (p.z + distance) - shift.x) / lens.tanX + 1) * (width / 2)
      const y = (1 - (p.y / (p.z + distance) - shift.y) / lens.tanY) * (height / 2)
      const clearOfCard = x >= DESKTOP_CARD.right + DESKTOP_GAP || y >= DESKTOP_CARD.bottom + DESKTOP_GAP
      return x >= DESKTOP_GAP && y >= DESKTOP_TOP && clearOfCard
    })
  }

  let near = space.near
  let far = space.near + space.far
  for (let i = 0; i < BISECTION_STEPS; i += 1) {
    const mid = (near + far) / 2
    if (fits(mid)) far = mid
    else near = mid
  }
  return framingAt(space, far, anchoredShift(far), width, height, lens)
}

/**
 * Phones: the camera backs off until the island and the harbour span PHONE_WIDTH_FILL of the screen's
 * width. The lens shift centres them across the screen and puts the horizon PHONE_HORIZON_FROM_TOP of the
 * way down, with the sky and the clouds above it, unless that would lift the island into the hero card: then
 * the island's top keeps to the band below the card.
 */
function fitPhone(scene: OverviewScene, width: number, height: number, fovDeg: number): OverviewFraming {
  const space = cameraSpace(scene)
  const lens = lensFor(width, height, fovDeg)
  // The tangent-space interval the points cover along one camera axis, seen from `distance` behind the target.
  const extent = (axis: "x" | "y", distance: number) => {
    const tangents = space.points.map((p) => p[axis] / (p.z + distance))
    return { low: Math.min(...tangents), high: Math.max(...tangents) }
  }

  let near = space.near
  let far = space.near + space.far
  for (let i = 0; i < BISECTION_STEPS; i += 1) {
    const mid = (near + far) / 2
    const { low, high } = extent("x", mid)
    if (high - low <= 2 * lens.tanX * PHONE_WIDTH_FILL) far = mid
    else near = mid
  }

  const horizontal = extent("x", far)
  const horizonShift = Math.tan(MathUtils.degToRad(BIRD_EYE_CAMERA_CONFIG.elevationDeg)) - lens.tanY * (1 - 2 * PHONE_HORIZON_FROM_TOP)
  const belowCardShift = extent("y", far).high - lens.tanY * (1 - (2 * PHONE_BAND_TOP) / height)
  const shift = { x: (horizontal.low + horizontal.high) / 2, y: Math.max(horizonShift, belowCardShift) }
  return framingAt(space, far, shift, width, height, lens)
}

/** The overview camera for a viewport: the whole island in view beside or below the hero card. */
export function getOverviewFraming(scene: OverviewScene, width: number, height: number, fovDeg: number): OverviewFraming {
  return width < DESKTOP_MIN_WIDTH ? fitPhone(scene, width, height, fovDeg) : fitBesideCard(scene, width, height, fovDeg)
}

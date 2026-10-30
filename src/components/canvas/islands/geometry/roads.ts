import * as THREE from "three"
import { assembleGeometry } from "./bufferGeometry"
import { surfaceHeight } from "./terrainHeight"

// Road dimensions in island-local units (world = local * EARTH_ISLAND.scale).
export const PATH_WIDTH = 7.8
export const BRANCH_WIDTH = PATH_WIDTH * 0.7
/** Road surfaces float this far above the terrain so they cannot z-fight with it. */
export const PATH_Y_OFFSET = 0.24
export const SIDE_ROAD_Y_OFFSET = 0.2
export const PATH_RIBBON_SEGMENTS = 170
// Side roads meet the main road at right angles, run underneath it, and overrun its centerline by
// just under half its width, so their square ends stay hidden and junctions read as clean T-joins.
const SIDE_ROAD_APPROACH = 8
export const SIDE_ROAD_OVERRUN = PATH_WIDTH / 2 - 0.4

// The camera walks behind and slightly left of the route curve, so the drawn main road follows the
// camera's track rather than the raw curve. World units; FirstPersonController uses the same offsets.
const CAMERA_BACK_OFFSET_WORLD = 12
const CAMERA_LEFT_OFFSET_WORLD = 1.2

// Cobblestone texture tile size in local units; ribbon UVs are generated in tile space.
const COBBLE_TILE = 9

/** Flattens a curve tangent onto the ground plane in place; a vertical tangent falls back to +z. */
export function getFlatTangent(tangent: THREE.Vector3) {
  tangent.y = 0
  if (tangent.lengthSq() > 1e-8) tangent.normalize()
  else tangent.set(0, 0, 1)
  return tangent
}

/**
 * Point, flat tangent, left-hand perpendicular and right-hand side vector of the camera track at
 * `t`, written into the passed vectors so callers can reuse them in loops without allocating.
 */
export function getTrackFrameAt(
  curve: THREE.CatmullRomCurve3,
  t: number,
  point: THREE.Vector3,
  tangent: THREE.Vector3,
  perp: THREE.Vector3,
  side: THREE.Vector3,
  worldScale: number
) {
  curve.getPointAt(t, point)
  curve.getTangentAt(t, tangent)
  getFlatTangent(tangent)

  side.set(tangent.z, 0, -tangent.x)
  const backOffset = CAMERA_BACK_OFFSET_WORLD / worldScale
  const leftOffset = CAMERA_LEFT_OFFSET_WORLD / worldScale
  point.x -= tangent.x * backOffset
  point.z -= tangent.z * backOffset
  point.addScaledVector(side, leftOffset)

  perp.set(-tangent.z, 0, tangent.x)
}

/** The camera track point at `t` as a fresh vector. */
export function trackPointAt(curve: THREE.CatmullRomCurve3, t: number, worldScale: number) {
  const point = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const perp = new THREE.Vector3()
  const side = new THREE.Vector3()
  getTrackFrameAt(curve, t, point, tangent, perp, side, worldScale)
  return point
}

/**
 * Junction point on the main road plus a control point SIDE_ROAD_APPROACH units away from it,
 * perpendicular to the road on the side facing `toward`, so a side road leaves or arrives square-on.
 */
export function junctionPoints(curve: THREE.CatmullRomCurve3, t: number, worldScale: number, toward: THREE.Vector3) {
  const point = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const perp = new THREE.Vector3()
  const side = new THREE.Vector3()
  getTrackFrameAt(curve, t, point, tangent, perp, side, worldScale)
  if (perp.dot(toward.clone().sub(point)) < 0) perp.negate()
  return { onRoad: point, approach: point.clone().addScaledVector(perp, SIDE_ROAD_APPROACH) }
}

/** A side road through `points`, extended at both ends so it overruns the main road's centerline. */
export function makeSideRoadCurve(points: THREE.Vector3[]) {
  const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5)
  const startTangent = getFlatTangent(curve.getTangentAt(0))
  const endTangent = getFlatTangent(curve.getTangentAt(1))
  const extended = [...points]
  extended[0] = points[0].clone().addScaledVector(startTangent, -SIDE_ROAD_OVERRUN)
  extended[extended.length - 1] = points[points.length - 1].clone().addScaledVector(endTangent, SIDE_ROAD_OVERRUN)
  return new THREE.CatmullRomCurve3(extended, false, "catmullrom", 0.5)
}

// The cross-island branch: where it leaves and rejoins the route, and the interior points it passes.
const BRANCH_FROM_T = 0.385
const BRANCH_TO_T = 0.735
const BRANCH_INTERIOR = [new THREE.Vector3(24, 0, 10), new THREE.Vector3(-6, 0, 6), new THREE.Vector3(-30, 0, 4)]
// The route ends beside its own start, both lanes heading the same way about 18 units apart, so the link
// closing the loop runs straight across between two points facing each other. Square approaches from the
// very ends left only a 3-unit middle span, and the spline through those uneven control points bent
// tighter than the road is wide, folding the ribbon into a knot over the main road.
const LOOP_LINK_FROM_T = 0.995
const LOOP_LINK_TO_T = 0.04

/** The side roads drawn on the island: the cross-island branch and the short link that closes the loop. */
export function buildSideRoadCurves(routeCurve: THREE.CatmullRomCurve3, worldScale: number) {
  const east = junctionPoints(routeCurve, BRANCH_FROM_T, worldScale, BRANCH_INTERIOR[0])
  const west = junctionPoints(routeCurve, BRANCH_TO_T, worldScale, BRANCH_INTERIOR[BRANCH_INTERIOR.length - 1])
  const linkFrom = trackPointAt(routeCurve, LOOP_LINK_FROM_T, worldScale)
  const linkTo = trackPointAt(routeCurve, LOOP_LINK_TO_T, worldScale)
  return [
    {
      name: "branch",
      curve: makeSideRoadCurve([east.onRoad, east.approach, ...BRANCH_INTERIOR, west.approach, west.onRoad]),
      junctionT: [BRANCH_FROM_T, BRANCH_TO_T],
      segments: 96
    },
    {
      name: "loopLink",
      // The midpoint keeps the straight link a three-point spline: with only two points, CatmullRomCurve3
      // extrapolates both phantom end points into one shared scratch vector and the curve loops back.
      curve: makeSideRoadCurve([linkFrom, linkFrom.clone().lerp(linkTo, 0.5), linkTo]),
      junctionT: [LOOP_LINK_FROM_T, LOOP_LINK_TO_T],
      segments: 32
    }
  ]
}

/**
 * A flat ribbon of `width` draped on the terrain along `curve`. The main road follows the camera
 * track (`followCameraTrack`); side roads follow their curve directly. UVs tile the cobblestones
 * squarely along the ribbon.
 */
export function makePathRibbonGeometry(
  curve: THREE.CatmullRomCurve3,
  width: number,
  segments: number,
  yOffset: number,
  worldScale: number,
  followCameraTrack: boolean
) {
  const vertexCount = (segments + 1) * 2
  const positions = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)
  const indices = new Uint16Array(segments * 6)

  const point = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const perp = new THREE.Vector3()
  const side = new THREE.Vector3()

  const halfW = width / 2
  const length = curve.getLength()

  for (let i = 0; i <= segments; i += 1) {
    const t = segments === 0 ? 0 : i / segments
    if (followCameraTrack) {
      getTrackFrameAt(curve, t, point, tangent, perp, side, worldScale)
    } else {
      curve.getPointAt(t, point)
      curve.getTangentAt(t, tangent)
      getFlatTangent(tangent)
      perp.set(-tangent.z, 0, tangent.x)
    }

    const lx = point.x + perp.x * halfW
    const lz = point.z + perp.z * halfW
    const rx = point.x - perp.x * halfW
    const rz = point.z - perp.z * halfW

    const v = (t * length) / COBBLE_TILE
    const baseV = i * 2

    positions[baseV * 3 + 0] = lx
    positions[baseV * 3 + 1] = surfaceHeight(lx, lz, worldScale) + yOffset
    positions[baseV * 3 + 2] = lz

    positions[(baseV + 1) * 3 + 0] = rx
    positions[(baseV + 1) * 3 + 1] = surfaceHeight(rx, rz, worldScale) + yOffset
    positions[(baseV + 1) * 3 + 2] = rz

    uvs[baseV * 2 + 0] = 0
    uvs[baseV * 2 + 1] = v
    uvs[(baseV + 1) * 2 + 0] = width / COBBLE_TILE
    uvs[(baseV + 1) * 2 + 1] = v
  }

  for (let i = 0; i < segments; i += 1) {
    const a = i * 2
    const b = a + 1
    const c = a + 2
    const d = a + 3
    const idx = i * 6
    indices[idx + 0] = a
    indices[idx + 1] = d
    indices[idx + 2] = b
    indices[idx + 3] = a
    indices[idx + 4] = c
    indices[idx + 5] = d
  }

  return assembleGeometry(positions, uvs, new THREE.BufferAttribute(indices, 1))
}

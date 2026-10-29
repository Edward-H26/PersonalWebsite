import * as THREE from "three"
import { type IslandOutline, type RoadSample, clampOffsetToIsland, distanceInsideOutline, getTrackFrameAt } from "../islandGeometry"
import type { LayoutContext } from "./types"

/** A point beside the main road: `t` along the route, `side` (+1 inner / -1 outer), `out` across and `along` the road. */
export type RoadAnchorSpec = { t: number; side: 1 | -1; out: number; along: number }

function isInsideOutline(outline: IslandOutline, x: number, z: number) {
  return distanceInsideOutline(outline, x, z) > 0
}

/**
 * Resolves a road anchor to island-local coordinates, pulling the offset back towards the road
 * when it would land in the sea, plus the road heading there for orienting the model.
 */
export function roadAnchor(ctx: LayoutContext, t: number, side: number, out: number, along: number) {
  const point = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const perp = new THREE.Vector3()
  const sideVec = new THREE.Vector3()
  getTrackFrameAt(ctx.routeCurve, t, point, tangent, perp, sideVec, ctx.worldScale)
  const offsetX = tangent.x * along + perp.x * side * out
  const offsetZ = tangent.z * along + perp.z * side * out
  const clamped = clampOffsetToIsland(point.x, point.z, offsetX, offsetZ, (x, z) => isInsideOutline(ctx.outline, x, z))
  const heading = Math.atan2(tangent.x, tangent.z)
  return { x: clamped.x, z: clamped.z, heading, tangent, perp }
}

/** Yaw that turns a model at x/z to face the nearest road sample. */
export function nearestRoadDirection(x: number, z: number, roads: ReadonlyArray<RoadSample>) {
  let best = Number.POSITIVE_INFINITY
  let nearest = roads[0]
  for (const s of roads) {
    const d = Math.hypot(s.x - x, s.z - z)
    if (d < best) {
      best = d
      nearest = s
    }
  }
  return Math.atan2(nearest.x - x, nearest.z - z)
}

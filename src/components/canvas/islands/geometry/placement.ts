import * as THREE from "three"
import { seededRandom } from "@/utils/math"
import { type IslandOutline, distanceInsideOutline } from "./outline"
import { getFlatTangent, getTrackFrameAt } from "./roads"

/**
 * Placement helpers: everything scattered on the island must stay on land, off the roads, and out
 * of the buildings' footprints. All coordinates are island-local.
 */

/** Distance between consecutive road samples. */
const ROAD_SAMPLE_SPACING = 1.5
/** Steps tried when walking an offset back towards its base point to land inside the island. */
const CLAMP_STEPS = 16
/** Rejection-sampling budget per requested instance. */
const SCATTER_ATTEMPTS_PER_INSTANCE = 40
/** Instances of one scatter keep this many footprint radii between their centres. */
const SCATTER_SPACING_RATIO = 1.2
/** Passes of pushing a point off the roads; a few settle points near junctions. */
const PUSH_CLEAR_PASSES = 4
// Per-attempt seed stride and per-channel offsets of the scatter's seeded random stream.
const SEED_STRIDE = 7.31
const SEED_OFFSET = { x: 0.13, z: 1.71, rotation: 2.9, scale: 4.2 } as const

export type RoadSample = { x: number; z: number; halfWidth: number; tangentX: number; tangentZ: number }

type RoadCurveSpec = { curve: THREE.CatmullRomCurve3; halfWidth: number; followCameraTrack: boolean }

/** Points along every road with its half width and direction, for distance and clearance tests. */
export function sampleRoadNetwork(roads: RoadCurveSpec[], worldScale: number, spacing = ROAD_SAMPLE_SPACING): RoadSample[] {
  const samples: RoadSample[] = []
  const point = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const perp = new THREE.Vector3()
  const side = new THREE.Vector3()
  for (const road of roads) {
    const count = Math.max(2, Math.ceil(road.curve.getLength() / spacing))
    for (let i = 0; i <= count; i += 1) {
      const t = i / count
      if (road.followCameraTrack) {
        getTrackFrameAt(road.curve, t, point, tangent, perp, side, worldScale)
      } else {
        road.curve.getPointAt(t, point)
        road.curve.getTangentAt(t, tangent)
        getFlatTangent(tangent)
      }
      samples.push({ x: point.x, z: point.z, halfWidth: road.halfWidth, tangentX: tangent.x, tangentZ: tangent.z })
    }
  }
  return samples
}

/** Signed distance to the nearest road edge: negative means the point is on the road surface. */
export function distanceToRoadEdge(x: number, z: number, roads: ReadonlyArray<RoadSample>) {
  let best = Number.POSITIVE_INFINITY
  for (const s of roads) {
    const d = Math.hypot(s.x - x, s.z - z) - s.halfWidth
    if (d < best) best = d
  }
  return best
}

export type Footprint = { x: number; z: number; radius: number }

function overlapsFootprint(x: number, z: number, radius: number, footprints: ReadonlyArray<Footprint>) {
  for (const f of footprints) {
    if (Math.hypot(f.x - x, f.z - z) < f.radius + radius) return true
  }
  return false
}

export type ScatterOptions = {
  count: number
  seed: number
  // Own footprint radius; also the clearance required from road edges and other footprints.
  radius: number
  // Minimum distance from the coastline.
  shoreMargin: number
  // Extra clearance from roads beyond the footprint radius.
  roadClearance?: number
  minScale?: number
  maxScale?: number
  // Optional region filter in local coordinates.
  accept?: (x: number, z: number) => boolean
}

export type ScatteredInstance = { x: number; z: number; rotY: number; scale: number }

/**
 * Seeded rejection sampling inside the coastline. Deterministic for a given seed so the island
 * looks the same on every visit; returns fewer instances than asked when space runs out.
 */
export function scatterOnIsland(
  outline: IslandOutline,
  roads: ReadonlyArray<RoadSample>,
  footprints: ReadonlyArray<Footprint>,
  options: ScatterOptions
): ScatteredInstance[] {
  const { count, seed, radius, shoreMargin, roadClearance = 0, minScale = 1, maxScale = 1, accept } = options
  const maxRadius = Math.max(...outline.radii) + 1
  const placed: ScatteredInstance[] = []
  const attempts = count * SCATTER_ATTEMPTS_PER_INSTANCE

  for (let i = 0; i < attempts && placed.length < count; i += 1) {
    const rx = seededRandom(seed + i * SEED_STRIDE + SEED_OFFSET.x)
    const rz = seededRandom(seed + i * SEED_STRIDE + SEED_OFFSET.z)
    const x = outline.centerX + (rx * 2 - 1) * maxRadius
    const z = outline.centerZ + (rz * 2 - 1) * maxRadius

    if (distanceInsideOutline(outline, x, z) < shoreMargin) continue
    if (distanceToRoadEdge(x, z, roads) < radius + roadClearance) continue
    if (overlapsFootprint(x, z, radius, footprints)) continue
    if (accept && !accept(x, z)) continue
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < radius * SCATTER_SPACING_RATIO)) continue

    placed.push({
      x,
      z,
      rotY: seededRandom(seed + i * SEED_STRIDE + SEED_OFFSET.rotation) * Math.PI * 2,
      scale: minScale + seededRandom(seed + i * SEED_STRIDE + SEED_OFFSET.scale) * (maxScale - minScale)
    })
  }

  return placed
}

/**
 * Moves a point sideways off the nearest road (along the road's normal, never along it) until it
 * clears the road edge by `clearance`.
 */
export function pushClearOfRoads(x: number, z: number, clearance: number, roads: ReadonlyArray<RoadSample>) {
  let px = x
  let pz = z
  for (let pass = 0; pass < PUSH_CLEAR_PASSES; pass += 1) {
    let nearest: RoadSample | null = null
    let best = Number.POSITIVE_INFINITY
    for (const s of roads) {
      const d = Math.hypot(s.x - px, s.z - pz) - s.halfWidth
      if (d < best) {
        best = d
        nearest = s
      }
    }
    if (!nearest || best >= clearance) break
    const normalX = -nearest.tangentZ
    const normalZ = nearest.tangentX
    const sideSign = Math.sign((px - nearest.x) * normalX + (pz - nearest.z) * normalZ) || 1
    px = nearest.x + normalX * sideSign * (nearest.halfWidth + clearance)
    pz = nearest.z + normalZ * sideSign * (nearest.halfWidth + clearance)
  }
  return { x: px, z: pz }
}

/**
 * The base point plus offset when that lies inside the island; otherwise the offset is shortened
 * step by step until it does, falling back to `fallbackPoint` (or the base point).
 */
export function clampOffsetToIsland(
  baseX: number,
  baseZ: number,
  offsetX: number,
  offsetZ: number,
  isInside: (x: number, z: number) => boolean,
  fallbackPoint?: { x: number; z: number }
) {
  if (isInside(baseX + offsetX, baseZ + offsetZ)) return { x: baseX + offsetX, z: baseZ + offsetZ }

  for (let i = 1; i <= CLAMP_STEPS; i += 1) {
    const t = 1 - i / CLAMP_STEPS
    const x = baseX + offsetX * t
    const z = baseZ + offsetZ * t
    if (isInside(x, z)) return { x, z }
  }

  return fallbackPoint ?? { x: baseX, z: baseZ }
}

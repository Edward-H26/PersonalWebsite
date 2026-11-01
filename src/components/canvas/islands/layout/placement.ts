import { seededRandom } from "@/utils/math"

/**
 * Placement helpers: everything scattered on the island must stay on land, off the roads, and out of
 * the buildings' footprints. All coordinates are in world units (x, z).
 */

/** Passes of pushing a ground rectangle off the roads; a few settle it near junctions, where a second road can catch it. */
const RECT_PUSH_PASSES = 8
/** Points sampled along each side of a ground rectangle when testing it against the roads. */
const RECT_SIDE_SAMPLES = 6
/** Rejection-sampling budget per requested instance. */
const SCATTER_ATTEMPTS_PER_INSTANCE = 30
/** Instances of one scatter keep this many footprint radii between their centres. */
const SCATTER_SPACING_RATIO = 1.2
// Per-attempt seed stride and per-channel offsets of the scatter's seeded random stream.
const SEED_STRIDE = 7.31
const SEED_OFFSET = { x: 0.13, z: 1.71, rotation: 2.9, scale: 4.2, density: 5.3 } as const
/** Side of the grid cells that bucket footprints, in world units. */
const FOOTPRINT_CELL = 8

/** A point on a road's centreline with its half width and direction, for distance and clearance tests. */
export type RoadSample = { x: number; z: number; halfWidth: number; tangentX: number; tangentZ: number }

export type Footprint = { x: number; z: number; radius: number }

/** Signed distance to the nearest road edge: negative means the point is on the road surface. */
export function distanceToRoadEdge(x: number, z: number, roads: ReadonlyArray<RoadSample>) {
  let best = Number.POSITIVE_INFINITY
  for (const s of roads) {
    const d = Math.hypot(s.x - x, s.z - z) - s.halfWidth
    if (d < best) best = d
  }
  return best
}

/**
 * The ground claimed so far, bucketed on a grid so that a test reads only the footprints near it.
 * Each footprint sits in every cell its bounding square touches, so two circles that overlap always
 * share a cell.
 */
export class FootprintIndex {
  private readonly cells = new Map<number, Footprint[]>()

  private static cellOf(value: number) {
    return Math.floor(value / FOOTPRINT_CELL)
  }

  private static key(i: number, j: number) {
    return (i + 32768) * 65536 + (j + 32768)
  }

  add(...footprints: Footprint[]) {
    for (const footprint of footprints) {
      const { x, z, radius } = footprint
      for (let i = FootprintIndex.cellOf(x - radius); i <= FootprintIndex.cellOf(x + radius); i += 1) {
        for (let j = FootprintIndex.cellOf(z - radius); j <= FootprintIndex.cellOf(z + radius); j += 1) {
          const key = FootprintIndex.key(i, j)
          const cell = this.cells.get(key)
          if (cell) cell.push(footprint)
          else this.cells.set(key, [footprint])
        }
      }
    }
  }

  /** Whether a circle at x/z of `radius` overlaps any footprint added so far. */
  overlaps(x: number, z: number, radius: number) {
    for (let i = FootprintIndex.cellOf(x - radius); i <= FootprintIndex.cellOf(x + radius); i += 1) {
      for (let j = FootprintIndex.cellOf(z - radius); j <= FootprintIndex.cellOf(z + radius); j += 1) {
        const cell = this.cells.get(FootprintIndex.key(i, j))
        if (!cell) continue
        for (const f of cell) {
          const dx = f.x - x
          const dz = f.z - z
          const reach = f.radius + radius
          if (dx * dx + dz * dz < reach * reach) return true
        }
      }
    }
    return false
  }
}

/** A building's ground plan: its centre, its yaw about +y, and half its extent along its own x and z. */
export type GroundRect = { x: number; z: number; yaw: number; halfX: number; halfZ: number }

/** The rectangle's corners and evenly spaced points along its sides, in world x/z. */
function rectOutline(rect: GroundRect): Array<[number, number]> {
  // A yaw about +y turns the rectangle's own +x to (cos, -sin) and its +z to (sin, cos) in x/z.
  const xAxis = [Math.cos(rect.yaw), -Math.sin(rect.yaw)]
  const zAxis = [Math.sin(rect.yaw), Math.cos(rect.yaw)]
  const at = (u: number, v: number): [number, number] => [
    rect.x + xAxis[0] * u * rect.halfX + zAxis[0] * v * rect.halfZ,
    rect.z + xAxis[1] * u * rect.halfX + zAxis[1] * v * rect.halfZ
  ]
  const points: Array<[number, number]> = []
  for (let i = 0; i < RECT_SIDE_SAMPLES; i += 1) {
    const s = -1 + (2 * i) / RECT_SIDE_SAMPLES
    points.push(at(s, -1), at(1, s), at(-s, 1), at(-1, -s))
  }
  return points
}

/** The rectangle's four corners in world x/z. */
export function rectCorners(rect: GroundRect): Array<[number, number]> {
  const xAxis = [Math.cos(rect.yaw), -Math.sin(rect.yaw)]
  const zAxis = [Math.sin(rect.yaw), Math.cos(rect.yaw)]
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1]
  ].map(([u, v]) => [
    rect.x + xAxis[0] * u * rect.halfX + zAxis[0] * v * rect.halfZ,
    rect.z + xAxis[1] * u * rect.halfX + zAxis[1] * v * rect.halfZ
  ])
}

/** The least clearance between a rectangle's outline and the road edges, negative where it overlaps a road. */
export function rectDistanceToRoadEdge(rect: GroundRect, roads: ReadonlyArray<RoadSample>) {
  return Math.min(...rectOutline(rect).map(([x, z]) => distanceToRoadEdge(x, z, roads)))
}

/**
 * Moves a ground rectangle sideways off the road its outline comes closest to (along that road's
 * normal, keeping its yaw) until the whole outline clears the road edges by `clearance`.
 */
export function pushRectClearOfRoads(rect: GroundRect, clearance: number, roads: ReadonlyArray<RoadSample>) {
  let { x, z } = rect
  for (let pass = 0; pass < RECT_PUSH_PASSES; pass += 1) {
    let worst = Number.POSITIVE_INFINITY
    let nearest: RoadSample | null = null
    for (const [px, pz] of rectOutline({ ...rect, x, z })) {
      for (const s of roads) {
        const d = Math.hypot(s.x - px, s.z - pz) - s.halfWidth
        if (d < worst) {
          worst = d
          nearest = s
        }
      }
    }
    if (!nearest || worst >= clearance) break
    const normalX = -nearest.tangentZ
    const normalZ = nearest.tangentX
    const sideSign = Math.sign((x - nearest.x) * normalX + (z - nearest.z) * normalZ) || 1
    x += normalX * sideSign * (clearance - worst)
    z += normalZ * sideSign * (clearance - worst)
  }
  return { x, z }
}

/**
 * Circles that together cover a ground rectangle, laid along its longer axis, so scattered plants
 * and rocks keep out of the whole building rather than a single circle around its centre.
 */
export function rectFootprints(rect: GroundRect): Footprint[] {
  const alongX = rect.halfX >= rect.halfZ
  const long = alongX ? rect.halfX : rect.halfZ
  const short = alongX ? rect.halfZ : rect.halfX
  const count = Math.ceil(long / short)
  const halfStep = long / count
  const axisX = alongX ? Math.cos(rect.yaw) : Math.sin(rect.yaw)
  const axisZ = alongX ? -Math.sin(rect.yaw) : Math.cos(rect.yaw)
  return Array.from({ length: count }, (_, i) => {
    const offset = -long + halfStep * (2 * i + 1)
    return { x: rect.x + axisX * offset, z: rect.z + axisZ * offset, radius: Math.hypot(halfStep, short) }
  })
}

/** Where a scatter may fall: a world-space box and the tests a candidate inside it must pass. */
export type ScatterArea = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  /** The chance from 0 to 1 that a candidate at x/z is kept, drawn before `accept` runs; every candidate goes on when omitted. */
  density?: (x: number, z: number) => number
  accept: (x: number, z: number) => boolean
}

export type ScatterOptions = {
  count: number
  seed: number
  /** Own footprint radius; also the clearance kept from other footprints. */
  radius: number
  minScale?: number
  maxScale?: number
  /** Whether instances of this scatter keep apart from each other by their own radius. */
  spaced?: boolean
  /** Candidates drawn per requested instance before giving up; raise it for areas that accept few candidates. */
  attemptsPerInstance?: number
}

export type ScatteredInstance = { x: number; z: number; rotY: number; scale: number }

/**
 * Seeded rejection sampling inside an area. Deterministic for a given seed so the island looks the
 * same on every visit; returns fewer instances than asked when space runs out.
 */
export function scatterInArea(area: ScatterArea, footprints: FootprintIndex, options: ScatterOptions): ScatteredInstance[] {
  const { count, seed, radius, minScale = 1, maxScale = 1, spaced = true, attemptsPerInstance = SCATTER_ATTEMPTS_PER_INSTANCE } = options
  const placed: ScatteredInstance[] = []
  // Instances keep apart as circles of half the spacing, so two of them overlap exactly when closer than the spacing.
  const spacing = new FootprintIndex()
  const halfSpacing = (radius * SCATTER_SPACING_RATIO) / 2
  const attempts = count * attemptsPerInstance
  for (let i = 0; i < attempts && placed.length < count; i += 1) {
    const x = area.minX + seededRandom(seed + i * SEED_STRIDE + SEED_OFFSET.x) * (area.maxX - area.minX)
    const z = area.minZ + seededRandom(seed + i * SEED_STRIDE + SEED_OFFSET.z) * (area.maxZ - area.minZ)
    if (area.density && seededRandom(seed + i * SEED_STRIDE + SEED_OFFSET.density) >= area.density(x, z)) continue
    if (!area.accept(x, z)) continue
    if (footprints.overlaps(x, z, radius)) continue
    if (spaced && spacing.overlaps(x, z, halfSpacing)) continue
    if (spaced) spacing.add({ x, z, radius: halfSpacing })
    placed.push({
      x,
      z,
      rotY: seededRandom(seed + i * SEED_STRIDE + SEED_OFFSET.rotation) * Math.PI * 2,
      scale: minScale + seededRandom(seed + i * SEED_STRIDE + SEED_OFFSET.scale) * (maxScale - minScale)
    })
  }
  return placed
}

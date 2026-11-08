import { smoothstep } from "@/utils/math"
import type { IslandTerrain } from "./islandTerrain"
import { type MapPoint, distanceToSegment, mapToScene } from "./terrainData"

/** Side of the buckets that index the roads and the stream for nearest-row lookups, in map pixels. */
const BUCKET_PX = 16

// How blender/island/terrain.py paints the ground (ground_maps), mirrored so placement can tell grass
// from rock, paving and sand: each pair is a smoothstep's edges, in rise over run for slopes, fractions
// of the peak for heights and map pixels for distances.
const ROCK_SLOPE = [0.55, 0.85] as const
const ROCK_HEIGHT = [0.6, 0.75] as const
const ROCK_HEIGHT_SLOPE = [0.25, 0.5] as const
const SAND_HEIGHT = [0.022, 0.034] as const
const SAND_SLOPE = [0.25, 0.45] as const
const PAVED_PX = [6, 8] as const
const QUAY_APRON_PX = [6, 10] as const
const SQUARE_PX = [12, 16] as const
const STREAM_BED_PX = [2.5, 5] as const
const POND_BANK_PX = [-1, 2] as const
/** The quay's line, along which the apron is paved (DESIGN.md section 17). */
const QUAY: readonly [MapPoint, MapPoint] = [
  [340, 512],
  [392, 500]
]

/** The shares of the ground's paint at a point: bare rock, paving (with the stream's bed and the pond), sand, and the grass they leave. */
export type GroundCover = { rock: number; path: number; sand: number; grass: number }

type Row = { x: number; y: number }

/** Map points bucketed on a grid, for the distance from any map point to the nearest of them. */
class PointIndex {
  private readonly buckets = new Map<number, Row[]>()

  constructor(points: Iterable<Row>) {
    for (const p of points) {
      const key = this.key(Math.floor(p.x / BUCKET_PX), Math.floor(p.y / BUCKET_PX))
      const bucket = this.buckets.get(key)
      if (bucket) bucket.push(p)
      else this.buckets.set(key, [p])
    }
  }

  private key(i: number, j: number) {
    return (i + 1000) * 4096 + (j + 1000)
  }

  /** Distance in map pixels to the nearest indexed point, searched out to `reach` pixels (Infinity beyond). */
  distance(x: number, y: number, reach: number) {
    const i0 = Math.floor((x - reach) / BUCKET_PX)
    const i1 = Math.floor((x + reach) / BUCKET_PX)
    const j0 = Math.floor((y - reach) / BUCKET_PX)
    const j1 = Math.floor((y + reach) / BUCKET_PX)
    // Squared distances in the loop: placement asks this tens of thousands of times.
    let best = reach * reach
    let found = false
    for (let i = i0; i <= i1; i += 1) {
      for (let j = j0; j <= j1; j += 1) {
        const bucket = this.buckets.get(this.key(i, j))
        if (!bucket) continue
        for (const p of bucket) {
          const dx = p.x - x
          const dy = p.y - y
          const squared = dx * dx + dy * dy
          if (squared <= best) {
            best = squared
            found = true
          }
        }
      }
    }
    return found ? Math.sqrt(best) : Number.POSITIVE_INFINITY
  }
}

/**
 * The questions placement asks of the terrain, in map pixels: how high the ground stands, how steep it
 * is, and how far a point lies from the roads, the stream and the pond.
 */
export class TerrainSite {
  private readonly roads: PointIndex
  private readonly stream: PointIndex

  constructor(readonly terrain: IslandTerrain) {
    const { roads, stream } = terrain.data
    const rows = [roads.ring, ...Object.values(roads.spurs)].flatMap((road) => road.points.map(([x, y]) => ({ x, y })))
    this.roads = new PointIndex(rows)
    this.stream = new PointIndex(stream.points.map(([x, y]) => ({ x, y })))
  }

  /** The ground's height as a fraction of the peak. */
  h(x: number, y: number) {
    return this.terrain.heights.sample(x, y)
  }

  /** The ground's height in metres above the water. */
  metres(x: number, y: number) {
    return this.h(x, y) * this.terrain.data.map.peakMetres
  }

  /** The ground's rise per metre across, from the heightmap's slope over a pixel either side. */
  slope(x: number, y: number) {
    const { peakMetres, metresPerPx } = this.terrain.data.map
    const dx = (this.h(x + 1, y) - this.h(x - 1, y)) * peakMetres
    const dy = (this.h(x, y + 1) - this.h(x, y - 1)) * peakMetres
    return Math.hypot(dx, dy) / (2 * metresPerPx)
  }

  /** The steepest ground within `radius` pixels, so a footprint never straddles a bank or a cliff edge. */
  steepestWithin(x: number, y: number, radius: number) {
    let steepest = this.slope(x, y)
    for (let k = 0; k < 8; k += 1) {
      const angle = (k / 8) * Math.PI * 2
      steepest = Math.max(steepest, this.slope(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius))
    }
    return steepest
  }

  /** Distance in map pixels to the nearest road centreline, or Infinity past `reach`. */
  roadDistance(x: number, y: number, reach = 64) {
    return this.roads.distance(x, y, reach)
  }

  /** Distance in map pixels to the stream's line, or Infinity past `reach`. */
  streamDistance(x: number, y: number, reach = 64) {
    return this.stream.distance(x, y, reach)
  }

  /** Distance in map pixels outside the mill pond's edge, negative inside it. */
  pondDistance(x: number, y: number) {
    const { centre, radiusPx } = this.terrain.data.stream.pond
    return Math.hypot(x - centre[0], y - centre[1]) - radiusPx
  }

  /**
   * How the ground is painted at a map point, as terrain.py paints it: rock where the ground is steep
   * or high, paving on the roads, the quay apron, the square, the stream's bed and the pond, sand on
   * the beach and the sea floor, each taking its share of what the ones before it leave.
   */
  cover(x: number, y: number): GroundCover {
    const h = this.h(x, y)
    if (h < 0) return { rock: 0, path: 0, sand: 1, grass: 0 }
    const slope = this.slope(x, y)
    const rock = Math.max(smoothstep(...ROCK_SLOPE, slope), smoothstep(...ROCK_HEIGHT, h) * smoothstep(...ROCK_HEIGHT_SLOPE, slope))
    const square = this.terrain.data.points.square
    const paved = Math.max(
      1 - smoothstep(...PAVED_PX, this.roadDistance(x, y, PAVED_PX[1])),
      1 - smoothstep(...QUAY_APRON_PX, distanceToSegment(x, y, ...QUAY)),
      1 - smoothstep(...SQUARE_PX, Math.hypot(x - square[0], y - square[1]))
    )
    const bed = 1 - smoothstep(...STREAM_BED_PX, this.streamDistance(x, y, STREAM_BED_PX[1]))
    const pond = 1 - smoothstep(...POND_BANK_PX, this.pondDistance(x, y))
    const path = Math.max(paved, bed, pond)
    const sand = (1 - smoothstep(...SAND_HEIGHT, h)) * (1 - smoothstep(...SAND_SLOPE, slope))
    return { rock, path: path * (1 - rock), sand: sand * (1 - rock) * (1 - path), grass: (1 - rock) * (1 - path) * (1 - sand) }
  }

  /** The most rock painted at a point or around it, out to `radius` pixels, so a tree keeps off cliff edges and crags. */
  rockWithin(x: number, y: number, radius: number) {
    let rock = this.cover(x, y).rock
    for (const reach of [radius / 2, radius]) {
      for (let k = 0; k < 8; k += 1) {
        const angle = (k / 8) * Math.PI * 2
        rock = Math.max(rock, this.cover(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach).rock)
      }
    }
    return rock
  }

  /** The scene position of a map point standing on the ground, lifted by `lift` scene units. */
  ground(x: number, y: number, lift = 0): [number, number, number] {
    const position = mapToScene(this.terrain.data.map, x, y, this.h(x, y))
    position[1] += lift
    return position
  }

  /** The scene x/z of a map point. */
  scene([x, y]: MapPoint): [number, number] {
    const [sx, , sz] = mapToScene(this.terrain.data.map, x, y)
    return [sx, sz]
  }
}

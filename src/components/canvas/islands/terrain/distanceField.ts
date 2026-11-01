import type { MapPoint } from "./terrainData"

/** Stands in for infinity: far beyond any squared distance on the grid, yet finite, so the parabolas' arithmetic holds. */
const FAR = 1e20

/**
 * One line of Felzenszwalb and Huttenlocher's distance transform: each cell's squared distance to the
 * nearest seed along the line, from the squared distances `f` so far, as the lower envelope of the
 * parabolas rooted at the cells. `parabolas` and `bounds` are scratch space of n and n + 1 entries.
 */
function transformLine(f: Float64Array, n: number, out: Float64Array, parabolas: Int32Array, bounds: Float64Array) {
  const meet = (q: number, p: number) => (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p)
  let k = 0
  parabolas[0] = 0
  bounds[0] = -Infinity
  bounds[1] = Infinity
  for (let q = 1; q < n; q += 1) {
    let s = meet(q, parabolas[k])
    while (s <= bounds[k]) {
      k -= 1
      s = meet(q, parabolas[k])
    }
    k += 1
    parabolas[k] = q
    bounds[k] = s
    bounds[k + 1] = Infinity
  }
  k = 0
  for (let q = 0; q < n; q += 1) {
    while (bounds[k + 1] < q) k += 1
    const p = parabolas[k]
    out[q] = (q - p) * (q - p) + f[p]
  }
}

/** A rectangle of the map in map pixels: its top-left corner and its size. */
export type MapRegion = { origin: MapPoint; size: readonly [number, number] }

/**
 * The distance in map pixels from any point of a region of the map to the nearest of a set of seed
 * points, read from a grid of cells that an exact Euclidean distance transform fills once. A lookup
 * costs the same however far the nearest seed lies, so thousands of scatter tests can ask it; each
 * answer is within half a cell's diagonal of the true distance. Cell (i, j) stands at the map point
 * origin + (i, j) * cellPx.
 */
export class DistanceField {
  readonly columns: number
  readonly rows: number
  private readonly distances: Float32Array

  constructor(
    readonly region: MapRegion,
    readonly cellPx: number,
    seeds: Iterable<MapPoint>
  ) {
    const [originX, originY] = region.origin
    const columns = Math.ceil(region.size[0] / cellPx) + 1
    const rows = Math.ceil(region.size[1] / cellPx) + 1
    const squared = new Float64Array(columns * rows).fill(FAR)
    for (const [x, y] of seeds) {
      const i = Math.round((x - originX) / cellPx)
      const j = Math.round((y - originY) / cellPx)
      if (i >= 0 && i < columns && j >= 0 && j < rows) squared[j * columns + i] = 0
    }

    const longest = Math.max(columns, rows)
    const line = new Float64Array(longest)
    const out = new Float64Array(longest)
    const parabolas = new Int32Array(longest)
    const bounds = new Float64Array(longest + 1)
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < columns; i += 1) line[i] = squared[j * columns + i]
      transformLine(line, columns, out, parabolas, bounds)
      for (let i = 0; i < columns; i += 1) squared[j * columns + i] = out[i]
    }
    for (let i = 0; i < columns; i += 1) {
      for (let j = 0; j < rows; j += 1) line[j] = squared[j * columns + i]
      transformLine(line, rows, out, parabolas, bounds)
      for (let j = 0; j < rows; j += 1) squared[j * columns + i] = out[j]
    }

    this.columns = columns
    this.rows = rows
    this.distances = new Float32Array(squared.length)
    for (let k = 0; k < squared.length; k += 1) this.distances[k] = Math.sqrt(squared[k]) * cellPx
  }

  /** Distance in map pixels from cell (i, j) to the nearest seed. */
  cellDistance(i: number, j: number) {
    return this.distances[j * this.columns + i]
  }

  /** Distance in map pixels from a map point to the nearest seed, bilinear between cells and held at the region's edge. */
  sample(x: number, y: number) {
    const u = Math.min(Math.max((x - this.region.origin[0]) / this.cellPx, 0), this.columns - 1)
    const v = Math.min(Math.max((y - this.region.origin[1]) / this.cellPx, 0), this.rows - 1)
    const i = Math.min(Math.floor(u), this.columns - 2)
    const j = Math.min(Math.floor(v), this.rows - 2)
    const fx = u - i
    const fy = v - j
    const at = (di: number, dj: number) => this.distances[(j + dj) * this.columns + i + di]
    return (at(0, 0) * (1 - fx) + at(1, 0) * fx) * (1 - fy) + (at(0, 1) * (1 - fx) + at(1, 1) * fx) * fy
  }
}

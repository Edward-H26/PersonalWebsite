import { DataTexture, DataUtils, HalfFloatType, LinearFilter, RedFormat } from "three"
import { DistanceField } from "./distanceField"
import { type MapPoint, mapToScene } from "./terrainData"
import type { IslandTerrain } from "./useTerrain"

/** Open sea kept round the map in the field, in map pixels; past it the distance grows with the way out. */
const SHORE_MARGIN_PX = 120
/** Cell side of the field, in map pixels: about a metre and a half on the water. */
const SHORE_CELL_PX = 2

/** A closed loop of map points with points added along every side, none more than a pixel apart. */
function densify(loop: ReadonlyArray<MapPoint>): MapPoint[] {
  const points: MapPoint[] = []
  loop.forEach((from, k) => {
    const to = loop[(k + 1) % loop.length]
    const steps = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1])))
    for (let s = 0; s < steps; s += 1) {
      const t = s / steps
      points.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t])
    }
  })
  return points
}

/**
 * The distance from the shore everywhere on the water, in world units: positive out at sea and
 * negative on land, measured to the coast loops of terrain.json (the island and the stacks and islet
 * off it) with the heightmap telling sea from land. The sea's mesh reads it at its vertices for the
 * swell, and its shader reads it as a texture for the foam and the shallows at any coast's shape.
 */
export class ShoreField {
  /** The texture's footprint in world x/z, from the outer edge of its first texel to that of its last. */
  readonly rect: { minX: number; minZ: number; sizeX: number; sizeZ: number }
  /** Where the field's middle lies in world x/z. */
  readonly centre: { x: number; z: number }
  /** How near the open water comes to the middle, in world units. */
  readonly nearestWater: number
  private readonly columns: number
  private readonly rows: number
  private readonly signed: Float32Array

  constructor(terrain: IslandTerrain) {
    const { map, coast } = terrain.data
    const origin: MapPoint = [-SHORE_MARGIN_PX, -SHORE_MARGIN_PX]
    const field = new DistanceField(
      { origin, size: [map.sizePx[0] + 2 * SHORE_MARGIN_PX, map.sizePx[1] + 2 * SHORE_MARGIN_PX] },
      SHORE_CELL_PX,
      [coast.outline, ...coast.islands].flatMap(densify)
    )
    this.columns = field.columns
    this.rows = field.rows
    this.signed = new Float32Array(this.columns * this.rows)
    for (let j = 0; j < this.rows; j += 1) {
      for (let i = 0; i < this.columns; i += 1) {
        const x = origin[0] + i * SHORE_CELL_PX
        const y = origin[1] + j * SHORE_CELL_PX
        const side = terrain.heights.sample(x, y) < map.waterLevel ? 1 : -1
        this.signed[j * this.columns + i] = side * field.cellDistance(i, j) * map.unitsPerPx
      }
    }
    // Each cell's value stands at its texel's centre, so the texture reaches half a cell past the first and last.
    const [minX, , minZ] = mapToScene(map, origin[0] - SHORE_CELL_PX / 2, origin[1] - SHORE_CELL_PX / 2)
    const cell = SHORE_CELL_PX * map.unitsPerPx
    this.rect = { minX, minZ, sizeX: this.columns * cell, sizeZ: this.rows * cell }
    this.centre = { x: minX + this.rect.sizeX / 2, z: minZ + this.rect.sizeZ / 2 }
    let nearest = Number.POSITIVE_INFINITY
    for (let j = 0; j < this.rows; j += 1) {
      for (let i = 0; i < this.columns; i += 1) {
        if (this.signed[j * this.columns + i] <= 0) continue
        const x = minX + (i + 0.5) * cell - this.centre.x
        const z = minZ + (j + 0.5) * cell - this.centre.z
        nearest = Math.min(nearest, Math.sqrt(x * x + z * z))
      }
    }
    this.nearestWater = nearest
  }

  /**
   * Distance from the shore at a world x/z, bilinear between cells. Beyond the field the open sea's
   * distance grows with the way out from its edge, a close bound far from the island.
   */
  distance(x: number, z: number) {
    const cell = this.rect.sizeX / this.columns
    const u = (x - this.rect.minX) / cell - 0.5
    const v = (z - this.rect.minZ) / cell - 0.5
    const cu = Math.min(Math.max(u, 0), this.columns - 1)
    const cv = Math.min(Math.max(v, 0), this.rows - 1)
    const i = Math.min(Math.floor(cu), this.columns - 2)
    const j = Math.min(Math.floor(cv), this.rows - 2)
    const fx = cu - i
    const fy = cv - j
    const at = (di: number, dj: number) => this.signed[(j + dj) * this.columns + i + di]
    const inside = (at(0, 0) * (1 - fx) + at(1, 0) * fx) * (1 - fy) + (at(0, 1) * (1 - fx) + at(1, 1) * fx) * fy
    return inside + Math.hypot(u - cu, v - cv) * cell
  }

  /** The field as a half-float texture, linearly filtered, for the sea's shader. */
  texture() {
    const data = new Uint16Array(this.signed.length)
    for (let k = 0; k < data.length; k += 1) data[k] = DataUtils.toHalfFloat(this.signed[k])
    const texture = new DataTexture(data, this.columns, this.rows, RedFormat, HalfFloatType)
    texture.magFilter = LinearFilter
    texture.minFilter = LinearFilter
    texture.needsUpdate = true
    return texture
  }
}

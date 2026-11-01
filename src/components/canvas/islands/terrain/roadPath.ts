import { Vector3 } from "three"
import { clamp01 } from "@/utils/math"
import { type MapFrame, type ProfileRow, type RoadProfile, mapToScene } from "./terrainData"

/** Half the stretch of road over which its direction is taken, in map pixels. */
const TANGENT_HALF_SPAN_PX = 4

const ahead = new Vector3()
const behind = new Vector3()

/** Each row's plan position averaged with `rows` neighbours either side, wrapping round a closed road. */
function roundCorners(points: ReadonlyArray<ProfileRow>, closed: boolean, rows: number): Array<[number, number]> {
  const count = closed ? points.length - 1 : points.length
  return points.map((_, i) => {
    let x = 0
    let y = 0
    let weight = 0
    for (let k = -rows; k <= rows; k += 1) {
      const j = closed ? (((i + k) % count) + count) % count : i + k
      if (j < 0 || j >= count) continue
      x += points[j][0]
      y += points[j][1]
      weight += 1
    }
    return [x / weight, y / weight]
  })
}

/**
 * A road of terrain.json in the scene, walked by t, the share of its plan length from its first row
 * (the file's own t). Its heights are the road surface after relaxation, the stone bridge's hump
 * included, so whatever follows it rides the road's rises and falls. The roads run straight between
 * the plan's waypoints and turn by up to 83 degrees at them; `cornerRows` averages each row's plan
 * position with that many rows either side, which rounds every corner into a short arc.
 */
export class RoadPath {
  readonly closed: boolean
  /** Plan length in map pixels. */
  readonly lengthPx: number
  /** Plan length in scene units. */
  readonly length: number
  private readonly points: Vector3[]
  private readonly ts: Float64Array

  constructor(profile: RoadProfile, map: MapFrame, cornerRows = 0) {
    this.closed = profile.closed
    this.lengthPx = profile.lengthPx
    this.length = profile.lengthPx * map.unitsPerPx
    const plan = roundCorners(profile.points, profile.closed, cornerRows)
    this.points = profile.points.map((row, i) => new Vector3(...mapToScene(map, plan[i][0], plan[i][1], row[2])))
    this.ts = Float64Array.from(profile.points, (row) => row[4])
  }

  /** t wrapped round a closed road, held at the ends of an open one. */
  private wrap(t: number) {
    return this.closed ? t - Math.floor(t) : clamp01(t)
  }

  /** The road surface at t. */
  getPointAt(t: number, target = new Vector3()) {
    const u = this.wrap(t)
    let low = 0
    let high = this.ts.length - 1
    while (high - low > 1) {
      const mid = (low + high) >> 1
      if (this.ts[mid] <= u) low = mid
      else high = mid
    }
    const span = this.ts[high] - this.ts[low]
    return target.copy(this.points[low]).lerp(this.points[high], span > 0 ? (u - this.ts[low]) / span : 0)
  }

  /** The road's unit direction at t, rise and fall included, taken across a few pixels either side. */
  getTangentAt(t: number, target = new Vector3()) {
    const dt = TANGENT_HALF_SPAN_PX / this.lengthPx
    const from = this.closed ? t - dt : Math.max(0, this.wrap(t) - dt)
    const to = this.closed ? t + dt : Math.min(1, this.wrap(t) + dt)
    this.getPointAt(to, ahead)
    this.getPointAt(from, behind)
    return target.subVectors(ahead, behind).normalize()
  }

  /** The t of the row nearest a scene x/z. */
  nearestT(x: number, z: number) {
    let best = 0
    let bestDistance = Number.POSITIVE_INFINITY
    this.points.forEach((p, i) => {
      const distance = (p.x - x) ** 2 + (p.z - z) ** 2
      if (distance < bestDistance) {
        bestDistance = distance
        best = this.ts[i]
      }
    })
    return best
  }
}

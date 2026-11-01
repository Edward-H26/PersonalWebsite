import { MODEL_PATHS } from "@/config/modelPaths"
import { islandFitHeight, islandGroundRadius } from "@/config/modelSizes"
import { seededRandom } from "@/utils/math"
import type { RoadLanternGroup, Vec3Tuple } from "../village/types"
import { sceneToMap } from "../terrain/terrainData"
import { type LayoutContext, ROAD_HALF_WIDTH_PX } from "./context"

/** About one lantern every 33 m round the ring road. */
const LANTERN_SPACING_M = 33
/** A lantern stands this far beyond the gravel's edge, in map pixels. */
const LANTERN_PAST_EDGE_PX = 2.5
/** Steps tried along the road, in route t, when a lantern's spot is taken by a building or another road. */
const NUDGES = [0, 0.006, -0.006, 0.012, -0.012, 0.018, -0.018]
/** Lanterns sink this far into the ground so their base never floats. */
const GROUND_OFFSET = -0.06

/**
 * The lanterns along the ring road, about every 33 m and on alternating sides, in road order with the
 * route t each stands at, so the walk lights them one by one as it reaches them.
 */
export function placeRoadLanterns(ctx: LayoutContext): RoadLanternGroup {
  const { roads, map } = ctx.site.terrain.data
  const ring = ctx.site.terrain.ring
  const count = Math.round((roads.ring.lengthPx * map.metresPerPx) / LANTERN_SPACING_M)
  const offset = (ROAD_HALF_WIDTH_PX + LANTERN_PAST_EDGE_PX) * map.unitsPerPx
  const radius = islandGroundRadius(MODEL_PATHS.earth.lantern)
  const point = ring.getPointAt(0)
  const tangent = ring.getTangentAt(0)

  const spot = (i: number) => {
    const side = i % 2 === 0 ? 1 : -1
    for (const nudge of NUDGES) {
      const t = (i + 0.5) / count + nudge
      ring.getPointAt(t, point)
      ring.getTangentAt(t, tangent)
      const across = Math.hypot(tangent.x, tangent.z) || 1
      const x = point.x - (tangent.z / across) * side * offset
      const z = point.z + (tangent.x / across) * side * offset
      // Clear of every other road too, where the spurs leave the ring.
      if (ctx.site.roadDistance(...sceneToMap(map, x, z)) * map.unitsPerPx < offset - 0.4) continue
      if (ctx.footprints.overlaps(x, z, radius)) continue
      ctx.footprints.add({ x, z, radius })
      return {
        position: [x, ctx.sampleGroundY(x, z) + GROUND_OFFSET, z] as Vec3Tuple,
        rotation: [0, seededRandom(i * 2.1 + 0.7) * Math.PI * 2, 0] as Vec3Tuple,
        scale: 1,
        routeT: t
      }
    }
    return null
  }

  const instances = Array.from({ length: count }, (_, i) => spot(i)).filter((lantern) => lantern !== null)
  return { path: MODEL_PATHS.earth.lantern, fitHeight: islandFitHeight(MODEL_PATHS.earth.lantern), instances }
}

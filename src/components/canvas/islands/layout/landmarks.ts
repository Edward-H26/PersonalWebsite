import { MODEL_PATHS } from "@/config/modelPaths"
import { ISLAND_UNITS_PER_METRE, islandSize } from "@/config/modelSizes"
import type { Placement, Vec3Tuple } from "../village/types"
import { facingToYaw, mapToScene } from "../terrain/terrainData"
import type { LayoutContext } from "./context"

/**
 * The landmarks blender/island built for their anchors in terrain.json, each standing on its anchor
 * with its origin there: the castle on the knoll's bailey, the watermill at the pond's outlet, the
 * stone bridge over the stream's mouth, the lighthouse on the headland, the standing stones, the
 * wayside shrine and the signpost at the mill lane's junction.
 */
const LANDMARKS = [
  { key: "castleKeep", path: MODEL_PATHS.earth.castleKeep, anchor: "castle_keep" },
  { key: "watermill", path: MODEL_PATHS.earth.watermill, anchor: "watermill" },
  { key: "stoneBridge", path: MODEL_PATHS.earth.stoneBridge, anchor: "stone_bridge" },
  { key: "lighthouse", path: MODEL_PATHS.earth.lighthouse, anchor: "lighthouse" },
  { key: "standingStones", path: MODEL_PATHS.earth.standingStones, anchor: "standing_stones" },
  { key: "shrine", path: MODEL_PATHS.earth.shrine, anchor: "shrine" },
  { key: "signpost", path: MODEL_PATHS.earth.signpost, anchor: "signpost" }
] as const

/** The water wheel: where its axle stands and the yaw that turns it to its pit; it spins about its own x. */
export type WaterWheel = { path: string; position: Vec3Tuple; yaw: number }

/** The landmarks as placements, each keeping later placements out of its ground plan, plus the turning wheel. */
export function placeLandmarks(ctx: LayoutContext): { placements: Placement[]; wheel: WaterWheel } {
  const { map, landmarks } = ctx.site.terrain.data
  const placements = LANDMARKS.map(({ key, path, anchor }): Placement => {
    const { at, facing } = landmarks[anchor]
    const position = mapToScene(map, at[0], at[1], at[2])
    const { width, depth } = islandSize(path)
    ctx.footprints.add({ x: position[0], z: position[2], radius: Math.hypot(width, depth) / 2 })
    return { key, path, position, rotation: [0, facingToYaw(facing), 0], scale: ISLAND_UNITS_PER_METRE, pivot: "origin" }
  })
  const { at, facing } = landmarks.watermill_wheel
  return {
    placements,
    wheel: { path: MODEL_PATHS.earth.watermillWheel, position: mapToScene(map, at[0], at[1], at[2]), yaw: facingToYaw(facing) }
  }
}

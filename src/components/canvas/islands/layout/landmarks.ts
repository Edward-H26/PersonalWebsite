import { MathUtils, Vector3 } from "three"
import { MODEL_PATHS } from "@/config/modelPaths"
import { ISLAND_MOUNTS, ISLAND_UNITS_PER_METRE, type ModelMount, islandSize } from "@/config/modelSizes"
import type { Placement, Vec3Tuple } from "../village/types"
import { type MapPoint, facingToYaw, mapToScene } from "../terrain/terrainData"
import type { LayoutContext } from "./context"

// A market stand's counter faces the model's +x, a quarter turn from the +z front its anchor turns to the road,
// so the stands turn back by that quarter to sell to the road.
const STAND_COUNTER_YAW = -Math.PI / 2

/**
 * The landmarks blender/island built or sited for their anchors in terrain.json, each standing on its anchor
 * with its origin there and its front to the anchor's facing: the castle on the knoll's bailey with its stair
 * down to the gate, the garrison house and the two market stands below the gate, the watermill at the pond's
 * outlet, the stone bridge on the beach walk, the bell tower on the village street, the sawmill, the stable and
 * the windmill on the north meadow, the lighthouse on the headland, the standing stones, the wayside shrine and
 * the signposts at the mill lane's junction and the lighthouse's turn.
 */
const LANDMARKS: ReadonlyArray<{ key: string; path: string; anchor: string; yaw?: number }> = [
  { key: "castleKeep", path: MODEL_PATHS.earth.castleKeep, anchor: "castle_keep" },
  { key: "castleStair", path: MODEL_PATHS.earth.castleStair, anchor: "castle_stair" },
  { key: "garrison", path: MODEL_PATHS.earth.barracks, anchor: "barracks" },
  { key: "marketStandA", path: MODEL_PATHS.earth.marketStand01, anchor: "market_stand_01", yaw: STAND_COUNTER_YAW },
  { key: "marketStandB", path: MODEL_PATHS.earth.marketStand02, anchor: "market_stand_02", yaw: STAND_COUNTER_YAW },
  { key: "watermill", path: MODEL_PATHS.earth.watermill, anchor: "watermill" },
  { key: "stoneBridge", path: MODEL_PATHS.earth.stoneBridge, anchor: "stone_bridge" },
  { key: "bellTower", path: MODEL_PATHS.earth.bellTower, anchor: "bell_tower" },
  { key: "sawmill", path: MODEL_PATHS.earth.sawmill, anchor: "sawmill" },
  { key: "stable", path: MODEL_PATHS.earth.stable, anchor: "stable" },
  { key: "windmill", path: MODEL_PATHS.earth.mill, anchor: "mill" },
  { key: "lighthouse", path: MODEL_PATHS.earth.lighthouse, anchor: "lighthouse" },
  { key: "standingStones", path: MODEL_PATHS.earth.standingStones, anchor: "standing_stones" },
  { key: "shrine", path: MODEL_PATHS.earth.shrine, anchor: "shrine" },
  { key: "signpost", path: MODEL_PATHS.earth.signpost, anchor: "signpost" },
  { key: "signpostLighthouse", path: MODEL_PATHS.earth.signpost, anchor: "signpost_lighthouse" }
]

/**
 * An overshot wheel turns slowly, about five turns a minute. The flume feeds it from the pond behind it, so its
 * top turns away from the flume, towards its front.
 */
const WATER_WHEEL_TURNS_PER_MINUTE = 5
/** The windmill's sails turn slower still in the sea breeze, about three turns a minute. */
const WINDMILL_TURNS_PER_MINUTE = 3
/**
 * A part that turns about its own x axis: the water wheel on its axle, the windmill's sails on the mill's hub.
 * It stands at `position` with its origin on its axle, turned by `yaw` about the vertical.
 */
export type Rotor = { key: string; path: string; position: Vec3Tuple; yaw: number; turnsPerMinute: number }

const UP = new Vector3(0, 1, 0)

/** The rotor `path` on its mount on a placed host, turning `turnsPerMinute` about its own x. */
export function mountRotor(host: Placement, mount: ModelMount, key: string, path: string, turnsPerMinute: number): Rotor {
  const hostYaw = host.rotation[1]
  const offset = new Vector3(...mount.offset).multiplyScalar(ISLAND_UNITS_PER_METRE).applyAxisAngle(UP, hostYaw)
  return {
    key,
    path,
    position: [host.position[0] + offset.x, host.position[1] + offset.y, host.position[2] + offset.z],
    yaw: hostYaw + MathUtils.degToRad(mount.rotationY),
    turnsPerMinute
  }
}

/** The landmarks as placements, each keeping later placements out of its ground plan, plus the parts that turn. */
export function placeLandmarks(ctx: LayoutContext): { placements: Placement[]; rotors: Rotor[] } {
  const { map, landmarks } = ctx.site.terrain.data
  const placements = LANDMARKS.map(({ key, path, anchor, yaw = 0 }): Placement => {
    const { at, facing, foot } = landmarks[anchor]
    const position = mapToScene(map, at[0], at[1], at[2])
    const { width, depth } = islandSize(path)
    // The castle stair hangs off the keep's origin; its ground plan runs up from its foot towards the keep.
    const [planX, planY] = foot ? towards(foot, at, depth / 2 / map.unitsPerPx) : at
    const [x, , z] = mapToScene(map, planX, planY)
    ctx.footprints.add({ x, z, radius: Math.hypot(width, depth) / 2 })
    return { key, path, position, rotation: [0, facingToYaw(facing) + yaw, 0], scale: ISLAND_UNITS_PER_METRE, pivot: "origin" }
  })
  const windmill = placements.find((p) => p.key === "windmill")!
  const sails = landmarks.mill.sails as keyof typeof ISLAND_MOUNTS
  const windmillSails = mountRotor(windmill, ISLAND_MOUNTS[sails], "windmillSails", MODEL_PATHS.earth.millSails, WINDMILL_TURNS_PER_MINUTE)
  const { at, facing } = landmarks.watermill_wheel
  const waterWheel: Rotor = {
    key: "waterWheel",
    path: MODEL_PATHS.earth.watermillWheel,
    position: mapToScene(map, at[0], at[1], at[2]),
    yaw: facingToYaw(facing),
    turnsPerMinute: WATER_WHEEL_TURNS_PER_MINUTE
  }
  return { placements, rotors: [waterWheel, windmillSails] }
}

/** The map point `distance` pixels from `from` towards `to`. */
function towards(from: readonly number[], to: readonly number[], distance: number): MapPoint {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  return [from[0] + ((to[0] - from[0]) / length) * distance, from[1] + ((to[1] - from[1]) / length) * distance]
}

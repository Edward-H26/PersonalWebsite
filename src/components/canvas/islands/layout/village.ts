import { MODEL_PATHS } from "@/config/modelPaths"
import { ISLAND_UNITS_PER_METRE, islandFitHeight, islandGroundRadius, islandSize } from "@/config/modelSizes"
import { seededRandom } from "@/utils/math"
import type { InstancedGroup, Placement, Vec3Tuple } from "../village/types"
import { type MapPoint, mapToScene } from "../terrain/terrainData"
import type { LayoutContext } from "./context"
import { type GroundRect, pushRectClearOfRoads, rectCorners, rectFootprints } from "./placement"

/** Extra clearance between a building's walls and the gravel's edge, in world units. */
export const BUILDING_ROAD_CLEARANCE = 1
/** A building sinks this far below the lowest ground under its walls, so no corner floats over a slope. */
const BUILDING_SINK = 0.2
/** Props sink this far into the ground so their bases never float. */
const PROP_SINK = 0.08

/**
 * The village on its terraces (DESIGN.md section 17), each building at its place on the plan in map
 * pixels. The inn's plan spot lies on the village street, so it starts on the street's uphill side.
 */
export const VILLAGE_BUILDINGS: ReadonlyArray<{ key: string; path: string; at: MapPoint }> = [
  { key: "inn", path: MODEL_PATHS.earth.inn, at: [390, 444] },
  { key: "houseQuay", path: MODEL_PATHS.earth.house02, at: [362, 486] },
  { key: "houseStream", path: MODEL_PATHS.earth.house03, at: [430, 480] },
  { key: "houseWest", path: MODEL_PATHS.earth.house01, at: [345, 470] },
  { key: "bellTower", path: MODEL_PATHS.earth.bellTower, at: [448, 405] },
  { key: "blacksmith", path: MODEL_PATHS.earth.blacksmith, at: [518, 404] },
  { key: "sawmill", path: MODEL_PATHS.earth.sawmill, at: [556, 456] },
  { key: "stable", path: MODEL_PATHS.earth.stable, at: [618, 500] }
]

/** The well stands at the end of its path from the square, facing back up the path. */
const WELL_AT: MapPoint = [470, 445]
const WELL_FACES: MapPoint = [450, 420]

// The stands' counters face the model's +x, a quarter turn from the +z front that every placement
// turns towards the road, so the stands turn back by that quarter to sell to the street.
const STAND_COUNTER_YAW = -Math.PI / 2

/** The market on the square's south side, between the street and the well path, with the cart beside it. */
const MARKET: ReadonlyArray<{ key: string; path: string; at: MapPoint; yaw?: number }> = [
  { key: "marketStandA", path: MODEL_PATHS.earth.marketStand01, at: [447, 437], yaw: STAND_COUNTER_YAW },
  { key: "marketStandB", path: MODEL_PATHS.earth.marketStand02, at: [440, 448], yaw: STAND_COUNTER_YAW },
  { key: "marketStandC", path: MODEL_PATHS.earth.marketStand02, at: [455, 447], yaw: STAND_COUNTER_YAW },
  { key: "cart", path: MODEL_PATHS.earth.cart, at: [433, 457], yaw: 0.4 },
  { key: "firePit", path: MODEL_PATHS.earth.firePit, at: [378, 432] }
]

/** Barrels and crates by the market, the inn, the blacksmith, the stable and the quay, in map pixels. */
const CLUSTERS: ReadonlyArray<{ key: string; path: string; at: readonly MapPoint[] }> = [
  {
    key: "barrels",
    path: MODEL_PATHS.earth.barrels,
    at: [
      [452, 455],
      [398, 432],
      [508, 414],
      [611, 486],
      [380, 500]
    ]
  },
  {
    key: "crates",
    path: MODEL_PATHS.earth.crate,
    at: [
      [444, 458],
      [462, 438],
      [527, 412],
      [372, 497],
      [627, 491]
    ]
  }
]

// The bunting is tied from the well's roof to stand C's awning, stretched to the gap between them, and
// hangs beside the well path rather than over it, so the walking camera never passes through its flags.
const BUNTING_TIE_HEIGHT_M = 2.7

/** A cypress stand behind the bell tower, the vertical accent over the square. */
const CYPRESSES: readonly MapPoint[] = [
  [438, 392],
  [447, 388],
  [457, 391],
  [462, 398],
  [432, 399]
]

/** Yaw that turns a model at x/z to face the nearest road sample. */
function faceNearestRoad(ctx: LayoutContext, x: number, z: number) {
  let best = Number.POSITIVE_INFINITY
  let nearest = ctx.roads[0]
  for (const s of ctx.roads) {
    const d = Math.hypot(s.x - x, s.z - z)
    if (d < best) {
      best = d
      nearest = s
    }
  }
  return Math.atan2(nearest.x - x, nearest.z - z)
}

/** The ground plan of a model at its real size, centred on x/z and turned by `yaw`. */
function groundRect(path: string, x: number, z: number, yaw: number): GroundRect {
  const { width, depth } = islandSize(path)
  return { x, z, yaw, halfX: width / 2, halfZ: depth / 2 }
}

/** The lowest ground under a rectangle's corners and centre. */
function lowestGround(ctx: LayoutContext, rect: GroundRect) {
  return Math.min(ctx.sampleGroundY(rect.x, rect.z), ...rectCorners(rect).map(([x, z]) => ctx.sampleGroundY(x, z)))
}

/** The village's buildings, each facing the street, pushed clear of the roads, standing on the lowest ground under it. */
export function placeBuildings(ctx: LayoutContext): Placement[] {
  const { map } = ctx.site.terrain.data
  return VILLAGE_BUILDINGS.map(({ key, path, at }) => {
    const [x0, , z0] = mapToScene(map, at[0], at[1])
    const yaw = faceNearestRoad(ctx, x0, z0)
    const { x, z } = pushRectClearOfRoads(groundRect(path, x0, z0, yaw), BUILDING_ROAD_CLEARANCE, ctx.roads)
    const rect = groundRect(path, x, z, yaw)
    ctx.footprints.add(...rectFootprints(rect))
    return {
      key,
      path,
      position: [x, lowestGround(ctx, rect) - BUILDING_SINK, z],
      rotation: [0, yaw, 0],
      fitHeight: islandFitHeight(path),
      scale: 1
    }
  })
}

/** A single prop at a map point, facing the nearest road turned by `yaw`, with a footprint. */
function placeProp(ctx: LayoutContext, key: string, path: string, at: MapPoint, yaw = 0, facing?: MapPoint): Placement {
  const { map } = ctx.site.terrain.data
  const [x, , z] = mapToScene(map, at[0], at[1])
  const towards = facing ? mapToScene(map, facing[0], facing[1]) : null
  const heading = towards ? Math.atan2(towards[0] - x, towards[2] - z) : faceNearestRoad(ctx, x, z)
  ctx.footprints.add({ x, z, radius: islandGroundRadius(path) })
  return {
    key,
    path,
    position: [x, ctx.sampleGroundY(x, z) - PROP_SINK, z],
    rotation: [0, heading + yaw, 0],
    fitHeight: islandFitHeight(path),
    scale: 1
  }
}

/** The well and the market's stands, the cart and the fire pit. */
export function placeVillageProps(ctx: LayoutContext): Placement[] {
  return [
    placeProp(ctx, "well", MODEL_PATHS.earth.well, WELL_AT, 0, WELL_FACES),
    ...MARKET.map(({ key, path, at, yaw }) => placeProp(ctx, key, path, at, yaw ?? 0))
  ]
}

/** The string of bunting from the well's roof to stand C, stretched to the gap between them. */
export function placeBunting(ctx: LayoutContext, props: readonly Placement[]): Placement {
  const [from, to] = ["well", "marketStandC"].map((key) => {
    const prop = props.find((p) => p.key === key)
    if (!prop) throw new Error(`The bunting is tied to "${key}", which is not placed`)
    return prop
  })
  const dx = to.position[0] - from.position[0]
  const dz = to.position[2] - from.position[2]
  const { width: span, height: drop } = islandSize(MODEL_PATHS.earth.bunting)
  const stretch = Math.hypot(dx, dz) / span
  const x = (from.position[0] + to.position[0]) / 2
  const z = (from.position[2] + to.position[2]) / 2
  return {
    key: "bunting",
    path: MODEL_PATHS.earth.bunting,
    position: [x, ctx.sampleGroundY(x, z) + BUNTING_TIE_HEIGHT_M * ISLAND_UNITS_PER_METRE - drop * stretch, z],
    rotation: [0, Math.atan2(-dz, dx), 0],
    fitHeight: drop * stretch,
    scale: 1
  }
}

/** Barrels and crates as one instanced group per model, and the cypress stand behind the bell tower. */
export function placeVillageClusters(ctx: LayoutContext): InstancedGroup[] {
  const { map } = ctx.site.terrain.data
  const group = (key: string, path: string, points: readonly MapPoint[], seed: number): InstancedGroup => ({
    key,
    path,
    fitHeight: islandFitHeight(path),
    castShadow: true,
    excludeFromReflection: true,
    instances: points.map(([px, py], i) => {
      const [x, , z] = mapToScene(map, px, py)
      ctx.footprints.add({ x, z, radius: islandGroundRadius(path) })
      return {
        position: [x, ctx.sampleGroundY(x, z) - PROP_SINK, z] as Vec3Tuple,
        rotation: [0, seededRandom(seed + i * 2.1) * Math.PI * 2, 0] as Vec3Tuple,
        scale: 1
      }
    })
  })
  return [
    ...CLUSTERS.map(({ key, path, at }, i) => group(key, path, at, 17 + i * 31)),
    group("cypress", MODEL_PATHS.earth.cypress, CYPRESSES, 43)
  ]
}

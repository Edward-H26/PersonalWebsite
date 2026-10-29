import { MODEL_PATHS } from "@/config/modelPaths"
import { type Footprint, PATH_WIDTH, pushClearOfRoads } from "../islandGeometry"
import { type RoadAnchorSpec, nearestRoadDirection, roadAnchor } from "./anchors"
import type { LayoutContext, Placement } from "./types"

/** A building's footprint radius as a fraction of its fitted height. */
const BUILDING_FOOTPRINT_RATIO = 0.45
/** Extra clearance between a building's footprint and the road edge. */
const BUILDING_ROAD_CLEARANCE = 0.5

// Buildings anchored to the main road, with their height, yaw tweak and how far they sink in.
type RoadBuildingSpec = RoadAnchorSpec & {
  key: string
  path: string
  fitHeight: number
  rotOffset: number
  yOffset: number
}

export const ROAD_BUILDINGS: readonly RoadBuildingSpec[] = [
  {
    key: "stable",
    path: MODEL_PATHS.earth.stable,
    t: 0.11,
    side: 1,
    out: PATH_WIDTH / 2 + 18,
    along: 4.0,
    fitHeight: 12.5,
    rotOffset: 0.12,
    yOffset: -0.22
  },
  {
    key: "houseEntryA",
    path: MODEL_PATHS.earth.house02,
    t: 0.06,
    side: -1,
    out: PATH_WIDTH / 2 + 16,
    along: -2.0,
    fitHeight: 10.5,
    rotOffset: -0.05,
    yOffset: -0.22
  },
  {
    key: "bellTower",
    path: MODEL_PATHS.earth.bellTower,
    t: 0.22,
    side: 1,
    out: PATH_WIDTH / 2 + 24,
    along: -1.0,
    fitHeight: 20,
    rotOffset: 0.08,
    yOffset: -0.3
  },
  {
    key: "houseSouthA",
    path: MODEL_PATHS.earth.house03,
    t: 0.18,
    side: -1,
    out: PATH_WIDTH / 2 + 14,
    along: 4.5,
    fitHeight: 10.5,
    rotOffset: 0.1,
    yOffset: -0.22
  },
  {
    key: "mill",
    path: MODEL_PATHS.earth.mill,
    t: 0.34,
    side: 1,
    out: PATH_WIDTH / 2 + 26,
    along: 3.5,
    fitHeight: 18,
    rotOffset: 0.22,
    yOffset: -0.3
  },
  {
    key: "houseEastA",
    path: MODEL_PATHS.earth.house01,
    t: 0.3,
    side: -1,
    out: PATH_WIDTH / 2 + 16,
    along: -1.0,
    fitHeight: 11,
    rotOffset: -0.12,
    yOffset: -0.22
  },
  {
    key: "inn",
    path: MODEL_PATHS.earth.fantasyInn,
    t: 0.5,
    side: -1,
    out: PATH_WIDTH / 2 + 22,
    along: -3.0,
    fitHeight: 16,
    rotOffset: -0.05,
    yOffset: -0.24
  },
  {
    key: "barracks",
    path: MODEL_PATHS.earth.barracks,
    t: 0.58,
    side: 1,
    out: PATH_WIDTH / 2 + 26,
    along: 2.5,
    fitHeight: 15,
    rotOffset: 0.12,
    yOffset: -0.24
  },
  {
    key: "houseNorthA",
    path: MODEL_PATHS.earth.house03,
    t: 0.54,
    side: -1,
    out: PATH_WIDTH / 2 + 16,
    along: 5.0,
    fitHeight: 11,
    rotOffset: 0.08,
    yOffset: -0.22
  },
  {
    key: "sawmill",
    path: MODEL_PATHS.earth.sawmill,
    t: 0.7,
    side: -1,
    out: PATH_WIDTH / 2 + 26,
    along: 1.0,
    fitHeight: 14.5,
    rotOffset: -0.08,
    yOffset: -0.26
  },
  {
    key: "blacksmith",
    path: MODEL_PATHS.earth.blacksmith,
    t: 0.82,
    side: 1,
    out: PATH_WIDTH / 2 + 22,
    along: -2.5,
    fitHeight: 12,
    rotOffset: 0.05,
    yOffset: -0.24
  },
  {
    key: "houseWestA",
    path: MODEL_PATHS.earth.house02,
    t: 0.88,
    side: -1,
    out: PATH_WIDTH / 2 + 18,
    along: 2.0,
    fitHeight: 10.5,
    rotOffset: -0.1,
    yOffset: -0.22
  }
]

// Extra homes in the interior, placed in local coordinates and turned to face the nearest road.
export const INTERIOR_BUILDINGS = [
  { key: "houseInnerA", path: MODEL_PATHS.earth.house01, x: 8, z: -10, fitHeight: 11, yOffset: -0.22 },
  { key: "houseInnerB", path: MODEL_PATHS.earth.house03, x: -14, z: -12, fitHeight: 10.5, yOffset: -0.22 },
  { key: "houseInnerC", path: MODEL_PATHS.earth.house02, x: -24, z: 18, fitHeight: 10.5, yOffset: -0.22 },
  { key: "houseInnerD", path: MODEL_PATHS.earth.house01, x: 16, z: 22, fitHeight: 11, yOffset: -0.22 }
] as const

/** Places the roadside buildings, facing the road, and records their footprints. */
export function placeRoadBuildings(ctx: LayoutContext, footprints: Footprint[]): Placement[] {
  return ROAD_BUILDINGS.map((b) => {
    const anchor = roadAnchor(ctx, b.t, b.side, b.out, b.along)
    const radius = b.fitHeight * BUILDING_FOOTPRINT_RATIO
    const clear = pushClearOfRoads(anchor.x, anchor.z, radius + BUILDING_ROAD_CLEARANCE, ctx.roads)
    footprints.push({ x: clear.x, z: clear.z, radius })
    return {
      key: b.key,
      path: b.path,
      position: [clear.x, ctx.sampleGroundY(clear.x, clear.z) + b.yOffset, clear.z],
      rotation: [0, anchor.heading + b.side * (Math.PI / 2) + b.rotOffset, 0],
      fitHeight: b.fitHeight,
      scale: 1
    }
  })
}

/** Places the interior homes, turned towards the nearest road, and records their footprints. */
export function placeInteriorBuildings(ctx: LayoutContext, footprints: Footprint[]): Placement[] {
  return INTERIOR_BUILDINGS.map((b) => {
    const radius = b.fitHeight * BUILDING_FOOTPRINT_RATIO
    const clear = pushClearOfRoads(b.x, b.z, radius + BUILDING_ROAD_CLEARANCE, ctx.roads)
    footprints.push({ x: clear.x, z: clear.z, radius })
    return {
      key: b.key,
      path: b.path,
      position: [clear.x, ctx.sampleGroundY(clear.x, clear.z) + b.yOffset, clear.z],
      rotation: [0, nearestRoadDirection(clear.x, clear.z, ctx.roads), 0],
      fitHeight: b.fitHeight,
      scale: 1
    }
  })
}

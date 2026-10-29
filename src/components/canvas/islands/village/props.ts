import { MODEL_PATHS } from "@/config/modelPaths"
import { seededRandom } from "@/utils/math"
import { type Footprint, PATH_WIDTH } from "../islandGeometry"
import { type RoadAnchorSpec, roadAnchor } from "./anchors"
import type { InstanceTransform, InstancedGroup, LayoutContext, Placement, Vec3Tuple } from "./types"

// How far each kind of prop sinks into the ground so its base never floats above the grass.
const ROAD_PROP_GROUND_OFFSET = -0.12
const CLUSTER_GROUND_OFFSET = -0.06
const FENCE_GROUND_OFFSET = -0.08
const CYPRESS_GROUND_OFFSET = -0.18
// Footprint radii as a fraction of the fitted height, or fixed for the cypresses.
const ROAD_PROP_FOOTPRINT_RATIO = 0.6
const CLUSTER_FOOTPRINT_RATIO = 0.8
const CYPRESS_FOOTPRINT_RADIUS = 2.5
const CYPRESS_FIT_HEIGHT = 20
// Props and clusters take a seeded yaw from their position along the route.
const PROP_YAW_SEED_SCALE = 100.7
const CLUSTER_YAW_SEED_STEP = 2.1
const CYPRESS_YAW_SEED_OFFSET = 1.2

type RoadPropSpec = RoadAnchorSpec & { key: string; path: string; fitHeight: number; rotOffset: number }

const ROAD_PROPS: readonly RoadPropSpec[] = [
  {
    key: "marketStandA",
    path: MODEL_PATHS.earth.marketStand01,
    t: 0.42,
    side: 1,
    out: PATH_WIDTH / 2 + 9.5,
    along: 2.0,
    fitHeight: 4.1,
    rotOffset: 0.1
  },
  {
    key: "marketStandB",
    path: MODEL_PATHS.earth.marketStand02,
    t: 0.43,
    side: -1,
    out: PATH_WIDTH / 2 + 9.0,
    along: -1.5,
    fitHeight: 4.1,
    rotOffset: -0.2
  },
  {
    key: "marketStandC",
    path: MODEL_PATHS.earth.marketStand02,
    t: 0.44,
    side: 1,
    out: PATH_WIDTH / 2 + 8.5,
    along: -2.0,
    fitHeight: 4.0,
    rotOffset: 0.35
  },
  { key: "well", path: MODEL_PATHS.earth.well, t: 0.435, side: -1, out: PATH_WIDTH / 2 + 6.0, along: 2.2, fitHeight: 3.1, rotOffset: 0.0 },
  { key: "cart", path: MODEL_PATHS.earth.cart, t: 0.46, side: 1, out: PATH_WIDTH / 2 + 7.0, along: 1.0, fitHeight: 3.8, rotOffset: 0.2 },
  {
    key: "firePit",
    path: MODEL_PATHS.earth.hqFirePit,
    t: 0.505,
    side: -1,
    out: PATH_WIDTH / 2 + 9.5,
    along: 4.0,
    fitHeight: 0.6,
    rotOffset: 0
  }
]

// Small realistic props dropped next to the road: barrels and crates around the market and stable,
// lanterns by doorways.
type RoadClusterSpec = {
  key: string
  path: string
  meshName?: string
  fitHeight: number
  anchors: ReadonlyArray<RoadAnchorSpec & { scale?: number }>
}

const ROAD_CLUSTERS: readonly RoadClusterSpec[] = [
  {
    key: "barrels",
    path: MODEL_PATHS.earth.hqBarrels,
    meshName: "wooden_barrels_01_barrel01",
    fitHeight: 1.4,
    anchors: [
      { t: 0.43, side: 1, out: PATH_WIDTH / 2 + 5.0, along: 5.0 },
      { t: 0.44, side: -1, out: PATH_WIDTH / 2 + 5.5, along: -4.0, scale: 0.95 },
      { t: 0.45, side: 1, out: PATH_WIDTH / 2 + 6.0, along: -5.5, scale: 0.9 },
      { t: 0.46, side: -1, out: PATH_WIDTH / 2 + 4.8, along: 3.0, scale: 0.92 },
      { t: 0.105, side: 1, out: PATH_WIDTH / 2 + 9.0, along: -3.0 },
      { t: 0.108, side: 1, out: PATH_WIDTH / 2 + 10.0, along: -1.4, scale: 0.9 },
      { t: 0.495, side: -1, out: PATH_WIDTH / 2 + 12.5, along: -1.0 },
      { t: 0.7, side: -1, out: PATH_WIDTH / 2 + 14, along: 6.0, scale: 0.95 }
    ]
  },
  {
    key: "crates",
    path: MODEL_PATHS.earth.hqCrate,
    meshName: "wooden_crate_01",
    fitHeight: 0.6,
    anchors: [
      { t: 0.42, side: -1, out: PATH_WIDTH / 2 + 4.2, along: 4.0 },
      { t: 0.44, side: 1, out: PATH_WIDTH / 2 + 4.5, along: 0.5, scale: 0.95 },
      { t: 0.45, side: -1, out: PATH_WIDTH / 2 + 4.0, along: -2.5, scale: 0.9 },
      { t: 0.112, side: 1, out: PATH_WIDTH / 2 + 8.2, along: -4.5 },
      { t: 0.5, side: -1, out: PATH_WIDTH / 2 + 13.5, along: 1.5 },
      { t: 0.815, side: 1, out: PATH_WIDTH / 2 + 12, along: 3.0, scale: 1.1 }
    ]
  },
  {
    key: "lanterns",
    path: MODEL_PATHS.earth.hqLantern,
    fitHeight: 0.9,
    anchors: [
      { t: 0.425, side: 1, out: PATH_WIDTH / 2 + 3.6, along: 0 },
      { t: 0.455, side: -1, out: PATH_WIDTH / 2 + 3.6, along: 0 },
      { t: 0.5, side: -1, out: PATH_WIDTH / 2 + 3.4, along: 0 },
      { t: 0.11, side: 1, out: PATH_WIDTH / 2 + 3.4, along: 0 },
      { t: 0.82, side: 1, out: PATH_WIDTH / 2 + 3.4, along: 0 },
      { t: 0.06, side: -1, out: PATH_WIDTH / 2 + 3.4, along: 0 }
    ]
  }
]

// Runs of fence pieces along the roadside, given as a t-range and a fixed offset from the road.
const FENCE_RUNS = [
  { tStart: 0.085, tEnd: 0.135, side: 1 as const, out: PATH_WIDTH / 2 + 6.5 },
  { tStart: 0.47, tEnd: 0.53, side: -1 as const, out: PATH_WIDTH / 2 + 7 },
  { tStart: 0.86, tEnd: 0.905, side: -1 as const, out: PATH_WIDTH / 2 + 7 }
] as const
const FENCE_FIT_HEIGHT = 1.3
const FENCE_PIECE_WIDTH = 3.1

// A stand of cypresses on the inner side of the road's first stretch.
const CYPRESS_ANCHORS: ReadonlyArray<RoadAnchorSpec & { scale: number }> = [
  { t: 0.11, side: 1, out: PATH_WIDTH / 2 + 26, along: -2.0, scale: 1.0 },
  { t: 0.16, side: 1, out: PATH_WIDTH / 2 + 30, along: 5.0, scale: 0.95 },
  { t: 0.2, side: 1, out: PATH_WIDTH / 2 + 28, along: 7.0, scale: 1.08 },
  { t: 0.24, side: 1, out: PATH_WIDTH / 2 + 34, along: 10.0, scale: 1.12 },
  { t: 0.15, side: -1, out: PATH_WIDTH / 2 + 22, along: 3.0, scale: 0.9 }
]

/** Market stands, the well, the cart and the fire pit beside the road, each with a footprint. */
export function placeRoadProps(ctx: LayoutContext, footprints: Footprint[]): Placement[] {
  return ROAD_PROPS.map((p) => {
    const anchor = roadAnchor(ctx, p.t, p.side, p.out, p.along)
    footprints.push({ x: anchor.x, z: anchor.z, radius: p.fitHeight * ROAD_PROP_FOOTPRINT_RATIO })
    return {
      key: p.key,
      path: p.path,
      position: [anchor.x, ctx.sampleGroundY(anchor.x, anchor.z) + ROAD_PROP_GROUND_OFFSET, anchor.z],
      rotation: [0, anchor.heading + p.side * (Math.PI / 2) + p.rotOffset, 0],
      fitHeight: p.fitHeight,
      scale: 1
    }
  })
}

/** Barrels, crates and lanterns as one instanced group per model, each anchor with a footprint. */
export function placeRoadClusters(ctx: LayoutContext, footprints: Footprint[]): InstancedGroup[] {
  return ROAD_CLUSTERS.map((cluster) => {
    const instances: InstanceTransform[] = cluster.anchors.map((a, i) => {
      const anchor = roadAnchor(ctx, a.t, a.side, a.out, a.along)
      footprints.push({ x: anchor.x, z: anchor.z, radius: cluster.fitHeight * CLUSTER_FOOTPRINT_RATIO })
      return {
        position: [anchor.x, ctx.sampleGroundY(anchor.x, anchor.z) + CLUSTER_GROUND_OFFSET, anchor.z] as Vec3Tuple,
        rotation: [0, seededRandom(a.t * PROP_YAW_SEED_SCALE + i * CLUSTER_YAW_SEED_STEP) * Math.PI * 2, 0] as Vec3Tuple,
        scale: a.scale ?? 1
      }
    })
    return {
      key: cluster.key,
      path: cluster.path,
      meshName: cluster.meshName,
      fitHeight: cluster.fitHeight,
      instances,
      castShadow: true,
      excludeFromReflection: true
    }
  })
}

/** Fence pieces laid end to end along each run, aligned with the road. */
export function placeFences(ctx: LayoutContext): InstancedGroup {
  const instances: InstanceTransform[] = []
  for (const run of FENCE_RUNS) {
    const length = ctx.routeCurve.getLength() * (run.tEnd - run.tStart)
    const pieces = Math.max(1, Math.floor(length / FENCE_PIECE_WIDTH))
    for (let i = 0; i <= pieces; i += 1) {
      const t = run.tStart + ((run.tEnd - run.tStart) * i) / pieces
      const anchor = roadAnchor(ctx, t, run.side, run.out, 0)
      instances.push({
        position: [anchor.x, ctx.sampleGroundY(anchor.x, anchor.z) + FENCE_GROUND_OFFSET, anchor.z],
        rotation: [0, anchor.heading, 0],
        scale: 1
      })
    }
  }
  return {
    key: "fences",
    path: MODEL_PATHS.earth.fence,
    fitHeight: FENCE_FIT_HEIGHT,
    instances,
    castShadow: true,
    excludeFromReflection: true
  }
}

/** The cypress stand, each tree with a fixed footprint. */
export function placeCypresses(ctx: LayoutContext, footprints: Footprint[]): InstancedGroup {
  return {
    key: "cypress",
    path: MODEL_PATHS.earth.cypressTree,
    fitHeight: CYPRESS_FIT_HEIGHT,
    castShadow: true,
    excludeFromReflection: true,
    instances: CYPRESS_ANCHORS.map((a) => {
      const anchor = roadAnchor(ctx, a.t, a.side, a.out, a.along)
      footprints.push({ x: anchor.x, z: anchor.z, radius: CYPRESS_FOOTPRINT_RADIUS })
      return {
        position: [anchor.x, ctx.sampleGroundY(anchor.x, anchor.z) + CYPRESS_GROUND_OFFSET, anchor.z] as Vec3Tuple,
        rotation: [0, seededRandom(a.t * PROP_YAW_SEED_SCALE + CYPRESS_YAW_SEED_OFFSET) * Math.PI * 2, 0] as Vec3Tuple,
        scale: a.scale
      }
    })
  }
}

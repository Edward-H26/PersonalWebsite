import { MODEL_PATHS } from "@/config/modelPaths"
import { type Footprint, scatterOnIsland } from "../islandGeometry"
import type { InstancedGroup, LayoutContext, Vec3Tuple } from "./types"

/** Scattered plants and rocks sink this far into the ground. */
const SCATTER_GROUND_OFFSET = -0.04

/** A model scattered over the island by seeded rejection sampling. */
export type ScatterSpec = {
  key: string
  path: string
  meshName?: string
  fitHeight: number
  count: number
  seed: number
  radius: number
  shoreMargin: number
  roadClearance?: number
  minScale?: number
  maxScale?: number
  castShadow: boolean
  /** Solid objects (trees, rocks) keep later scatters out of their footprint; grass does not. */
  addsFootprint?: boolean
}

const TREE_SCATTERS: readonly ScatterSpec[] = [
  {
    key: "islandTrees",
    path: MODEL_PATHS.earth.hqTree,
    fitHeight: 18,
    count: 6,
    seed: 11,
    radius: 4.5,
    shoreMargin: 10,
    roadClearance: 6,
    minScale: 0.85,
    maxScale: 1.25,
    castShadow: true,
    addsFootprint: true
  },
  {
    key: "broadTrees",
    path: MODEL_PATHS.earth.hqTreeLarge,
    fitHeight: 21,
    count: 2,
    seed: 23,
    radius: 5,
    shoreMargin: 12,
    roadClearance: 7,
    minScale: 0.9,
    maxScale: 1.15,
    castShadow: true,
    addsFootprint: true
  },
  {
    key: "smallTrees",
    path: MODEL_PATHS.earth.hqTreeSmall,
    fitHeight: 13,
    count: 3,
    seed: 37,
    radius: 3.5,
    shoreMargin: 8,
    roadClearance: 5,
    minScale: 0.85,
    maxScale: 1.2,
    castShadow: true,
    addsFootprint: true
  }
]

const GROUND_SCATTERS: readonly ScatterSpec[] = [
  {
    key: "bouldersLarge",
    path: MODEL_PATHS.earth.hqBoulder,
    fitHeight: 2.2,
    count: 3,
    seed: 41,
    radius: 3,
    shoreMargin: 4,
    roadClearance: 1.5,
    minScale: 0.8,
    maxScale: 1.2,
    castShadow: true,
    addsFootprint: true
  },
  {
    key: "bouldersFlat",
    path: MODEL_PATHS.earth.hqBoulder02,
    fitHeight: 1.3,
    count: 6,
    seed: 43,
    radius: 2.4,
    shoreMargin: 4,
    roadClearance: 1.2,
    minScale: 0.8,
    maxScale: 1.3,
    castShadow: true,
    addsFootprint: true
  },
  {
    key: "mossRocksA",
    path: MODEL_PATHS.earth.hqMossRocks,
    meshName: "rock_moss_set_01_rock03",
    fitHeight: 1.4,
    count: 5,
    seed: 47,
    radius: 2,
    shoreMargin: 4,
    roadClearance: 1,
    minScale: 0.8,
    maxScale: 1.3,
    castShadow: true,
    addsFootprint: true
  },
  {
    key: "mossRocksB",
    path: MODEL_PATHS.earth.hqMossRocks,
    meshName: "rock_moss_set_01_rock06",
    fitHeight: 1.4,
    count: 5,
    seed: 53,
    radius: 2,
    shoreMargin: 4,
    roadClearance: 1,
    minScale: 0.8,
    maxScale: 1.3,
    castShadow: true,
    addsFootprint: true
  },
  {
    key: "stumps",
    path: MODEL_PATHS.earth.hqTreeStump,
    fitHeight: 0.8,
    count: 6,
    seed: 59,
    radius: 1.4,
    shoreMargin: 5,
    roadClearance: 1,
    minScale: 0.9,
    maxScale: 1.4,
    castShadow: true,
    addsFootprint: true
  },
  {
    key: "ferns",
    path: MODEL_PATHS.earth.hqFern,
    meshName: "fern_02_b",
    fitHeight: 1.3,
    count: 30,
    seed: 61,
    radius: 1,
    shoreMargin: 4,
    roadClearance: 0.5,
    minScale: 0.8,
    maxScale: 1.5,
    castShadow: false
  }
]

export const GRASS_SCATTERS: readonly ScatterSpec[] = [
  {
    key: "grassClumpsC",
    path: MODEL_PATHS.earth.hqGrassMedium02,
    meshName: "grass_medium_02_c",
    fitHeight: 0.8,
    count: 200,
    seed: 79,
    radius: 0.5,
    shoreMargin: 3,
    roadClearance: 0.3,
    minScale: 0.8,
    maxScale: 1.4,
    castShadow: false
  },
  {
    key: "grassClumpsA",
    path: MODEL_PATHS.earth.hqGrassMedium02,
    meshName: "grass_medium_02_a",
    fitHeight: 0.65,
    count: 180,
    seed: 83,
    radius: 0.45,
    shoreMargin: 3,
    roadClearance: 0.3,
    minScale: 0.8,
    maxScale: 1.4,
    castShadow: false
  },
  {
    key: "grassTall",
    path: MODEL_PATHS.earth.hqGrassMedium01,
    meshName: "grass_medium_01_mid_a_LOD0",
    fitHeight: 0.75,
    count: 70,
    seed: 89,
    radius: 0.5,
    shoreMargin: 3,
    roadClearance: 0.4,
    minScale: 0.8,
    maxScale: 1.3,
    castShadow: false
  },
  {
    key: "grassSeedlings",
    path: MODEL_PATHS.earth.hqGrassBermuda,
    meshName: "grass_bermuda_01_seedling_a",
    fitHeight: 0.5,
    count: 120,
    seed: 71,
    radius: 0.35,
    shoreMargin: 3,
    roadClearance: 0.3,
    minScale: 0.8,
    maxScale: 1.4,
    castShadow: false
  }
]

const FLOWER_SCATTERS: readonly ScatterSpec[] = [
  {
    key: "dandelionsA",
    path: MODEL_PATHS.earth.hqDandelion,
    meshName: "dandelion_01_c_LOD0",
    fitHeight: 0.5,
    count: 70,
    seed: 97,
    radius: 0.3,
    shoreMargin: 3,
    roadClearance: 0.3,
    minScale: 0.9,
    maxScale: 1.5,
    castShadow: false
  },
  {
    key: "dandelionsB",
    path: MODEL_PATHS.earth.hqDandelion,
    meshName: "dandelion_01_e_LOD0",
    fitHeight: 0.42,
    count: 70,
    seed: 101,
    radius: 0.3,
    shoreMargin: 3,
    roadClearance: 0.3,
    minScale: 0.9,
    maxScale: 1.5,
    castShadow: false
  },
  {
    key: "gazaniasA",
    path: MODEL_PATHS.earth.hqGazania,
    meshName: "flower_gazania_c_LOD0",
    fitHeight: 0.6,
    count: 45,
    seed: 103,
    radius: 0.35,
    shoreMargin: 3,
    roadClearance: 0.3,
    minScale: 0.9,
    maxScale: 1.4,
    castShadow: false
  },
  {
    key: "gazaniasB",
    path: MODEL_PATHS.earth.hqGazania,
    meshName: "flower_gazania_d_LOD0",
    fitHeight: 0.6,
    count: 45,
    seed: 107,
    radius: 0.35,
    shoreMargin: 3,
    roadClearance: 0.3,
    minScale: 0.9,
    maxScale: 1.4,
    castShadow: false
  },
  {
    key: "sorrel",
    path: MODEL_PATHS.earth.hqSorrel,
    meshName: "shrub_sorrel_01_d",
    fitHeight: 0.3,
    count: 60,
    seed: 109,
    radius: 0.3,
    shoreMargin: 3,
    roadClearance: 0.3,
    minScale: 0.9,
    maxScale: 1.5,
    castShadow: false
  }
]

function scatterGroup(ctx: LayoutContext, footprints: Footprint[], spec: ScatterSpec): InstancedGroup {
  const points = scatterOnIsland(ctx.outline, ctx.roads, footprints, {
    count: spec.count,
    seed: spec.seed,
    radius: spec.radius,
    shoreMargin: spec.shoreMargin,
    roadClearance: spec.roadClearance,
    minScale: spec.minScale,
    maxScale: spec.maxScale
  })
  if (spec.addsFootprint) {
    for (const p of points) footprints.push({ x: p.x, z: p.z, radius: spec.radius * p.scale })
  }
  return {
    key: spec.key,
    path: spec.path,
    meshName: spec.meshName,
    fitHeight: spec.fitHeight,
    castShadow: spec.castShadow,
    excludeFromReflection: true,
    instances: points.map((p) => ({
      position: [p.x, ctx.sampleGroundY(p.x, p.z) + SCATTER_GROUND_OFFSET, p.z] as Vec3Tuple,
      rotation: [0, p.rotY, 0] as Vec3Tuple,
      scale: p.scale
    }))
  }
}

/**
 * Trees, then rocks and stumps, then grass, then flowers. The order matters: each scatter avoids
 * the footprints recorded by everything placed before it.
 */
export function placeVegetation(ctx: LayoutContext, footprints: Footprint[]): InstancedGroup[] {
  const groups: InstancedGroup[] = []
  for (const spec of TREE_SCATTERS) groups.push(scatterGroup(ctx, footprints, spec))
  for (const spec of GROUND_SCATTERS) groups.push(scatterGroup(ctx, footprints, spec))
  for (const spec of GRASS_SCATTERS) groups.push(scatterGroup(ctx, footprints, spec))
  for (const spec of FLOWER_SCATTERS) groups.push(scatterGroup(ctx, footprints, spec))
  return groups
}

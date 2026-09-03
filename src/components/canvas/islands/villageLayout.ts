import * as THREE from "three"
import { MODEL_PATHS } from "@/config/modelPaths"
import { seededRandom as rand, seededRandomSigned as randSigned } from "@/utils/math"
import {
  type Footprint,
  type IslandOutline,
  type RoadSample,
  clampOffsetToIsland,
  distanceInsideOutline,
  getTrackFrameAt,
  outlineRadiusToward,
  pushClearOfRoads,
  scatterOnIsland
} from "./islandGeometry"
import { PATH_WIDTH } from "./islandGeometry"

type Placement = {
  key: string
  path: string
  position: [number, number, number]
  rotation: [number, number, number]
  fitHeight?: number
  scale: number
  pivot?: "origin" | "center" | "center-bottom"
}

type InstanceTransform = { position: [number, number, number]; rotation: [number, number, number]; scale: number }

type InstancedGroup = {
  key: string
  path: string
  meshName?: string
  fitHeight: number
  instances: InstanceTransform[]
  castShadow: boolean
  excludeFromReflection: boolean
}

// Buildings anchored to the main road: t along the route, side (+1 inner / -1 outer), and offsets.
type RoadBuildingSpec = {
  key: string
  path: string
  t: number
  side: 1 | -1
  out: number
  along: number
  fitHeight: number
  rotOffset: number
  yOffset: number
}

export const ROAD_BUILDINGS: RoadBuildingSpec[] = [
  { key: "stable", path: MODEL_PATHS.earth.stable, t: 0.11, side: 1, out: PATH_WIDTH / 2 + 18, along: 4.0, fitHeight: 12.5, rotOffset: 0.12, yOffset: -0.22 },
  { key: "houseEntryA", path: MODEL_PATHS.earth.house02, t: 0.06, side: -1, out: PATH_WIDTH / 2 + 16, along: -2.0, fitHeight: 10.5, rotOffset: -0.05, yOffset: -0.22 },
  { key: "bellTower", path: MODEL_PATHS.earth.bellTower, t: 0.22, side: 1, out: PATH_WIDTH / 2 + 24, along: -1.0, fitHeight: 20, rotOffset: 0.08, yOffset: -0.3 },
  { key: "houseSouthA", path: MODEL_PATHS.earth.house03, t: 0.18, side: -1, out: PATH_WIDTH / 2 + 14, along: 4.5, fitHeight: 10.5, rotOffset: 0.1, yOffset: -0.22 },
  { key: "mill", path: MODEL_PATHS.earth.mill, t: 0.34, side: 1, out: PATH_WIDTH / 2 + 26, along: 3.5, fitHeight: 18, rotOffset: 0.22, yOffset: -0.3 },
  { key: "houseEastA", path: MODEL_PATHS.earth.house01, t: 0.3, side: -1, out: PATH_WIDTH / 2 + 16, along: -1.0, fitHeight: 11, rotOffset: -0.12, yOffset: -0.22 },
  { key: "inn", path: MODEL_PATHS.earth.fantasyInn, t: 0.5, side: -1, out: PATH_WIDTH / 2 + 22, along: -3.0, fitHeight: 16, rotOffset: -0.05, yOffset: -0.24 },
  { key: "barracks", path: MODEL_PATHS.earth.barracks, t: 0.58, side: 1, out: PATH_WIDTH / 2 + 26, along: 2.5, fitHeight: 15, rotOffset: 0.12, yOffset: -0.24 },
  { key: "houseNorthA", path: MODEL_PATHS.earth.house03, t: 0.54, side: -1, out: PATH_WIDTH / 2 + 16, along: 5.0, fitHeight: 11, rotOffset: 0.08, yOffset: -0.22 },
  { key: "sawmill", path: MODEL_PATHS.earth.sawmill, t: 0.7, side: -1, out: PATH_WIDTH / 2 + 26, along: 1.0, fitHeight: 14.5, rotOffset: -0.08, yOffset: -0.26 },
  { key: "blacksmith", path: MODEL_PATHS.earth.blacksmith, t: 0.82, side: 1, out: PATH_WIDTH / 2 + 22, along: -2.5, fitHeight: 12, rotOffset: 0.05, yOffset: -0.24 },
  { key: "houseWestA", path: MODEL_PATHS.earth.house02, t: 0.88, side: -1, out: PATH_WIDTH / 2 + 18, along: 2.0, fitHeight: 10.5, rotOffset: -0.1, yOffset: -0.22 }
]

// Extra homes in the interior, placed in local coordinates and turned to face the nearest road.
export const INTERIOR_BUILDINGS = [
  { key: "houseInnerA", path: MODEL_PATHS.earth.house01, x: 8, z: -10, fitHeight: 11, yOffset: -0.22 },
  { key: "houseInnerB", path: MODEL_PATHS.earth.house03, x: -14, z: -12, fitHeight: 10.5, yOffset: -0.22 },
  { key: "houseInnerC", path: MODEL_PATHS.earth.house02, x: -24, z: 18, fitHeight: 10.5, yOffset: -0.22 },
  { key: "houseInnerD", path: MODEL_PATHS.earth.house01, x: 16, z: 22, fitHeight: 11, yOffset: -0.22 }
]

type RoadPropSpec = { key: string; path: string; t: number; side: 1 | -1; out: number; along: number; fitHeight: number; rotOffset: number }

const ROAD_PROPS: RoadPropSpec[] = [
  { key: "marketStandA", path: MODEL_PATHS.earth.marketStand01, t: 0.42, side: 1, out: PATH_WIDTH / 2 + 9.5, along: 2.0, fitHeight: 4.1, rotOffset: 0.1 },
  { key: "marketStandB", path: MODEL_PATHS.earth.marketStand02, t: 0.43, side: -1, out: PATH_WIDTH / 2 + 9.0, along: -1.5, fitHeight: 4.1, rotOffset: -0.2 },
  { key: "marketStandC", path: MODEL_PATHS.earth.marketStand02, t: 0.44, side: 1, out: PATH_WIDTH / 2 + 8.5, along: -2.0, fitHeight: 4.0, rotOffset: 0.35 },
  { key: "well", path: MODEL_PATHS.earth.well, t: 0.435, side: -1, out: PATH_WIDTH / 2 + 6.0, along: 2.2, fitHeight: 3.1, rotOffset: 0.0 },
  { key: "cart", path: MODEL_PATHS.earth.cart, t: 0.46, side: 1, out: PATH_WIDTH / 2 + 7.0, along: 1.0, fitHeight: 3.8, rotOffset: 0.2 },
  { key: "firePit", path: MODEL_PATHS.earth.hqFirePit, t: 0.505, side: -1, out: PATH_WIDTH / 2 + 9.5, along: 4.0, fitHeight: 0.6, rotOffset: 0 }
]

// Small realistic props dropped next to the road: barrels and crates around the market and stable,
// lanterns by doorways.
type RoadClusterSpec = { key: string; path: string; meshName?: string; fitHeight: number; anchors: Array<{ t: number; side: 1 | -1; out: number; along: number; scale?: number }> }

const ROAD_CLUSTERS: RoadClusterSpec[] = [
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
]
const FENCE_FIT_HEIGHT = 1.3
const FENCE_PIECE_WIDTH = 3.1

// A harbor off the north-west coast, which faces the overview camera: a pier, a moored pinnace,
// and two lateral sea markers. Everything floats at sea level, below the cliff top.
const HARBOR_BEARING = Math.atan2(-1, -1)
const HARBOR = {
  pierOffset: 7,
  pierLength: 24,
  shipOffset: 34,
  shipSideways: 16,
  markerOffset: 26,
  markerSideways: 28,
  waterY: -0.4 / 1.6
}

type ScatterSpec = {
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
  addsFootprint?: boolean
}

const TREE_SCATTERS: ScatterSpec[] = [
  { key: "islandTrees", path: MODEL_PATHS.earth.hqTree, fitHeight: 18, count: 6, seed: 11, radius: 4.5, shoreMargin: 10, roadClearance: 6, minScale: 0.85, maxScale: 1.25, castShadow: true, addsFootprint: true },
  { key: "broadTrees", path: MODEL_PATHS.earth.hqTreeLarge, fitHeight: 21, count: 2, seed: 23, radius: 5, shoreMargin: 12, roadClearance: 7, minScale: 0.9, maxScale: 1.15, castShadow: true, addsFootprint: true },
  { key: "smallTrees", path: MODEL_PATHS.earth.hqTreeSmall, fitHeight: 13, count: 3, seed: 37, radius: 3.5, shoreMargin: 8, roadClearance: 5, minScale: 0.85, maxScale: 1.2, castShadow: true, addsFootprint: true }
]

const GROUND_SCATTERS: ScatterSpec[] = [
  { key: "bouldersLarge", path: MODEL_PATHS.earth.hqBoulder, fitHeight: 2.2, count: 3, seed: 41, radius: 3, shoreMargin: 4, roadClearance: 1.5, minScale: 0.8, maxScale: 1.2, castShadow: true, addsFootprint: true },
  { key: "bouldersFlat", path: MODEL_PATHS.earth.hqBoulder02, fitHeight: 1.3, count: 6, seed: 43, radius: 2.4, shoreMargin: 4, roadClearance: 1.2, minScale: 0.8, maxScale: 1.3, castShadow: true, addsFootprint: true },
  { key: "mossRocksA", path: MODEL_PATHS.earth.hqMossRocks, meshName: "rock_moss_set_01_rock03", fitHeight: 1.4, count: 5, seed: 47, radius: 2, shoreMargin: 4, roadClearance: 1, minScale: 0.8, maxScale: 1.3, castShadow: true, addsFootprint: true },
  { key: "mossRocksB", path: MODEL_PATHS.earth.hqMossRocks, meshName: "rock_moss_set_01_rock06", fitHeight: 1.4, count: 5, seed: 53, radius: 2, shoreMargin: 4, roadClearance: 1, minScale: 0.8, maxScale: 1.3, castShadow: true, addsFootprint: true },
  { key: "stumps", path: MODEL_PATHS.earth.hqTreeStump, fitHeight: 0.8, count: 6, seed: 59, radius: 1.4, shoreMargin: 5, roadClearance: 1, minScale: 0.9, maxScale: 1.4, castShadow: true, addsFootprint: true },
  { key: "ferns", path: MODEL_PATHS.earth.hqFern, meshName: "fern_02_b", fitHeight: 1.3, count: 30, seed: 61, radius: 1, shoreMargin: 4, roadClearance: 0.5, minScale: 0.8, maxScale: 1.5, castShadow: false }
]

export const GRASS_SCATTERS: ScatterSpec[] = [
  { key: "grassClumpsC", path: MODEL_PATHS.earth.hqGrassMedium02, meshName: "grass_medium_02_c", fitHeight: 0.8, count: 200, seed: 79, radius: 0.5, shoreMargin: 3, roadClearance: 0.3, minScale: 0.8, maxScale: 1.4, castShadow: false },
  { key: "grassClumpsA", path: MODEL_PATHS.earth.hqGrassMedium02, meshName: "grass_medium_02_a", fitHeight: 0.65, count: 180, seed: 83, radius: 0.45, shoreMargin: 3, roadClearance: 0.3, minScale: 0.8, maxScale: 1.4, castShadow: false },
  { key: "grassTall", path: MODEL_PATHS.earth.hqGrassMedium01, meshName: "grass_medium_01_mid_a_LOD0", fitHeight: 0.75, count: 70, seed: 89, radius: 0.5, shoreMargin: 3, roadClearance: 0.4, minScale: 0.8, maxScale: 1.3, castShadow: false },
  { key: "grassSeedlings", path: MODEL_PATHS.earth.hqGrassBermuda, meshName: "grass_bermuda_01_seedling_a", fitHeight: 0.5, count: 120, seed: 71, radius: 0.35, shoreMargin: 3, roadClearance: 0.3, minScale: 0.8, maxScale: 1.4, castShadow: false }
]

const FLOWER_SCATTERS: ScatterSpec[] = [
  { key: "dandelionsA", path: MODEL_PATHS.earth.hqDandelion, meshName: "dandelion_01_c_LOD0", fitHeight: 0.5, count: 70, seed: 97, radius: 0.3, shoreMargin: 3, roadClearance: 0.3, minScale: 0.9, maxScale: 1.5, castShadow: false },
  { key: "dandelionsB", path: MODEL_PATHS.earth.hqDandelion, meshName: "dandelion_01_e_LOD0", fitHeight: 0.42, count: 70, seed: 101, radius: 0.3, shoreMargin: 3, roadClearance: 0.3, minScale: 0.9, maxScale: 1.5, castShadow: false },
  { key: "gazaniasA", path: MODEL_PATHS.earth.hqGazania, meshName: "flower_gazania_c_LOD0", fitHeight: 0.6, count: 45, seed: 103, radius: 0.35, shoreMargin: 3, roadClearance: 0.3, minScale: 0.9, maxScale: 1.4, castShadow: false },
  { key: "gazaniasB", path: MODEL_PATHS.earth.hqGazania, meshName: "flower_gazania_d_LOD0", fitHeight: 0.6, count: 45, seed: 107, radius: 0.35, shoreMargin: 3, roadClearance: 0.3, minScale: 0.9, maxScale: 1.4, castShadow: false },
  { key: "sorrel", path: MODEL_PATHS.earth.hqSorrel, meshName: "shrub_sorrel_01_d", fitHeight: 0.3, count: 60, seed: 109, radius: 0.3, shoreMargin: 3, roadClearance: 0.3, minScale: 0.9, maxScale: 1.5, castShadow: false }
]

type LayoutContext = {
  routeCurve: THREE.CatmullRomCurve3
  outline: IslandOutline
  roads: ReadonlyArray<RoadSample>
  worldScale: number
  sampleGroundY: (x: number, z: number) => number
}

type VillageLayout = {
  buildings: Placement[]
  props: Placement[]
  harbor: Placement[]
  instanced: InstancedGroup[]
  footprints: Footprint[]
}

function isInsideOutline(outline: IslandOutline, x: number, z: number) {
  return distanceInsideOutline(outline, x, z) > 0
}

function roadAnchor(ctx: LayoutContext, t: number, side: number, out: number, along: number) {
  const point = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const perp = new THREE.Vector3()
  const sideVec = new THREE.Vector3()
  getTrackFrameAt(ctx.routeCurve, t, point, tangent, perp, sideVec, ctx.worldScale)
  const offsetX = tangent.x * along + perp.x * side * out
  const offsetZ = tangent.z * along + perp.z * side * out
  const clamped = clampOffsetToIsland(point.x, point.z, offsetX, offsetZ, (x, z) => isInsideOutline(ctx.outline, x, z))
  const heading = Math.atan2(tangent.x, tangent.z)
  return { x: clamped.x, z: clamped.z, heading, tangent, perp }
}

function nearestRoadDirection(x: number, z: number, roads: ReadonlyArray<RoadSample>) {
  let best = Number.POSITIVE_INFINITY
  let nearest = roads[0]
  for (const s of roads) {
    const d = Math.hypot(s.x - x, s.z - z)
    if (d < best) {
      best = d
      nearest = s
    }
  }
  return Math.atan2(nearest.x - x, nearest.z - z)
}

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
      position: [p.x, ctx.sampleGroundY(p.x, p.z) - 0.04, p.z] as [number, number, number],
      rotation: [0, p.rotY, 0] as [number, number, number],
      scale: p.scale
    }))
  }
}

export function buildVillageLayout(ctx: LayoutContext): VillageLayout {
  const footprints: Footprint[] = []
  const buildings: Placement[] = []
  const props: Placement[] = []

  for (const b of ROAD_BUILDINGS) {
    const anchor = roadAnchor(ctx, b.t, b.side, b.out, b.along)
    const radius = b.fitHeight * 0.45
    const clear = pushClearOfRoads(anchor.x, anchor.z, radius + 0.5, ctx.roads)
    footprints.push({ x: clear.x, z: clear.z, radius })
    buildings.push({
      key: b.key,
      path: b.path,
      position: [clear.x, ctx.sampleGroundY(clear.x, clear.z) + b.yOffset, clear.z],
      rotation: [0, anchor.heading + b.side * (Math.PI / 2) + b.rotOffset, 0],
      fitHeight: b.fitHeight,
      scale: 1
    })
  }

  for (const b of INTERIOR_BUILDINGS) {
    const radius = b.fitHeight * 0.45
    const clear = pushClearOfRoads(b.x, b.z, radius + 0.5, ctx.roads)
    footprints.push({ x: clear.x, z: clear.z, radius })
    buildings.push({
      key: b.key,
      path: b.path,
      position: [clear.x, ctx.sampleGroundY(clear.x, clear.z) + b.yOffset, clear.z],
      rotation: [0, nearestRoadDirection(clear.x, clear.z, ctx.roads), 0],
      fitHeight: b.fitHeight,
      scale: 1
    })
  }

  for (const p of ROAD_PROPS) {
    const anchor = roadAnchor(ctx, p.t, p.side, p.out, p.along)
    footprints.push({ x: anchor.x, z: anchor.z, radius: p.fitHeight * 0.6 })
    props.push({
      key: p.key,
      path: p.path,
      position: [anchor.x, ctx.sampleGroundY(anchor.x, anchor.z) - 0.12, anchor.z],
      rotation: [0, anchor.heading + p.side * (Math.PI / 2) + p.rotOffset, 0],
      fitHeight: p.fitHeight,
      scale: 1
    })
  }

  const instanced: InstancedGroup[] = []

  for (const cluster of ROAD_CLUSTERS) {
    const instances: InstanceTransform[] = cluster.anchors.map((a, i) => {
      const anchor = roadAnchor(ctx, a.t, a.side, a.out, a.along)
      footprints.push({ x: anchor.x, z: anchor.z, radius: cluster.fitHeight * 0.8 })
      return {
        position: [anchor.x, ctx.sampleGroundY(anchor.x, anchor.z) - 0.06, anchor.z] as [number, number, number],
        rotation: [0, rand(a.t * 100.7 + i * 2.1) * Math.PI * 2, 0] as [number, number, number],
        scale: a.scale ?? 1
      }
    })
    instanced.push({ key: cluster.key, path: cluster.path, meshName: cluster.meshName, fitHeight: cluster.fitHeight, instances, castShadow: true, excludeFromReflection: true })
  }

  const fenceInstances: InstanceTransform[] = []
  for (const run of FENCE_RUNS) {
    const length = ctx.routeCurve.getLength() * (run.tEnd - run.tStart)
    const pieces = Math.max(1, Math.floor(length / FENCE_PIECE_WIDTH))
    for (let i = 0; i <= pieces; i += 1) {
      const t = run.tStart + ((run.tEnd - run.tStart) * i) / pieces
      const anchor = roadAnchor(ctx, t, run.side, run.out, 0)
      fenceInstances.push({
        position: [anchor.x, ctx.sampleGroundY(anchor.x, anchor.z) - 0.08, anchor.z],
        rotation: [0, anchor.heading, 0],
        scale: 1
      })
    }
  }
  instanced.push({ key: "fences", path: MODEL_PATHS.earth.fence, fitHeight: FENCE_FIT_HEIGHT, instances: fenceInstances, castShadow: true, excludeFromReflection: true })

  const cypressAnchors = [
    { t: 0.11, side: 1, out: PATH_WIDTH / 2 + 26, along: -2.0, scale: 1.0 },
    { t: 0.16, side: 1, out: PATH_WIDTH / 2 + 30, along: 5.0, scale: 0.95 },
    { t: 0.2, side: 1, out: PATH_WIDTH / 2 + 28, along: 7.0, scale: 1.08 },
    { t: 0.24, side: 1, out: PATH_WIDTH / 2 + 34, along: 10.0, scale: 1.12 },
    { t: 0.15, side: -1, out: PATH_WIDTH / 2 + 22, along: 3.0, scale: 0.9 }
  ]
  instanced.push({
    key: "cypress",
    path: MODEL_PATHS.earth.cypressTree,
    fitHeight: 20,
    castShadow: true,
    excludeFromReflection: true,
    instances: cypressAnchors.map((a) => {
      const anchor = roadAnchor(ctx, a.t, a.side, a.out, a.along)
      footprints.push({ x: anchor.x, z: anchor.z, radius: 2.5 })
      return {
        position: [anchor.x, ctx.sampleGroundY(anchor.x, anchor.z) - 0.18, anchor.z] as [number, number, number],
        rotation: [0, rand(a.t * 100.7 + 1.2) * Math.PI * 2, 0] as [number, number, number],
        scale: a.scale
      }
    })
  })

  for (const spec of TREE_SCATTERS) instanced.push(scatterGroup(ctx, footprints, spec))
  for (const spec of GROUND_SCATTERS) instanced.push(scatterGroup(ctx, footprints, spec))
  for (const spec of GRASS_SCATTERS) instanced.push(scatterGroup(ctx, footprints, spec))
  for (const spec of FLOWER_SCATTERS) instanced.push(scatterGroup(ctx, footprints, spec))

  const harbor = buildHarbor(ctx)
  instanced.push(harbor.markers)

  return { buildings, props, harbor: harbor.placements, instanced, footprints }
}

function buildHarbor(ctx: LayoutContext) {
  const dirX = Math.cos(HARBOR_BEARING)
  const dirZ = Math.sin(HARBOR_BEARING)
  const sideX = -dirZ
  const sideZ = dirX
  const shore = outlineRadiusToward(ctx.outline, ctx.outline.centerX + dirX, ctx.outline.centerZ + dirZ)
  const at = (offset: number, sideways: number): [number, number] => [
    ctx.outline.centerX + dirX * (shore + offset) + sideX * sideways,
    ctx.outline.centerZ + dirZ * (shore + offset) + sideZ * sideways
  ]
  const outward = Math.atan2(dirX, dirZ)

  const [pierX, pierZ] = at(HARBOR.pierOffset + HARBOR.pierLength / 2, 0)
  const [shipX, shipZ] = at(HARBOR.shipOffset, HARBOR.shipSideways)
  const placements: Placement[] = [
    { key: "pier", path: MODEL_PATHS.earth.hqPier, position: [pierX, HARBOR.waterY - 3, pierZ], rotation: [0, outward, 0], scale: 1.3, pivot: "center-bottom" },
    { key: "ship", path: MODEL_PATHS.earth.hqShip, position: [shipX, HARBOR.waterY - 2.6, shipZ], rotation: [0, outward + Math.PI / 2 + 0.25, 0], scale: 0.9, pivot: "center-bottom" }
  ]

  const markers: InstancedGroup = {
    key: "seaMarkers",
    path: MODEL_PATHS.earth.hqSeaMarker,
    fitHeight: 6,
    castShadow: false,
    excludeFromReflection: false,
    instances: [-1, 1].map((s) => {
      const [x, z] = at(HARBOR.markerOffset, HARBOR.markerSideways * s)
      return { position: [x, HARBOR.waterY - 1.2, z] as [number, number, number], rotation: [0, randSigned(s) * 0.3, 0] as [number, number, number], scale: 1 }
    })
  }

  return { placements, markers }
}

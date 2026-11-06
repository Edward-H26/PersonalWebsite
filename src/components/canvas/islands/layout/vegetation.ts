import { MODEL_PATHS } from "@/config/modelPaths"
import { islandFitHeight, islandSize } from "@/config/modelSizes"
import { seededRandom, smoothstep } from "@/utils/math"
import { DistanceField } from "../terrain/distanceField"
import { type MapPoint, distanceToSegment, mapToScene, sceneToMap } from "../terrain/terrainData"
import type { InstanceTransform, InstancedGroup, Vec3Tuple } from "../village/types"
import { type LayoutContext, ROAD_HALF_WIDTH_PX } from "./context"
import { type FieldOutline, fieldArea, insideField } from "./fields"
import { FootprintIndex, type ScatterArea, type ScatterOptions, scatterInArea } from "./placement"

/** Grass and flowers grow fully within DENSE_FULL_M of a road or the village and thin out to none at DENSE_REACH_M. */
export const DENSE_FULL_M = 12
export const DENSE_REACH_M = 40
/** Cell side of the distance field that density reads, in map pixels: fine enough for a 28 m fade. */
const DENSITY_CELL_PX = 4
/** Grass and flowers grow only where the ground is painted at least this much grass. */
const PLANT_GRASS_COVER = 0.75
/**
 * Trees stand where the ground is grass and no rock is painted within TREE_ROCK_CLEAR_PX, so none crowns
 * a cliff or a crag; spruce, the ridge's own tree, may stand closer, among the boulders at its foot.
 */
const TREE_GRASS_COVER = 0.85
const TREE_ROCK_CLEAR_PX = 10
const SPRUCE_ROCK_CLEAR_PX = 5
/** Boulders gather at the foot of bare rock: on grass, with rock painted at least CRAG_ROCK within CRAG_FOOT_PX. */
const CRAG_FOOT_PX = 12
const CRAG_ROCK = 0.3
/** Stumps lie within STUMP_REACH_PX of a copse's edge and half the ferns within FERN_REACH_PX; the other ferns line the stream's banks, from the bed's edge out to STREAM_BANK_PX[1]. */
const STUMP_REACH_PX = 14
const FERN_REACH_PX = 6
const STREAM_BANK_PX = [5, 14] as const
/** Scattered plants and rocks sink this far into the ground. */
const SCATTER_SINK = 0.04
/** An apple tree's trunk keeps this far from a road's centreline, in map pixels, two past the gravel's edge; its ground claim, in world units. */
const ORCHARD_ROAD_CLEAR_PX = ROAD_HALF_WIDTH_PX + 2
const ORCHARD_TRUNK_RADIUS = 2
/** Every daisy grows within this distance of another flower, in world units, so daisies join the flower patches. */
export const DAISY_REACH = 1.2

type Species = "oak" | "ash" | "birch"

const SPECIES: Record<Species, { key: string; path: string }> = {
  oak: { key: "oaks", path: MODEL_PATHS.earth.islandTree01 },
  ash: { key: "ashes", path: MODEL_PATHS.earth.islandTree02 },
  birch: { key: "birches", path: MODEL_PATHS.earth.birch }
}

/**
 * The copses of the north meadow (DESIGN.md section 17), in map pixels: oak, ash and birch in
 * patches either side of the ring's north stretch, one by the sawmill, some near enough to the roads to
 * be walked past, and none on the standing stones' hummock. `spacing` is how far apart, in world units,
 * the trees of a copse stand.
 */
export const MEADOW_COPSES: ReadonlyArray<{
  centre: MapPoint
  radiusPx: number
  count: number
  spacing: number
  mix: Partial<Record<Species, number>>
}> = [
  { centre: [300, 160], radiusPx: 32, count: 7, spacing: 9, mix: { oak: 0.7, ash: 0.3 } },
  { centre: [420, 230], radiusPx: 36, count: 8, spacing: 9, mix: { ash: 0.6, oak: 0.4 } },
  { centre: [530, 150], radiusPx: 30, count: 7, spacing: 6.5, mix: { birch: 0.7, ash: 0.3 } },
  { centre: [230, 250], radiusPx: 28, count: 6, spacing: 9, mix: { oak: 0.8, birch: 0.2 } },
  { centre: [590, 240], radiusPx: 24, count: 5, spacing: 6.5, mix: { birch: 0.8, oak: 0.2 } },
  { centre: [385, 315], radiusPx: 26, count: 6, spacing: 9, mix: { oak: 0.5, ash: 0.5 } },
  { centre: [500, 320], radiusPx: 26, count: 6, spacing: 7.5, mix: { birch: 0.5, oak: 0.5 } }
]

/** Spruce keep to the ridge's flanks: within RIDGE_REACH_PX of its line, above RIDGE_MIN_H of the peak, off the castle knoll. */
const RIDGE: readonly [MapPoint, MapPoint] = [
  [655, 262],
  [745, 200]
]
const RIDGE_REACH_PX = 110
const RIDGE_MIN_H = 0.28
const KNOLL_CLEAR_PX = 60
const SPRUCE_COUNT = 22

/** How a scatter is drawn, and whether its copies claim their ground: solid things (trees, rocks, stumps) keep later scatters out; plants do not. */
type Sowing = ScatterOptions & { claims?: boolean }

/** A model scattered by seeded rejection sampling, at its real size times a random scale; `radius` is its footprint in world units. */
type ScatterSpec = Sowing & { key: string; path: string; minScale: number; maxScale: number; castShadow: boolean }

const ROCKS: readonly ScatterSpec[] = [
  {
    key: "bouldersLarge",
    path: MODEL_PATHS.earth.boulder01,
    count: 12,
    seed: 41,
    radius: 1.7,
    minScale: 0.8,
    maxScale: 1.25,
    castShadow: true,
    claims: true
  },
  {
    key: "bouldersFlat",
    path: MODEL_PATHS.earth.boulder02,
    count: 16,
    seed: 43,
    radius: 1.8,
    minScale: 0.8,
    maxScale: 1.3,
    castShadow: true,
    claims: true
  },
  {
    key: "mossRocksA",
    path: MODEL_PATHS.earth.mossRocks,
    count: 16,
    seed: 47,
    radius: 1.9,
    minScale: 0.8,
    maxScale: 1.3,
    castShadow: true,
    claims: true
  },
  {
    key: "mossRocksB",
    path: MODEL_PATHS.earth.mossRocksB,
    count: 16,
    seed: 53,
    radius: 2.2,
    minScale: 0.8,
    maxScale: 1.3,
    castShadow: true,
    claims: true
  }
]

const GRASS: readonly ScatterSpec[] = [
  {
    key: "grassClumpsC",
    path: MODEL_PATHS.earth.grassMedium02,
    count: 2000,
    seed: 79,
    radius: 0.5,
    minScale: 0.8,
    maxScale: 1.4,
    castShadow: false
  },
  {
    key: "grassClumpsA",
    path: MODEL_PATHS.earth.grassMedium02B,
    count: 1800,
    seed: 83,
    radius: 0.5,
    minScale: 0.8,
    maxScale: 1.4,
    castShadow: false
  },
  {
    key: "grassTall",
    path: MODEL_PATHS.earth.grassMedium01,
    count: 800,
    seed: 89,
    radius: 0.5,
    minScale: 0.8,
    maxScale: 1.3,
    castShadow: false
  },
  {
    key: "grassSeedlings",
    path: MODEL_PATHS.earth.grassBermuda,
    count: 1400,
    seed: 71,
    radius: 0.3,
    minScale: 0.8,
    maxScale: 1.4,
    castShadow: false
  }
]

const FLOWERS: readonly ScatterSpec[] = [
  {
    key: "dandelionsA",
    path: MODEL_PATHS.earth.dandelion,
    count: 220,
    seed: 97,
    radius: 0.3,
    minScale: 0.9,
    maxScale: 1.5,
    castShadow: false
  },
  {
    key: "dandelionsB",
    path: MODEL_PATHS.earth.dandelionB,
    count: 220,
    seed: 101,
    radius: 0.3,
    minScale: 0.9,
    maxScale: 1.5,
    castShadow: false
  },
  {
    key: "gazaniasA",
    path: MODEL_PATHS.earth.gazania,
    count: 150,
    seed: 103,
    radius: 0.3,
    minScale: 0.9,
    maxScale: 1.4,
    castShadow: false
  },
  {
    key: "gazaniasB",
    path: MODEL_PATHS.earth.gazaniaB,
    count: 150,
    seed: 107,
    radius: 0.3,
    minScale: 0.9,
    maxScale: 1.4,
    castShadow: false
  },
  {
    key: "cornflowers",
    path: MODEL_PATHS.earth.cornflower,
    count: 250,
    seed: 113,
    radius: 0.3,
    minScale: 0.9,
    maxScale: 1.4,
    castShadow: false
  },
  { key: "sorrel", path: MODEL_PATHS.earth.sorrel, count: 200, seed: 109, radius: 0.3, minScale: 0.9, maxScale: 1.5, castShadow: false }
]

// Few candidates land within reach of a flower, so the daisies draw more of them.
const DAISIES: ScatterSpec = {
  key: "daisies",
  path: MODEL_PATHS.earth.daisy,
  count: 320,
  seed: 127,
  radius: 0.4,
  minScale: 0.85,
  maxScale: 1.25,
  castShadow: false,
  attemptsPerInstance: 150
}
const POPPIES: ScatterSpec = {
  key: "poppies",
  path: MODEL_PATHS.earth.poppy,
  count: 240,
  seed: 131,
  radius: 0.4,
  minScale: 0.85,
  maxScale: 1.25,
  castShadow: false
}
const FERNS: ScatterSpec = {
  key: "ferns",
  path: MODEL_PATHS.earth.fern,
  count: 110,
  seed: 61,
  radius: 1,
  minScale: 0.8,
  maxScale: 1.5,
  castShadow: false
}
const STUMPS: ScatterSpec = {
  key: "stumps",
  path: MODEL_PATHS.earth.treeStump,
  count: 14,
  seed: 59,
  radius: 1.7,
  minScale: 0.9,
  maxScale: 1.4,
  castShadow: true,
  claims: true
}
const CRAG_ROCKS: ScatterSpec = {
  key: "cragBoulders",
  path: MODEL_PATHS.earth.boulder01,
  count: 14,
  seed: 67,
  radius: 1.7,
  minScale: 1,
  maxScale: 1.6,
  castShadow: true,
  claims: true
}

function group(spec: Pick<ScatterSpec, "key" | "path" | "castShadow">, instances: InstanceTransform[]): InstancedGroup {
  return {
    key: spec.key,
    path: spec.path,
    fitHeight: islandFitHeight(spec.path),
    castShadow: spec.castShadow,
    excludeFromReflection: true,
    instances
  }
}

/** Half a model's width in map pixels: how far its crown reaches from its trunk. */
function crownRadiusPx(ctx: LayoutContext, path: string) {
  return islandSize(path).width / 2 / ctx.site.terrain.data.map.unitsPerPx
}

/** The first species whose running share of the mix passes `draw`, a number from 0 to 1. */
function pickSpecies(mix: Partial<Record<Species, number>>, draw: number): Species {
  let total = 0
  for (const [species, share] of Object.entries(mix) as Array<[Species, number]>) {
    total += share
    if (draw < total) return species
  }
  return Object.keys(mix)[0] as Species
}

/** The vegetation's view of the island: its terrain in map pixels, its bounds in world units and the density near the roads. */
class Ground {
  readonly bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  private readonly nearRoads: DistanceField

  constructor(
    private readonly ctx: LayoutContext,
    villageSeeds: readonly MapPoint[]
  ) {
    const { map, coast, roads } = ctx.site.terrain.data
    const outline = coast.outline.map(([x, y]) => mapToScene(map, x, y))
    this.bounds = {
      minX: Math.min(...outline.map((p) => p[0])),
      maxX: Math.max(...outline.map((p) => p[0])),
      minZ: Math.min(...outline.map((p) => p[2])),
      maxZ: Math.max(...outline.map((p) => p[2]))
    }
    const roadRows = [roads.ring, ...Object.values(roads.spurs)].flatMap((road) => road.points.map(([x, y]): MapPoint => [x, y]))
    this.nearRoads = new DistanceField({ origin: [0, 0], size: map.sizePx }, DENSITY_CELL_PX, [...roadRows, ...villageSeeds])
  }

  toMap(x: number, z: number) {
    return sceneToMap(this.ctx.site.terrain.data.map, x, z)
  }

  /** How densely grass and flowers grow at a world x/z: 1 near the roads and the village, falling to 0 at DENSE_REACH_M. */
  readonly density = (x: number, z: number) => {
    const { metresPerPx } = this.ctx.site.terrain.data.map
    const [px, py] = this.toMap(x, z)
    return 1 - smoothstep(DENSE_FULL_M / metresPerPx, DENSE_REACH_M / metresPerPx, this.nearRoads.sample(px, py))
  }

  /** Whether grass and flowers grow at a world x/z. */
  readonly grassy = (x: number, z: number) => {
    const [px, py] = this.toMap(x, z)
    return this.ctx.site.cover(px, py).grass >= PLANT_GRASS_COVER
  }

  /** Whether a tree whose crown reaches `crownPx` stands well at a world x/z: on grass, `rockClearPx` off rock, its crown clear of the roads. */
  treeGround(x: number, z: number, crownPx: number, rockClearPx = TREE_ROCK_CLEAR_PX) {
    const [px, py] = this.toMap(x, z)
    const { site } = this.ctx
    const roadClear = crownPx + ROAD_HALF_WIDTH_PX
    return (
      site.cover(px, py).grass >= TREE_GRASS_COVER &&
      site.roadDistance(px, py, roadClear + 1) > roadClear &&
      site.rockWithin(px, py, rockClearPx) < 0.05
    )
  }

  /** The box round a set of map points, widened by `marginPx`, in world units. */
  around(points: readonly MapPoint[], marginPx: number) {
    const { map } = this.ctx.site.terrain.data
    const scene = points.map(([x, y]) => mapToScene(map, x, y))
    const margin = marginPx * map.unitsPerPx
    return {
      minX: Math.min(...scene.map((p) => p[0])) - margin,
      maxX: Math.max(...scene.map((p) => p[0])) + margin,
      minZ: Math.min(...scene.map((p) => p[2])) - margin,
      maxZ: Math.max(...scene.map((p) => p[2])) + margin
    }
  }

  /** The whole island, at the density near the roads and the village. */
  dense(accept: (x: number, z: number) => boolean = this.grassy): ScatterArea {
    return { ...this.bounds, density: this.density, accept }
  }

  /** A disc round a map point, densest at its middle. */
  disc(centre: MapPoint, radiusPx: number, accept: (x: number, z: number) => boolean): ScatterArea {
    const { map } = this.ctx.site.terrain.data
    const [cx, , cz] = mapToScene(map, centre[0], centre[1])
    const radius = radiusPx * map.unitsPerPx
    return {
      minX: cx - radius,
      maxX: cx + radius,
      minZ: cz - radius,
      maxZ: cz + radius,
      density: (x, z) => 1 - smoothstep(radius * 0.5, radius, Math.hypot(x - cx, z - cz)),
      accept
    }
  }

  /** Copies sown over an area, standing on the ground. */
  place(sowing: Sowing, area: ScatterArea) {
    const points = scatterInArea(area, this.ctx.footprints, sowing)
    if (sowing.claims) for (const p of points) this.ctx.footprints.add({ x: p.x, z: p.z, radius: sowing.radius * p.scale })
    return points.map((p): InstanceTransform => ({
      position: [p.x, this.ctx.sampleGroundY(p.x, p.z) - SCATTER_SINK, p.z] as Vec3Tuple,
      rotation: [0, p.rotY, 0] as Vec3Tuple,
      scale: p.scale
    }))
  }
}

/**
 * The orchard's apple trees at their places in the terrace's rows, each turned and sized a little
 * differently. A place whose trunk would stand on a road's gravel is left empty.
 */
function placeOrchard(ctx: LayoutContext): InstancedGroup {
  const { map, layout } = ctx.site.terrain.data
  const path = MODEL_PATHS.earth.treeSmall
  const instances = layout.orchard.flatMap(([px, py], i): InstanceTransform[] => {
    if (ctx.site.roadDistance(px, py, ORCHARD_ROAD_CLEAR_PX) < ORCHARD_ROAD_CLEAR_PX) return []
    const [x, , z] = mapToScene(map, px, py)
    ctx.footprints.add({ x, z, radius: ORCHARD_TRUNK_RADIUS })
    return [
      {
        position: [x, ctx.sampleGroundY(x, z) - SCATTER_SINK, z],
        rotation: [0, seededRandom(i * 3.1 + 0.4) * Math.PI * 2, 0],
        scale: 0.9 + 0.2 * seededRandom(i * 1.7 + 0.9)
      }
    ]
  })
  return group({ key: "appleTrees", path, castShadow: true }, instances)
}

/** The copses of the north meadow, each tree's species drawn from its copse's mix, gathered into one group per species. */
function placeCopses(ctx: LayoutContext, ground: Ground): InstancedGroup[] {
  const bySpecies = new Map<Species, InstanceTransform[]>()
  MEADOW_COPSES.forEach((copse, c) => {
    const crownPx = Math.max(...Object.keys(copse.mix).map((species) => crownRadiusPx(ctx, SPECIES[species as Species].path)))
    const area = ground.disc(copse.centre, copse.radiusPx, (x, z) => ground.treeGround(x, z, crownPx))
    const sowing: Sowing = {
      count: copse.count,
      seed: 301 + c * 37,
      radius: copse.spacing / 2,
      minScale: 0.85,
      maxScale: 1.2,
      claims: true
    }
    ground.place(sowing, area).forEach((instance, i) => {
      const species = pickSpecies(copse.mix, seededRandom(sowing.seed + i * 4.1))
      const copies = bySpecies.get(species) ?? []
      copies.push(instance)
      bySpecies.set(species, copies)
    })
  })
  return [...bySpecies].map(([species, instances]) => group({ ...SPECIES[species], castShadow: true }, instances))
}

/** Spruce on the ridge's flanks below its bare crest, kept off the castle knoll. */
function placeRidgeSpruce(ctx: LayoutContext, ground: Ground): InstancedGroup {
  const [a, b] = RIDGE
  const knoll = ctx.site.terrain.data.landmarks.castle_keep.at
  const crownPx = crownRadiusPx(ctx, MODEL_PATHS.earth.spruce)
  const accept = (x: number, z: number) => {
    const [px, py] = ground.toMap(x, z)
    if (distanceToSegment(px, py, a, b) > RIDGE_REACH_PX) return false
    if (Math.hypot(px - knoll[0], py - knoll[1]) < KNOLL_CLEAR_PX) return false
    return ctx.site.h(px, py) > RIDGE_MIN_H && ground.treeGround(x, z, crownPx, SPRUCE_ROCK_CLEAR_PX)
  }
  const spec: ScatterSpec = {
    key: "spruces",
    path: MODEL_PATHS.earth.spruce,
    count: SPRUCE_COUNT,
    seed: 151,
    radius: 3.5,
    minScale: 0.85,
    maxScale: 1.2,
    castShadow: true,
    claims: true
  }
  return group(spec, ground.place(spec, { ...ground.around(RIDGE, RIDGE_REACH_PX), accept }))
}

/**
 * Trees (the orchard, the meadow copses, spruce on the ridge), rocks near the roads and at the foot of
 * the crags, stumps and ferns about the copses and ferns along the stream, then grass and flowers near
 * the roads and the village, poppies in the fields and daisies among the other flowers. The order
 * matters: each scatter keeps out of the ground claimed by everything placed before it.
 */
export function placeVegetation(ctx: LayoutContext, villageSeeds: readonly MapPoint[], fields: readonly FieldOutline[]): InstancedGroup[] {
  const ground = new Ground(ctx, villageSeeds)
  const trees = [placeOrchard(ctx), ...placeCopses(ctx, ground), placeRidgeSpruce(ctx, ground)]

  const atCragFoot = (x: number, z: number) => {
    const [px, py] = ground.toMap(x, z)
    return ctx.site.cover(px, py).grass >= TREE_GRASS_COVER && ctx.site.rockWithin(px, py, CRAG_FOOT_PX) > CRAG_ROCK
  }
  const nearCopse = (reachPx: number) => (x: number, z: number) => {
    const [px, py] = ground.toMap(x, z)
    return (
      MEADOW_COPSES.some(({ centre, radiusPx }) => Math.hypot(px - centre[0], py - centre[1]) < radiusPx + reachPx) && ground.grassy(x, z)
    )
  }
  const stream = ctx.site.terrain.data.stream.points.map(([x, y]): MapPoint => [x, y])
  const streamBank = (x: number, z: number) => {
    const [px, py] = ground.toMap(x, z)
    const distance = ctx.site.streamDistance(px, py, STREAM_BANK_PX[1] + 1)
    return distance > STREAM_BANK_PX[0] && distance < STREAM_BANK_PX[1] && ground.grassy(x, z)
  }
  const rocks = [
    ...ROCKS.map((spec) => group(spec, ground.place(spec, ground.dense()))),
    group(CRAG_ROCKS, ground.place(CRAG_ROCKS, { ...ground.bounds, accept: atCragFoot }))
  ]
  const stumps = group(STUMPS, ground.place(STUMPS, { ...ground.bounds, accept: nearCopse(STUMP_REACH_PX) }))
  const ferns = group(FERNS, [
    ...ground.place({ ...FERNS, count: FERNS.count / 2 }, { ...ground.bounds, accept: nearCopse(FERN_REACH_PX) }),
    ...ground.place(
      { ...FERNS, count: FERNS.count / 2, seed: FERNS.seed + 7 },
      { ...ground.around(stream, STREAM_BANK_PX[1]), accept: streamBank }
    )
  ])

  const grass = GRASS.map((spec) => group(spec, ground.place(spec, ground.dense())))
  const flowers = FLOWERS.map((spec) => group(spec, ground.place(spec, ground.dense())))
  // Each field takes its share of the poppies by its area, drawn from the field's own box.
  const fieldsArea = fields.reduce((sum, outline) => sum + fieldArea(outline), 0)
  const poppies = group(
    POPPIES,
    fields.flatMap((outline, i) => {
      const box = {
        minX: Math.min(...outline.map((p) => p[0])),
        maxX: Math.max(...outline.map((p) => p[0])),
        minZ: Math.min(...outline.map((p) => p[1])),
        maxZ: Math.max(...outline.map((p) => p[1]))
      }
      const count = Math.round((POPPIES.count * fieldArea(outline)) / fieldsArea)
      const accept = (x: number, z: number) => insideField(outline, x, z) && ground.grassy(x, z)
      return ground.place({ ...POPPIES, count, seed: POPPIES.seed + i * 17 }, { ...box, accept })
    })
  )

  // A daisy grows only where it would touch another flower's ring of DAISY_REACH.
  const flowerRings = new FootprintIndex()
  for (const flower of [...flowers, poppies]) {
    for (const { position } of flower.instances) flowerRings.add({ x: position[0], z: position[2], radius: DAISY_REACH })
  }
  const nearFlowers = (x: number, z: number) => flowerRings.overlaps(x, z, 0) && ground.grassy(x, z)
  const daisies = group(DAISIES, ground.place(DAISIES, ground.dense(nearFlowers)))

  return [...trees, ...rocks, stumps, ferns, ...grass, ...flowers, poppies, daisies]
}

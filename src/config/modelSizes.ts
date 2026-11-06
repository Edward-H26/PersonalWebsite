import { islandModel } from "./modelPaths"

/**
 * Island units per metre for every model blender/island generates, chosen by eye for how full the
 * village reads on the island. Drawing every model at the same scale keeps every door 2.1 m and
 * every tree as tall as it was built, beside the houses.
 */
export const ISLAND_UNITS_PER_METRE = 1.3

/**
 * Width (Blender x), depth (Blender y, the model's front-to-back) and height in metres of every
 * generated model, as blender/island/build/stats.json records them; modelSizes.test.ts keeps the
 * two in step when a model is rebuilt.
 */
export const ISLAND_MODEL_SIZES_M = {
  arbour: [1.594, 0.969, 2.584],
  barracks: [9.537, 11.492, 10.575],
  barrels: [4.318, 3.13, 0.913],
  bell_tower: [5.904, 7.096, 15.407],
  birch: [5.968, 7.425, 10.513],
  birch_b: [5.919, 6.631, 8.432],
  blacksmith: [8.986, 8.212, 7.526],
  boulder_01: [1.265, 1.823, 0.996],
  boulder_02: [2.434, 1.184, 0.847],
  breakwater: [60.247, 34.894, 19.138],
  bunting: [8.012, 0.082, 1.037],
  cart: [1.2, 2.232, 1.911],
  castle_keep: [30.915, 26.344, 34.827],
  castle_stair: [7.147, 8.32, 6.817],
  cornflower: [0.66, 0.429, 0.563],
  crate: [0.948, 0.41, 0.373],
  cypress: [2.032, 1.892, 13],
  cypress_b: [2.032, 3.256, 13],
  daisy: [0.619, 0.394, 0.497],
  dandelion: [0.461, 0.453, 0.274],
  dandelion_b: [0.259, 0.248, 0.057],
  dry_stone_wall: [3.009, 0.657, 1.403],
  dry_stone_wall_b: [3.12, 0.74, 1.57],
  espalier: [2.47, 0.192, 2.4],
  fence: [2.3, 0.091, 0.971],
  fence_b: [2.3, 0.336, 0.971],
  fern: [1.566, 1.414, 0.677],
  fire_pit: [1.511, 1.532, 0.442],
  gazania: [0.449, 0.346, 0.129],
  gazania_b: [0.362, 0.392, 0.147],
  grass_bermuda: [0.144, 0.097, 0.319],
  grass_medium_01: [0.509, 0.521, 0.514],
  grass_medium_02: [0.783, 0.748, 0.694],
  grass_medium_02_b: [0.433, 0.437, 0.572],
  hawthorn: [4.155, 4.37, 3.005],
  haystack: [3.939, 3.57, 4.293],
  haystack_b: [3.856, 3.418, 4.632],
  hedge_box: [0.751, 0.759, 0.682],
  hedge_box_b: [0.745, 0.739, 0.606],
  hedgerow: [4.604, 1.505, 2.013],
  hedgerow_b: [4.659, 1.514, 1.946],
  house_01: [10.905, 6.856, 6.821],
  house_01_b: [10.906, 6.857, 6.858],
  house_01_c: [10.904, 6.856, 6.852],
  house_02: [7.876, 9.385, 11.153],
  house_02_b: [7.876, 9.388, 11.168],
  house_02_c: [7.88, 9.39, 11.172],
  house_03: [8.78, 11.946, 11.694],
  house_03_b: [8.78, 11.947, 11.666],
  house_03_c: [8.78, 11.942, 11.707],
  inn: [13.04, 13.82, 11.268],
  island_tree_01: [9.506, 9.737, 10.025],
  island_tree_01_b: [7.625, 8.044, 8.041],
  island_tree_02: [9.525, 9.261, 7.715],
  island_tree_02_b: [7.638, 7.83, 6.187],
  lantern: [0.22, 0.22, 0.567],
  lighthouse: [11.58, 6.363, 16.84],
  lobster_pots: [2.214, 1.223, 1.666],
  market_stand_01: [1.27, 2.82, 2.444],
  market_stand_02: [2.4, 3.25, 2.623],
  market_stand_02_b: [2.4, 3.25, 2.62],
  mill: [8.74, 9.659, 11.455],
  mill_sails: [0.378, 11.723, 11.723],
  moss_rocks: [2.021, 1.995, 1.05],
  moss_rocks_b: [2.111, 2.733, 1.25],
  net_rack: [3.9, 1.146, 2.355],
  pier: [30.269, 19.515, 11.162],
  planter_hydrangea: [0.688, 0.733, 0.859],
  poppy: [0.69, 0.723, 0.591],
  quay_wall: [55.915, 38.241, 8.358],
  raised_bed: [2.48, 1.28, 0.541],
  rowing_boat: [1.529, 6.315, 0.907],
  rowing_boat_b: [1.529, 6.315, 0.907],
  sawmill: [9.71, 8.409, 7.26],
  sea_marker: [3.18, 3.18, 6.716],
  ship: [10.033, 37.291, 32.674],
  shrine: [0.921, 0.92, 2.519],
  signpost: [1.839, 1.011, 2.747],
  sorrel: [0.096, 0.077, 0.085],
  spruce: [6.319, 6.404, 13.307],
  spruce_b: [5.368, 5.173, 10.689],
  stable: [12.201, 8.46, 6.802],
  standing_stones: [9.775, 12.088, 2.947],
  stone_bridge: [12.386, 11.289, 4.389],
  tree_small: [3.399, 4.919, 5.314],
  tree_small_b: [2.726, 4.279, 4.262],
  tree_stump: [1.812, 2.015, 0.722],
  watermill: [37.207, 27.647, 12.128],
  watermill_wheel: [2.5, 2.7, 2.7],
  well: [1.944, 2.57, 3.571]
} as const satisfies Record<string, readonly [number, number, number]>

const SIZE_BY_PATH: ReadonlyMap<string, readonly [number, number, number]> = new Map(
  Object.entries(ISLAND_MODEL_SIZES_M).map(([asset, sizeM]) => [islandModel(asset), sizeM])
)

/**
 * A generated model's size as drawn on the island, in island units: `width` along its x, `depth`
 * along its z (front to back), `height`.
 */
export function islandSize(path: string) {
  const sizeM = SIZE_BY_PATH.get(path)
  if (!sizeM) throw new Error(`No size is recorded for ${path}`)
  const [width, depth, height] = sizeM.map((metres) => metres * ISLAND_UNITS_PER_METRE)
  return { width, depth, height }
}

/** Where a model that turns hangs on the model it turns on; it spins about its own x. */
export type ModelMount = {
  /** The model it hangs on. */
  on: string
  /** Its origin's offset from the host's origin in metres, in the host's frame: x right, y up, z out of its front. */
  offset: readonly [number, number, number]
  /** Degrees it is turned about the host's vertical. */
  rotationY: number
}

/** The mounts blender/island/build/stats.json records; modelSizes.test.ts keeps the two in step. */
export const ISLAND_MOUNTS = {
  mill_sails: { on: "mill", offset: [0, 9.35, 3.579], rotationY: 90 }
} as const satisfies Record<string, ModelMount>

/** The fitted height that draws a generated model at its scale on the island. */
export function islandFitHeight(path: string) {
  return islandSize(path).height
}

/** Radius of the circle around a generated model's ground plan, in island units. */
export function islandGroundRadius(path: string) {
  const { width, depth } = islandSize(path)
  return Math.hypot(width, depth) / 2
}

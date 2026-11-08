import { islandAtlas, islandModel } from "@/config/modelPaths"
import { VEGETATION_ATLAS_URLS } from "@/components/canvas/models/vegetationMaterials"
import { GROUND_LAYERS, GROUND_TEXTURES } from "../terrain/groundMaterial"

/**
 * Every model the layout places, so all of them can be requested together before it has run; islandPlan.test.ts keeps this
 * list and the layout in step.
 */
const ISLAND_MODEL_NAMES = [
  "arbour",
  "barracks",
  "barrels",
  "bell_tower",
  "birch",
  "blacksmith",
  "boulder_01",
  "boulder_02",
  "breakwater",
  "bunting",
  "cart",
  "castle_keep",
  "castle_stair",
  "cornflower",
  "crate",
  "cypress",
  "daisy",
  "dandelion",
  "dandelion_b",
  "dry_stone_wall",
  "dry_stone_wall_b",
  "espalier",
  "fence",
  "fern",
  "fire_pit",
  "gazania",
  "gazania_b",
  "grass_bermuda",
  "grass_medium_01",
  "grass_medium_02",
  "grass_medium_02_b",
  "hawthorn",
  "haystack",
  "haystack_b",
  "hedge_box",
  "hedge_box_b",
  "hedgerow",
  "hedgerow_b",
  "house_01",
  "house_02",
  "house_03",
  "inn",
  "island_tree_01",
  "island_tree_02",
  "lantern",
  "lighthouse",
  "lobster_pots",
  "market_stand_01",
  "market_stand_02",
  "mill",
  "mill_sails",
  "moss_rocks",
  "moss_rocks_b",
  "net_rack",
  "pier",
  "planter_hydrangea",
  "poppy",
  "quay_wall",
  "raised_bed",
  "rowing_boat",
  "rowing_boat_b",
  "sawmill",
  "sea_marker",
  "ship",
  "shrine",
  "signpost",
  "sorrel",
  "spruce",
  "stable",
  "standing_stones",
  "stone_bridge",
  "terrain",
  "tree_small",
  "tree_stump",
  "watermill",
  "watermill_wheel",
  "well"
] as const

export const ISLAND_MODEL_PATHS: readonly string[] = ISLAND_MODEL_NAMES.map(islandModel)

/** A texture to load and whether its rows go bottom first, as a plain image upload would lay them. */
export type TextureRequest = { url: string; flipY: boolean }

/** The ground's tiles keep three.js's default orientation; the plant and rock atlases are laid out for glTF, unflipped. */
export const ISLAND_TEXTURES: readonly TextureRequest[] = [
  ...GROUND_LAYERS.map((name) => ({ url: islandAtlas(GROUND_TEXTURES[name].atlas), flipY: true })),
  ...VEGETATION_ATLAS_URLS.map((url) => ({ url, flipY: false }))
]

import { withBase } from "@/utils/assets"

export const MODEL_PATHS = {
  earth: {
    // *_web.glb are baked from the Poly Haven originals by scripts/bake-web-models.mjs (large scans
    // simplified, 1k textures, draco); the originals run up to 110 MB and 877k triangles each.
    hqTree: withBase("/models/hq/island_tree_02_web.glb"),
    hqTreeLarge: withBase("/models/hq/island_tree_01_web.glb"),
    hqTreeSmall: withBase("/models/hq/tree_small_02_web.glb"),
    hqFern: withBase("/models/hq/fern_02_web.glb"),
    hqBoulder: withBase("/models/hq/boulder_01_web.glb"),
    hqBoulder02: withBase("/models/hq/namaqualand_boulder_02_web.glb"),
    hqMossRocks: withBase("/models/hq/rock_moss_set_01_web.glb"),
    hqTreeStump: withBase("/models/hq/tree_stump_01_web.glb"),
    hqGrassMedium01: withBase("/models/hq/grass_medium_01_web.glb"),
    hqGrassMedium02: withBase("/models/hq/grass_medium_02_web.glb"),
    hqGrassBermuda: withBase("/models/hq/grass_bermuda_01_web.glb"),
    hqDandelion: withBase("/models/hq/dandelion_01_web.glb"),
    hqGazania: withBase("/models/hq/flower_gazania_web.glb"),
    hqSorrel: withBase("/models/hq/shrub_sorrel_01_web.glb"),
    hqLantern: withBase("/models/hq/wooden_lantern_01_web.glb"),
    hqPier: withBase("/models/hq/modular_wooden_pier_web.glb"),
    hqShip: withBase("/models/hq/ship_pinnace_web.glb"),
    hqFirePit: withBase("/models/hq/stone_fire_pit_web.glb"),
    hqBarrels: withBase("/models/hq/wooden_barrels_01_web.glb"),
    hqCrate: withBase("/models/hq/wooden_crate_01_web.glb"),
    hqSeaMarker: withBase("/models/hq/lateral_sea_marker_web.glb"),
    fantasyInn: withBase("/models/medieval_village_pack/fantasy_inn.glb"),
    cypressTree: withBase("/models/fantasy_village/cypress_tree.glb"),

    bellTower: withBase("/models/medieval_village_pack/bell_tower.glb"),
    mill: withBase("/models/medieval_village_pack/mill.glb"),
    blacksmith: withBase("/models/medieval_village_pack/blacksmith.glb"),
    barracks: withBase("/models/medieval_village_pack/fantasy_barracks.glb"),
    sawmill: withBase("/models/medieval_village_pack/fantasy_sawmill.glb"),
    stable: withBase("/models/medieval_village_pack/fantasy_stable.glb"),

    house01: withBase("/models/medieval_village_pack/fantasy_house_01.glb"),
    house02: withBase("/models/medieval_village_pack/fantasy_house_02.glb"),
    house03: withBase("/models/medieval_village_pack/fantasy_house_03.glb"),

    marketStand01: withBase("/models/medieval_village_pack/market_stand_01.glb"),
    marketStand02: withBase("/models/medieval_village_pack/market_stand_02.glb"),
    well: withBase("/models/medieval_village_pack/well.glb"),
    cart: withBase("/models/medieval_village_pack/cart.glb"),
    fence: withBase("/models/medieval_village_pack/fence.glb")
  }
}

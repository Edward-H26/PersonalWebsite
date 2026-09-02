import { withBase } from "@/utils/assets"

export const MODEL_PATHS = {
  earth: {
    // *_web.glb are the Poly Haven originals simplified, resized to 1k textures, and draco-compressed
    // (see scripts/bake-web-models.mjs); the originals were 40 MB and up to 877k triangles each.
    hqTree: withBase("/models/hq/island_tree_02_web.glb"),
    hqFern: withBase("/models/hq/fern_02_web.glb"),
    hqBoulder: withBase("/models/hq/boulder_01_web.glb"),
    hqTreeStump: withBase("/models/hq/tree_stump_01_web.glb"),
    hqGrassMedium01: withBase("/models/hq/grass_medium_01_web.glb"),
    fantasyInn: withBase("/models/medieval_village_pack/fantasy_inn.glb"),
    cypressTree: withBase("/models/fantasy_village/cypress_tree.glb"),
    flowers: withBase("/models/fantasy_village/flowers.glb"),
    flowerBushes: withBase("/models/fantasy_village/flower_bushes.glb"),

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
    barrel: withBase("/models/medieval_village_pack/barrel.glb"),
    crate: withBase("/models/medieval_village_pack/crate.glb"),
    fence: withBase("/models/medieval_village_pack/fence.glb")
  }
}

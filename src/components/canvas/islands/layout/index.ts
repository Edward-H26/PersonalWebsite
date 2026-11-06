import type { InstancedGroup, Placement, RoadLanternGroup } from "../village/types"
import { placeGardens } from "../village/gardens"
import { assignVariants, shapeByWind } from "../village/variants"
import { sceneToMap } from "../terrain/terrainData"
import type { TerrainSite } from "../terrain/terrainSite"
import { createLayoutContext } from "./context"
import { placeFields } from "./fields"
import { type Harbor, buildHarbor } from "./harbor"
import { type Rotor, placeLandmarks } from "./landmarks"
import { placeRoadLanterns } from "./lanterns"
import { placeVegetation } from "./vegetation"
import { placeBunting, placeBuildings, placeVillageClusters, placeVillageProps } from "./village"

export type IslandLayout = {
  /** Single models: landmarks, buildings, props and the harbour's pieces. */
  placements: Placement[]
  /** Everything drawn many times over as one instanced mesh per model. */
  instanced: InstancedGroup[]
  lanterns: RoadLanternGroup
  /** The parts that turn: the water wheel, and the windmill's sails once the windmill stands. */
  rotors: Rotor[]
  harbor: Harbor
}

/**
 * Lays out everything that stands on the island, from terrain.json and its heightmap. Each kind of
 * object lives in its own module; this function fixes the order in which they claim ground, and the
 * order is part of the design: every placement records its footprint and each later step keeps out of
 * the footprints before it, so landmarks win over the village, the village over the lanterns and the
 * fields, and all of them over trees, rocks and grass. Trees then turn to the sea wind, and repeated
 * buildings take their character variants last, in placement order.
 */
export function buildIslandLayout(site: TerrainSite): IslandLayout {
  const ctx = createLayoutContext(site)
  const { map } = site.terrain.data
  const landmarks = placeLandmarks(ctx)
  const buildings = placeBuildings(ctx)
  const props = placeVillageProps(ctx)
  const gardens = placeGardens(ctx, buildings, props, ctx.footprints)
  const clusters = placeVillageClusters(ctx)
  const lanterns = placeRoadLanterns(ctx)
  const fields = placeFields(ctx)
  const village = [...buildings, ...props].map((p) => sceneToMap(map, p.position[0], p.position[2]))
  const vegetation = placeVegetation(ctx, village, fields.outlines)
  const harbor = buildHarbor(site)
  return {
    placements: [
      ...landmarks.placements,
      ...assignVariants(buildings),
      ...assignVariants(props),
      placeBunting(ctx, landmarks.placements),
      ...harbor.placements
    ],
    instanced: [
      ...[...gardens, ...clusters, ...fields.groups, ...vegetation].flatMap((group) => shapeByWind(group, ctx.nearestCoast)),
      ...harbor.instanced
    ],
    lanterns,
    rotors: landmarks.rotors,
    harbor
  }
}

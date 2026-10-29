/**
 * Entry point for the village: everything that stands on the island, placed in island-local
 * units from the road, the coastline and the terrain height. Each kind of object lives in its own
 * module under village/; this file only fixes the order in which they claim ground.
 */
import type { Footprint } from "./islandGeometry"
import { placeInteriorBuildings, placeRoadBuildings } from "./village/buildings"
import { buildHarbor } from "./village/harbor"
import { placeCypresses, placeFences, placeRoadClusters, placeRoadProps } from "./village/props"
import type { InstancedGroup, LayoutContext, VillageLayout } from "./village/types"
import { placeVegetation } from "./village/vegetation"

export { INTERIOR_BUILDINGS, ROAD_BUILDINGS } from "./village/buildings"
export type { InstanceTransform, InstancedGroup, LayoutContext, Placement, VillageLayout } from "./village/types"
export { GRASS_SCATTERS, type ScatterSpec } from "./village/vegetation"

/**
 * Lays out the whole village. The order is part of the design: every placement records a
 * footprint, and each later step keeps clear of the footprints recorded before it, so buildings
 * win over props, props over trees, and trees over grass.
 */
export function buildVillageLayout(ctx: LayoutContext): VillageLayout {
  const footprints: Footprint[] = []
  const buildings = [...placeRoadBuildings(ctx, footprints), ...placeInteriorBuildings(ctx, footprints)]
  const props = placeRoadProps(ctx, footprints)
  const instanced: InstancedGroup[] = [
    ...placeRoadClusters(ctx, footprints),
    placeFences(ctx),
    placeCypresses(ctx, footprints),
    ...placeVegetation(ctx, footprints)
  ]
  const harbor = buildHarbor(ctx)
  instanced.push(harbor.markers)
  return { buildings, props, harbor: harbor.placements, instanced, footprints }
}

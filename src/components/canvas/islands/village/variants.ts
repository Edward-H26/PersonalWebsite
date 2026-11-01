import { MODEL_VARIANTS, SHORE_BUILDS } from "@/config/modelPaths"
import { islandFitHeight } from "@/config/modelSizes"
import type { LayoutContext } from "../layout/context"
import type { InstanceTransform, InstancedGroup, Placement, Vec3Tuple } from "./types"

/** Trees standing this close to the coast take their shore build, bent by the sea wind. */
const SHORE_TREE_DISTANCE = 30

/**
 * Gives the n-th placement of each model the n-th of its character variants, in placement order,
 * so the same layout always builds the same village, each variant fitted to its own real height.
 * Models without variants keep their path.
 */
export function assignVariants(placements: readonly Placement[]): Placement[] {
  const placedSoFar = new Map<string, number>()
  return placements.map((placement) => {
    const variants = MODEL_VARIANTS.get(placement.path)
    if (!variants) return placement
    const index = placedSoFar.get(placement.path) ?? 0
    placedSoFar.set(placement.path, index + 1)
    const path = variants[index % variants.length]
    return { ...placement, path, fitHeight: islandFitHeight(path) }
  })
}

/**
 * Shapes a group of trees by the sea wind: every tree turns its seaward side (Blender's +y, -z here)
 * to the nearest coast, and the trees within SHORE_TREE_DISTANCE of it take the shore build that
 * leans landward, shorter for the wind, at its own real height. Groups of models without a shore
 * build pass through unchanged.
 */
export function shapeByWind(group: InstancedGroup, nearestCoast: LayoutContext["nearestCoast"]): InstancedGroup[] {
  const shoreBuild = SHORE_BUILDS.get(group.path)
  if (!shoreBuild) return [group]
  const inland: InstanceTransform[] = []
  const shore: InstanceTransform[] = []
  for (const instance of group.instances) {
    const [x, , z] = instance.position
    const coast = nearestCoast(x, z)
    const facingTheSea = { ...instance, rotation: [0, Math.atan2(x - coast.x, z - coast.z), 0] as Vec3Tuple }
    if (coast.distance < SHORE_TREE_DISTANCE) shore.push(facingTheSea)
    else inland.push(facingTheSea)
  }
  const groups = [
    { ...group, instances: inland },
    { ...group, key: `${group.key}Shore`, path: shoreBuild, fitHeight: islandFitHeight(shoreBuild), instances: shore }
  ]
  return groups.filter((g) => g.instances.length > 0)
}

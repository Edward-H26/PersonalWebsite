import { ISLAND_UNITS_PER_METRE } from "./modelSizes"

/**
 * Grass thins out from the first of these distances from the camera, in metres, and is gone by the second. Further off
 * its blades shrink below a pixel long before its shaded roots do, so the clumps would read as dark dots; the ground's
 * own grass carries the meadow there.
 */
export const GRASS_FADE_M = [40, 60] as const

/** Flowers fade the same way from where they are under a pixel: cutting them at 200 m moved no page of the deck by more than a stray pixel. */
export const FLOWER_FADE_M = [200, 260] as const

/** How a kind of ground cover is culled, in world units: in squares this wide, each dropped once it is all beyond reach. */
export type GroundCoverCulling = { chunkSize: number; reach: number }

function culling(chunkMetres: number, fadeMetres: readonly [number, number]): GroundCoverCulling {
  return { chunkSize: chunkMetres * ISLAND_UNITS_PER_METRE, reach: fadeMetres[1] * ISLAND_UNITS_PER_METRE }
}

export const GRASS_CULLING = culling(60, GRASS_FADE_M)

/**
 * The flowers' reach takes in the whole island from anywhere on the walk, so their squares only need to be small enough
 * to lie beyond reach from the overview.
 */
export const FLOWER_CULLING = culling(130, FLOWER_FADE_M)

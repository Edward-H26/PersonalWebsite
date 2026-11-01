import { Vector2 } from "three"

/**
 * The one wind over the island, in x/z: it comes in off the sea on the west, where the sun sets (-x),
 * and blows east across the island, a little to the north. The plants, the swell and the clouds all
 * read this vector, so the weather of DESIGN.md section 12 can turn them together by setting it.
 */
export const WIND_DIRECTION = new Vector2(1, -0.3).normalize()

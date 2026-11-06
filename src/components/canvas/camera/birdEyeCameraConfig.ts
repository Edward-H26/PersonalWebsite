/**
 * The overview camera looks at `lookAt` from the south-west, over the harbour bay and up the village
 * terraces to the castle and the peak, with the setting sun behind its left shoulder. It looks down
 * `elevationDeg` below the horizontal, low enough that the sea and the sky show above the island
 * (DESIGN.md section 18.1). Its distance is not taken from here: overviewFraming fits it to the island
 * and the viewport.
 */
export const BIRD_EYE_CAMERA_CONFIG = {
  /** The scene x and z the camera looks from; only its bearing to `lookAt` counts. */
  from: [-170, 231] as const,
  lookAt: [0, 18, 31] as const,
  elevationDeg: 18
}

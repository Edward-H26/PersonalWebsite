/**
 * The overview camera looks at `lookAt` from the direction of `position`: from the south-west, over the
 * harbour bay and up the village terraces to the castle and the peak, with the setting sun behind its
 * left shoulder. Its distance along that line is not taken from here: overviewFraming fits it to the
 * island's bounds and the viewport.
 */
export const BIRD_EYE_CAMERA_CONFIG = {
  position: [-170, 120, 231] as const,
  lookAt: [0, 18, 31] as const
}

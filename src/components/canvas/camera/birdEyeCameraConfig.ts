/**
 * The overview camera looks at `lookAt` from the direction of `position`. Its distance along that line
 * is not taken from here: overviewFraming fits it to the island's bounds and the viewport.
 */
export const BIRD_EYE_CAMERA_CONFIG = {
  position: [-220, 120, -280] as const,
  lookAt: [-20, 18, -110] as const
}

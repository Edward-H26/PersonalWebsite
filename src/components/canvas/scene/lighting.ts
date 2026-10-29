import * as THREE from "three"

/** Elevation of the sky's sunset sun, in degrees above the horizon. */
export const SUN_ELEVATION = 2
/** Compass direction of the sun, shared by the sky, the ocean glint and the key light. */
export const SUN_AZIMUTH = 180
// The sky keeps its low sunset sun; the key light sits at a late-afternoon angle so roofs, terrain,
// and cliffs receive direct light and cast readable shadows. Fill lights stay low so shadows read.
const KEY_LIGHT_ELEVATION = 30
const KEY_LIGHT_DISTANCE = 700

/** Light intensities and tone-mapping exposure for one dimming level. */
export type LightLevels = { sun: number; ambient: number; fill: number; point: number; exposure: number }

/** World position of the key light: the sun's azimuth at the key light's elevation. */
export function keyLightPosition(): [number, number, number] {
  const phi = THREE.MathUtils.degToRad(90 - KEY_LIGHT_ELEVATION)
  const theta = THREE.MathUtils.degToRad(SUN_AZIMUTH)
  const sun = new THREE.Vector3().setFromSphericalCoords(1, phi, theta).normalize()
  return [sun.x * KEY_LIGHT_DISTANCE, sun.y * KEY_LIGHT_DISTANCE, sun.z * KEY_LIGHT_DISTANCE]
}

/** The scene dims step by step as the visitor walks into the later sections. */
export function lightDimmingForSection(section: number) {
  return section >= 5 ? 0.55 : section >= 4 ? 0.65 : section >= 3 ? 0.75 : 1
}

/** The tuned intensities for a dimming level; the fill lights fade less than the sun so shadows keep reading. */
export function lightLevels(dimming: number): LightLevels {
  return {
    sun: 3.2 * dimming,
    ambient: 0.32 * Math.min(1, dimming + 0.2),
    fill: 0.3 * Math.min(1, dimming + 0.25),
    point: 0.35 * Math.min(1, dimming + 0.15),
    exposure: 0.52 - 0.12 * (1 - dimming)
  }
}

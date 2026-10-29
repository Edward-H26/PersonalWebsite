import { smoothstep01 } from "@/utils/math"

// The island climbs along world z: a smoothstep ramp between these bounds, on top of a gentle
// analytic noise, so the camera and every prop can sample the ground without a raycast.
const HILL_START_WORLD_Z = -120
const HILL_END_WORLD_Z = 120
const HILL_HEIGHT_WORLD = 18

function groundNoise(x: number, z: number) {
  return Math.sin(x * 0.16) * Math.cos(z * 0.065) * 0.85
}

function hillHeightWorld(worldZ: number) {
  const t = smoothstep01((worldZ - HILL_START_WORLD_Z) / (HILL_END_WORLD_Z - HILL_START_WORLD_Z))
  return t * HILL_HEIGHT_WORLD
}

/**
 * Terrain height at an island-local x/z, in local units. The hill ramp is defined in world
 * units, so `worldScale` (world = local * scale) converts in and out of it.
 */
export function surfaceHeight(x: number, z: number, worldScale: number) {
  const worldZ = z * worldScale
  return groundNoise(x, z) + hillHeightWorld(worldZ) / worldScale
}

import * as THREE from "three"

/**
 * The sea's full width in world units. The sea runs out to half this distance from the island's middle,
 * far enough past the overview's camera that the horizon haze has swallowed it before its edge.
 */
export const OCEAN_SIZE = 24000

/** What the sea's mesh needs of the shore: the island's middle, how near the open water comes to it, and the distance from the shore anywhere. */
export type Shore = {
  centre: { x: number; z: number }
  nearestWater: number
  distance: (x: number, z: number) => number
}

/** Columns of the sea round the island's middle. */
const COLUMNS = 512
/** Rings this far apart out to NEAR_REACH from the middle, where the swell runs; past it each ring is RING_GROWTH wider than the last. */
const NEAR_RING_STEP = 4
const NEAR_REACH = 640
const RING_GROWTH = 0.06
/** The sea starts this far inside the nearest open water, so no gap opens between the land and the sea. */
const SHORE_TUCK = 8

/** The rings' distances from the island's middle, from `start` out to `reach`. */
export function seaRingRadii(start: number, reach: number): number[] {
  const radii = [start]
  let r = start
  while (r < reach) {
    r = r < NEAR_REACH ? r + NEAR_RING_STEP : r * (1 + RING_GROWTH)
    radii.push(r)
  }
  return radii
}

/**
 * One sea mesh: rings round the island's middle from just inside the nearest open water out to the
 * edge of the sea, the land hiding the water under it. Every vertex carries `aShore`, its distance from
 * the shore in world units, positive at sea and negative under the land, which the sea's vertex shader
 * reads to calm the swell at the shore whatever the coast's shape.
 */
export function buildSeaGeometry(shore: Shore, size = OCEAN_SIZE): THREE.BufferGeometry {
  const radii = seaRingRadii(Math.max(0, shore.nearestWater - SHORE_TUCK), size / 2)
  const rings = radii.length
  const positions = new Float32Array(COLUMNS * rings * 3)
  const distances = new Float32Array(COLUMNS * rings)

  for (let c = 0; c < COLUMNS; c += 1) {
    const theta = (c / COLUMNS) * Math.PI * 2
    const cos = Math.cos(theta)
    const sin = Math.sin(theta)
    for (let r = 0; r < rings; r += 1) {
      const v = c * rings + r
      const x = shore.centre.x + cos * radii[r]
      const z = shore.centre.z + sin * radii[r]
      positions[v * 3] = x
      positions[v * 3 + 1] = 0
      positions[v * 3 + 2] = z
      distances[v] = shore.distance(x, z)
    }
  }

  const indices: number[] = []
  for (let c = 0; c < COLUMNS; c += 1) {
    const a = c * rings
    const b = ((c + 1) % COLUMNS) * rings
    for (let r = 0; r < rings - 1; r += 1) {
      // Wound counter-clockwise seen from above, so the water faces the sky.
      indices.push(a + r, b + r, a + r + 1, b + r, b + r + 1, a + r + 1)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute("aShore", new THREE.BufferAttribute(distances, 1))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

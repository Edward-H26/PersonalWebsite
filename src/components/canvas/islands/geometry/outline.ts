import type * as THREE from "three"
import { trackPointAt } from "./roads"

// Coastline parameters in island-local units.
export const ISLAND_SHORE_RADIUS = 36
export const ISLAND_OUTLINE_SEGMENTS = 288
const ROAD_OUTLINE_SAMPLES = 400

export type IslandOutline = {
  centerX: number
  centerZ: number
  // Rim radius per angle sample, plus the cumulative rim length used for cliff UVs.
  radii: number[]
  arcLengths: number[]
  perimeter: number
}

/**
 * The island is the outer boundary of discs of ISLAND_SHORE_RADIUS swept along the drawn road,
 * read as a star-shaped polygon from the road's centroid. A road loop therefore yields one solid
 * landmass with an organic coastline instead of a ring with a pit in the middle.
 */
export function buildIslandOutline(routeCurve: THREE.CatmullRomCurve3, worldScale: number): IslandOutline {
  const road: THREE.Vector3[] = []
  for (let i = 0; i <= ROAD_OUTLINE_SAMPLES; i += 1) {
    road.push(trackPointAt(routeCurve, i / ROAD_OUTLINE_SAMPLES, worldScale))
  }

  let centerX = 0
  let centerZ = 0
  for (const p of road) {
    centerX += p.x
    centerZ += p.z
  }
  centerX /= road.length
  centerZ /= road.length

  const radii: number[] = []
  for (let i = 0; i < ISLAND_OUTLINE_SEGMENTS; i += 1) {
    const theta = (i / ISLAND_OUTLINE_SEGMENTS) * Math.PI * 2
    const ux = Math.cos(theta)
    const uz = Math.sin(theta)
    const shore = ISLAND_SHORE_RADIUS + 3.2 * Math.sin(theta * 3 + 0.8) + 2.1 * Math.sin(theta * 7 + 2.3) + 1.2 * Math.sin(theta * 13 + 1.1)

    let best = 0
    for (const p of road) {
      const dx = p.x - centerX
      const dz = p.z - centerZ
      const along = dx * ux + dz * uz
      const off = Math.abs(dx * uz - dz * ux)
      if (off > shore) continue
      const r = along + Math.sqrt(shore * shore - off * off)
      if (r > best) best = r
    }
    radii.push(best)
  }

  const arcLengths: number[] = [0]
  let perimeter = 0
  for (let i = 1; i <= ISLAND_OUTLINE_SEGMENTS; i += 1) {
    const a0 = ((i - 1) / ISLAND_OUTLINE_SEGMENTS) * Math.PI * 2
    const a1 = (i / ISLAND_OUTLINE_SEGMENTS) * Math.PI * 2
    const r0 = radii[i - 1]
    const r1 = radii[i % ISLAND_OUTLINE_SEGMENTS]
    perimeter += Math.hypot(Math.cos(a1) * r1 - Math.cos(a0) * r0, Math.sin(a1) * r1 - Math.sin(a0) * r0)
    arcLengths.push(perimeter)
  }

  return { centerX, centerZ, radii, arcLengths, perimeter }
}

/** Rim point of angle sample `index` (wrapping), optionally scaled towards the centre. */
export function outlinePoint(outline: IslandOutline, index: number, radiusScale = 1) {
  const i = index % ISLAND_OUTLINE_SEGMENTS
  const theta = (i / ISLAND_OUTLINE_SEGMENTS) * Math.PI * 2
  const r = outline.radii[i] * radiusScale
  return { x: outline.centerX + Math.cos(theta) * r, z: outline.centerZ + Math.sin(theta) * r }
}

/** Rim radius in the direction of a point, linearly interpolated between angle samples. */
export function outlineRadiusToward(outline: IslandOutline, x: number, z: number) {
  const theta = Math.atan2(z - outline.centerZ, x - outline.centerX)
  const u = (((theta / (Math.PI * 2)) % 1) + 1) % 1
  const f = u * ISLAND_OUTLINE_SEGMENTS
  const i0 = Math.floor(f) % ISLAND_OUTLINE_SEGMENTS
  const i1 = (i0 + 1) % ISLAND_OUTLINE_SEGMENTS
  const w = f - Math.floor(f)
  return outline.radii[i0] * (1 - w) + outline.radii[i1] * w
}

/** How far inside the coastline a point is (negative when in the sea). */
export function distanceInsideOutline(outline: IslandOutline, x: number, z: number) {
  const r = Math.hypot(x - outline.centerX, z - outline.centerZ)
  return outlineRadiusToward(outline, x, z) - r
}

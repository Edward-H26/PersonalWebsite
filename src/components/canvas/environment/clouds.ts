import * as THREE from "three"
import { WIND_DIRECTION } from "./wind"

/**
 * The manuscript cloud's silhouette: a flat-bottomed cumulus of overlapping round lobes, a row along the
 * base and a scalloped crown above it, in a frame where the cloud spans x from -1 to 1 and its base lies
 * at y = 0. The loader and the 404 page can draw the same cloud from these circles.
 */
export const MANUSCRIPT_CLOUD_LOBES: ReadonlyArray<{ x: number; y: number; z: number; r: number }> = [
  { x: -0.7, y: 0.02, z: 0.04, r: 0.28 },
  { x: -0.36, y: 0.04, z: -0.06, r: 0.36 },
  { x: 0.04, y: 0.05, z: 0.05, r: 0.4 },
  { x: 0.42, y: 0.03, z: -0.03, r: 0.34 },
  { x: 0.74, y: 0.02, z: 0.03, r: 0.24 },
  { x: -0.4, y: 0.3, z: 0.02, r: 0.27 },
  { x: -0.04, y: 0.4, z: -0.02, r: 0.33 },
  { x: 0.34, y: 0.27, z: 0.04, r: 0.25 }
]

/** Subdivision of each lobe's icosphere: 180 triangles a lobe. */
const LOBE_DETAIL = 2
/** Soft normals lean from each lobe's own normal towards the cloud's centre, so the cloud shades as one mass. */
const SOFT_NORMAL_PULL = 0.65
const CLOUD_CENTRE = new THREE.Vector3(0, 0.22, 0)

/** One cloud's geometry: the lobes as icospheres, squashed flat below the base, with soft normals. */
export function buildCloudGeometry(): THREE.BufferGeometry {
  const positions: number[] = []
  const normals: number[] = []
  const point = new THREE.Vector3()
  const soft = new THREE.Vector3()
  const toward = new THREE.Vector3()
  const down = new THREE.Vector3(0, -1, 0)
  for (const lobe of MANUSCRIPT_CLOUD_LOBES) {
    const sphere = new THREE.IcosahedronGeometry(lobe.r, LOBE_DETAIL)
    const source = sphere.getAttribute("position")
    const offset = new THREE.Vector3(lobe.x, lobe.y, lobe.z)
    for (let i = 0; i < source.count; i += 1) {
      soft.fromBufferAttribute(source, i).normalize()
      point.fromBufferAttribute(source, i).add(offset)
      const onBase = point.y <= 0
      if (onBase) point.y = 0
      toward.subVectors(point, CLOUD_CENTRE).normalize()
      soft.lerp(toward, SOFT_NORMAL_PULL)
      if (onBase) soft.lerp(down, 0.7)
      soft.normalize()
      positions.push(point.x, point.y, point.z)
      normals.push(soft.x, soft.y, soft.z)
    }
    sphere.dispose()
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3))
  return geometry
}

/**
 * One cloud of the bank: its base centre and width in world units, its turn about the vertical, and how
 * much taller and deeper than the lobes' own proportions it is drawn.
 */
export type CloudPlacement = { x: number; y: number; z: number; width: number; height: number; depth: number; yaw: number }

/**
 * The cloud bank round the island, a dozen clouds well beyond the coast so they fill the sky of every
 * view without crossing the overview's sight line to the island.
 */
export const CLOUD_BANK: readonly CloudPlacement[] = [
  { x: 1350, y: 470, z: -1150, width: 420, height: 1.2, depth: 0.8, yaw: 1.8 },
  { x: 380, y: 560, z: -1750, width: 360, height: 1.05, depth: 0.75, yaw: 2.7 },
  { x: 1850, y: 520, z: -300, width: 400, height: 1.15, depth: 0.85, yaw: 1.2 },
  { x: 1450, y: 430, z: 650, width: 320, height: 1.3, depth: 0.8, yaw: 2.4 },
  { x: -650, y: 400, z: -1900, width: 340, height: 1.1, depth: 0.75, yaw: -2.5 },
  { x: 900, y: 500, z: 1600, width: 360, height: 1.2, depth: 0.85, yaw: 0.4 },
  { x: -500, y: 450, z: 1950, width: 330, height: 1.25, depth: 0.8, yaw: -1.8 },
  { x: -1800, y: 590, z: 900, width: 440, height: 1.0, depth: 0.7, yaw: 2.1 },
  { x: -2000, y: 480, z: -600, width: 380, height: 1.15, depth: 0.8, yaw: -0.5 },
  { x: -1450, y: 620, z: -1300, width: 300, height: 1.2, depth: 0.85, yaw: -3.0 },
  { x: 1250, y: 530, z: -2150, width: 340, height: 1.1, depth: 0.75, yaw: 0.7 },
  { x: 2250, y: 600, z: 250, width: 460, height: 1.0, depth: 0.7, yaw: -2.2 }
]

/** The clouds drift with the wind at this speed, in world units per second. */
export const CLOUD_DRIFT_SPEED = 3
/** They drift within a square this far each way from the island; one leaving downwind comes back upwind. */
export const CLOUD_REGION = 2600
/** Near the square's edge a cloud shrinks away over this share of the distance, so it never pops. */
const CLOUD_EDGE_FADE = 0.18

/** Where a cloud's base centre has drifted to after `seconds`, and how much of its size it keeps there. */
export function driftedCloud(cloud: Pick<CloudPlacement, "x" | "z">, seconds: number) {
  const wrap = (v: number) => ((((v + CLOUD_REGION) % (2 * CLOUD_REGION)) + 2 * CLOUD_REGION) % (2 * CLOUD_REGION)) - CLOUD_REGION
  const x = wrap(cloud.x + WIND_DIRECTION.x * CLOUD_DRIFT_SPEED * seconds)
  const z = wrap(cloud.z + WIND_DIRECTION.y * CLOUD_DRIFT_SPEED * seconds)
  const edge = Math.max(Math.abs(x), Math.abs(z))
  const keep = 1 - THREE.MathUtils.smoothstep(edge, CLOUD_REGION * (1 - CLOUD_EDGE_FADE), CLOUD_REGION)
  return { x, z, keep }
}

/** A cloud's shadow on the ground, for the weather of DESIGN.md section 12: where it is and how wide. */
export type CloudShadowSource = { x: number; z: number; radius: number }

/** Every cloud's shadow source after `seconds` of drift, matching what the cloud shader draws. */
export function cloudShadowSources(seconds: number): CloudShadowSource[] {
  return CLOUD_BANK.map((cloud) => {
    const { x, z, keep } = driftedCloud(cloud, seconds)
    return { x, z, radius: (cloud.width / 2) * keep }
  })
}

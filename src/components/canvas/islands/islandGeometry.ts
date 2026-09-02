import * as THREE from "three"
import { seededRandom, smoothstep01 } from "@/utils/math"

// Island body (all in island-local units, world = local * EARTH_ISLAND.scale)
export const ISLAND_DEPTH = 42
export const ISLAND_SHORE_RADIUS = 36
export const ISLAND_OUTLINE_SEGMENTS = 288
export const ISLAND_RINGS = 44
export const CLIFF_ROWS = 14
const ROAD_OUTLINE_SAMPLES = 400

// Texture tile sizes in local units; UVs are generated in tile space so every surface tiles squarely.
export const GRASS_TILE = 11
export const CLIFF_TILE = 15
export const COBBLE_TILE = 9

export const PATH_WIDTH = 7.8
export const BRANCH_WIDTH = PATH_WIDTH * 0.7
export const PATH_Y_OFFSET = 0.24
export const SIDE_ROAD_Y_OFFSET = 0.2
export const PATH_RIBBON_SEGMENTS = 170
// Side roads meet the main road at right angles, run underneath it, and overrun its centerline by
// just under half its width, so their square ends stay hidden and junctions read as clean T-joins.
export const SIDE_ROAD_APPROACH = 8
export const SIDE_ROAD_OVERRUN = PATH_WIDTH / 2 - 0.4

const CAMERA_BACK_OFFSET_WORLD = 12
const CAMERA_LEFT_OFFSET_WORLD = 1.2

const HILL_START_WORLD_Z = -120
const HILL_END_WORLD_Z = 120
const HILL_HEIGHT_WORLD = 18

export function applyAoUv(geo: THREE.BufferGeometry) {
  if (geo.attributes.uv && !geo.attributes.uv1) {
    geo.setAttribute("uv1", new THREE.BufferAttribute(geo.attributes.uv.array, 2))
  }
}

function groundNoise(x: number, z: number) {
  return Math.sin(x * 0.16) * Math.cos(z * 0.065) * 0.85
}

function hillHeightWorld(worldZ: number) {
  const t = smoothstep01((worldZ - HILL_START_WORLD_Z) / (HILL_END_WORLD_Z - HILL_START_WORLD_Z))
  return t * HILL_HEIGHT_WORLD
}

export function surfaceHeight(x: number, z: number, worldScale: number) {
  const worldZ = z * worldScale
  return groundNoise(x, z) + hillHeightWorld(worldZ) / worldScale
}

export function isPointInPolygon2D(px: number, py: number, polygon: ReadonlyArray<THREE.Vector2>) {
  let inside = false
  const count = polygon.length
  if (count < 3) return false

  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y

    const intersects = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }

  return inside
}

export function clampOffsetToIsland(
  baseX: number,
  baseZ: number,
  offsetX: number,
  offsetZ: number,
  isInside: (x: number, z: number) => boolean,
  fallbackPoint?: { x: number; z: number }
) {
  if (isInside(baseX + offsetX, baseZ + offsetZ)) return { x: baseX + offsetX, z: baseZ + offsetZ }

  const steps = 16
  for (let i = 1; i <= steps; i += 1) {
    const t = 1 - i / steps
    const x = baseX + offsetX * t
    const z = baseZ + offsetZ * t
    if (isInside(x, z)) return { x, z }
  }

  return fallbackPoint ?? { x: baseX, z: baseZ }
}

export function getFlatTangent(tangent: THREE.Vector3) {
  tangent.y = 0
  if (tangent.lengthSq() > 1e-8) tangent.normalize()
  else tangent.set(0, 0, 1)
  return tangent
}

// The drawn road sits where the camera travels: behind and slightly left of the route curve.
export function getTrackFrameAt(
  curve: THREE.CatmullRomCurve3,
  t: number,
  point: THREE.Vector3,
  tangent: THREE.Vector3,
  perp: THREE.Vector3,
  side: THREE.Vector3,
  worldScale: number
) {
  curve.getPointAt(t, point)
  curve.getTangentAt(t, tangent)
  getFlatTangent(tangent)

  side.set(tangent.z, 0, -tangent.x)
  const backOffset = CAMERA_BACK_OFFSET_WORLD / worldScale
  const leftOffset = CAMERA_LEFT_OFFSET_WORLD / worldScale
  point.x -= tangent.x * backOffset
  point.z -= tangent.z * backOffset
  point.addScaledVector(side, leftOffset)

  perp.set(-tangent.z, 0, tangent.x)
}

export function trackPointAt(curve: THREE.CatmullRomCurve3, t: number, worldScale: number) {
  const point = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const perp = new THREE.Vector3()
  const side = new THREE.Vector3()
  getTrackFrameAt(curve, t, point, tangent, perp, side, worldScale)
  return point
}

// Junction point on the main road plus a control point SIDE_ROAD_APPROACH units away from it,
// perpendicular to the road on the side facing `toward`, so a side road leaves or arrives square-on.
export function junctionPoints(curve: THREE.CatmullRomCurve3, t: number, worldScale: number, toward: THREE.Vector3) {
  const point = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const perp = new THREE.Vector3()
  const side = new THREE.Vector3()
  getTrackFrameAt(curve, t, point, tangent, perp, side, worldScale)
  if (perp.dot(toward.clone().sub(point)) < 0) perp.negate()
  return { onRoad: point, approach: point.clone().addScaledVector(perp, SIDE_ROAD_APPROACH) }
}

export function makeSideRoadCurve(points: THREE.Vector3[]) {
  const curve = new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5)
  const startTangent = getFlatTangent(curve.getTangentAt(0))
  const endTangent = getFlatTangent(curve.getTangentAt(1))
  const extended = [...points]
  extended[0] = points[0].clone().addScaledVector(startTangent, -SIDE_ROAD_OVERRUN)
  extended[extended.length - 1] = points[points.length - 1].clone().addScaledVector(endTangent, SIDE_ROAD_OVERRUN)
  return new THREE.CatmullRomCurve3(extended, false, "catmullrom", 0.5)
}

export type IslandOutline = {
  centerX: number
  centerZ: number
  // Rim radius per angle sample, plus the cumulative rim length used for cliff UVs.
  radii: number[]
  arcLengths: number[]
  perimeter: number
}

// The island is the outer boundary of discs of ISLAND_SHORE_RADIUS swept along the drawn road,
// read as a star-shaped polygon from the road's centroid. A road loop therefore yields one solid
// landmass with an organic coastline instead of a ring with a pit in the middle.
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
    const shore =
      ISLAND_SHORE_RADIUS +
      3.2 * Math.sin(theta * 3 + 0.8) +
      2.1 * Math.sin(theta * 7 + 2.3) +
      1.2 * Math.sin(theta * 13 + 1.1)

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

export function outlinePoint(outline: IslandOutline, index: number, radiusScale = 1) {
  const i = index % ISLAND_OUTLINE_SEGMENTS
  const theta = (i / ISLAND_OUTLINE_SEGMENTS) * Math.PI * 2
  const r = outline.radii[i] * radiusScale
  return { x: outline.centerX + Math.cos(theta) * r, z: outline.centerZ + Math.sin(theta) * r }
}

// Rim radius in the direction of a point, linearly interpolated between angle samples.
export function outlineRadiusToward(outline: IslandOutline, x: number, z: number) {
  const theta = Math.atan2(z - outline.centerZ, x - outline.centerX)
  const u = ((theta / (Math.PI * 2)) % 1 + 1) % 1
  const f = u * ISLAND_OUTLINE_SEGMENTS
  const i0 = Math.floor(f) % ISLAND_OUTLINE_SEGMENTS
  const i1 = (i0 + 1) % ISLAND_OUTLINE_SEGMENTS
  const w = f - Math.floor(f)
  return outline.radii[i0] * (1 - w) + outline.radii[i1] * w
}

// How far inside the coastline a point is (negative when in the sea).
export function distanceInsideOutline(outline: IslandOutline, x: number, z: number) {
  const r = Math.hypot(x - outline.centerX, z - outline.centerZ)
  return outlineRadiusToward(outline, x, z) - r
}

export function makeIslandTopGeometry(outline: IslandOutline, heightAt: (x: number, z: number) => number) {
  const M = ISLAND_OUTLINE_SEGMENTS
  const K = ISLAND_RINGS
  const vertexCount = 1 + K * M
  const positions = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)

  const setVertex = (v: number, x: number, z: number) => {
    positions[v * 3 + 0] = x
    positions[v * 3 + 1] = heightAt(x, z)
    positions[v * 3 + 2] = z
    uvs[v * 2 + 0] = x / GRASS_TILE
    uvs[v * 2 + 1] = z / GRASS_TILE
  }

  setVertex(0, outline.centerX, outline.centerZ)
  for (let k = 1; k <= K; k += 1) {
    const s = k / K
    for (let i = 0; i < M; i += 1) {
      const rim = outlinePoint(outline, i)
      const x = outline.centerX + (rim.x - outline.centerX) * s
      const z = outline.centerZ + (rim.z - outline.centerZ) * s
      setVertex(1 + (k - 1) * M + i, x, z)
    }
  }

  const indices: number[] = []
  for (let i = 0; i < M; i += 1) {
    indices.push(0, 1 + ((i + 1) % M), 1 + i)
  }
  for (let k = 1; k < K; k += 1) {
    const inner = 1 + (k - 1) * M
    const outer = 1 + k * M
    for (let i = 0; i < M; i += 1) {
      const j = (i + 1) % M
      indices.push(inner + i, outer + j, outer + i)
      indices.push(inner + i, inner + j, outer + j)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  applyAoUv(geo)
  return geo
}

function cliffOffset(theta: number, depthFraction: number, y: number) {
  const lip = 1.4 * Math.sin(Math.PI * Math.min(1, depthFraction * 1.6))
  const striations = 0.55 * Math.sin(theta * 11 + y * 0.35) + 0.45 * Math.sin(theta * 29 + 1.3) * Math.cos(y * 0.22)
  return lip + 1.7 * striations
}

// Cliff walls hang from the rim to below the waterline. UVs run along the rim (u) and down the
// wall (v) in tile units, so the rock texture tiles uniformly instead of smearing down the face.
export function makeCliffGeometry(outline: IslandOutline, rimHeightAt: (x: number, z: number) => number, baseY: number) {
  const M = ISLAND_OUTLINE_SEGMENTS
  const R = CLIFF_ROWS
  const columns = M + 1
  const wallVertexCount = columns * (R + 1)
  const vertexCount = wallVertexCount + 1 + M
  const positions = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)

  for (let c = 0; c < columns; c += 1) {
    const i = c % M
    const theta = (i / M) * Math.PI * 2
    const rim = outlinePoint(outline, i)
    const rimY = rimHeightAt(rim.x, rim.z)
    const ux = Math.cos(theta)
    const uz = Math.sin(theta)
    const u = outline.arcLengths[c] / CLIFF_TILE

    for (let r = 0; r <= R; r += 1) {
      const f = r / R
      const y = rimY + (baseY - rimY) * f
      const offset = r === 0 ? 0 : cliffOffset(theta, f, y)
      const v = c * (R + 1) + r
      positions[v * 3 + 0] = rim.x + ux * offset
      positions[v * 3 + 1] = y
      positions[v * 3 + 2] = rim.z + uz * offset
      uvs[v * 2 + 0] = u
      uvs[v * 2 + 1] = (rimY - y) / CLIFF_TILE
    }
  }

  const indices: number[] = []
  for (let c = 0; c < M; c += 1) {
    const a = c * (R + 1)
    const b = (c + 1) * (R + 1)
    for (let r = 0; r < R; r += 1) {
      indices.push(a + r, b + r, a + r + 1)
      indices.push(b + r, b + r + 1, a + r + 1)
    }
  }

  const baseCenter = wallVertexCount
  positions[baseCenter * 3 + 0] = outline.centerX
  positions[baseCenter * 3 + 1] = baseY
  positions[baseCenter * 3 + 2] = outline.centerZ
  for (let i = 0; i < M; i += 1) {
    const src = i * (R + 1) + R
    const v = baseCenter + 1 + i
    positions[v * 3 + 0] = positions[src * 3 + 0]
    positions[v * 3 + 1] = baseY
    positions[v * 3 + 2] = positions[src * 3 + 2]
    uvs[v * 2 + 0] = positions[v * 3 + 0] / CLIFF_TILE
    uvs[v * 2 + 1] = positions[v * 3 + 2] / CLIFF_TILE
  }
  for (let i = 0; i < M; i += 1) {
    indices.push(baseCenter, baseCenter + 1 + i, baseCenter + 1 + ((i + 1) % M))
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  applyAoUv(geo)
  return geo
}

export function makePathRibbonGeometry(
  curve: THREE.CatmullRomCurve3,
  width: number,
  segments: number,
  yOffset: number,
  worldScale: number,
  followCameraTrack: boolean
) {
  const vertexCount = (segments + 1) * 2
  const positions = new Float32Array(vertexCount * 3)
  const uvs = new Float32Array(vertexCount * 2)
  const indices = new Uint16Array(segments * 6)

  const point = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const perp = new THREE.Vector3()
  const side = new THREE.Vector3()

  const halfW = width / 2
  const length = curve.getLength()

  for (let i = 0; i <= segments; i += 1) {
    const t = segments === 0 ? 0 : i / segments
    if (followCameraTrack) {
      getTrackFrameAt(curve, t, point, tangent, perp, side, worldScale)
    } else {
      curve.getPointAt(t, point)
      curve.getTangentAt(t, tangent)
      getFlatTangent(tangent)
      perp.set(-tangent.z, 0, tangent.x)
    }

    const lx = point.x + perp.x * halfW
    const lz = point.z + perp.z * halfW
    const rx = point.x - perp.x * halfW
    const rz = point.z - perp.z * halfW

    const v = (t * length) / COBBLE_TILE
    const baseV = i * 2

    positions[baseV * 3 + 0] = lx
    positions[baseV * 3 + 1] = surfaceHeight(lx, lz, worldScale) + yOffset
    positions[baseV * 3 + 2] = lz

    positions[(baseV + 1) * 3 + 0] = rx
    positions[(baseV + 1) * 3 + 1] = surfaceHeight(rx, rz, worldScale) + yOffset
    positions[(baseV + 1) * 3 + 2] = rz

    uvs[baseV * 2 + 0] = 0
    uvs[baseV * 2 + 1] = v
    uvs[(baseV + 1) * 2 + 0] = width / COBBLE_TILE
    uvs[(baseV + 1) * 2 + 1] = v
  }

  for (let i = 0; i < segments; i += 1) {
    const a = i * 2
    const b = a + 1
    const c = a + 2
    const d = a + 3
    const idx = i * 6
    indices[idx + 0] = a
    indices[idx + 1] = d
    indices[idx + 2] = b
    indices[idx + 3] = a
    indices[idx + 4] = c
    indices[idx + 5] = d
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3))
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(new THREE.BufferAttribute(indices, 1))
  geo.computeVertexNormals()
  applyAoUv(geo)
  return geo
}

// ---------------------------------------------------------------------------------------------
// Placement helpers: everything scattered on the island must stay on land, off the roads, and
// out of the buildings' footprints.

export type RoadSample = { x: number; z: number; halfWidth: number; tangentX: number; tangentZ: number }

export type RoadCurveSpec = { curve: THREE.CatmullRomCurve3; halfWidth: number; followCameraTrack: boolean }

export function sampleRoadNetwork(roads: RoadCurveSpec[], worldScale: number, spacing = 1.5): RoadSample[] {
  const samples: RoadSample[] = []
  const point = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const perp = new THREE.Vector3()
  const side = new THREE.Vector3()
  for (const road of roads) {
    const count = Math.max(2, Math.ceil(road.curve.getLength() / spacing))
    for (let i = 0; i <= count; i += 1) {
      const t = i / count
      if (road.followCameraTrack) {
        getTrackFrameAt(road.curve, t, point, tangent, perp, side, worldScale)
      } else {
        road.curve.getPointAt(t, point)
        road.curve.getTangentAt(t, tangent)
        getFlatTangent(tangent)
      }
      samples.push({ x: point.x, z: point.z, halfWidth: road.halfWidth, tangentX: tangent.x, tangentZ: tangent.z })
    }
  }
  return samples
}

// Signed distance to the nearest road edge: negative means the point is on the road surface.
export function distanceToRoadEdge(x: number, z: number, roads: ReadonlyArray<RoadSample>) {
  let best = Number.POSITIVE_INFINITY
  for (const s of roads) {
    const d = Math.hypot(s.x - x, s.z - z) - s.halfWidth
    if (d < best) best = d
  }
  return best
}

export type Footprint = { x: number; z: number; radius: number }

export function overlapsFootprint(x: number, z: number, radius: number, footprints: ReadonlyArray<Footprint>) {
  for (const f of footprints) {
    if (Math.hypot(f.x - x, f.z - z) < f.radius + radius) return true
  }
  return false
}

export type ScatterOptions = {
  count: number
  seed: number
  // Own footprint radius; also the clearance required from road edges and other footprints.
  radius: number
  // Minimum distance from the coastline.
  shoreMargin: number
  // Extra clearance from roads beyond the footprint radius.
  roadClearance?: number
  minScale?: number
  maxScale?: number
  // Optional region filter in local coordinates.
  accept?: (x: number, z: number) => boolean
}

export type ScatteredInstance = { x: number; z: number; rotY: number; scale: number }

// Seeded rejection sampling inside the coastline. Deterministic for a given seed so the island
// looks the same on every visit.
export function scatterOnIsland(
  outline: IslandOutline,
  roads: ReadonlyArray<RoadSample>,
  footprints: ReadonlyArray<Footprint>,
  options: ScatterOptions
): ScatteredInstance[] {
  const { count, seed, radius, shoreMargin, roadClearance = 0, minScale = 1, maxScale = 1, accept } = options
  const maxRadius = Math.max(...outline.radii) + 1
  const placed: ScatteredInstance[] = []
  const attempts = count * 40

  for (let i = 0; i < attempts && placed.length < count; i += 1) {
    const rx = seededRandom(seed + i * 7.31 + 0.13)
    const rz = seededRandom(seed + i * 7.31 + 1.71)
    const x = outline.centerX + (rx * 2 - 1) * maxRadius
    const z = outline.centerZ + (rz * 2 - 1) * maxRadius

    if (distanceInsideOutline(outline, x, z) < shoreMargin) continue
    if (distanceToRoadEdge(x, z, roads) < radius + roadClearance) continue
    if (overlapsFootprint(x, z, radius, footprints)) continue
    if (accept && !accept(x, z)) continue
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < radius * 1.2)) continue

    placed.push({
      x,
      z,
      rotY: seededRandom(seed + i * 7.31 + 2.9) * Math.PI * 2,
      scale: minScale + seededRandom(seed + i * 7.31 + 4.2) * (maxScale - minScale)
    })
  }

  return placed
}

// Moves a point sideways off the nearest road (along the road's normal, never along it) until it
// clears the road edge by `clearance`. A few passes settle points near junctions.
export function pushClearOfRoads(x: number, z: number, clearance: number, roads: ReadonlyArray<RoadSample>) {
  let px = x
  let pz = z
  for (let pass = 0; pass < 4; pass += 1) {
    let nearest: RoadSample | null = null
    let best = Number.POSITIVE_INFINITY
    for (const s of roads) {
      const d = Math.hypot(s.x - px, s.z - pz) - s.halfWidth
      if (d < best) {
        best = d
        nearest = s
      }
    }
    if (!nearest || best >= clearance) break
    const normalX = -nearest.tangentZ
    const normalZ = nearest.tangentX
    const sideSign = Math.sign((px - nearest.x) * normalX + (pz - nearest.z) * normalZ) || 1
    px = nearest.x + normalX * sideSign * (nearest.halfWidth + clearance)
    pz = nearest.z + normalZ * sideSign * (nearest.halfWidth + clearance)
  }
  return { x: px, z: pz }
}

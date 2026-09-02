import { Suspense, useCallback, useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { EARTH_ISLAND, EARTH_ROUTE_POINTS, EARTH_SECTION_T_STOPS } from "@/config"
import type { PbrTextureSet } from "@/hooks/usePbrTextureSet"
import { MODEL_PATHS } from "@/hooks/useIslandModels"
import { GltfModel } from "@/components/canvas/models/GltfModel"
import { useTiledPbrTextureSet } from "@/hooks/useTiledPbrTextureSet"
import { InstancedGltfModel } from "@/components/canvas/models/InstancedGltfModel"
import { useWorldStore } from "@/store/worldStore"
import { ENV_MAP_INTENSITY } from "@/hooks/useRealtimeMaterials"
import { seededRandom as rand, seededRandomSigned as randSigned, smoothstep01 } from "@/utils/math"

// Island body (all in island-local units, world = local * EARTH_ISLAND.scale)
const ISLAND_DEPTH = 42
const ISLAND_SHORE_RADIUS = 36
const ISLAND_OUTLINE_SEGMENTS = 288
const ISLAND_RINGS = 44
const CLIFF_ROWS = 14
const ROAD_OUTLINE_SAMPLES = 400

// Texture tile sizes in local units; UVs are generated in tile space so every surface tiles squarely.
const GRASS_TILE = 11
const CLIFF_TILE = 15
const COBBLE_TILE = 9

const PATH_WIDTH = 7.8
const BRANCH_WIDTH = PATH_WIDTH * 0.7
const PATH_Y_OFFSET = 0.22
const PATH_RIBBON_SEGMENTS = 170

const CAMERA_BACK_OFFSET_WORLD = 12
const CAMERA_LEFT_OFFSET_WORLD = 1.2

function applyAoUv(geo: THREE.BufferGeometry) {
  if (geo.attributes.uv && !geo.attributes.uv1) {
    geo.setAttribute("uv1", new THREE.BufferAttribute(geo.attributes.uv.array, 2))
  }
}

function groundNoise(x: number, z: number) {
  return Math.sin(x * 0.16) * Math.cos(z * 0.065) * 0.85
}

function isPointInPolygon2D(px: number, py: number, polygon: ReadonlyArray<THREE.Vector2>) {
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

function clampOffsetToIsland(
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

const HILL_START_WORLD_Z = -120
const HILL_END_WORLD_Z = 120
const HILL_HEIGHT_WORLD = 18

function hillHeightWorld(worldZ: number) {
  const t = smoothstep01((worldZ - HILL_START_WORLD_Z) / (HILL_END_WORLD_Z - HILL_START_WORLD_Z))
  return t * HILL_HEIGHT_WORLD
}

function surfaceHeight(x: number, z: number, worldScale: number) {
  const worldZ = z * worldScale
  return groundNoise(x, z) + hillHeightWorld(worldZ) / worldScale
}

function getFlatTangent(tangent: THREE.Vector3) {
  tangent.y = 0
  if (tangent.lengthSq() > 1e-8) tangent.normalize()
  else tangent.set(0, 0, 1)
  return tangent
}

// The drawn road sits where the camera travels: behind and slightly left of the route curve.
function getTrackFrameAt(
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

function trackPointAt(curve: THREE.CatmullRomCurve3, t: number, worldScale: number) {
  const point = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const perp = new THREE.Vector3()
  const side = new THREE.Vector3()
  getTrackFrameAt(curve, t, point, tangent, perp, side, worldScale)
  return point
}

type IslandOutline = {
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
function buildIslandOutline(routeCurve: THREE.CatmullRomCurve3, worldScale: number): IslandOutline {
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

function outlinePoint(outline: IslandOutline, index: number, radiusScale = 1) {
  const i = index % ISLAND_OUTLINE_SEGMENTS
  const theta = (i / ISLAND_OUTLINE_SEGMENTS) * Math.PI * 2
  const r = outline.radii[i] * radiusScale
  return { x: outline.centerX + Math.cos(theta) * r, z: outline.centerZ + Math.sin(theta) * r }
}

function makeIslandTopGeometry(outline: IslandOutline, heightAt: (x: number, z: number) => number) {
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
function makeCliffGeometry(outline: IslandOutline, rimHeightAt: (x: number, z: number) => number, baseY: number) {
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

function makePathRibbonGeometry(
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

function Terrain({ ground, geometry }: { ground: PbrTextureSet; geometry: THREE.BufferGeometry }) {
  return (
    <mesh geometry={geometry} castShadow receiveShadow userData={{ isGround: true }}>
      <meshStandardMaterial
        map={ground.map}
        normalMap={ground.normalMap}
        normalScale={new THREE.Vector2(0.85, 0.85)}
        aoMap={ground.armMap}
        aoMapIntensity={0.45}
        roughnessMap={ground.armMap}
        metalnessMap={ground.armMap}
        color="#c4e8b0"
        roughness={1}
        metalness={0}
        envMapIntensity={ENV_MAP_INTENSITY}
      />
    </mesh>
  )
}

function CliffBase({ rock, geometry }: { rock: PbrTextureSet; geometry: THREE.BufferGeometry }) {
  return (
    <mesh geometry={geometry} castShadow receiveShadow userData={{ isGround: true }}>
      <meshStandardMaterial
        map={rock.map}
        normalMap={rock.normalMap}
        aoMap={rock.armMap}
        aoMapIntensity={0.6}
        roughnessMap={rock.armMap}
        metalnessMap={rock.armMap}
        color="#d8d4cc"
        roughness={1}
        metalness={0}
        envMapIntensity={ENV_MAP_INTENSITY}
      />
    </mesh>
  )
}

function PathSurface({ ground, topY, geometry }: { ground: PbrTextureSet; topY: number; geometry: THREE.BufferGeometry }) {
  return (
    <mesh geometry={geometry} position={[0, topY, 0]} receiveShadow userData={{ isGround: true }} frustumCulled={false}>
      <meshStandardMaterial
        map={ground.map}
        normalMap={ground.normalMap}
        aoMap={ground.armMap}
        aoMapIntensity={0.35}
        roughnessMap={ground.armMap}
        metalnessMap={ground.armMap}
        color="#d1d1d1"
        roughness={0.92}
        metalness={0}
        envMapIntensity={ENV_MAP_INTENSITY}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function TexturedIslandCore({
  topY,
  terrainGeometry,
  cliffGeometry,
  pathGeometries,
  onReady
}: {
  topY: number
  terrainGeometry: THREE.BufferGeometry
  cliffGeometry: THREE.BufferGeometry
  pathGeometries: THREE.BufferGeometry[]
  onReady?: () => void
}) {
  const terrainPbr = useTiledPbrTextureSet("sparseGrass", 1)
  const cliffPbr = useTiledPbrTextureSet("cliffSide", 1)
  const pathPbr = useTiledPbrTextureSet("cobblestonePavement", 1)

  useEffect(() => {
    if (!onReady) return
    onReady()
  }, [onReady])

  return (
    <>
      <CliffBase rock={cliffPbr} geometry={cliffGeometry} />
      <Terrain ground={terrainPbr} geometry={terrainGeometry} />
      {pathGeometries.map((geometry, index) => (
        <PathSurface key={index} ground={pathPbr} topY={topY} geometry={geometry} />
      ))}
    </>
  )
}

export function StylizedEarthIsland({ showProps = true }: { showProps?: boolean }) {
  const config = EARTH_ISLAND
  const texturedReadyRef = useRef(false)
  const markTexturedReady = useCallback(() => {
    if (texturedReadyRef.current) return
    texturedReadyRef.current = true
    useWorldStore.getState().setEarthTexturedReady(true)
  }, [])

  const topY = 14 + 0.02 / config.scale

  const routeCurve = useMemo(() => {
    const points = EARTH_ROUTE_POINTS.map((p) => new THREE.Vector3(p[0] / config.scale, p[1] / config.scale, p[2] / config.scale))
    return new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.5)
  }, [config.scale])

  const outline = useMemo(() => buildIslandOutline(routeCurve, config.scale), [config.scale, routeCurve])

  const terrainGeometry = useMemo(() => {
    return makeIslandTopGeometry(outline, (x, z) => topY + surfaceHeight(x, z, config.scale))
  }, [config.scale, outline, topY])

  const cliffGeometry = useMemo(() => {
    return makeCliffGeometry(outline, (x, z) => topY + surfaceHeight(x, z, config.scale), topY - ISLAND_DEPTH)
  }, [config.scale, outline, topY])

  const sampleGroundY = useMemo(() => {
    const mesh = new THREE.Mesh(terrainGeometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    mesh.updateMatrixWorld(true)

    const raycaster = new THREE.Raycaster()
    const origin = new THREE.Vector3()
    const down = new THREE.Vector3(0, -1, 0)

    const cache = new Map<string, number>()
    const quant = 2

    return (x: number, z: number) => {
      const quantX = Math.round(x * quant) / quant
      const quantZ = Math.round(z * quant) / quant
      const key = quantX + ":" + quantZ

      const cached = cache.get(key)
      if (cached != null) return cached

      origin.set(x, topY + 2000, z)
      raycaster.set(origin, down)
      raycaster.far = 8000

      const hit = raycaster.intersectObject(mesh, false)[0]
      const y = hit ? hit.point.y : topY + surfaceHeight(x, z, config.scale)
      cache.set(key, y)
      if (cache.size > 2400) cache.clear()

      return y
    }
  }, [config.scale, terrainGeometry, topY])

  const terrainBoundary = useMemo(() => {
    const points: THREE.Vector2[] = []
    for (let i = 0; i < ISLAND_OUTLINE_SEGMENTS; i += 1) {
      const p = outlinePoint(outline, i)
      points.push(new THREE.Vector2(p.x, -p.z))
    }
    return points
  }, [outline])

  const terrainCentroid = useMemo(() => ({ x: outline.centerX, z: outline.centerZ }), [outline])

  const isInsideTerrain = useMemo(() => {
    return (x: number, z: number) => isPointInPolygon2D(x, -z, terrainBoundary)
  }, [terrainBoundary])

  const clampToTerrain = useMemo(() => {
    return (baseX: number, baseZ: number, offsetX: number, offsetZ: number) => {
      if (isInsideTerrain(baseX, baseZ)) {
        return clampOffsetToIsland(baseX, baseZ, offsetX, offsetZ, isInsideTerrain)
      }

      const dx = terrainCentroid.x - baseX
      const dz = terrainCentroid.z - baseZ

      const steps = 24
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps
        const x = baseX + dx * t
        const z = baseZ + dz * t
        if (isInsideTerrain(x, z)) {
          return clampOffsetToIsland(x, z, offsetX, offsetZ, isInsideTerrain, { x, z })
        }
      }

      return clampOffsetToIsland(baseX, baseZ, offsetX, offsetZ, isInsideTerrain, terrainCentroid)
    }
  }, [isInsideTerrain, terrainCentroid])

  // Side roads start and end on the drawn main road so the network reads as one connected loop:
  // a cross-island branch between the east and west sides, and a short link closing the loop's ends.
  const branchCurve = useMemo(() => {
    const s = config.scale
    return new THREE.CatmullRomCurve3(
      [
        trackPointAt(routeCurve, 0.385, s),
        new THREE.Vector3(24, 0, 10),
        new THREE.Vector3(-6, 0, 6),
        new THREE.Vector3(-30, 0, 4),
        trackPointAt(routeCurve, 0.735, s)
      ],
      false,
      "catmullrom",
      0.5
    )
  }, [config.scale, routeCurve])

  const loopLinkCurve = useMemo(() => {
    const s = config.scale
    const end = trackPointAt(routeCurve, 1, s)
    const start = trackPointAt(routeCurve, 0, s)
    const mid = end.clone().lerp(start, 0.5)
    mid.x -= 3
    return new THREE.CatmullRomCurve3([end, mid, start], false, "catmullrom", 0.5)
  }, [config.scale, routeCurve])

  const pathGeometries = useMemo(() => {
    return [
      makePathRibbonGeometry(routeCurve, PATH_WIDTH, PATH_RIBBON_SEGMENTS, PATH_Y_OFFSET, config.scale, true),
      makePathRibbonGeometry(branchCurve, BRANCH_WIDTH, 96, PATH_Y_OFFSET + 0.02, config.scale, false),
      makePathRibbonGeometry(loopLinkCurve, BRANCH_WIDTH, 24, PATH_Y_OFFSET + 0.02, config.scale, false)
    ]
  }, [branchCurve, config.scale, loopLinkCurve, routeCurve])

  const villageBuildings = useMemo(() => {
    if (!showProps) return []

    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const perp = new THREE.Vector3()
    const sideVec = new THREE.Vector3()

    const buildings = [
      {
        key: "stable",
        path: MODEL_PATHS.earth.stable,
        t: 0.11,
        side: 1,
        out: PATH_WIDTH / 2 + 18,
        along: 4.0,
        fitHeight: 12.5,
        scale: 1.0,
        rotOffset: 0.12,
        yOffset: -0.22
      },
      {
        key: "houseEntryA",
        path: MODEL_PATHS.earth.house02,
        t: 0.06,
        side: -1,
        out: PATH_WIDTH / 2 + 16,
        along: -2.0,
        fitHeight: 10.5,
        scale: 1.0,
        rotOffset: -0.05,
        yOffset: -0.22
      },
      {
        key: "bellTower",
        path: MODEL_PATHS.earth.bellTower,
        t: 0.22,
        side: 1,
        out: PATH_WIDTH / 2 + 24,
        along: -1.0,
        fitHeight: 20,
        scale: 1.0,
        rotOffset: 0.08,
        yOffset: -0.3
      },
      {
        key: "houseSouthA",
        path: MODEL_PATHS.earth.house03,
        t: 0.18,
        side: -1,
        out: PATH_WIDTH / 2 + 14,
        along: 4.5,
        fitHeight: 10.5,
        scale: 1.0,
        rotOffset: 0.1,
        yOffset: -0.22
      },
      {
        key: "mill",
        path: MODEL_PATHS.earth.mill,
        t: 0.34,
        side: 1,
        out: PATH_WIDTH / 2 + 26,
        along: 3.5,
        fitHeight: 18,
        scale: 1.0,
        rotOffset: 0.22,
        yOffset: -0.3
      },
      {
        key: "houseEastA",
        path: MODEL_PATHS.earth.house01,
        t: 0.3,
        side: -1,
        out: PATH_WIDTH / 2 + 16,
        along: -1.0,
        fitHeight: 11,
        scale: 1.0,
        rotOffset: -0.12,
        yOffset: -0.22
      },
      {
        key: "inn",
        path: MODEL_PATHS.earth.fantasyInn,
        t: 0.5,
        side: -1,
        out: PATH_WIDTH / 2 + 22,
        along: -3.0,
        fitHeight: 16,
        scale: 1.0,
        rotOffset: -0.05,
        yOffset: -0.24
      },
      {
        key: "barracks",
        path: MODEL_PATHS.earth.barracks,
        t: 0.58,
        side: 1,
        out: PATH_WIDTH / 2 + 26,
        along: 2.5,
        fitHeight: 15,
        scale: 1.0,
        rotOffset: 0.12,
        yOffset: -0.24
      },
      {
        key: "houseNorthA",
        path: MODEL_PATHS.earth.house03,
        t: 0.54,
        side: -1,
        out: PATH_WIDTH / 2 + 16,
        along: 5.0,
        fitHeight: 11,
        scale: 1.0,
        rotOffset: 0.08,
        yOffset: -0.22
      },
      {
        key: "sawmill",
        path: MODEL_PATHS.earth.sawmill,
        t: 0.7,
        side: -1,
        out: PATH_WIDTH / 2 + 26,
        along: 1.0,
        fitHeight: 14.5,
        scale: 1.0,
        rotOffset: -0.08,
        yOffset: -0.26
      },
      {
        key: "blacksmith",
        path: MODEL_PATHS.earth.blacksmith,
        t: 0.82,
        side: 1,
        out: PATH_WIDTH / 2 + 22,
        along: -2.5,
        fitHeight: 12,
        scale: 1.0,
        rotOffset: 0.05,
        yOffset: -0.24
      },
      {
        key: "houseWestA",
        path: MODEL_PATHS.earth.house02,
        t: 0.88,
        side: -1,
        out: PATH_WIDTH / 2 + 18,
        along: 2.0,
        fitHeight: 10.5,
        scale: 1.0,
        rotOffset: -0.1,
        yOffset: -0.22
      }
    ]

    return buildings.map((b) => {
      getTrackFrameAt(routeCurve, b.t, point, tangent, perp, sideVec, config.scale)

      const out = b.side * b.out
      const offsetX = tangent.x * b.along + perp.x * out
      const offsetZ = tangent.z * b.along + perp.z * out
      const clamped = clampToTerrain(point.x, point.z, offsetX, offsetZ)
      const x = clamped.x
      const z = clamped.z
      const y = sampleGroundY(x, z) + b.yOffset
      const baseHeading = Math.atan2(tangent.x, tangent.z)
      const rotY = baseHeading + b.side * (Math.PI / 2) + b.rotOffset

      return {
        key: b.key,
        path: b.path,
        position: [x, y, z] as [number, number, number],
        rotation: [0, rotY, 0] as [number, number, number],
        fitHeight: b.fitHeight,
        scale: b.scale
      }
    })
  }, [clampToTerrain, config.scale, routeCurve, sampleGroundY, showProps])

  const villageProps = useMemo(() => {
    if (!showProps) return []

    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const perp = new THREE.Vector3()
    const sideVec = new THREE.Vector3()

    const props = [
      { key: "marketStandA", path: MODEL_PATHS.earth.marketStand01, t: 0.42, side: 1, out: PATH_WIDTH / 2 + 9.5, along: 2.0, fitHeight: 4.1, rotOffset: 0.1 },
      { key: "marketStandB", path: MODEL_PATHS.earth.marketStand02, t: 0.43, side: -1, out: PATH_WIDTH / 2 + 9.0, along: -1.5, fitHeight: 4.1, rotOffset: -0.2 },
      { key: "marketStandC", path: MODEL_PATHS.earth.marketStand02, t: 0.44, side: 1, out: PATH_WIDTH / 2 + 8.5, along: -2.0, fitHeight: 4.0, rotOffset: 0.35 },
      { key: "well", path: MODEL_PATHS.earth.well, t: 0.435, side: -1, out: PATH_WIDTH / 2 + 6.0, along: 2.2, fitHeight: 3.1, rotOffset: 0.0 },
      { key: "cart", path: MODEL_PATHS.earth.cart, t: 0.46, side: 1, out: PATH_WIDTH / 2 + 7.0, along: 1.0, fitHeight: 3.8, rotOffset: 0.2 }
    ]

    return props.map((p) => {
      getTrackFrameAt(routeCurve, p.t, point, tangent, perp, sideVec, config.scale)

      const out = p.side * p.out
      const offsetX = tangent.x * p.along + perp.x * out
      const offsetZ = tangent.z * p.along + perp.z * out
      const clamped = clampToTerrain(point.x, point.z, offsetX, offsetZ)
      const x = clamped.x
      const z = clamped.z
      const y = sampleGroundY(x, z) - 0.12
      const baseHeading = Math.atan2(tangent.x, tangent.z)
      const rotY = baseHeading + p.side * (Math.PI / 2) + p.rotOffset

      return {
        key: p.key,
        path: p.path,
        position: [x, y, z] as [number, number, number],
        rotation: [0, rotY, 0] as [number, number, number],
        fitHeight: p.fitHeight,
        scale: 1.0
      }
    })
  }, [clampToTerrain, config.scale, routeCurve, sampleGroundY, showProps])

  const barrelInstances = useMemo(() => {
    if (!showProps) return []

    const instances: Array<{ position: [number, number, number]; rotation: [number, number, number]; scale: number }> = []
    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const perp = new THREE.Vector3()
    const sideVec = new THREE.Vector3()

    const anchors = [
      { t: 0.43, side: 1, out: PATH_WIDTH / 2 + 5.0, along: 5.0, scale: 1.0 },
      { t: 0.44, side: -1, out: PATH_WIDTH / 2 + 5.5, along: -4.0, scale: 0.95 },
      { t: 0.45, side: 1, out: PATH_WIDTH / 2 + 6.0, along: -5.5, scale: 0.9 },
      { t: 0.46, side: -1, out: PATH_WIDTH / 2 + 4.8, along: 3.0, scale: 0.92 }
    ]

    for (const a of anchors) {
      getTrackFrameAt(routeCurve, a.t, point, tangent, perp, sideVec, config.scale)
      const out = a.side * a.out
      const offsetX = tangent.x * a.along + perp.x * out
      const offsetZ = tangent.z * a.along + perp.z * out
      const clamped = clampToTerrain(point.x, point.z, offsetX, offsetZ)
      const x = clamped.x
      const z = clamped.z
      const y = sampleGroundY(x, z) - 0.16
      const rotY = rand(a.t * 100.7 + 2.1) * Math.PI * 2
      instances.push({ position: [x, y, z], rotation: [0, rotY, 0], scale: a.scale })
    }

    return instances
  }, [clampToTerrain, config.scale, routeCurve, sampleGroundY, showProps])

  const crateInstances = useMemo(() => {
    if (!showProps) return []

    const instances: Array<{ position: [number, number, number]; rotation: [number, number, number]; scale: number }> = []
    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const perp = new THREE.Vector3()
    const sideVec = new THREE.Vector3()

    const anchors = [
      { t: 0.42, side: -1, out: PATH_WIDTH / 2 + 4.2, along: 4.0, scale: 1.0 },
      { t: 0.44, side: 1, out: PATH_WIDTH / 2 + 4.5, along: 0.5, scale: 0.95 },
      { t: 0.45, side: -1, out: PATH_WIDTH / 2 + 4.0, along: -2.5, scale: 0.9 }
    ]

    for (const a of anchors) {
      getTrackFrameAt(routeCurve, a.t, point, tangent, perp, sideVec, config.scale)
      const out = a.side * a.out
      const offsetX = tangent.x * a.along + perp.x * out
      const offsetZ = tangent.z * a.along + perp.z * out
      const clamped = clampToTerrain(point.x, point.z, offsetX, offsetZ)
      const x = clamped.x
      const z = clamped.z
      const y = sampleGroundY(x, z) - 0.16
      const rotY = rand(a.t * 90.1 + 6.3) * Math.PI * 2
      instances.push({ position: [x, y, z], rotation: [0, rotY, 0], scale: a.scale })
    }

    return instances
  }, [clampToTerrain, config.scale, routeCurve, sampleGroundY, showProps])

  const cypressInstances = useMemo(() => {
    if (!showProps) return []

    const instances: Array<{ position: [number, number, number]; rotation: [number, number, number]; scale: number }> = []
    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const perp = new THREE.Vector3()
    const sideVec = new THREE.Vector3()

    const anchors = [
      { t: 0.11, side: 1, out: PATH_WIDTH / 2 + 26, along: -2.0, scale: 1.0 },
      { t: 0.16, side: 1, out: PATH_WIDTH / 2 + 30, along: 5.0, scale: 0.95 },
      { t: 0.2, side: 1, out: PATH_WIDTH / 2 + 28, along: 7.0, scale: 1.08 },
      { t: 0.24, side: 1, out: PATH_WIDTH / 2 + 34, along: 10.0, scale: 1.12 },
      { t: 0.15, side: -1, out: PATH_WIDTH / 2 + 22, along: 3.0, scale: 0.9 }
    ]

    for (const a of anchors) {
      getTrackFrameAt(routeCurve, a.t, point, tangent, perp, sideVec, config.scale)
      const out = a.side * a.out
      const offsetX = tangent.x * a.along + perp.x * out
      const offsetZ = tangent.z * a.along + perp.z * out
      const clamped = clampToTerrain(point.x, point.z, offsetX, offsetZ)
      const x = clamped.x
      const z = clamped.z
      const y = sampleGroundY(x, z) - 0.18
      const rotY = rand(a.t * 100.7 + 1.2) * Math.PI * 2
      instances.push({ position: [x, y, z], rotation: [0, rotY, 0], scale: a.scale })
    }

    return instances
  }, [clampToTerrain, config.scale, routeCurve, sampleGroundY, showProps])

  const flowerBushInstances = useMemo(() => {
    if (!showProps) return []

    const instances: Array<{ position: [number, number, number]; rotation: [number, number, number]; scale: number }> = []
    const count = 26

    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const perp = new THREE.Vector3()
    const sideVec = new THREE.Vector3()

    for (let i = 0; i < count; i += 1) {
      const u = count <= 1 ? 0.5 : i / (count - 1)
      const t = 0.07 + (0.27 - 0.07) * u
      getTrackFrameAt(routeCurve, t, point, tangent, perp, sideVec, config.scale)

      const seed = i * 11.3 + 3.1
      const side = rand(seed + 0.2) > 0.2 ? 1 : -1
      const along = randSigned(seed + 0.7) * 7.0
      const out = side * (PATH_WIDTH / 2 + 6.5 + rand(seed + 1.3) * 16.0)

      const offsetX = tangent.x * along + perp.x * out
      const offsetZ = tangent.z * along + perp.z * out
      const clamped = clampToTerrain(point.x, point.z, offsetX, offsetZ)
      const x = clamped.x
      const z = clamped.z
      const y = sampleGroundY(x, z) + 0.06
      const rotY = rand(seed + 2.1) * Math.PI * 2
      const scale = 0.85 + rand(seed + 3.4) * 0.55

      instances.push({ position: [x, y, z], rotation: [0, rotY, 0], scale })
    }

    return instances
  }, [clampToTerrain, config.scale, routeCurve, sampleGroundY, showProps])

  const flowerInstances = useMemo(() => {
    if (!showProps) return []

    const instances: Array<{ position: [number, number, number]; rotation: [number, number, number]; scale: number }> = []
    const count = 34

    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const perp = new THREE.Vector3()
    const sideVec = new THREE.Vector3()

    for (let i = 0; i < count; i += 1) {
      const u = count <= 1 ? 0.5 : i / (count - 1)
      const t = 0.06 + (0.27 - 0.06) * u
      getTrackFrameAt(routeCurve, t, point, tangent, perp, sideVec, config.scale)

      const seed = i * 7.77 + 6.2
      const side = rand(seed + 0.4) > 0.35 ? 1 : -1
      const along = randSigned(seed + 0.7) * 5.0
      const out = side * (PATH_WIDTH / 2 + 3.2 + rand(seed + 1.1) * 10.0)

      const offsetX = tangent.x * along + perp.x * out
      const offsetZ = tangent.z * along + perp.z * out
      const clamped = clampToTerrain(point.x, point.z, offsetX, offsetZ)
      const x = clamped.x
      const z = clamped.z
      const y = sampleGroundY(x, z) + 0.04
      const rotY = rand(seed + 2.2) * Math.PI * 2
      const scale = 0.75 + rand(seed + 3.1) * 0.5

      instances.push({ position: [x, y, z], rotation: [0, rotY, 0], scale })
    }

    return instances
  }, [clampToTerrain, config.scale, routeCurve, sampleGroundY, showProps])

  const rockInstances = useMemo(() => {
    if (!showProps) return []

    const instances: Array<{ position: [number, number, number]; rotation: [number, number, number]; scale: number }> = []
    const count = 6
    const publicationsStartT = EARTH_SECTION_T_STOPS[3]
    const publicationsEndT = EARTH_SECTION_T_STOPS[4]

    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const perp = new THREE.Vector3()
    const sideVec = new THREE.Vector3()

    for (let i = 0; i < count; i += 1) {
      const u = count <= 1 ? 0.5 : i / (count - 1)
      const t = 0.09 + (0.92 - 0.09) * u
      getTrackFrameAt(routeCurve, t, point, tangent, perp, sideVec, config.scale)

      const seed = i * 29.4 + 2.7
      const side = i % 2 === 0 ? 1 : -1
      const along = randSigned(seed + 0.3) * 5.0
      let out = side * (PATH_WIDTH / 2 + 6.5 + rand(seed + 1.1) * 9.5)
      if (t >= publicationsStartT && t <= publicationsEndT) {
        out += side * 8.0
      }

      const offsetX = tangent.x * along + perp.x * out
      const offsetZ = tangent.z * along + perp.z * out
      const clamped = clampToTerrain(point.x, point.z, offsetX, offsetZ)
      const x = clamped.x
      const z = clamped.z
      const y = sampleGroundY(x, z) + 0.04
      const rotY = rand(seed + 2.1) * Math.PI * 2
      const scale = 0.7 + rand(seed + 3.4) * 0.45

      instances.push({ position: [x, y, z], rotation: [0, rotY, 0], scale })
    }

    return instances
  }, [clampToTerrain, config.scale, routeCurve, sampleGroundY, showProps])

  const grassInstances = useMemo(() => {
    if (!showProps) return []

    const instances: Array<{ position: [number, number, number]; rotation: [number, number, number]; scale: number }> = []

    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const perp = new THREE.Vector3()
    const sideVec = new THREE.Vector3()

    const trim = 0.04
    const startT = trim
    const endT = 1 - trim
    const count = 34

    for (let i = 0; i < count; i += 1) {
      const u = count <= 1 ? 0.5 : i / (count - 1)
      const t = startT + (endT - startT) * u
      getTrackFrameAt(routeCurve, t, point, tangent, perp, sideVec, config.scale)

      for (const side of [1, -1] as const) {
        const seed = i * 17.3 + (side === 1 ? 1.2 : 9.7)
        const along = randSigned(seed + 0.7) * 4.0
        const out = side * (PATH_WIDTH / 2 + 3.2 + rand(seed + 1.2) * 14.0)

        const offsetX = tangent.x * along + perp.x * out
        const offsetZ = tangent.z * along + perp.z * out
        const clamped = clampToTerrain(point.x, point.z, offsetX, offsetZ)
        const x = clamped.x
        const z = clamped.z
        const y = sampleGroundY(x, z) + 0.02
        const rotY = rand(seed + 2.2) * Math.PI * 2
        const scale = 0.65 + rand(seed + 3.7) * 0.55

        instances.push({ position: [x, y, z], rotation: [0, rotY, 0], scale })
      }
    }

    return instances
  }, [clampToTerrain, config.scale, routeCurve, sampleGroundY, showProps])

  const publicationsStumpInstances = useMemo(() => {
    if (!showProps) return []

    const instances: Array<{ position: [number, number, number]; rotation: [number, number, number]; scale: number }> = []
    const count = 12

    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const perp = new THREE.Vector3()
    const sideVec = new THREE.Vector3()

    const startT = EARTH_SECTION_T_STOPS[3] + 0.04
    const endT = EARTH_SECTION_T_STOPS[4] - 0.04

    for (let i = 0; i < count; i += 1) {
      const u = count <= 1 ? 0.5 : i / (count - 1)
      const t = startT + (endT - startT) * u
      getTrackFrameAt(routeCurve, t, point, tangent, perp, sideVec, config.scale)

      const seed = i * 12.7 + 4.9
      const side = rand(seed + 0.2) > 0.5 ? 1 : -1
      const along = randSigned(seed + 0.7) * 7.0
      const out = side * (PATH_WIDTH / 2 + 10 + rand(seed + 1.1) * 18)

      const offsetX = tangent.x * along + perp.x * out
      const offsetZ = tangent.z * along + perp.z * out
      const clamped = clampToTerrain(point.x, point.z, offsetX, offsetZ)
      const x = clamped.x
      const z = clamped.z
      const y = sampleGroundY(x, z) - 0.12
      const rotY = rand(seed + 2.3) * Math.PI * 2
      const scale = 0.8 + rand(seed + 3.1) * 0.7

      instances.push({ position: [x, y, z], rotation: [0, rotY, 0], scale })
    }

    return instances
  }, [clampToTerrain, config.scale, routeCurve, sampleGroundY, showProps])

  const projectTreeInstances = useMemo(() => {
    if (!showProps) return []

    const instances: Array<{ position: [number, number, number]; rotation: [number, number, number]; scale: number }> = []
    const count = 7

    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const perp = new THREE.Vector3()
    const sideVec = new THREE.Vector3()

    const startT = EARTH_SECTION_T_STOPS[2] + 0.04
    const endT = EARTH_SECTION_T_STOPS[3] - 0.05
    const pathClearance = PATH_WIDTH / 2 + 6.5

    for (let i = 0; i < count; i += 1) {
      const u = count <= 1 ? 0.5 : i / (count - 1)
      const t = startT + (endT - startT) * u
      getTrackFrameAt(routeCurve, t, point, tangent, perp, sideVec, config.scale)

      const seed = i * 18.4 + 11.6
      const side = rand(seed + 0.2) > 0.55 ? 1 : -1
      const along = randSigned(seed + 0.7) * 10.0
      const out = side * (PATH_WIDTH / 2 + 18 + rand(seed + 1.1) * 22)

      const offsetX = tangent.x * along + perp.x * out
      const offsetZ = tangent.z * along + perp.z * out
      const clamped = clampToTerrain(point.x, point.z, offsetX, offsetZ)
      const x = clamped.x
      const z = clamped.z
      const y = sampleGroundY(x, z) - 0.22
      const dx = x - point.x
      const dz = z - point.z
      if (dx * dx + dz * dz < pathClearance * pathClearance) continue
      const rotY = rand(seed + 2.3) * Math.PI * 2
      const scale = 0.85 + rand(seed + 3.2) * 0.6

      instances.push({ position: [x, y, z], rotation: [0, rotY, 0], scale })
    }

    return instances
  }, [clampToTerrain, config.scale, routeCurve, sampleGroundY, showProps])

  const projectFernInstances = useMemo(() => {
    if (!showProps) return []

    const instances: Array<{ position: [number, number, number]; rotation: [number, number, number]; scale: number }> = []
    const count = 18

    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const perp = new THREE.Vector3()
    const sideVec = new THREE.Vector3()

    const startT = EARTH_SECTION_T_STOPS[2] + 0.03
    const endT = EARTH_SECTION_T_STOPS[3] - 0.03

    for (let i = 0; i < count; i += 1) {
      const u = count <= 1 ? 0.5 : i / (count - 1)
      const t = startT + (endT - startT) * u
      getTrackFrameAt(routeCurve, t, point, tangent, perp, sideVec, config.scale)

      const seed = i * 9.3 + 2.2
      const side = rand(seed + 0.3) > 0.35 ? 1 : -1
      const along = randSigned(seed + 0.8) * 4.5
      const out = side * (PATH_WIDTH / 2 + 4.0 + rand(seed + 1.5) * 12)

      const offsetX = tangent.x * along + perp.x * out
      const offsetZ = tangent.z * along + perp.z * out
      const clamped = clampToTerrain(point.x, point.z, offsetX, offsetZ)
      const x = clamped.x
      const z = clamped.z
      const y = sampleGroundY(x, z) + 0.02
      const rotY = rand(seed + 2.2) * Math.PI * 2
      const scale = 0.9 + rand(seed + 3.1) * 0.8

      instances.push({ position: [x, y, z], rotation: [0, rotY, 0], scale })
    }

    return instances
  }, [clampToTerrain, config.scale, routeCurve, sampleGroundY, showProps])

  return (
    <group name="Island-earth" position={[config.position[0], config.position[1], config.position[2]]} rotation={config.rotation} scale={config.scale}>
      <Suspense fallback={null}>
        <TexturedIslandCore
          topY={topY}
          terrainGeometry={terrainGeometry}
          cliffGeometry={cliffGeometry}
          pathGeometries={pathGeometries}
          onReady={markTexturedReady}
        />
      </Suspense>

      {showProps ? (
        <Suspense fallback={null}>
          {villageBuildings.map((b) => (
            <GltfModel
              key={b.key}
              path={b.path}
              position={b.position}
              rotation={b.rotation}
              fitHeight={b.fitHeight}
              scale={b.scale}
            />
          ))}

          {villageProps.map((p) => (
            <GltfModel key={p.key} path={p.path} position={p.position} rotation={p.rotation} fitHeight={p.fitHeight} scale={p.scale} />
          ))}

          <InstancedGltfModel path={MODEL_PATHS.earth.barrel} fitHeight={2.3} instances={barrelInstances} castShadow={false} receiveShadow={false} />

          <InstancedGltfModel path={MODEL_PATHS.earth.crate} fitHeight={1.65} instances={crateInstances} castShadow={false} receiveShadow={false} />

          <InstancedGltfModel
            path={MODEL_PATHS.earth.hqTreeStump}
            excludeFromReflection
            fitHeight={4.2}
            receiveShadow={false}
            instances={publicationsStumpInstances}
          />

          <InstancedGltfModel
            path={MODEL_PATHS.earth.hqTree}
            excludeFromReflection
            fitHeight={18}
            receiveShadow={false}
            instances={projectTreeInstances}
          />

          <InstancedGltfModel
            path={MODEL_PATHS.earth.hqFern}
            excludeFromReflection
            meshName="fern_02_b"
            fitHeight={1.3}
            castShadow={false}
            receiveShadow={false}
            instances={projectFernInstances}
          />

          <InstancedGltfModel
            path={MODEL_PATHS.earth.cypressTree}
            excludeFromReflection
            fitHeight={20}
            receiveShadow={false}
            instances={cypressInstances}
          />

          <InstancedGltfModel
            path={MODEL_PATHS.earth.flowerBushes}
            excludeFromReflection
            fitHeight={1.55}
            castShadow={false}
            receiveShadow={false}
            instances={flowerBushInstances}
          />

          <InstancedGltfModel
            path={MODEL_PATHS.earth.flowers}
            excludeFromReflection
            fitHeight={1.1}
            castShadow={false}
            receiveShadow={false}
            instances={flowerInstances}
          />

          <InstancedGltfModel
            path={MODEL_PATHS.earth.hqBoulder}
            excludeFromReflection
            fitHeight={2.9}
            instances={rockInstances}
          />

          <InstancedGltfModel
            path={MODEL_PATHS.earth.hqGrassMedium01}
            excludeFromReflection
            meshName="grass_medium_01_mid_a_LOD0"
            fitHeight={0.55}
            castShadow={false}
            receiveShadow={false}
            instances={grassInstances}
          />
        </Suspense>
      ) : null}
    </group>
  )
}

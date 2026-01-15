import { Suspense, useCallback, useEffect, useMemo, useRef } from "react"
import { useGLTF } from "@react-three/drei"
import * as THREE from "three"
import { EARTH_ISLAND, EARTH_ROUTE_POINTS, EARTH_SECTION_T_STOPS } from "@/config"
import type { PbrTextureSet } from "@/hooks/usePbrTextureSet"
import { MODEL_PATHS } from "@/hooks/useIslandModels"
import { GltfModel } from "@/components/canvas/models/GltfModel"
import { useTiledPbrTextureSet } from "@/hooks/useTiledPbrTextureSet"
import { InstancedGltfModel } from "@/components/canvas/models/InstancedGltfModel"
import { useWorldStore } from "@/store/worldStore"

const EARTH_TOP_DEPTH = 6.8
const EARTH_CLIFF_DEPTH = 34

const PATH_WIDTH = 7.8
const PATH_Y_OFFSET = 0.45

const TERRAIN_SHAPE_SEGMENTS = 96
const TERRAIN_CAP_SEGMENTS = 18
const TERRAIN_BASE_HALF_WIDTH = 18.0
const TERRAIN_BULGE = 4.2
const TERRAIN_NOISE = 1.9

const CLIFF_SHAPE_SEGMENTS = 96
const CLIFF_CAP_SEGMENTS = 18
const CLIFF_BASE_HALF_WIDTH = 26.5
const CLIFF_BULGE = 4.6
const CLIFF_NOISE = 2.4

const ISLAND_ROUTE_EXTENSION_WORLD = 36
const ISLAND_BEND_AMPLITUDE_WORLD = 22
const PATH_RIBBON_SEGMENTS = 170

const CAMERA_BACK_OFFSET_WORLD = 12
const CAMERA_LEFT_OFFSET_WORLD = 1.2

function fract(v: number) {
  return v - Math.floor(v)
}

function rand(seed: number) {
  return fract(Math.sin(seed) * 43758.5453123)
}

function randSigned(seed: number) {
  return rand(seed) * 2 - 1
}

function applyUv2(geo: THREE.BufferGeometry) {
  if (geo.attributes.uv && !geo.attributes.uv2) {
    geo.setAttribute("uv2", new THREE.BufferAttribute(geo.attributes.uv.array, 2))
  }
}

function applyPlanarUvXZ(geo: THREE.BufferGeometry) {
  const pos = geo.attributes.position
  if (!pos) return

  geo.computeBoundingBox()
  const box = geo.boundingBox
  if (!box) return

  const minX = box.min.x
  const maxX = box.max.x
  const minZ = box.min.z
  const maxZ = box.max.z

  const rangeX = maxX - minX || 1
  const rangeZ = maxZ - minZ || 1

  const uvs = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    uvs[i * 2 + 0] = (x - minX) / rangeX
    uvs[i * 2 + 1] = (z - minZ) / rangeZ
  }

  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2))
}

function applyHeightGradient(geo: THREE.BufferGeometry, topColor: string, bottomColor: string) {
  const pos = geo.attributes.position
  if (!pos) return

  geo.computeBoundingBox()
  const box = geo.boundingBox
  if (!box) return

  const minY = box.min.y
  const maxY = box.max.y
  const rangeY = Math.max(1e-6, maxY - minY)

  const top = new THREE.Color(topColor)
  const bottom = new THREE.Color(bottomColor)
  const scratch = new THREE.Color()

  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i += 1) {
    const t = (pos.getY(i) - minY) / rangeY
    scratch.copy(bottom).lerp(top, t)
    colors[i * 3 + 0] = scratch.r
    colors[i * 3 + 1] = scratch.g
    colors[i * 3 + 2] = scratch.b
  }

  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
}

function applyRadialGradientXZ(geo: THREE.BufferGeometry, innerColor: string, outerColor: string) {
  const pos = geo.attributes.position
  if (!pos) return

  geo.computeBoundingBox()
  const box = geo.boundingBox
  if (!box) return

  const centerX = (box.min.x + box.max.x) / 2
  const centerZ = (box.min.z + box.max.z) / 2

  const rMin = Math.hypot(box.min.x - centerX, box.min.z - centerZ)
  const rMax = Math.hypot(box.max.x - centerX, box.max.z - centerZ)
  const maxR = Math.max(1e-6, Math.max(rMin, rMax))

  const inner = new THREE.Color(innerColor)
  const outer = new THREE.Color(outerColor)
  const scratch = new THREE.Color()

  const colors = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i += 1) {
    const dx = pos.getX(i) - centerX
    const dz = pos.getZ(i) - centerZ
    const t = Math.max(0, Math.min(1, Math.hypot(dx, dz) / maxR))
    scratch.copy(inner).lerp(outer, t)
    colors[i * 3 + 0] = scratch.r
    colors[i * 3 + 1] = scratch.g
    colors[i * 3 + 2] = scratch.b
  }

  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3))
}

function groundNoise(x: number, z: number) {
  return Math.sin(x * 0.16) * Math.cos(z * 0.065) * 0.85
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function smoothstep(t: number) {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
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
  const t = smoothstep((worldZ - HILL_START_WORLD_Z) / (HILL_END_WORLD_Z - HILL_START_WORLD_Z))
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

function extendRoute(points: THREE.Vector3[], extension: number) {
  if (points.length < 2) return points

  const start = points[0]
  const next = points[1]
  const end = points[points.length - 1]
  const prev = points[points.length - 2]

  const dirStart = getFlatTangent(next.clone().sub(start))
  const dirEnd = getFlatTangent(end.clone().sub(prev))

  const extendedStart = start.clone().addScaledVector(dirStart, -extension)
  const extendedEnd = end.clone().addScaledVector(dirEnd, extension)

  return [extendedStart, ...points, extendedEnd]
}

function halfWidthAt(t: number, baseHalfWidth: number, bulge: number, noise: number) {
  const bulgeT = Math.sin(Math.PI * t) * bulge
  const n = (Math.sin(t * 10.5 + 0.6) * 0.75 + Math.sin(t * 24.0 + 1.9) * 0.45) * noise
  return Math.max(PATH_WIDTH * 0.6, baseHalfWidth + bulgeT + n)
}

function makeIslandShape(
  curve: THREE.CatmullRomCurve3,
  options: { segments: number; capSegments: number; baseHalfWidth: number; bulge: number; noise: number }
) {
  const left: THREE.Vector2[] = []
  const right: THREE.Vector2[] = []

  const point = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const perp = new THREE.Vector3()

  for (let i = 0; i <= options.segments; i += 1) {
    const t = options.segments === 0 ? 0 : i / options.segments
    curve.getPointAt(t, point)
    curve.getTangentAt(t, tangent)
    getFlatTangent(tangent)
    perp.set(-tangent.z, 0, tangent.x)

    const halfWidth = halfWidthAt(t, options.baseHalfWidth, options.bulge, options.noise)

    const lx = point.x + perp.x * halfWidth
    const lz = point.z + perp.z * halfWidth
    const rx = point.x - perp.x * halfWidth
    const rz = point.z - perp.z * halfWidth

    left.push(new THREE.Vector2(lx, -lz))
    right.push(new THREE.Vector2(rx, -rz))
  }

  const shape = new THREE.Shape()
  if (left.length === 0) return shape

  shape.moveTo(left[0].x, left[0].y)
  for (let i = 1; i < left.length; i += 1) {
    shape.lineTo(left[i].x, left[i].y)
  }

  curve.getPointAt(1, point)
  curve.getTangentAt(1, tangent)
  getFlatTangent(tangent)
  perp.set(-tangent.z, 0, tangent.x)

  const halfWidthEnd = halfWidthAt(1, options.baseHalfWidth, options.bulge, options.noise)
  const capDirEnd = tangent.clone()

  for (let j = 1; j <= options.capSegments; j += 1) {
    const a = (j / options.capSegments) * Math.PI
    const cx = point.x + perp.x * halfWidthEnd * Math.cos(a) + capDirEnd.x * halfWidthEnd * Math.sin(a)
    const cz = point.z + perp.z * halfWidthEnd * Math.cos(a) + capDirEnd.z * halfWidthEnd * Math.sin(a)
    shape.lineTo(cx, -cz)
  }

  for (let i = right.length - 2; i >= 0; i -= 1) {
    shape.lineTo(right[i].x, right[i].y)
  }

  curve.getPointAt(0, point)
  curve.getTangentAt(0, tangent)
  getFlatTangent(tangent)
  perp.set(-tangent.z, 0, tangent.x)

  const halfWidthStart = halfWidthAt(0, options.baseHalfWidth, options.bulge, options.noise)
  const capDirStart = tangent.clone().multiplyScalar(-1)

  for (let j = 1; j <= options.capSegments; j += 1) {
    const a = Math.PI - (j / options.capSegments) * Math.PI
    const cx = point.x + perp.x * halfWidthStart * Math.cos(a) + capDirStart.x * halfWidthStart * Math.sin(a)
    const cz = point.z + perp.z * halfWidthStart * Math.cos(a) + capDirStart.z * halfWidthStart * Math.sin(a)
    shape.lineTo(cx, -cz)
  }

  shape.closePath()
  return shape
}

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

function makePathRibbonGeometry(
  curve: THREE.CatmullRomCurve3,
  width: number,
  segments: number,
  yOffset: number,
  worldScale: number,
  startT = 0,
  endT = 1,
  heightAt?: (x: number, z: number) => number
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
  const backOffset = CAMERA_BACK_OFFSET_WORLD / worldScale
  const leftOffset = CAMERA_LEFT_OFFSET_WORLD / worldScale

  for (let i = 0; i <= segments; i += 1) {
    const u = segments === 0 ? 0 : i / segments
    const t = startT + (endT - startT) * u
    curve.getPointAt(t, point)
    curve.getTangentAt(t, tangent)
    getFlatTangent(tangent)

    side.set(tangent.z, 0, -tangent.x)
    point.x -= tangent.x * backOffset
    point.z -= tangent.z * backOffset
    point.addScaledVector(side, leftOffset)

    perp.set(-tangent.z, 0, tangent.x)

    const lx = point.x + perp.x * halfW
    const lz = point.z + perp.z * halfW
    const rx = point.x - perp.x * halfW
    const rz = point.z - perp.z * halfW

    const v = u
    const baseV = i * 2
    const ly = heightAt ? heightAt(lx, lz) : surfaceHeight(lx, lz, worldScale)
    const ry = heightAt ? heightAt(rx, rz) : surfaceHeight(rx, rz, worldScale)

    positions[baseV * 3 + 0] = lx
    positions[baseV * 3 + 1] = ly + yOffset
    positions[baseV * 3 + 2] = lz

    positions[(baseV + 1) * 3 + 0] = rx
    positions[(baseV + 1) * 3 + 1] = ry + yOffset
    positions[(baseV + 1) * 3 + 2] = rz

    uvs[baseV * 2 + 0] = 0
    uvs[baseV * 2 + 1] = v
    uvs[(baseV + 1) * 2 + 0] = 1
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
  applyUv2(geo)
  return geo
}

function makeTerrainGeometry(shape: THREE.Shape, worldScale: number) {
  const depth = EARTH_TOP_DEPTH
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: 2.1,
    bevelSize: 1.6,
    bevelSegments: 3
  })

  geo.rotateX(-Math.PI / 2)
  geo.translate(0, -depth / 2, 0)

  const positions = geo.attributes.position.array as Float32Array
  for (let i = 0; i < positions.length; i += 3) {
    const y = positions[i + 1]
    if (y > 0) {
      const x = positions[i]
      const z = positions[i + 2]
      positions[i + 1] += surfaceHeight(x, z, worldScale)
    }
  }

  geo.computeVertexNormals()
  applyPlanarUvXZ(geo)
  applyUv2(geo)
  return geo
}

function Terrain({ ground, topY, geometry }: { ground: PbrTextureSet; topY: number; geometry: THREE.BufferGeometry }) {
  return (
    <mesh geometry={geometry} position={[0, topY - EARTH_TOP_DEPTH / 2, 0]} castShadow receiveShadow userData={{ isGround: true }}>
      <meshStandardMaterial
        map={ground.map}
        normalMap={ground.normalMap}
        aoMap={ground.armMap}
        aoMapIntensity={0.35}
        roughnessMap={ground.armMap}
        metalnessMap={ground.armMap}
        color="#d9f2d3"
        roughness={1}
        metalness={0}
      />
    </mesh>
  )
}

function CliffBase({ rock, topY, geometry }: { rock: PbrTextureSet; topY: number; geometry: THREE.BufferGeometry }) {
  const y = topY - EARTH_TOP_DEPTH - EARTH_CLIFF_DEPTH / 2

  return (
    <mesh geometry={geometry} position={[0, y, 0]} castShadow receiveShadow userData={{ isGround: true }}>
      <meshStandardMaterial
        map={rock.map}
        normalMap={rock.normalMap}
        aoMap={rock.armMap}
        aoMapIntensity={0.55}
        roughnessMap={rock.armMap}
        metalnessMap={rock.armMap}
        color="#c8d2e1"
        roughness={1}
        metalness={0}
      />
    </mesh>
  )
}

function PathSurface({
  ground,
  topY,
  geometry
}: {
  ground: PbrTextureSet
  topY: number
  geometry: THREE.BufferGeometry
}) {
  return (
    <mesh geometry={geometry} position={[0, topY, 0]} receiveShadow userData={{ isGround: true }} frustumCulled={false}>
      <meshStandardMaterial
        map={ground.map}
        normalMap={ground.normalMap}
        aoMap={ground.armMap}
        aoMapIntensity={0.25}
        roughnessMap={ground.armMap}
        metalnessMap={ground.armMap}
        color="#d1d1d1"
        roughness={0.92}
        metalness={0}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}

function TexturedIslandCore({
  topY,
  terrainGeometry,
  cliffGeometry,
  mainPathGeometry,
  branchPathGeometryA,
  branchPathGeometryB,
  onReady
}: {
  topY: number
  terrainGeometry: THREE.BufferGeometry
  cliffGeometry: THREE.BufferGeometry
  mainPathGeometry: THREE.BufferGeometry
  branchPathGeometryA: THREE.BufferGeometry
  branchPathGeometryB: THREE.BufferGeometry
  onReady?: () => void
}) {
  const terrainPbr = useTiledPbrTextureSet("sparseGrass", [8, 42])
  const cliffPbr = useTiledPbrTextureSet("cliffSide", [2.0, 10])
  const pathPbr = useTiledPbrTextureSet("cobblestonePavement", [2, 34])

  useEffect(() => {
    if (!onReady) return
    onReady()
  }, [onReady])

  return (
    <>
      <CliffBase rock={cliffPbr} topY={topY} geometry={cliffGeometry} />
      <Terrain ground={terrainPbr} topY={topY} geometry={terrainGeometry} />
      <PathSurface ground={pathPbr} topY={topY} geometry={mainPathGeometry} />
      <PathSurface ground={pathPbr} topY={topY} geometry={branchPathGeometryA} />
      <PathSurface ground={pathPbr} topY={topY} geometry={branchPathGeometryB} />
    </>
  )
}

function PathStones({
  routeCurve,
  branchCurveA,
  branchCurveB,
  worldScale,
  sampleGroundY
}: {
  routeCurve: THREE.CatmullRomCurve3
  branchCurveA: THREE.CatmullRomCurve3
  branchCurveB: THREE.CatmullRomCurve3
  worldScale: number
  sampleGroundY: (x: number, z: number) => number
}) {
  const fitHeight = 0.55
  const { scene: mainScene } = useGLTF(MODEL_PATHS.earth.polypizzaPathRoundWide)
  const { scene: branchScene } = useGLTF(MODEL_PATHS.earth.polypizzaPathSquareSmall)

  const mainSegmentLength = useMemo(() => {
    mainScene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(mainScene)
    const size = new THREE.Vector3()
    box.getSize(size)

    const sizeY = size.y > 0 ? size.y : 1
    const baseScale = fitHeight / sizeY
    const forwardSize = size.z > 0 ? size.z : 1
    return Math.max(0.001, forwardSize * baseScale)
  }, [fitHeight, mainScene])

  const branchSegmentLength = useMemo(() => {
    branchScene.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(branchScene)
    const size = new THREE.Vector3()
    box.getSize(size)

    const sizeY = size.y > 0 ? size.y : 1
    const baseScale = fitHeight / sizeY
    const forwardSize = size.z > 0 ? size.z : 1
    return Math.max(0.001, forwardSize * baseScale)
  }, [branchScene, fitHeight])

  const buildInstances = useMemo(() => {
    type Instance = { position: [number, number, number]; rotation: [number, number, number]; scale: number }

    return (curves: THREE.CatmullRomCurve3[], spacing: number, trim: number): Instance[] => {
      const instances: Instance[] = []
      const point = new THREE.Vector3()
      const pointAhead = new THREE.Vector3()
      const pointBehind = new THREE.Vector3()
      const tangent = new THREE.Vector3()
      const perp = new THREE.Vector3()
      const sideVec = new THREE.Vector3()

      const startT = trim
      const endT = 1 - trim

      const staggerOffsets = [0, 0.48]

      for (const curve of curves) {
        const curveLength = curve.getLength()
        const count = Math.max(3, Math.ceil(curveLength / spacing))
        for (const offsetFactor of staggerOffsets) {
          for (let i = 0; i < count; i += 1) {
            const baseU = count <= 1 ? 0.5 : i / (count - 1)
            const u = baseU + offsetFactor / count
            if (u < 0 || u > 1) continue
            const t = startT + (endT - startT) * u
            getTrackFrameAt(curve, t, point, tangent, perp, sideVec, worldScale)

            const lateral = offsetFactor === 0 ? -0.24 : 0.24
            point.addScaledVector(perp, lateral)

            const x = point.x
            const z = point.z
            const rotY = Math.atan2(tangent.x, tangent.z)

            const pitchDt = 0.01
            const tBehind = Math.max(startT, t - pitchDt)
            const tAhead = Math.min(endT, t + pitchDt)

            getTrackFrameAt(curve, tBehind, pointBehind, tangent, perp, sideVec, worldScale)
            const yBehind = sampleGroundY(pointBehind.x, pointBehind.z) + PATH_Y_OFFSET - 0.02

            getTrackFrameAt(curve, tAhead, pointAhead, tangent, perp, sideVec, worldScale)
            const yAhead = sampleGroundY(pointAhead.x, pointAhead.z) + PATH_Y_OFFSET - 0.02

            const dx = pointAhead.x - pointBehind.x
            const dz = pointAhead.z - pointBehind.z
            const dy = yAhead - yBehind
            const horizLen = Math.max(1e-6, Math.sqrt(dx * dx + dz * dz))
            const pitch = clamp(-Math.atan2(dy, horizLen), -0.35, 0.35)

            const y = sampleGroundY(x, z) + PATH_Y_OFFSET - 0.02
            const scale = offsetFactor === 0 ? 1.02 : 0.98
            instances.push({ position: [x, y, z], rotation: [pitch, rotY, 0], scale })
          }
        }
      }

      return instances
    }
  }, [sampleGroundY, worldScale])

  const mainInstances = useMemo(() => {
    const overlap = 0.22
    const spacing = Math.max(0.001, mainSegmentLength * overlap)
    return buildInstances([routeCurve], spacing, 0).map((instance) => ({
      ...instance,
      scale: 1.12
    }))
  }, [buildInstances, mainSegmentLength, routeCurve])

  const branchInstances = useMemo(() => {
    const overlap = 0.26
    const spacing = Math.max(0.001, branchSegmentLength * overlap)
    return buildInstances([branchCurveA, branchCurveB], spacing, 0).map((instance) => ({
      ...instance,
      scale: 1.1
    }))
  }, [branchCurveA, branchCurveB, branchSegmentLength, buildInstances])

  return (
    <>
      <InstancedGltfModel
        path={MODEL_PATHS.earth.polypizzaPathRoundWide}
        fitHeight={fitHeight}
        instances={mainInstances}
        castShadow={false}
        receiveShadow={false}
      />
      <InstancedGltfModel
        path={MODEL_PATHS.earth.polypizzaPathSquareSmall}
        fitHeight={fitHeight}
        instances={branchInstances}
        castShadow={false}
        receiveShadow={false}
      />
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

  const islandCurve = useMemo(() => {
    const points = EARTH_ROUTE_POINTS.map((p) => new THREE.Vector3(p[0] / config.scale, p[1] / config.scale, p[2] / config.scale))
    const bendAmp = ISLAND_BEND_AMPLITUDE_WORLD / config.scale
    const count = points.length

    for (let i = 0; i < count; i += 1) {
      const u = count <= 1 ? 0.5 : i / (count - 1)
      points[i].x += Math.sin(u * Math.PI) * bendAmp
    }

    const extension = ISLAND_ROUTE_EXTENSION_WORLD / config.scale
    const extended = extendRoute(points, extension)
    return new THREE.CatmullRomCurve3(extended, false, "catmullrom", 0.5)
  }, [config.scale])

  const terrainShape = useMemo(() => {
    return makeIslandShape(islandCurve, {
      segments: TERRAIN_SHAPE_SEGMENTS,
      capSegments: TERRAIN_CAP_SEGMENTS,
      baseHalfWidth: TERRAIN_BASE_HALF_WIDTH,
      bulge: TERRAIN_BULGE,
      noise: TERRAIN_NOISE
    })
  }, [islandCurve])

  const terrainGeometry = useMemo(() => {
    const geo = makeTerrainGeometry(terrainShape, config.scale)
    applyRadialGradientXZ(geo, "#40d9b7", "#06110d")
    return geo
  }, [config.scale, terrainShape])

  const sampleSurfaceOffsetY = useMemo(() => {
    return (x: number, z: number) => surfaceHeight(x, z, config.scale)
  }, [config.scale])

  const sampleGroundY = useMemo(() => {
    const mesh = new THREE.Mesh(terrainGeometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
    mesh.position.set(0, topY - EARTH_TOP_DEPTH / 2, 0)
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
    return terrainShape.getPoints(360)
  }, [terrainShape])

  const terrainCentroid = useMemo(() => {
    const count = terrainBoundary.length
    if (count === 0) return { x: 0, z: 0 }

    let sumX = 0
    let sumY = 0
    for (const p of terrainBoundary) {
      sumX += p.x
      sumY += p.y
    }

    const cx = sumX / count
    const cz = -sumY / count
    return { x: cx, z: cz }
  }, [terrainBoundary])

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

  const branchRoadCurves = useMemo(() => {
    const curveA = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(60 / config.scale, 0, -30 / config.scale),
        new THREE.Vector3(30 / config.scale, 0, 0),
        new THREE.Vector3(5 / config.scale, 0, 20 / config.scale)
      ],
      false,
      "catmullrom",
      0.5
    )

    const curveB = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(5 / config.scale, 0, 20 / config.scale),
        new THREE.Vector3(-25 / config.scale, 0, 10 / config.scale),
        new THREE.Vector3(-60 / config.scale, 0, 30 / config.scale)
      ],
      false,
      "catmullrom",
      0.5
    )

    return { curveA, curveB }
  }, [config.scale])

  const mainPathGeometry = useMemo(() => {
    return makePathRibbonGeometry(routeCurve, PATH_WIDTH, PATH_RIBBON_SEGMENTS, PATH_Y_OFFSET, config.scale)
  }, [config.scale, routeCurve])

  const branchPathGeometryA = useMemo(() => {
    return makePathRibbonGeometry(branchRoadCurves.curveA, PATH_WIDTH * 0.72, 64, PATH_Y_OFFSET + 0.02, config.scale, 0, 1, sampleSurfaceOffsetY)
  }, [branchRoadCurves, config.scale, sampleSurfaceOffsetY])

  const branchPathGeometryB = useMemo(() => {
    return makePathRibbonGeometry(branchRoadCurves.curveB, PATH_WIDTH * 0.66, 72, PATH_Y_OFFSET + 0.02, config.scale, 0, 1, sampleSurfaceOffsetY)
  }, [branchRoadCurves, config.scale, sampleSurfaceOffsetY])

  const cliffShape = useMemo(() => {
    return makeIslandShape(islandCurve, {
      segments: CLIFF_SHAPE_SEGMENTS,
      capSegments: CLIFF_CAP_SEGMENTS,
      baseHalfWidth: CLIFF_BASE_HALF_WIDTH,
      bulge: CLIFF_BULGE,
      noise: CLIFF_NOISE
    })
  }, [islandCurve])

  const cliffGeometry = useMemo(() => {
    const depth = EARTH_CLIFF_DEPTH
    const geo = new THREE.ExtrudeGeometry(cliffShape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 3.4,
      bevelSize: 2.8,
      bevelSegments: 3
    })

    geo.rotateX(-Math.PI / 2)
    geo.translate(0, -depth / 2, 0)

    const positions = geo.attributes.position.array as Float32Array
    for (let i = 0; i < positions.length; i += 3) {
      const y = positions[i + 1]
      const x = positions[i]
      const z = positions[i + 2]
      if (y > depth / 2 - 0.25) continue
      positions[i] += Math.sin(z * 0.08) * 0.35 * Math.cos(y * 0.2)
      positions[i + 2] += Math.sin(x * 0.08) * 0.35 * Math.cos(y * 0.2)
    }

    geo.computeVertexNormals()
    applyPlanarUvXZ(geo)
    applyUv2(geo)
    applyHeightGradient(geo, "#6b7f9c", "#0b1220")
    return geo
  }, [cliffShape])

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
    const count = 10
    const publicationsStartT = EARTH_SECTION_T_STOPS[1]
    const publicationsEndT = EARTH_SECTION_T_STOPS[2]

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

    const startT = EARTH_SECTION_T_STOPS[1] + 0.04
    const endT = EARTH_SECTION_T_STOPS[2] - 0.04

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
    const count = 9

    const point = new THREE.Vector3()
    const tangent = new THREE.Vector3()
    const perp = new THREE.Vector3()
    const sideVec = new THREE.Vector3()

    const startT = EARTH_SECTION_T_STOPS[3] + 0.04
    const endT = EARTH_SECTION_T_STOPS[4] - 0.05
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

    const startT = EARTH_SECTION_T_STOPS[3] + 0.03
    const endT = EARTH_SECTION_T_STOPS[4] - 0.03

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
          mainPathGeometry={mainPathGeometry}
          branchPathGeometryA={branchPathGeometryA}
          branchPathGeometryB={branchPathGeometryB}
          onReady={markTexturedReady}
        />
      </Suspense>

      {showProps ? (
        <Suspense fallback={null}>
          <PathStones
            routeCurve={routeCurve}
            branchCurveA={branchRoadCurves.curveA}
            branchCurveB={branchRoadCurves.curveB}
            worldScale={config.scale}
            sampleGroundY={sampleGroundY}
          />

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
            fitHeight={4.2}
            castShadow={false}
            receiveShadow={false}
            instances={publicationsStumpInstances}
          />

          <InstancedGltfModel
            path={MODEL_PATHS.earth.hqTree}
            fitHeight={18}
            castShadow={false}
            receiveShadow={false}
            instances={projectTreeInstances}
          />

          <InstancedGltfModel
            path={MODEL_PATHS.earth.hqFern}
            fitHeight={1.3}
            castShadow={false}
            receiveShadow={false}
            instances={projectFernInstances}
          />

          <InstancedGltfModel
            path={MODEL_PATHS.earth.cypressTree}
            fitHeight={20}
            castShadow={false}
            receiveShadow={false}
            instances={cypressInstances}
          />

          <InstancedGltfModel
            path={MODEL_PATHS.earth.flowerBushes}
            fitHeight={1.55}
            castShadow={false}
            receiveShadow={false}
            instances={flowerBushInstances}
          />

          <InstancedGltfModel
            path={MODEL_PATHS.earth.flowers}
            fitHeight={1.1}
            castShadow={false}
            receiveShadow={false}
            instances={flowerInstances}
          />

          <InstancedGltfModel
            path={MODEL_PATHS.earth.hqBoulder}
            fitHeight={2.9}
            instances={rockInstances}
          />

          <InstancedGltfModel
            path={MODEL_PATHS.earth.hqGrassMedium01}
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



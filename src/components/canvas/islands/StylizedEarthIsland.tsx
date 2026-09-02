import { Suspense, useCallback, useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { EARTH_ISLAND, EARTH_ROUTE_POINTS } from "@/config"
import type { PbrTextureSet } from "@/hooks/usePbrTextureSet"
import { GltfModel } from "@/components/canvas/models/GltfModel"
import { useTiledPbrTextureSet } from "@/hooks/useTiledPbrTextureSet"
import { InstancedGltfModel } from "@/components/canvas/models/InstancedGltfModel"
import { useWorldStore } from "@/store/worldStore"
import { ENV_MAP_INTENSITY } from "@/hooks/useRealtimeMaterials"
import {
  BRANCH_WIDTH,
  ISLAND_DEPTH,
  PATH_RIBBON_SEGMENTS,
  PATH_WIDTH,
  PATH_Y_OFFSET,
  SIDE_ROAD_Y_OFFSET,
  buildIslandOutline,
  junctionPoints,
  makeCliffGeometry,
  makeIslandTopGeometry,
  makePathRibbonGeometry,
  makeSideRoadCurve,
  sampleRoadNetwork,
  surfaceHeight,
  trackPointAt
} from "./islandGeometry"
import { buildVillageLayout } from "./villageLayout"

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
  // Scanned vegetation, rocks, and the harbor are decoration: they mount once the textured island
  // and its buildings are in, so the loading screen only waits for the core scene.
  const decorationsReady = useWorldStore((state) => state.isEarthTexturedReady)
  const texturedReadyRef = useRef(false)
  const markTexturedReady = useCallback(() => {
    if (texturedReadyRef.current) return
    texturedReadyRef.current = true
    useWorldStore.getState().setEarthTexturedReady(true)
  }, [])

  const topY = 14 + 0.02 / config.scale

  // The camera walks the road, so it samples the analytic surface plus the road offset; this
  // replaces per-frame raycasts against the 25k-triangle terrain that made transitions stutter.
  useEffect(() => {
    const s = config.scale
    useWorldStore.getState().setGroundHeightSampler((x, z) => (topY + surfaceHeight(x / s, z / s, s) + PATH_Y_OFFSET) * s)
    return () => useWorldStore.getState().setGroundHeightSampler(null)
  }, [config.scale, topY])

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

  // Props sit on the rendered terrain mesh (raycast once at build time, cached per half unit).
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
      if (cache.size > 4800) cache.clear()

      return y
    }
  }, [config.scale, terrainGeometry, topY])

  // Side roads start and end on the drawn main road so the network reads as one connected loop:
  // a cross-island branch between the east and west sides, and a short link closing the loop's ends.
  const roads = useMemo(() => {
    const s = config.scale
    const interior = [new THREE.Vector3(24, 0, 10), new THREE.Vector3(-6, 0, 6), new THREE.Vector3(-30, 0, 4)]
    const east = junctionPoints(routeCurve, 0.385, s, interior[0])
    const west = junctionPoints(routeCurve, 0.735, s, interior[interior.length - 1])
    const branchCurve = makeSideRoadCurve([east.onRoad, east.approach, ...interior, west.approach, west.onRoad])

    const startLane = trackPointAt(routeCurve, 0.006, s)
    const endLane = trackPointAt(routeCurve, 0.995, s)
    const from = junctionPoints(routeCurve, 0.995, s, startLane)
    const to = junctionPoints(routeCurve, 0.006, s, endLane)
    const loopLinkCurve = makeSideRoadCurve([from.onRoad, from.approach, to.approach, to.onRoad])

    const specs = [
      { curve: routeCurve, halfWidth: PATH_WIDTH / 2, followCameraTrack: true },
      { curve: branchCurve, halfWidth: BRANCH_WIDTH / 2, followCameraTrack: false },
      { curve: loopLinkCurve, halfWidth: BRANCH_WIDTH / 2, followCameraTrack: false }
    ]

    return {
      geometries: [
        makePathRibbonGeometry(routeCurve, PATH_WIDTH, PATH_RIBBON_SEGMENTS, PATH_Y_OFFSET, s, true),
        makePathRibbonGeometry(branchCurve, BRANCH_WIDTH, 96, SIDE_ROAD_Y_OFFSET, s, false),
        makePathRibbonGeometry(loopLinkCurve, BRANCH_WIDTH, 32, SIDE_ROAD_Y_OFFSET, s, false)
      ],
      samples: sampleRoadNetwork(specs, s)
    }
  }, [config.scale, routeCurve])

  const layout = useMemo(() => {
    if (!showProps) return null
    return buildVillageLayout({ routeCurve, outline, roads: roads.samples, worldScale: config.scale, sampleGroundY })
  }, [config.scale, outline, roads.samples, routeCurve, sampleGroundY, showProps])

  return (
    <group name="Island-earth" position={[config.position[0], config.position[1], config.position[2]]} rotation={config.rotation} scale={config.scale}>
      <Suspense fallback={null}>
        <TexturedIslandCore
          topY={topY}
          terrainGeometry={terrainGeometry}
          cliffGeometry={cliffGeometry}
          pathGeometries={roads.geometries}
          onReady={markTexturedReady}
        />
      </Suspense>

      {layout ? (
        <Suspense fallback={null}>
          {[...layout.buildings, ...layout.props].map((p) => (
            <GltfModel
              key={p.key}
              path={p.path}
              position={p.position}
              rotation={p.rotation}
              fitHeight={p.fitHeight}
              scale={p.scale}
              pivot={p.pivot}
            />
          ))}
        </Suspense>
      ) : null}

      {layout && decorationsReady ? (
        <Suspense fallback={null}>
          {layout.harbor.map((p) => (
            <GltfModel
              key={p.key}
              path={p.path}
              position={p.position}
              rotation={p.rotation}
              fitHeight={p.fitHeight}
              scale={p.scale}
              pivot={p.pivot}
            />
          ))}

          {layout.instanced.map((group) => (
            <InstancedGltfModel
              key={group.key}
              path={group.path}
              meshName={group.meshName}
              fitHeight={group.fitHeight}
              instances={group.instances}
              castShadow={group.castShadow}
              receiveShadow={false}
              excludeFromReflection={group.excludeFromReflection}
            />
          ))}
        </Suspense>
      ) : null}
    </group>
  )
}

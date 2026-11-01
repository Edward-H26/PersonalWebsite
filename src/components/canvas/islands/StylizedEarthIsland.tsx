import { Suspense, useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { GltfModel } from "@/components/canvas/models/GltfModel"
import { InstancedGltfModel } from "@/components/canvas/models/InstancedGltfModel"
import { useVegetationMaterials } from "@/components/canvas/models/vegetationMaterials"
import { useWorldStore } from "@/store/worldStore"
import { buildIslandLayout } from "./layout"
import { islandOverviewScene } from "./layout/overview"
import { RoadLanterns } from "./RoadLanterns"
import { TerrainGround } from "./terrain/TerrainGround"
import { TerrainSite } from "./terrain/terrainSite"
import { useTerrain } from "./terrain/useTerrain"
import type { InstancedGroup, Placement } from "./village/types"
import { WaterWheel } from "./WaterWheel"

/** The instanced plants, rocks and props; plants and rocks draw with their family's shared atlas material. */
function Instances({ groups }: { groups: readonly InstancedGroup[] }) {
  const vegetation = useVegetationMaterials()
  return (
    <>
      {groups.map((group) => (
        <InstancedGltfModel
          key={group.key}
          path={group.path}
          fitHeight={group.fitHeight}
          instances={group.instances}
          castShadow={group.castShadow}
          receiveShadow={false}
          excludeFromReflection={group.excludeFromReflection}
          materialOverrides={vegetation.materials}
          depthMaterialOverrides={vegetation.depthMaterials}
        />
      ))}
    </>
  )
}

function Models({ placements }: { placements: readonly Placement[] }) {
  return (
    <>
      {placements.map((p) => (
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
    </>
  )
}

/** The island built from its terrain, publishing the ground, the walk and the overview's scene for the camera. */
function IslandFromTerrain() {
  const terrain = useTerrain()
  const site = useMemo(() => new TerrainSite(terrain), [terrain])
  const layout = useMemo(() => buildIslandLayout(site), [site])

  useEffect(() => {
    const store = useWorldStore.getState()
    store.setGroundHeightSampler(terrain.groundHeightAt)
    store.setWalkRoute(terrain.walk)
    store.setOverviewScene(islandOverviewScene(site, layout.harbor))
    return () => {
      store.setGroundHeightSampler(null)
      store.setWalkRoute(null)
      store.setOverviewScene(null)
    }
  }, [terrain, site, layout])

  return (
    <>
      <TerrainGround map={terrain.data.map} />
      <Models placements={layout.placements} />
      <Instances groups={layout.instanced} />
      <RoadLanterns lanterns={layout.lanterns} />
      <WaterWheel wheel={layout.wheel} />
    </>
  )
}

// Rendered last inside the island's Suspense boundary, so it only mounts once every texture and
// model in the boundary has loaded; it then reports the island as ready after two drawn frames, and
// the loading screen waits for that flag rather than for the first batch of downloads.
function SceneReadyBeacon() {
  const framesRef = useRef(0)

  useFrame(() => {
    if (framesRef.current >= 2) return
    framesRef.current += 1
    if (framesRef.current === 2) useWorldStore.getState().setEarthSceneReady(true)
  })

  return null
}

/** The island of DESIGN.md section 17: terrain, roads, village and landmarks, all placed from terrain.json. */
export function StylizedEarthIsland() {
  return (
    <group name="Island-earth">
      <Suspense fallback={null}>
        <IslandFromTerrain />
        <SceneReadyBeacon />
      </Suspense>
    </group>
  )
}

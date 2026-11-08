import { useEffect, useMemo } from "react"
import { createStillWaterMaterial } from "@/components/canvas/environment/streamShader"
import { GltfModel, type MaterialOverrides } from "@/components/canvas/models/GltfModel"
import { InstancedGltfModel } from "@/components/canvas/models/InstancedGltfModel"
import { useVegetationMaterials } from "@/components/canvas/models/vegetationMaterials"
import { useWorldStore } from "@/store/worldStore"
import { IslandAssetsProvider } from "./assets/IslandAssetsContext"
import type { IslandAssets } from "./assets/islandAssets"
import { RoadLanterns } from "./RoadLanterns"
import { Rotor } from "./Rotor"
import { StreamWater } from "./StreamWater"
import { TerrainGround } from "./terrain/TerrainGround"
import type { InstancedGroup, Placement } from "./village/types"

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
          culling={group.culling}
          materialOverrides={vegetation.materials}
          depthMaterialOverrides={vegetation.depthMaterials}
        />
      ))}
    </>
  )
}

function Models({ placements, materialOverrides }: { placements: readonly Placement[]; materialOverrides: MaterialOverrides }) {
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
          materialOverrides={materialOverrides}
        />
      ))}
    </>
  )
}

/** The island of DESIGN.md section 17: terrain, roads, village and landmarks, all placed from terrain.json, publishing the ground, the walk and the overview's scene for the camera. */
export function StylizedEarthIsland({ assets }: { assets: IslandAssets }) {
  const { terrain, layout, overview } = assets
  // The watermill's pond takes the stream's water, standing still, in place of its own flat colour.
  const stillWater = useMemo(() => createStillWaterMaterial(), [])
  const waterOverrides = useMemo(() => ({ isl_pond_water: stillWater }), [stillWater])
  useEffect(() => () => stillWater.dispose(), [stillWater])

  useEffect(() => {
    const store = useWorldStore.getState()
    store.setGroundHeightSampler(terrain.groundHeightAt)
    store.setWalkRoute(terrain.walk)
    store.setOverviewScene(overview)
    return () => {
      store.setGroundHeightSampler(null)
      store.setWalkRoute(null)
      store.setOverviewScene(null)
    }
  }, [terrain, overview])

  return (
    <group name="Island-earth">
      <IslandAssetsProvider value={assets}>
        <TerrainGround map={terrain.data.map} />
        <StreamWater terrain={terrain} />
        <Models placements={layout.placements} materialOverrides={waterOverrides} />
        <Instances groups={layout.instanced} />
        <RoadLanterns lanterns={layout.lanterns} />
        {layout.rotors.map((rotor) => (
          <Rotor key={rotor.key} rotor={rotor} />
        ))}
      </IslandAssetsProvider>
    </group>
  )
}

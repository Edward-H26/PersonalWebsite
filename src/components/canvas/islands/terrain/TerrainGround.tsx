import { useGLTF } from "@react-three/drei"
import { useLoader, useThree } from "@react-three/fiber"
import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { useRockAtlas } from "@/components/canvas/models/vegetationMaterials"
import { islandAtlas, islandModel } from "@/config/modelPaths"
import { GROUND_LAYERS, GROUND_TEXTURES, type GroundLayer, type GroundLayerName, createGroundMaterial, paintMeans } from "./groundMaterial"
import { type MapFrame, mapToScene } from "./terrainData"

const TEXTURE_URLS = GROUND_LAYERS.map((name) => islandAtlas(GROUND_TEXTURES[name].atlas))

// The village terraces, where the roads are cobbled (DESIGN.md section 17): a circle round (440, 445)
// on the map, cobbles out to 110 px and gravel past 170 px.
const VILLAGE_CENTRE_PX = [440, 445] as const
const COBBLES_TO_PX = 110
const GRAVEL_FROM_PX = 170

/** Anisotropic filtering keeps the ground crisp at the walk's grazing angles. */
const MAX_ANISOTROPY = 8
/** The island's ground: terrain.glb in metres, scaled into the scene and drawn with the splat material in one call. */
export function TerrainGround({ map }: { map: MapFrame }) {
  const { scene } = useGLTF(islandModel("terrain"))
  const textures = useLoader(THREE.TextureLoader, TEXTURE_URLS)
  const rock = useRockAtlas()
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy())

  const geometry = useMemo(() => {
    let found: THREE.BufferGeometry | null = null
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) found = object.geometry
    })
    if (!found) throw new Error("terrain.glb holds no mesh")
    return found as THREE.BufferGeometry
  }, [scene])

  const material = useMemo(() => {
    const layers = Object.fromEntries(
      GROUND_LAYERS.map((name, i) => {
        const map = textures[i]
        map.colorSpace = THREE.SRGBColorSpace
        map.wrapS = map.wrapT = THREE.RepeatWrapping
        map.anisotropy = Math.min(maxAnisotropy, MAX_ANISOTROPY)
        map.needsUpdate = true
        return [name, { map, tileMetres: GROUND_TEXTURES[name].tileMetres }]
      })
    ) as Record<GroundLayerName, GroundLayer>
    const [x, , z] = mapToScene(map, ...VILLAGE_CENTRE_PX)
    const cobbles = { centre: new THREE.Vector2(x, z), inner: COBBLES_TO_PX * map.unitsPerPx, outer: GRAVEL_FROM_PX * map.unitsPerPx }
    return createGroundMaterial(layers, rock, paintMeans(geometry), cobbles, map.unitsPerMetre)
  }, [textures, rock, maxAnisotropy, map, geometry])

  useEffect(() => () => material.dispose(), [material])

  return (
    <mesh
      name="island-ground"
      geometry={geometry}
      material={material}
      scale={map.unitsPerMetre}
      castShadow
      receiveShadow
      userData={{ isGround: true }}
    />
  )
}

import { GroupProps } from "@react-three/fiber"
import { useMemo } from "react"
import { Box3, type Material, Mesh, Object3D, SkinnedMesh, Vector3 } from "three"
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js"
import { useIslandModel } from "@/components/canvas/islands/assets/IslandAssetsContext"
import { useRealtimeMaterials } from "@/hooks/useRealtimeMaterials"
import { REFLECTION_EXCLUDED_LAYER } from "@/config/renderLayers"

type Pivot = "origin" | "center" | "center-bottom"

/** Materials to draw in place of a model's own, by the name the model gives its material. */
export type MaterialOverrides = Readonly<Record<string, Material>>

interface GltfModelProps extends Omit<GroupProps, "scale"> {
  path: string
  fitHeight?: number
  pivot?: Pivot
  castShadow?: boolean
  receiveShadow?: boolean
  scale?: number
  excludeFromReflection?: boolean
  /** Materials swapped in by name on this copy only, such as a clone the caller animates per instance. */
  materialOverrides?: MaterialOverrides
}

type SceneBounds = {
  sizeY: number
  centerX: number
  centerY: number
  centerZ: number
  minY: number
}

const sceneBoundsCache = new Map<string, SceneBounds>()
const sceneHasSkinCache = new Map<string, boolean>()

function getSceneBounds(path: string, scene: Object3D): SceneBounds {
  const cached = sceneBoundsCache.get(path)
  if (cached) return cached

  const box = new Box3().setFromObject(scene)
  const size = new Vector3()
  const center = new Vector3()
  box.getSize(size)
  box.getCenter(center)

  const bounds: SceneBounds = {
    sizeY: size.y,
    centerX: center.x,
    centerY: center.y,
    centerZ: center.z,
    minY: box.min.y
  }

  sceneBoundsCache.set(path, bounds)
  return bounds
}

function hasSkinnedMesh(path: string, scene: Object3D) {
  const cached = sceneHasSkinCache.get(path)
  if (cached != null) return cached

  let found = false
  scene.traverse((obj) => {
    if (obj instanceof SkinnedMesh) found = true
  })

  sceneHasSkinCache.set(path, found)
  return found
}

export function GltfModel({
  path,
  fitHeight,
  pivot = "center-bottom",
  castShadow = true,
  receiveShadow = true,
  scale = 1,
  excludeFromReflection = false,
  materialOverrides,
  ...props
}: GltfModelProps) {
  const scene = useIslandModel(path)
  useRealtimeMaterials(scene)

  const object = useMemo(() => {
    const baseBounds = getSceneBounds(path, scene)
    const shouldUseSkeletonClone = hasSkinnedMesh(path, scene)
    const cloned = shouldUseSkeletonClone ? clone(scene) : scene.clone(true)

    cloned.traverse((obj) => {
      if (excludeFromReflection) obj.layers.set(REFLECTION_EXCLUDED_LAYER)
      if (obj instanceof Mesh) {
        obj.castShadow = castShadow
        obj.receiveShadow = receiveShadow
        const override = Array.isArray(obj.material) ? undefined : materialOverrides?.[obj.material.name]
        if (override) obj.material = override
      }
    })

    const baseScale = fitHeight && baseBounds.sizeY > 0 ? fitHeight / baseBounds.sizeY : 1
    const totalScale = baseScale * scale
    if (totalScale !== 1) cloned.scale.setScalar(totalScale)

    if (pivot !== "origin") {
      cloned.position.x -= baseBounds.centerX * totalScale
      cloned.position.z -= baseBounds.centerZ * totalScale

      if (pivot === "center") {
        cloned.position.y -= baseBounds.centerY * totalScale
      } else if (pivot === "center-bottom") {
        cloned.position.y -= baseBounds.minY * totalScale
      }
    }

    return cloned
  }, [scene, castShadow, receiveShadow, excludeFromReflection, fitHeight, pivot, scale, path, materialOverrides])

  // The pivot's offset lives on the clone and the placement on a group round it: a `position` prop on the clone itself
  // would replace the offset, and this way the offset also turns with the model.
  return (
    <group {...props}>
      <primitive object={object} />
    </group>
  )
}

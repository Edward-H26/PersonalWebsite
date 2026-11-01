import { useGLTF } from "@react-three/drei"
import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { GltfModel, type MaterialOverrides } from "./GltfModel"
import { useRealtimeMaterials } from "@/hooks/useRealtimeMaterials"
import { REFLECTION_EXCLUDED_LAYER } from "@/config/renderLayers"

type Pivot = "origin" | "center" | "center-bottom"

type InstancedTransform = {
  position?: [number, number, number]
  rotation?: [number, number, number]
  scale?: number
}

type InstancedGltfModelProps = {
  path: string
  instances: InstancedTransform[]
  fitHeight?: number
  pivot?: Pivot
  castShadow?: boolean
  receiveShadow?: boolean
  excludeFromReflection?: boolean
  /** Shared materials drawn in place of the model's own, by material name. */
  materialOverrides?: MaterialOverrides
  /** Shadow depth materials by the same names, for cut-out or animated materials. */
  depthMaterialOverrides?: MaterialOverrides
}

/** One mesh of the model, its geometry baked into model space, drawn as one instanced mesh. */
type InstancingPart = {
  geometry: THREE.BufferGeometry
  material: THREE.Material
}

type InstancingSource = {
  parts: InstancingPart[]
  sizeY: number
}

// A model exported with several materials loads as one mesh per material, so each mesh becomes its
// own instanced mesh and all of them share the instance transforms. A material with an override is
// never drawn once the instanced meshes replace the model, so it is disposed.
function tryBuildInstancingSource(scene: THREE.Object3D, pivot: Pivot, materialOverrides?: MaterialOverrides): InstancingSource | null {
  const meshes: THREE.Mesh[] = []
  let canInstance = true

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    if (obj instanceof THREE.SkinnedMesh || Array.isArray(obj.material)) canInstance = false
    meshes.push(obj)
  })

  if (!canInstance || meshes.length === 0) return null

  scene.updateMatrixWorld(true)

  const bounds = new THREE.Box3()
  const parts = meshes.map((mesh) => {
    const geometry = mesh.geometry.clone()
    geometry.applyMatrix4(mesh.matrixWorld)
    geometry.computeBoundingBox()
    if (geometry.boundingBox) bounds.union(geometry.boundingBox)
    const own = mesh.material as THREE.Material
    const override = materialOverrides?.[own.name]
    if (override && override !== own) own.dispose()
    return { geometry, material: override ?? own }
  })

  const center = bounds.getCenter(new THREE.Vector3())
  const pivotY = pivot === "center" ? center.y : bounds.min.y

  for (const { geometry } of parts) {
    if (pivot !== "origin") geometry.translate(-center.x, -pivotY, -center.z)
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
  }

  return { parts, sizeY: bounds.max.y - bounds.min.y }
}

export function InstancedGltfModel({
  path,
  instances,
  fitHeight,
  pivot = "center-bottom",
  castShadow = true,
  receiveShadow = true,
  excludeFromReflection = false,
  materialOverrides,
  depthMaterialOverrides
}: InstancedGltfModelProps) {
  const { scene } = useGLTF(path)
  const groupRef = useRef<THREE.Group>(null)
  useRealtimeMaterials(scene)

  const source = useMemo(() => {
    return tryBuildInstancingSource(scene, pivot, materialOverrides)
  }, [scene, pivot, materialOverrides])

  const baseScale = useMemo(() => {
    if (!source) return 1
    if (!fitHeight) return 1
    if (source.sizeY <= 0) return 1
    return fitHeight / source.sizeY
  }, [fitHeight, source])

  useEffect(() => {
    if (!groupRef.current) return

    const dummy = new THREE.Object3D()
    const matrices = instances.map((instance) => {
      const pos = instance.position ?? [0, 0, 0]
      const rot = instance.rotation ?? [0, 0, 0]
      const scale = baseScale * (instance.scale ?? 1)

      dummy.position.set(pos[0], pos[1], pos[2])
      dummy.rotation.set(rot[0], rot[1], rot[2])
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      return dummy.matrix.clone()
    })

    for (const child of groupRef.current.children) {
      if (!(child instanceof THREE.InstancedMesh)) continue
      matrices.forEach((matrix, i) => child.setMatrixAt(i, matrix))
      child.instanceMatrix.needsUpdate = true
      // Bounds round every copy, so the mesh is culled only once all of its copies are out of view.
      child.computeBoundingSphere()
      child.layers.set(excludeFromReflection ? REFLECTION_EXCLUDED_LAYER : 0)
    }
  }, [baseScale, excludeFromReflection, instances, source])

  if (!source) {
    return (
      <>
        {instances.map((instance, idx) => (
          <GltfModel
            key={`${path}:${idx}`}
            path={path}
            position={instance.position}
            rotation={instance.rotation}
            fitHeight={fitHeight}
            pivot={pivot}
            castShadow={castShadow}
            receiveShadow={receiveShadow}
            scale={instance.scale}
            excludeFromReflection={excludeFromReflection}
            materialOverrides={materialOverrides}
          />
        ))}
      </>
    )
  }

  return (
    <group ref={groupRef}>
      {source.parts.map((part, index) => (
        <instancedMesh
          key={index}
          args={[part.geometry, part.material, instances.length]}
          castShadow={castShadow}
          receiveShadow={receiveShadow}
          customDepthMaterial={depthMaterialOverrides?.[part.material.name]}
        />
      ))}
    </group>
  )
}

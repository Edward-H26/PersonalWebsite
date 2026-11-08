import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { useIslandModel } from "@/components/canvas/islands/assets/IslandAssetsContext"
import type { InstanceTransform } from "@/components/canvas/islands/village/types"
import type { GroundCoverCulling } from "@/config/groundCover"
import { REFLECTION_EXCLUDED_LAYER } from "@/config/renderLayers"
import { useRealtimeMaterials } from "@/hooks/useRealtimeMaterials"
import { GltfModel, type MaterialOverrides } from "./GltfModel"
import { type InstanceChunk, chunkInReach, packChunks, sortIntoChunks } from "./instanceChunks"

type Pivot = "origin" | "center" | "center-bottom"

type InstancedGltfModelProps = {
  path: string
  instances: InstanceTransform[]
  fitHeight?: number
  pivot?: Pivot
  castShadow?: boolean
  receiveShadow?: boolean
  excludeFromReflection?: boolean
  /** Ground cover only: past its reach a copy's cards have fully faded, so its copies are culled by distance a square at a time. */
  culling?: GroundCoverCulling
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

/** Every copy's transform, 16 floats each, in the copies' order. */
function copyMatrices(instances: readonly InstanceTransform[], baseScale: number) {
  const matrices = new Float32Array(instances.length * 16)
  const matrix = new THREE.Matrix4()
  const position = new THREE.Vector3()
  const rotation = new THREE.Euler()
  const quaternion = new THREE.Quaternion()
  const scale = new THREE.Vector3()
  instances.forEach((instance, i) => {
    position.fromArray(instance.position)
    quaternion.setFromEuler(rotation.fromArray(instance.rotation))
    scale.setScalar(baseScale * instance.scale)
    matrix.compose(position, quaternion, scale).toArray(matrices, i * 16)
  })
  return matrices
}

type PartMeshOptions = {
  castShadow: boolean
  receiveShadow: boolean
  excludeFromReflection: boolean
  depthMaterial?: THREE.Material
}

/** One instanced mesh for a part of the model, holding every copy. */
function buildPartMesh(part: InstancingPart, matrices: Float32Array, options: PartMeshOptions) {
  const mesh = new THREE.InstancedMesh(part.geometry, part.material, matrices.length / 16)
  ;(mesh.instanceMatrix.array as Float32Array).set(matrices)
  // Bounds round every copy, so the mesh is culled only once all of them are out of view.
  mesh.computeBoundingSphere()
  mesh.castShadow = options.castShadow
  mesh.receiveShadow = options.receiveShadow
  mesh.customDepthMaterial = options.depthMaterial
  mesh.layers.set(options.excludeFromReflection ? REFLECTION_EXCLUDED_LAYER : 0)
  // The copies' transforms are the whole of its place in the world; it never moves.
  mesh.matrixAutoUpdate = false
  return mesh
}

/** Copies culled by distance: their transforms sorted by square, each square's run of them and the bounds round it. */
type CulledCopies = { matrices: Float32Array; chunks: readonly InstanceChunk[]; bounds: readonly THREE.Sphere[]; reach: number }

/** The bounds round each square's copies, every part of the model included. */
function chunkBounds(parts: readonly InstancingPart[], matrices: Float32Array, chunks: readonly InstanceChunk[]) {
  const matrix = new THREE.Matrix4()
  const copy = new THREE.Sphere()
  return chunks.map(({ start, count }) => {
    const bounds = new THREE.Sphere().makeEmpty()
    for (let i = start; i < start + count; i += 1) {
      matrix.fromArray(matrices, i * 16)
      for (const part of parts) bounds.union(copy.copy(part.geometry.boundingSphere!).applyMatrix4(matrix))
    }
    return bounds
  })
}

/**
 * Keeps only the squares within reach of the camera in the meshes, packed at the front of their transforms, so each
 * part still draws in one call; a mesh with none in reach is hidden. The transforms change only as a square comes into
 * reach or leaves it.
 */
function DistanceCulling({ meshes, copies }: { meshes: readonly THREE.InstancedMesh[]; copies: CulledCopies }) {
  // The meshes start out holding every copy.
  const inReach = useMemo(() => new Uint8Array(copies.chunks.length).fill(1), [copies])
  const bounds = useMemo(() => new THREE.Sphere(), [])

  useFrame(({ camera }) => {
    let changed = false
    for (let i = 0; i < copies.bounds.length; i += 1) {
      const near = chunkInReach(camera.position, copies.bounds[i], copies.reach) ? 1 : 0
      if (near !== inReach[i]) {
        inReach[i] = near
        changed = true
      }
    }
    if (!changed) return
    bounds.makeEmpty()
    copies.bounds.forEach((square, i) => {
      if (inReach[i]) bounds.union(square)
    })
    for (const mesh of meshes) {
      mesh.count = packChunks(copies.matrices, copies.chunks, inReach, mesh.instanceMatrix.array as Float32Array)
      mesh.visible = mesh.count > 0
      mesh.boundingSphere!.copy(bounds)
      if (!mesh.visible) continue
      mesh.instanceMatrix.addUpdateRange(0, mesh.count * 16)
      mesh.instanceMatrix.needsUpdate = true
    }
  })

  return null
}

export function InstancedGltfModel({
  path,
  instances,
  fitHeight,
  pivot = "center-bottom",
  castShadow = true,
  receiveShadow = true,
  excludeFromReflection = false,
  culling,
  materialOverrides,
  depthMaterialOverrides
}: InstancedGltfModelProps) {
  const scene = useIslandModel(path)
  useRealtimeMaterials(scene)

  const source = useMemo(() => {
    return tryBuildInstancingSource(scene, pivot, materialOverrides)
  }, [scene, pivot, materialOverrides])

  const { group, culled } = useMemo(() => {
    const built = new THREE.Group()
    if (!source) return { group: built, culled: null }
    const baseScale = fitHeight && source.sizeY > 0 ? fitHeight / source.sizeY : 1
    // Culled copies are sorted by square, so the squares in reach can be packed at the front of the transforms.
    const sorted = culling ? sortIntoChunks(instances, culling.chunkSize) : { instances, chunks: [] }
    const matrices = copyMatrices(sorted.instances, baseScale)
    for (const part of source.parts) {
      const depthMaterial = depthMaterialOverrides?.[part.material.name]
      built.add(buildPartMesh(part, matrices, { castShadow, receiveShadow, excludeFromReflection, depthMaterial }))
    }
    const culledCopies: CulledCopies | null = culling
      ? { matrices, chunks: sorted.chunks, bounds: chunkBounds(source.parts, matrices, sorted.chunks), reach: culling.reach }
      : null
    return { group: built, culled: culledCopies }
  }, [source, instances, fitHeight, culling, castShadow, receiveShadow, excludeFromReflection, depthMaterialOverrides])

  useEffect(
    () => () => {
      for (const child of group.children) (child as THREE.InstancedMesh).dispose()
    },
    [group]
  )

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
    <>
      <primitive object={group} />
      {culled ? <DistanceCulling meshes={group.children as THREE.InstancedMesh[]} copies={culled} /> : null}
    </>
  )
}

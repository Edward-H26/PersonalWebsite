import { useGLTF } from "@react-three/drei"
import { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { GltfModel } from "./GltfModel"

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
}

type InstancingSource = {
  geometry: THREE.BufferGeometry
  material: THREE.Material
  sizeY: number
}

function tryBuildInstancingSource(scene: THREE.Object3D, pivot: Pivot): InstancingSource | null {
  const meshes: THREE.Mesh[] = []

  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return
    if (obj instanceof THREE.SkinnedMesh) return
    meshes.push(obj)
  })

  if (meshes.length !== 1) return null

  const mesh = meshes[0]
  if (!mesh.geometry) return null
  if (Array.isArray(mesh.material)) return null

  scene.updateMatrixWorld(true)
  mesh.updateWorldMatrix(true, false)

  const geometry = mesh.geometry.clone()
  geometry.applyMatrix4(mesh.matrixWorld)
  geometry.computeBoundingBox()

  const box = geometry.boundingBox
  if (!box) return null

  const sizeY = box.max.y - box.min.y
  const centerX = (box.min.x + box.max.x) / 2
  const centerY = (box.min.y + box.max.y) / 2
  const centerZ = (box.min.z + box.max.z) / 2
  const minY = box.min.y

  if (pivot !== "origin") {
    const pivotY = pivot === "center" ? centerY : minY
    geometry.translate(-centerX, -pivotY, -centerZ)
  }

  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()

  return {
    geometry,
    material: mesh.material as THREE.Material,
    sizeY
  }
}

export function InstancedGltfModel({
  path,
  instances,
  fitHeight,
  pivot = "center-bottom",
  castShadow = true,
  receiveShadow = true
}: InstancedGltfModelProps) {
  const { scene } = useGLTF(path)
  const meshRef = useRef<THREE.InstancedMesh>(null)

  const source = useMemo(() => {
    return tryBuildInstancingSource(scene, pivot)
  }, [scene, pivot])

  const baseScale = useMemo(() => {
    if (!source) return 1
    if (!fitHeight) return 1
    if (source.sizeY <= 0) return 1
    return fitHeight / source.sizeY
  }, [fitHeight, source])

  useEffect(() => {
    if (!meshRef.current) return

    const dummy = new THREE.Object3D()
    for (let i = 0; i < instances.length; i += 1) {
      const instance = instances[i]
      const pos = instance.position ?? [0, 0, 0]
      const rot = instance.rotation ?? [0, 0, 0]
      const scale = baseScale * (instance.scale ?? 1)

      dummy.position.set(pos[0], pos[1], pos[2])
      dummy.rotation.set(rot[0], rot[1], rot[2])
      dummy.scale.set(scale, scale, scale)
      dummy.updateMatrix()
      meshRef.current.setMatrixAt(i, dummy.matrix)
    }

    meshRef.current.instanceMatrix.needsUpdate = true
  }, [baseScale, instances])

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
          />
        ))}
      </>
    )
  }

  return (
    <instancedMesh
      ref={meshRef}
      args={[source.geometry, source.material, instances.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={false}
    />
  )
}

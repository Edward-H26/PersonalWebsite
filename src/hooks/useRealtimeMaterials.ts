import { useMemo } from "react"
import { Mesh, MeshStandardMaterial, type Object3D } from "three"

// The sky environment map is bright enough to wash out the key light's shadows at full strength.
export const ENV_MAP_INTENSITY = 0.35

const preparedScenes = new WeakSet<Object3D>()

// Adapts scanned/authored materials to real-time rendering: scanned foliage ships as
// alpha-blended leaves, which sort badly and pay full overdraw for every leaf, so it becomes an
// alpha-tested cutout; and every standard material gets the scene's environment intensity.
export function useRealtimeMaterials(scene: Object3D) {
  useMemo(() => {
    if (preparedScenes.has(scene)) return
    preparedScenes.add(scene)
    scene.traverse((obj) => {
      if (!(obj instanceof Mesh)) return
      const materials = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial)) continue
        material.envMapIntensity = ENV_MAP_INTENSITY
        if (material.transparent && material.map) {
          material.transparent = false
          material.alphaTest = 0.5
          material.depthWrite = true
        }
        material.needsUpdate = true
      }
    })
  }, [scene])
}

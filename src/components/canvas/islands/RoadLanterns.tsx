import { useGLTF } from "@react-three/drei"
import { useFrame } from "@react-three/fiber"
import { useEffect, useMemo, useRef } from "react"
import { Mesh, MeshStandardMaterial, type Object3D } from "three"
import { GltfModel } from "@/components/canvas/models/GltfModel"
import { useRealtimeMaterials } from "@/hooks/useRealtimeMaterials"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { useWorldStore } from "@/store/worldStore"
import { smoothstep01 } from "@/utils/math"
import { LANTERN_GLASS_MATERIAL, isLanternLit, stepGlow } from "./lanternGlow"
import type { RoadLanternGroup } from "./village/types"

function findLanternGlass(scene: Object3D): MeshStandardMaterial | null {
  let glass: MeshStandardMaterial | null = null
  scene.traverse((obj) => {
    if (obj instanceof Mesh && obj.material instanceof MeshStandardMaterial && obj.material.name === LANTERN_GLASS_MATERIAL) {
      glass = obj.material
    }
  })
  return glass
}

/**
 * The lanterns along the main road. Each copy owns a clone of the lantern's glass, so the lanterns
 * light one at a time, in road order, as the deck carries the walk towards them, and go dark again
 * when the visitor pages back. The lanterns built into the houses keep their shared, always-lit glass.
 */
export function RoadLanterns({ lanterns }: { lanterns: RoadLanternGroup }) {
  const { scene } = useGLTF(lanterns.path)
  // Prepared before cloning, so every copy of the glass inherits the scene-wide material settings.
  useRealtimeMaterials(scene)
  const reducedMotion = useReducedMotion()
  const glass = useMemo(() => findLanternGlass(scene), [scene])
  const glassCopies = useMemo(() => (glass ? lanterns.instances.map(() => glass.clone()) : []), [glass, lanterns.instances])
  const overrides = useMemo(() => glassCopies.map((copy) => ({ [LANTERN_GLASS_MATERIAL]: copy })), [glassCopies])
  const glowLevels = useRef<number[]>([])

  useEffect(() => () => glassCopies.forEach((copy) => copy.dispose()), [glassCopies])

  useFrame((_, delta) => {
    if (!glass) return
    const { routeT } = useWorldStore.getState()
    glassCopies.forEach((copy, i) => {
      const lit = isLanternLit(routeT, lanterns.instances[i].routeT)
      const level = stepGlow(glowLevels.current[i] ?? 0, lit, delta, reducedMotion)
      glowLevels.current[i] = level
      copy.emissiveIntensity = glass.emissiveIntensity * smoothstep01(level)
    })
  })

  return (
    <>
      {lanterns.instances.map((lantern, i) => (
        <GltfModel
          key={i}
          path={lanterns.path}
          position={lantern.position}
          rotation={lantern.rotation}
          fitHeight={lanterns.fitHeight}
          scale={lantern.scale}
          receiveShadow={false}
          excludeFromReflection
          materialOverrides={overrides[i]}
        />
      ))}
    </>
  )
}

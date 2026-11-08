import { useEffect, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import type { SeaPlan } from "@/components/canvas/islands/assets/islandPlan"
import { shoreTexture } from "@/components/canvas/islands/terrain/shoreField"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { SEA_FRAGMENT, SEA_VERTEX, WATER_UNIFORMS, createSeaUniforms } from "./seaShader"

/** The sea round the island's shore field, its foam wrapped round the harbor's pier, ship and markers. */
function createSea(plan: SeaPlan) {
  const shoreField = shoreTexture(plan.shoreField)
  const material = new THREE.ShaderMaterial({
    name: "sea",
    uniforms: createSeaUniforms({ island: plan.shoreCentre, shore: { texture: shoreField, rect: plan.shoreRect }, ...plan.waterline }),
    vertexShader: SEA_VERTEX,
    fragmentShader: SEA_FRAGMENT
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.BufferAttribute(plan.positions, 3))
  geometry.setAttribute("aShore", new THREE.BufferAttribute(plan.shoreDistances, 1))
  geometry.setIndex(new THREE.BufferAttribute(plan.indices, 1))
  const sea = new THREE.Mesh(geometry, material)
  sea.name = "sea"
  // The swell moves the surface past any fixed bounds, and the sea fills most frames anyway.
  sea.frustumCulled = false
  // Drawn after the island, so the depth test spares the water hidden under the land from shading.
  sea.renderOrder = 1
  return { sea, shoreField }
}

/**
 * The painted sea (DESIGN.md section 16): one mesh round the island, its swell in the vertex shader and
 * its colour, foam and glitter in the fragment shader, reflecting the sky's colours instead of
 * rendering the scene a second time. The swell stands still for visitors who prefer reduced motion.
 */
export function Sea({ plan }: { plan: SeaPlan }) {
  const reducedMotion = useReducedMotion()
  const { sea, shoreField } = useMemo(() => createSea(plan), [plan])

  useEffect(
    () => () => {
      sea.geometry.dispose()
      sea.material.dispose()
      shoreField.dispose()
    },
    [sea, shoreField]
  )

  useFrame((_, delta) => {
    // The stream runs on the same clock, so this one step moves all the island's water.
    if (!reducedMotion) WATER_UNIFORMS.uTime.value += delta
  })

  return <primitive object={sea} />
}

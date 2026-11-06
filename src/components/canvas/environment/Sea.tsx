import { Suspense, useEffect, useMemo } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { buildHarbor } from "@/components/canvas/islands/layout/harbor"
import { ShoreField } from "@/components/canvas/islands/terrain/shoreField"
import { TerrainSite } from "@/components/canvas/islands/terrain/terrainSite"
import { type IslandTerrain, useTerrain } from "@/components/canvas/islands/terrain/useTerrain"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { buildSeaGeometry } from "./seaGeometry"
import { SEA_FRAGMENT, SEA_VERTEX, WATER_UNIFORMS, createSeaUniforms } from "./seaShader"

/** The sea round the island's shore field, its foam wrapped round the harbor's pier, ship and markers. */
function createSea(terrain: IslandTerrain) {
  const shore = new ShoreField(terrain)
  const shoreTexture = shore.texture()
  const harbor = buildHarbor(new TerrainSite(terrain)).waterline
  const material = new THREE.ShaderMaterial({
    name: "sea",
    uniforms: createSeaUniforms({ island: shore.centre, shore: { texture: shoreTexture, rect: shore.rect }, ...harbor }),
    vertexShader: SEA_VERTEX,
    fragmentShader: SEA_FRAGMENT
  })
  const sea = new THREE.Mesh(buildSeaGeometry(shore), material)
  sea.name = "sea"
  // The swell moves the surface past any fixed bounds, and the sea fills most frames anyway.
  sea.frustumCulled = false
  // Drawn after the island, so the depth test spares the water hidden under the land from shading.
  sea.renderOrder = 1
  return { sea, shoreTexture }
}

function SeaSurface() {
  const terrain = useTerrain()
  const reducedMotion = useReducedMotion()
  const { sea, shoreTexture } = useMemo(() => createSea(terrain), [terrain])

  useEffect(
    () => () => {
      sea.geometry.dispose()
      sea.material.dispose()
      shoreTexture.dispose()
    },
    [sea, shoreTexture]
  )

  useFrame((_, delta) => {
    // The stream runs on the same clock, so this one step moves all the island's water.
    if (!reducedMotion) WATER_UNIFORMS.uTime.value += delta
  })

  return <primitive object={sea} />
}

/**
 * The painted sea (DESIGN.md section 16): one mesh round the island, its swell in the vertex shader and
 * its colour, foam and glitter in the fragment shader, reflecting the sky's colours instead of
 * rendering the scene a second time. The swell stands still for visitors who prefer reduced motion.
 */
export function Sea() {
  // Waits for the terrain the island loads, without holding back the sky and the camera meanwhile.
  return (
    <Suspense fallback={null}>
      <SeaSurface />
    </Suspense>
  )
}

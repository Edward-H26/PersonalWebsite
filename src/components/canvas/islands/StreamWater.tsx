import { useEffect, useMemo } from "react"
import * as THREE from "three"
import { createStreamMaterial } from "@/components/canvas/environment/streamShader"
import { buildStreamGeometry } from "./terrain/streamGeometry"
import type { IslandTerrain } from "./terrain/useTerrain"

/** The stream's water, one mesh from the spring to the bay, on the sea's clock and wind. */
export function StreamWater({ terrain }: { terrain: IslandTerrain }) {
  const stream = useMemo(() => {
    const geometry = buildStreamGeometry(terrain)
    const material = createStreamMaterial()
    material.uniforms.uEndAlong.value = geometry.userData.endAlong
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = "stream"
    return mesh
  }, [terrain])

  useEffect(
    () => () => {
      stream.geometry.dispose()
      stream.material.dispose()
    },
    [stream]
  )

  return <primitive object={stream} />
}

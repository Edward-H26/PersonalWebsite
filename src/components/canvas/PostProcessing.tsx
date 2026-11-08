import { type Ref, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { EffectComposer, SMAA, Vignette } from "@react-three/postprocessing"
import type { VignetteEffect } from "postprocessing"
import { useWorldStore } from "@/store/worldStore"

/** The vignette's darkness on the walk; it fades to none on the overview. */
const WALK_VIGNETTE_DARKNESS = 0.75

// SMAA instead of multisampled render targets: 4x MSAA in the composer cost more than the whole
// scene on Apple GPUs, while SMAA is a single cheap full-screen pass with comparable edge quality.
export function PostProcessing() {
  const vignette = useRef<VignetteEffect>(null)

  // Set on the effect each frame: as a prop, the darkness would rebuild the effect and the composer's passes on every
  // frame of a turn between the overview and the walk.
  useFrame(() => {
    if (vignette.current) vignette.current.darkness = WALK_VIGNETTE_DARKNESS * useWorldStore.getState().overviewBlend
  })

  return (
    <EffectComposer multisampling={0}>
      <SMAA />
      {/* The wrapper types an effect's ref as the effect's class, though it holds the instance. */}
      <Vignette ref={vignette as unknown as Ref<typeof VignetteEffect>} eskil={false} offset={0.2} darkness={0} />
    </EffectComposer>
  )
}

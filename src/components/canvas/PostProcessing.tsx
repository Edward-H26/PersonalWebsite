import { EffectComposer, SMAA, Vignette } from "@react-three/postprocessing"
import { useWorldStore } from "@/store/worldStore"

// SMAA instead of multisampled render targets: 4x MSAA in the composer cost more than the whole
// scene on Apple GPUs, while SMAA is a single cheap full-screen pass with comparable edge quality.
export function PostProcessing() {
  const overviewBlend = useWorldStore((state) => state.overviewBlend)
  const darkness = 0.75 * overviewBlend

  return (
    <EffectComposer multisampling={0}>
      <SMAA />
      <Vignette eskil={false} offset={0.2} darkness={darkness} />
    </EffectComposer>
  )
}

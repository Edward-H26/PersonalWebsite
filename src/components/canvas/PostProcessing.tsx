import { EffectComposer, Vignette } from "@react-three/postprocessing"
import { useWorldStore } from "@/store/worldStore"

export function PostProcessing() {
  const overviewBlend = useWorldStore((state) => state.overviewBlend)
  const darkness = 0.75 * overviewBlend

  return (
    <EffectComposer multisampling={0}>
      <Vignette eskil={false} offset={0.2} darkness={darkness} />
    </EffectComposer>
  )
}



import { Cloud, Clouds } from "@react-three/drei"
import { withBase } from "@/utils/assets"

type CloudLayer = {
  position: [number, number, number]
  bounds: [number, number, number]
  segments: number
  volume: number
  opacity: number
  speed: number
  growth: number
  fade: number
}

const CLOUD_TEXTURE = withBase("/textures/cloud.png")
/** Three cloud banks high over the island and one thin haze layer just above the sea. */
const CLOUD_LAYERS: readonly CloudLayer[] = [
  { position: [0, 260, -120], bounds: [260, 80, 220], segments: 40, volume: 20, opacity: 0.22, speed: 0.12, growth: 6, fade: 420 },
  { position: [-180, 240, 40], bounds: [240, 70, 200], segments: 35, volume: 18, opacity: 0.2, speed: 0.1, growth: 5, fade: 400 },
  { position: [140, 220, 80], bounds: [220, 60, 200], segments: 35, volume: 16, opacity: 0.18, speed: 0.09, growth: 4, fade: 380 },
  { position: [0, 10, 0], bounds: [520, 18, 520], segments: 22, volume: 8, opacity: 0.08, speed: 0.04, growth: 1.6, fade: 260 }
]

/** The drifting clouds, drawn from one shared sprite sheet. */
export function SkyClouds() {
  return (
    <Clouds texture={CLOUD_TEXTURE} limit={600} frustumCulled={false}>
      {CLOUD_LAYERS.map((layer, index) => (
        <Cloud key={index} {...layer} color="#ffffff" />
      ))}
    </Clouds>
  )
}

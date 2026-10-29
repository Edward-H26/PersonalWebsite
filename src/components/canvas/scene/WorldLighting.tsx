import { type LightLevels, keyLightPosition } from "./lighting"

const SHADOW_MAP_SIZE = 2048
const KEY_LIGHT_POSITION = keyLightPosition()

/** The sun, a cool fill from behind, the sky and ground hemisphere, and a warm point light over the village. */
export function WorldLighting({ levels }: { levels: LightLevels }) {
  return (
    <>
      <ambientLight intensity={levels.ambient} color="#b8c4e0" />

      <directionalLight
        position={KEY_LIGHT_POSITION}
        intensity={levels.sun}
        castShadow
        shadow-mapSize-width={SHADOW_MAP_SIZE}
        shadow-mapSize-height={SHADOW_MAP_SIZE}
        shadow-camera-near={300}
        shadow-camera-far={1100}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
        shadow-bias={-0.0002}
        shadow-normalBias={0.05}
        color="#fff5e6"
      />

      <directionalLight position={[-80, 100, -80]} intensity={levels.fill} color="#6080ff" />

      <hemisphereLight args={["#87ceeb", "#2a4a2a", 0.35]} />

      <pointLight position={[0, 50, 0]} intensity={levels.point} distance={300} color="#ffe0b0" />
    </>
  )
}

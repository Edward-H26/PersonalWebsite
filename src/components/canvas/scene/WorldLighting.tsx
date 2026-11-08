import { useFrame } from "@react-three/fiber"
import { useRef } from "react"
import * as THREE from "three"
import { useWorldStore } from "@/store/worldStore"
import { type LightLevels, KEY_LIGHT_DISTANCE, keyLightDirection } from "./lighting"

const SHADOW_MAP_SIZE = 2048
/**
 * Half the width of the sun's shadow box, in world units. On the walk it covers the 400 units round
 * the view, as dense as the shadows have always been; on the overview it widens to the whole island,
 * which at that distance still puts a shadow texel under a screen pixel.
 */
const WALK_SHADOW_HALF = 200
const OVERVIEW_SHADOW_HALF = 420
/** How far ahead of the camera the walk's shadow box is centred. */
const WALK_SHADOW_LEAD = 90
/** Where the overview's shadow box is centred: the middle of the island. */
const ISLAND_CENTRE = new THREE.Vector3(0, 0, 25)
/**
 * How often the overview's held shadow map is drawn again, in seconds. Only the windmill's sails move it: their tips,
 * 6.9 m out at 3 turns a minute, cover 0.22 m in this time, less than one of the overview's 0.32 m shadow texels.
 */
const HELD_SHADOW_REDRAW_S = 0.1

const KEY_DIRECTION = keyLightDirection()
// The shadow box's own axes across the sun's rays, for snapping its centre to whole texels.
const SHADOW_RIGHT = new THREE.Vector3().crossVectors(KEY_DIRECTION, new THREE.Vector3(0, 1, 0)).normalize()
const SHADOW_UP = new THREE.Vector3().crossVectors(SHADOW_RIGHT, KEY_DIRECTION).normalize()

const focus = new THREE.Vector3()
const ahead = new THREE.Vector3()

/**
 * Moves the sun's shadow box with the view: centred on the island for the overview and on the ground
 * ahead of the walking camera, its centre snapped to whole texels so shadows do not crawl as it moves.
 */
function followView(light: THREE.DirectionalLight, camera: THREE.Camera, overviewBlend: number) {
  camera.getWorldDirection(ahead)
  ahead.y = 0
  ahead.normalize()
  focus.copy(camera.position).addScaledVector(ahead, WALK_SHADOW_LEAD)
  focus.y = 0
  focus.lerpVectors(ISLAND_CENTRE, focus, overviewBlend)

  const half = THREE.MathUtils.lerp(OVERVIEW_SHADOW_HALF, WALK_SHADOW_HALF, overviewBlend)
  const texel = (2 * half) / SHADOW_MAP_SIZE
  const right = Math.round(focus.dot(SHADOW_RIGHT) / texel) * texel
  const up = Math.round(focus.dot(SHADOW_UP) / texel) * texel
  const along = focus.dot(KEY_DIRECTION)
  focus.copy(SHADOW_RIGHT).multiplyScalar(right).addScaledVector(SHADOW_UP, up).addScaledVector(KEY_DIRECTION, along)

  light.target.position.copy(focus)
  light.target.updateMatrixWorld()
  light.position.copy(focus).addScaledVector(KEY_DIRECTION, KEY_LIGHT_DISTANCE)
  const box = light.shadow.camera
  if (box.right !== half) {
    box.left = box.bottom = -half
    box.right = box.top = half
    box.updateProjectionMatrix()
  }
}

/** The sun, a cool fill from behind, the sky and ground hemisphere, and a warm point light over the village. */
export function WorldLighting({ levels }: { levels: LightLevels }) {
  const sun = useRef<THREE.DirectionalLight>(null)
  const heldShadows = useRef<boolean | null>(null)
  const heldShadowDrawnAt = useRef(0)

  useFrame(({ camera, gl, clock }) => {
    const { overviewBlend } = useWorldStore.getState()
    if (sun.current) followView(sun.current, camera, overviewBlend)
    // On the overview the shadow box stands still over the whole island, whatever the camera does, so the map is drawn
    // only as often as the sails need; at that distance the wind's sway is under a texel of it.
    const hold = overviewBlend === 0
    const now = clock.elapsedTime
    if (hold !== heldShadows.current || (hold && now - heldShadowDrawnAt.current >= HELD_SHADOW_REDRAW_S)) {
      heldShadows.current = hold
      heldShadowDrawnAt.current = now
      gl.shadowMap.autoUpdate = !hold
      gl.shadowMap.needsUpdate = true
    }
  })

  return (
    <>
      <ambientLight intensity={levels.ambient} color="#b8c4e0" />

      <directionalLight
        ref={sun}
        intensity={levels.sun}
        castShadow
        shadow-mapSize-width={SHADOW_MAP_SIZE}
        shadow-mapSize-height={SHADOW_MAP_SIZE}
        shadow-camera-near={KEY_LIGHT_DISTANCE - 400}
        shadow-camera-far={KEY_LIGHT_DISTANCE + 400}
        shadow-camera-left={-OVERVIEW_SHADOW_HALF}
        shadow-camera-right={OVERVIEW_SHADOW_HALF}
        shadow-camera-top={OVERVIEW_SHADOW_HALF}
        shadow-camera-bottom={-OVERVIEW_SHADOW_HALF}
        shadow-bias={-0.0002}
        shadow-normalBias={0.05}
        color="#fff5e6"
      />

      <directionalLight position={[-80, 100, 80]} intensity={levels.fill} color="#6080ff" />

      <hemisphereLight args={["#87ceeb", "#2a4a2a", 0.35]} />

      <pointLight position={[-45, 50, 78]} intensity={levels.point} distance={300} color="#ffe0b0" />
    </>
  )
}

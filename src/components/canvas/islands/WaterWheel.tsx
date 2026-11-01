import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"
import { ISLAND_UNITS_PER_METRE } from "@/config/modelSizes"
import { GltfModel } from "@/components/canvas/models/GltfModel"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import type { WaterWheel as WheelPlacement } from "./layout/landmarks"

/** An overshot wheel turns slowly, about five turns a minute. */
const TURNS_PER_MINUTE = 5

/**
 * The watermill's wheel, turning about its own axle (its x axis). The flume feeds it from the pond
 * behind it, so its top turns away from the flume, towards its front; for visitors who prefer reduced
 * motion it stands still.
 */
export function WaterWheel({ wheel }: { wheel: WheelPlacement }) {
  const axle = useRef<Group>(null)
  const reducedMotion = useReducedMotion()

  useFrame((_, delta) => {
    if (reducedMotion || !axle.current) return
    axle.current.rotation.x += (delta * TURNS_PER_MINUTE * Math.PI * 2) / 60
  })

  return (
    <group position={wheel.position} rotation={[0, wheel.yaw, 0]}>
      <group ref={axle}>
        <GltfModel path={wheel.path} scale={ISLAND_UNITS_PER_METRE} pivot="origin" />
      </group>
    </group>
  )
}

import { useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type { Group } from "three"
import { ISLAND_UNITS_PER_METRE } from "@/config/modelSizes"
import { GltfModel } from "@/components/canvas/models/GltfModel"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import type { Rotor as RotorPlacement } from "./layout/landmarks"

/**
 * A part that turns about its own axle, its x axis, at its own pace: the water wheel, the windmill's sails.
 * For visitors who prefer reduced motion it stands still.
 */
export function Rotor({ rotor }: { rotor: RotorPlacement }) {
  const axle = useRef<Group>(null)
  const reducedMotion = useReducedMotion()

  useFrame((_, delta) => {
    if (reducedMotion || !axle.current) return
    axle.current.rotation.x += (delta * rotor.turnsPerMinute * Math.PI * 2) / 60
  })

  return (
    <group position={rotor.position} rotation={[0, rotor.yaw, 0]}>
      <group ref={axle}>
        <GltfModel path={rotor.path} scale={ISLAND_UNITS_PER_METRE} pivot="origin" />
      </group>
    </group>
  )
}

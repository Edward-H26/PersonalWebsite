import { useLayoutEffect } from "react"
import { useThree } from "@react-three/fiber"
import type { PerspectiveCamera } from "three"
import { REFLECTION_EXCLUDED_LAYER } from "@/config/renderLayers"
import type { StillShot } from "./stillShots"

/** Holds the camera at a still's pose, in place of the walk controller. */
export function StillCamera({ shot }: { shot: StillShot }) {
  const camera = useThree((state) => state.camera) as PerspectiveCamera

  useLayoutEffect(() => {
    camera.layers.enable(REFLECTION_EXCLUDED_LAYER)
    camera.clearViewOffset()
    camera.fov = shot.fov
    camera.position.set(...shot.position)
    camera.lookAt(...shot.lookAt)
    camera.updateProjectionMatrix()
  }, [camera, shot])

  return null
}

import { useEffect } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"

/** Applies the colour pipeline to the renderer: ACES tone mapping at the given exposure, sRGB output. */
export function RendererConfig({ exposure }: { exposure: number }) {
  const { gl } = useThree()

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = exposure
    gl.outputColorSpace = THREE.SRGBColorSpace
    gl.info.autoReset = false
  }, [gl, exposure])

  return null
}

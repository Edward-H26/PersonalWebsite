import { useRef, useMemo, useEffect } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import { Sky as ThreeSky } from "three/examples/jsm/objects/Sky.js"

interface SkyProps {
  elevation?: number
  azimuth?: number
  turbidity?: number
  rayleigh?: number
  mieCoefficient?: number
  mieDirectionalG?: number
}

export function ProceduralSky({
  elevation = 2,
  azimuth = 180,
  turbidity = 10,
  rayleigh = 2,
  mieCoefficient = 0.005,
  mieDirectionalG = 0.8
}: SkyProps) {
  const { scene, gl } = useThree()
  const skyRef = useRef<ThreeSky | null>(null)
  const sunRef = useRef(new THREE.Vector3())
  const renderTargetRef = useRef<THREE.WebGLRenderTarget | null>(null)

  const sky = useMemo(() => {
    const s = new ThreeSky()
    s.scale.setScalar(10000)
    return s
  }, [])

  useEffect(() => {
    skyRef.current = sky
    scene.add(sky)

    const skyUniforms = sky.material.uniforms
    skyUniforms["turbidity"].value = turbidity
    skyUniforms["rayleigh"].value = rayleigh
    skyUniforms["mieCoefficient"].value = mieCoefficient
    skyUniforms["mieDirectionalG"].value = mieDirectionalG

    const phi = THREE.MathUtils.degToRad(90 - elevation)
    const theta = THREE.MathUtils.degToRad(azimuth)
    sunRef.current.setFromSphericalCoords(1, phi, theta)

    sky.material.uniforms["sunPosition"].value.copy(sunRef.current)

    const pmremGenerator = new THREE.PMREMGenerator(gl)
    pmremGenerator.compileEquirectangularShader()

    const sceneEnv = new THREE.Scene()
    sceneEnv.add(sky.clone())

    renderTargetRef.current = pmremGenerator.fromScene(sceneEnv)
    scene.environment = renderTargetRef.current.texture

    pmremGenerator.dispose()

    return () => {
      scene.remove(sky)
      if (renderTargetRef.current) {
        renderTargetRef.current.dispose()
      }
    }
  }, [scene, gl, sky, elevation, azimuth, turbidity, rayleigh, mieCoefficient, mieDirectionalG])

  return null
}

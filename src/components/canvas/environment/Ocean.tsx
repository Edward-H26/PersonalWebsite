import { useEffect, useMemo } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { Water } from "three/examples/jsm/objects/Water.js"
import { withBase } from "@/config/assets"

interface OceanProps {
  sunElevation?: number
  sunAzimuth?: number
  waterColor?: number
  animationSpeed?: number
}

function createFallbackNormalTexture() {
  const size = 2
  const data = new Uint8Array(size * size * 4)
  for (let i = 0; i < size * size; i += 1) {
    data[i * 4 + 0] = 128
    data[i * 4 + 1] = 128
    data[i * 4 + 2] = 255
    data[i * 4 + 3] = 255
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.needsUpdate = true
  return tex
}

export function Ocean({
  sunElevation = 2,
  sunAzimuth = 180,
  waterColor = 0x001e0f,
  animationSpeed = 1.15,
}: OceanProps) {
  const { scene } = useThree()
  const fallbackNormals = useMemo(() => createFallbackNormalTexture(), [])

  const sunDirection = useMemo(() => {
    const phi = THREE.MathUtils.degToRad(90 - sunElevation)
    const theta = THREE.MathUtils.degToRad(sunAzimuth)
    return new THREE.Vector3().setFromSphericalCoords(1, phi, theta)
  }, [sunElevation, sunAzimuth])

  const water = useMemo(() => {
    const geometry = new THREE.PlaneGeometry(10000, 10000)
    const ocean = new Water(geometry, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: fallbackNormals,
      sunDirection: new THREE.Vector3(),
      sunColor: 0xffffff,
      waterColor,
      distortionScale: 3.7,
      fog: scene.fog !== undefined
    })

    ocean.rotation.x = -Math.PI / 2
    return ocean
  }, [fallbackNormals, waterColor, scene])

  useEffect(() => {
    let cancelled = false
    const loader = new THREE.TextureLoader()

    loader.load(withBase("/textures/waternormals.jpg"), (tex) => {
      if (cancelled) {
        tex.dispose()
        return
      }

      tex.wrapS = THREE.RepeatWrapping
      tex.wrapT = THREE.RepeatWrapping
      tex.needsUpdate = true
      water.material.uniforms["normalSampler"].value = tex
    })

    return () => {
      cancelled = true
    }
  }, [water])

  useEffect(() => {
    water.material.uniforms["sunDirection"].value.copy(sunDirection).normalize()
  }, [water, sunDirection])

  useFrame((_, delta) => {
    water.material.uniforms["time"].value += animationSpeed * delta
  })

  return <primitive object={water} />
}

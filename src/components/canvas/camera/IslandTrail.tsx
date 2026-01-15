import { useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"

const MAX_MARKERS = 56
const MIN_STEP_DISTANCE = 0.7
const GROUND_OFFSET = 0.08
const RAYCAST_QUANT = 2

function getGroundMeshes(root: THREE.Object3D) {
  const groundMeshes: THREE.Object3D[] = []
  root.traverse((obj) => {
    if (obj.userData?.isGround) groundMeshes.push(obj)
  })
  if (groundMeshes.length === 0) return null
  return groundMeshes
}

export function IslandTrail({ section }: { section: number }) {
  const { camera, scene } = useThree()

  const instancedRef = useRef<THREE.InstancedMesh>(null)
  const pointsRef = useRef<THREE.Vector3[]>([])

  const groundRef = useRef<THREE.Object3D[] | null>(null)
  const cachedGroundKey = useRef<string | null>(null)
  const cachedGroundY = useRef<number | null>(null)
  const lastValidGroundY = useRef<number | null>(null)

  const scratchPoint = useRef(new THREE.Vector3())
  const lastCameraPos = useRef(new THREE.Vector3())
  const lastWrittenCount = useRef(0)

  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const down = useMemo(() => new THREE.Vector3(0, -1, 0), [])
  const origin = useRef(new THREE.Vector3())
  const tmp = useRef(new THREE.Object3D())

  const baseColor = useMemo(() => new THREE.Color("#06b6d4"), [])
  const colorScratch = useRef(new THREE.Color())

  useFrame(() => {
    const mesh = instancedRef.current
    if (!mesh) return

    if (section === 0) {
      if (mesh.count !== 0) {
        pointsRef.current = []
        groundRef.current = null
        cachedGroundKey.current = null
        cachedGroundY.current = null
        lastValidGroundY.current = null
        lastWrittenCount.current = 0
        mesh.count = 0
      }
      return
    }

    if (!groundRef.current) {
      const root = scene.getObjectByName("Island-earth")
      if (!root) return
      const resolved = getGroundMeshes(root)
      if (!resolved) return
      groundRef.current = resolved
    }

    const x = camera.position.x
    const z = camera.position.z

    const dx = x - lastCameraPos.current.x
    const dz = z - lastCameraPos.current.z
    if (dx * dx + dz * dz < 0.01) return
    lastCameraPos.current.set(x, 0, z)

    const quantX = Math.round(x * RAYCAST_QUANT) / RAYCAST_QUANT
    const quantZ = Math.round(z * RAYCAST_QUANT) / RAYCAST_QUANT
    const groundKey = `${quantX}:${quantZ}`

    if (cachedGroundKey.current !== groundKey) {
      cachedGroundKey.current = groundKey
      cachedGroundY.current = null

      origin.current.set(quantX, camera.position.y + 2000, quantZ)
      raycaster.set(origin.current, down)
      raycaster.far = 8000

      const hit = raycaster.intersectObjects(groundRef.current, true)[0]
      if (hit) {
        cachedGroundY.current = hit.point.y
        lastValidGroundY.current = hit.point.y
      }
    }

    const groundY = cachedGroundY.current ?? lastValidGroundY.current ?? camera.position.y
    scratchPoint.current.set(x, groundY + GROUND_OFFSET, z)

    const points = pointsRef.current
    const last = points.length > 0 ? points[points.length - 1] : null
    const minStepDistSq = MIN_STEP_DISTANCE * MIN_STEP_DISTANCE

    let fullUpdate = false
    let lastIndexToUpdate: number | null = null

    if (!last) {
      points.push(scratchPoint.current.clone())
      fullUpdate = true
    } else if (last.distanceToSquared(scratchPoint.current) >= minStepDistSq) {
      const distance = Math.sqrt(last.distanceToSquared(scratchPoint.current))
      const steps = Math.max(1, Math.floor(distance / MIN_STEP_DISTANCE))
      const direction = scratchPoint.current.clone().sub(last).normalize()
      for (let i = 1; i <= steps; i += 1) {
        const stepPoint = last.clone().addScaledVector(direction, MIN_STEP_DISTANCE * i)
        if (i === steps) stepPoint.copy(scratchPoint.current)
        points.push(stepPoint)
      }
      fullUpdate = true
      while (points.length > MAX_MARKERS) {
        points.shift()
      }
    } else {
      last.copy(scratchPoint.current)
      lastIndexToUpdate = points.length - 1
    }

    const dummy = tmp.current
    const count = points.length

    if (fullUpdate || lastWrittenCount.current !== count) {
      lastWrittenCount.current = count
      mesh.count = count
      for (let i = 0; i < count; i += 1) {
        const t = count <= 1 ? 1 : i / (count - 1)
        const scale = 0.55 + 0.55 * t

        dummy.position.copy(points[i])
        dummy.rotation.set(-Math.PI / 2, 0, 0)
        dummy.scale.setScalar(scale)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)

        colorScratch.current.copy(baseColor).multiplyScalar(0.35 + 0.65 * t)
        mesh.setColorAt(i, colorScratch.current)
      }
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
      return
    }

    if (lastIndexToUpdate != null) {
      const i = lastIndexToUpdate
      const t = count <= 1 ? 1 : i / (count - 1)
      const scale = 0.55 + 0.55 * t

      dummy.position.copy(points[i])
      dummy.rotation.set(-Math.PI / 2, 0, 0)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      mesh.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <instancedMesh ref={instancedRef} args={[undefined, undefined, MAX_MARKERS]} frustumCulled={false}>
      <ringGeometry args={[0.14, 0.24, 28]} />
      <meshStandardMaterial
        vertexColors
        color="#06b6d4"
        emissive="#06b6d4"
        emissiveIntensity={0.85}
        transparent
        opacity={0.6}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </instancedMesh>
  )
}



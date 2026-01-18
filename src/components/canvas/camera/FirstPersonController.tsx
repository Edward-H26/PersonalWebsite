import { useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { CatmullRomCurve3, Vector3 } from "three"
import { easing } from "maath"
import { useWorldStore } from "@/store/worldStore"
import { EARTH_ROUTE_POINTS, WORLD_CONFIG } from "@/config"
import { BIRD_EYE_CAMERA_CONFIG } from "./BirdEyeCamera"

const CAMERA_BACK_OFFSET = 12
const CAMERA_LEFT_OFFSET = 1.2
const GROUND_EPSILON = 0.04
const EARTH_EYE_HEIGHT_BONUS = 0.7

const LOOK_DISTANCE = 16
const LOOK_DOWN_OFFSET = 3.6
const TITLE_LIFT = 1.2
const TITLE_BACK = 7.0
const OVERVIEW_FILM_OFFSET = -9

function getGroundMeshes(root: THREE.Object3D) {
  const groundMeshes: THREE.Object3D[] = []
  root.traverse((obj) => {
    if (obj.userData?.isGround) groundMeshes.push(obj)
  })
  if (groundMeshes.length === 0) return null
  return groundMeshes
}

export function FirstPersonController() {
  const { camera, scene } = useThree()

  const fpTargetPosition = useRef(new Vector3())
  const fpTargetLookAt = useRef(new Vector3())
  const targetPosition = useRef(new Vector3())
  const targetLookAt = useRef(new Vector3())
  const currentLookAt = useRef(new Vector3())

  const prevPathT = useRef<number | null>(null)
  const prevTravelDir = useRef<1 | -1>(1)
  const lastMotionDir = useRef<1 | -1>(1)
  const motionLockUntilMs = useRef(0)

  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const down = useMemo(() => new THREE.Vector3(0, -1, 0), [])
  const rayOrigin = useRef(new THREE.Vector3())

  const islandRootRef = useRef<THREE.Object3D | null>(null)
  const groundMeshesRef = useRef<THREE.Object3D[] | null>(null)

  const cachedGroundKey = useRef<string | null>(null)
  const cachedGroundY = useRef<number | null>(null)
  const lastValidGroundY = useRef<number | null>(null)

  const cachedCameraGroundKey = useRef<string | null>(null)
  const cachedCameraGroundY = useRef<number | null>(null)
  const lastValidCameraGroundY = useRef<number | null>(null)

  const resetGroundCaches = () => {
    cachedGroundKey.current = null
    cachedGroundY.current = null
    lastValidGroundY.current = null
    cachedCameraGroundKey.current = null
    cachedCameraGroundY.current = null
    lastValidCameraGroundY.current = null
  }

  const pathCurve = useMemo(() => {
    const points = EARTH_ROUTE_POINTS.map((p) => new Vector3(p[0], p[1], p[2]))
    return new CatmullRomCurve3(points, false, "catmullrom", 0.5)
  }, [])

  const birdEyePosition = useMemo(() => new Vector3(...BIRD_EYE_CAMERA_CONFIG.position), [])
  const birdEyeLookAt = useMemo(() => new Vector3(...BIRD_EYE_CAMERA_CONFIG.lookAt), [])

  const point = useRef(new Vector3())
  const tangent = useRef(new Vector3())
  const pathForwardFlat = useRef(new Vector3())
  const look = useRef(new Vector3())

  const smoothedRouteT = useRef(0)
  const smoothedOverviewBlend = useRef(0)
  const smoothedTitleBlend = useRef(0)

  useFrame((_, delta) => {
    const worldState = useWorldStore.getState()
    const routeT = worldState.routeT
    const overviewBlend = worldState.overviewBlend
    const titleCardBlend = worldState.titleCardBlend
    const travelDir = worldState.travelDir
    const mousePosition = worldState.mousePosition

    const routeTarget = Math.max(0, Math.min(1, routeT))
    const overviewTarget = Math.max(0, Math.min(1, overviewBlend))
    const titleTarget = Math.max(0, Math.min(1, titleCardBlend))

    smoothedRouteT.current = THREE.MathUtils.damp(smoothedRouteT.current, routeTarget, 10, delta)
    smoothedOverviewBlend.current = THREE.MathUtils.damp(smoothedOverviewBlend.current, overviewTarget, 10, delta)
    smoothedTitleBlend.current = THREE.MathUtils.damp(smoothedTitleBlend.current, titleTarget, 10, delta)

    const pathT = smoothedRouteT.current
    const overviewMix = smoothedOverviewBlend.current
    const titleMix = smoothedTitleBlend.current

    const baseDir: 1 | -1 = travelDir === -1 ? -1 : 1
    let walkDir: 1 | -1 = lastMotionDir.current

    const prevT = prevPathT.current
    prevPathT.current = pathT
    let deltaT = 0

    if (prevT == null) {
      walkDir = baseDir
      lastMotionDir.current = baseDir
    } else {
      deltaT = pathT - prevT
      if (Math.abs(deltaT) > 1e-4) {
        walkDir = deltaT > 0 ? 1 : -1
        lastMotionDir.current = walkDir
      }
    }

    if (walkDir !== prevTravelDir.current) {
      prevTravelDir.current = walkDir
      motionLockUntilMs.current = performance.now() + 260
    }

    if (prevT != null) {
      if (Math.abs(deltaT) > 1e-4) {
        motionLockUntilMs.current = performance.now() + 260
      }
    }

    pathCurve.getPointAt(pathT, point.current)
    pathCurve.getTangentAt(pathT, tangent.current)

    pathForwardFlat.current.copy(tangent.current)
    pathForwardFlat.current.y = 0
    if (pathForwardFlat.current.lengthSq() > 1e-8) pathForwardFlat.current.normalize()
    else pathForwardFlat.current.set(0, 0, -1)

    let desiredX = point.current.x
    let desiredZ = point.current.z
    desiredX -= pathForwardFlat.current.x * CAMERA_BACK_OFFSET
    desiredZ -= pathForwardFlat.current.z * CAMERA_BACK_OFFSET
    desiredX += pathForwardFlat.current.z * CAMERA_LEFT_OFFSET
    desiredZ += -pathForwardFlat.current.x * CAMERA_LEFT_OFFSET
    if (titleMix > 1e-4) {
      desiredX += pathForwardFlat.current.x * (-TITLE_BACK * titleMix)
      desiredZ += pathForwardFlat.current.z * (-TITLE_BACK * titleMix)
    }

    const islandRoot = scene.getObjectByName("Island-earth")
    if (islandRoot && islandRootRef.current !== islandRoot) {
      islandRootRef.current = islandRoot
      groundMeshesRef.current = null
      resetGroundCaches()
    }

    if (islandRoot && !groundMeshesRef.current) {
      const resolved = getGroundMeshes(islandRoot)
      if (resolved) {
        groundMeshesRef.current = resolved
        resetGroundCaches()
      }
    }

    const groundMeshes = groundMeshesRef.current

    const quantX = Math.round(desiredX * 2) / 2
    const quantZ = Math.round(desiredZ * 2) / 2
    const groundKey = `${quantX}:${quantZ}`

    if (groundMeshes && cachedGroundKey.current !== groundKey) {
      cachedGroundKey.current = groundKey
      cachedGroundY.current = null

      rayOrigin.current.set(desiredX, camera.position.y + 2000, desiredZ)
      raycaster.set(rayOrigin.current, down)
      raycaster.far = 8000

      const hit = raycaster.intersectObjects(groundMeshes, true)[0]
      if (hit) {
        cachedGroundY.current = hit.point.y
        lastValidGroundY.current = hit.point.y
      }
    }

    const surfaceY = cachedGroundY.current ?? lastValidGroundY.current ?? 0
    const desiredY = surfaceY + WORLD_CONFIG.cameraHeight + EARTH_EYE_HEIGHT_BONUS + TITLE_LIFT * titleMix

    fpTargetPosition.current.set(desiredX, desiredY, desiredZ)

    look.current.copy(tangent.current).normalize().multiplyScalar(LOOK_DISTANCE * walkDir)
    const lookDownOffset = LOOK_DOWN_OFFSET * (1 - titleMix)
    fpTargetLookAt.current.set(desiredX + look.current.x, desiredY - lookDownOffset, desiredZ + look.current.z)

    const allowMouseLook = performance.now() >= motionLockUntilMs.current
    if (allowMouseLook) {
      fpTargetLookAt.current.x += mousePosition.x * 6 * overviewMix
      fpTargetLookAt.current.y += mousePosition.y * 3 * overviewMix
    }

    targetPosition.current.copy(birdEyePosition).lerp(fpTargetPosition.current, overviewMix)
    targetLookAt.current.copy(birdEyeLookAt).lerp(fpTargetLookAt.current, overviewMix)

    const distToTarget = camera.position.distanceTo(targetPosition.current)
    const isFar = distToTarget > 240

    let positionDamp = isFar ? 0.085 : 0.12
    let lookDamp = isFar ? 0.085 : 0.12

    if (overviewMix <= 0.001) {
      positionDamp = 0.15
      lookDamp = 0.15
    } else if (overviewMix < 1) {
      positionDamp = 0.08
      lookDamp = 0.08
    }

    easing.damp3(camera.position, targetPosition.current, positionDamp, delta)
    easing.damp3(currentLookAt.current, targetLookAt.current, lookDamp, delta)

    const perspectiveCamera = camera as THREE.PerspectiveCamera
    const desiredFilmOffset = OVERVIEW_FILM_OFFSET * (1 - overviewMix)
    if (Math.abs(perspectiveCamera.filmOffset - desiredFilmOffset) > 1e-4) {
      perspectiveCamera.filmOffset = desiredFilmOffset
      perspectiveCamera.updateProjectionMatrix()
    }

    if (groundMeshes) {
      const quantCamX = Math.round(camera.position.x * 2) / 2
      const quantCamZ = Math.round(camera.position.z * 2) / 2
      const cameraGroundKey = `${quantCamX}:${quantCamZ}`

      if (cachedCameraGroundKey.current !== cameraGroundKey) {
        cachedCameraGroundKey.current = cameraGroundKey
        cachedCameraGroundY.current = null

        rayOrigin.current.set(camera.position.x, camera.position.y + 2000, camera.position.z)
        raycaster.set(rayOrigin.current, down)
        raycaster.far = 8000

        const hit = raycaster.intersectObjects(groundMeshes, true)[0]
        if (hit) {
          cachedCameraGroundY.current = hit.point.y
          lastValidCameraGroundY.current = hit.point.y
        }
      }

      const clampGroundY = cachedCameraGroundY.current ?? lastValidCameraGroundY.current
      if (clampGroundY != null) {
        const minY = clampGroundY + WORLD_CONFIG.cameraHeight + GROUND_EPSILON
        if (camera.position.y < minY) camera.position.y = minY
      }
    }

    camera.lookAt(currentLookAt.current)
  })

  return null
}



import { useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { CatmullRomCurve3, Vector3 } from "three"
import { easing } from "maath"
import { useWorldStore } from "@/store/worldStore"
import { EARTH_ROUTE_POINTS, EARTH_SECTION_T_STOPS, WORLD_CONFIG } from "@/config"
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
  const { camera, scene, size } = useThree()

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

  const isNarrow = size.width <= 640
  const birdEyePosition = useMemo(() => {
    const base = new Vector3(...BIRD_EYE_CAMERA_CONFIG.position)
    if (!isNarrow) return base
    base.multiplyScalar(1.18)
    base.y += 18
    base.z -= 24
    return base
  }, [isNarrow])
  const birdEyeLookAt = useMemo(() => {
    const base = new Vector3(...BIRD_EYE_CAMERA_CONFIG.lookAt)
    if (!isNarrow) return base
    base.y -= 4
    return base
  }, [isNarrow])

  const point = useRef(new Vector3())
  const tangent = useRef(new Vector3())
  const pathForwardFlat = useRef(new Vector3())
  const look = useRef(new Vector3())
  const lookDir = useRef(new Vector3())
  const lastLookDir = useRef(new Vector3(0, 0, -1))
  const lastMouseLogAt = useRef(0)
  const lastMousePos = useRef({ x: 0, y: 0 })
  const lastDirMismatchLogAt = useRef(0)
  const lastBackwardLogAt = useRef(0)
  const lastTangentLogAt = useRef(0)
  const lastClampLogAt = useRef(0)
  const prevIsSettled = useRef(false)
  const lastSettleLogAt = useRef(0)

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
    const researchSectionEnd = EARTH_SECTION_T_STOPS[1] ?? 1

    smoothedRouteT.current = THREE.MathUtils.damp(smoothedRouteT.current, routeTarget, 10, delta)
    smoothedOverviewBlend.current = THREE.MathUtils.damp(smoothedOverviewBlend.current, overviewTarget, 10, delta)
    smoothedTitleBlend.current = THREE.MathUtils.damp(smoothedTitleBlend.current, titleTarget, 10, delta)

    if (Math.abs(smoothedRouteT.current - routeTarget) < 0.0006) {
      const now = performance.now()
      if (now - lastClampLogAt.current > 250 && Math.abs(smoothedRouteT.current - routeTarget) > 0) {
        lastClampLogAt.current = now
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "post-fix",
            hypothesisId: "H29",
            location: "FirstPersonController.tsx:routeClamp",
            message: "RouteT clamped to target",
            data: {
              smoothedRouteT: smoothedRouteT.current,
              routeTarget,
              delta
            },
            timestamp: Date.now()
          })
        }).catch(() => {})
        // #endregion agent log
      }
      smoothedRouteT.current = routeTarget
    }
    if (Math.abs(smoothedOverviewBlend.current - overviewTarget) < 0.002) {
      smoothedOverviewBlend.current = overviewTarget
    }
    if (Math.abs(smoothedTitleBlend.current - titleTarget) < 0.002) {
      smoothedTitleBlend.current = titleTarget
    }

    const pathT = smoothedRouteT.current
    const overviewMix = smoothedOverviewBlend.current
    const titleMix = smoothedTitleBlend.current
    const isResearchTitle = titleMix > 0.6 && routeTarget <= researchSectionEnd + 0.001

    const baseDir: 1 | -1 = travelDir === -1 ? -1 : 1
    let walkDir: 1 | -1 = lastMotionDir.current

    const prevT = prevPathT.current
    prevPathT.current = pathT
    let deltaT = 0
    const routeDelta = Math.abs(routeTarget - pathT)

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

    const isSettled =
      routeDelta < 0.0006 &&
      Math.abs(deltaT) < 1e-5 &&
      Math.abs(overviewTarget - overviewMix) < 0.002 &&
      Math.abs(titleTarget - titleMix) < 0.002
    if (isSettled !== prevIsSettled.current) {
      const now = performance.now()
      if (now - lastSettleLogAt.current > 200) {
        lastSettleLogAt.current = now
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "post-fix",
            hypothesisId: "H30",
            location: "FirstPersonController.tsx:isSettled",
            message: "IsSettled changed",
            data: {
              isSettled,
              routeDelta,
              deltaT,
              overviewMix,
              titleMix
            },
            timestamp: Date.now()
          })
        }).catch(() => {})
        // #endregion agent log
      }
      prevIsSettled.current = isSettled
    }
    if (isResearchTitle && travelDir === 1 && titleMix > 0.25) {
      walkDir = 1
      lastMotionDir.current = 1
    } else if (isSettled && walkDir !== baseDir) {
      walkDir = baseDir
      lastMotionDir.current = baseDir
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
    const tangentLenSq = tangent.current.lengthSq()

    pathForwardFlat.current.copy(tangent.current)
    pathForwardFlat.current.y = 0
    if (pathForwardFlat.current.lengthSq() > 1e-8) pathForwardFlat.current.normalize()
    else pathForwardFlat.current.set(0, 0, -1)
    if (tangentLenSq < 1e-6 && (pathT > 0.98 || pathT < 0.02)) {
      const now = performance.now()
      if (now - lastTangentLogAt.current > 400) {
        lastTangentLogAt.current = now
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "post-fix",
            hypothesisId: "H20",
            location: "FirstPersonController.tsx:tangent",
            message: "Tangent length near zero at path end",
            data: {
              pathT,
              tangentLenSq,
              overviewMix,
              titleMix
            },
            timestamp: Date.now()
          })
        }).catch(() => {})
        // #endregion agent log
      }
    }

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

    lookDir.current.copy(tangent.current)
    if (lookDir.current.lengthSq() > 1e-8) {
      lookDir.current.normalize()
    } else {
      lookDir.current.set(0, 0, -1)
    }
    lookDir.current.multiplyScalar(walkDir)

    const hasMotion = (prevT != null && Math.abs(deltaT) > 2e-4) || routeDelta > 0.002
    if (hasMotion || prevT == null || (isResearchTitle && travelDir === 1 && titleMix > 0.25)) {
      lastLookDir.current.copy(lookDir.current)
    }

    look.current.copy(lastLookDir.current).multiplyScalar(LOOK_DISTANCE)
    const lookDownOffset = LOOK_DOWN_OFFSET * (1 - titleMix)
    fpTargetLookAt.current.set(desiredX + look.current.x, desiredY - lookDownOffset, desiredZ + look.current.z)

    if (!hasMotion && routeDelta < 0.0006 && look.current.length() > 0.001) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "post-fix",
          hypothesisId: "H15",
          location: "FirstPersonController.tsx:lookDirection",
          message: "Look direction while settled",
          data: {
            routeDelta,
            deltaT,
            walkDir,
            lookX: look.current.x,
            lookZ: look.current.z,
            overviewMix,
            titleMix
          },
          timestamp: Date.now()
        })
      }).catch(() => {})
      // #endregion agent log
    }

    const allowMouseLook = performance.now() >= motionLockUntilMs.current && !isSettled
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

    const positionError = camera.position.distanceTo(targetPosition.current)
    const lookError = currentLookAt.current.distanceTo(targetLookAt.current)
    const now = performance.now()
    const mouseDeltaX = mousePosition.x - lastMousePos.current.x
    const mouseDeltaY = mousePosition.y - lastMousePos.current.y
    if (isSettled && allowMouseLook && (Math.abs(mouseDeltaX) > 0.012 || Math.abs(mouseDeltaY) > 0.012)) {
      if (now - lastMouseLogAt.current > 250) {
        lastMouseLogAt.current = now
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "post-fix",
            hypothesisId: "H18",
            location: "FirstPersonController.tsx:mouseLook",
            message: "Mouse look while settled",
            data: {
              mouseX: mousePosition.x,
              mouseY: mousePosition.y,
              mouseDeltaX,
              mouseDeltaY,
              overviewMix,
              routeDelta
            },
            timestamp: Date.now()
          })
        }).catch(() => {})
        // #endregion agent log
      }
    }
    lastMousePos.current.x = mousePosition.x
    lastMousePos.current.y = mousePosition.y
    if (isSettled && walkDir !== baseDir) {
      if (now - lastDirMismatchLogAt.current > 250) {
        lastDirMismatchLogAt.current = now
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "post-fix",
            hypothesisId: "H21",
            location: "FirstPersonController.tsx:dirMismatch",
            message: "Walk direction differs from travel direction",
            data: {
              walkDir,
              travelDir,
              routeDelta,
              deltaT,
              overviewMix
            },
            timestamp: Date.now()
          })
        }).catch(() => {})
        // #endregion agent log
      }
    }
    const lookDot = lastLookDir.current.dot(pathForwardFlat.current)
    if (isSettled && overviewMix > 0.2 && lookDot < -0.2) {
      if (now - lastBackwardLogAt.current > 300) {
        lastBackwardLogAt.current = now
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "post-fix",
            hypothesisId: "H19",
            location: "FirstPersonController.tsx:lookDot",
            message: "Look direction points backward",
            data: {
              lookDot,
              walkDir,
              travelDir,
              routeDelta,
              overviewMix
            },
            timestamp: Date.now()
          })
        }).catch(() => {})
        // #endregion agent log
      }
    }
    if (routeDelta < 0.0006 && Math.abs(deltaT) < 1e-5) {
      smoothedTitleBlend.current = titleTarget
    }
    if (routeDelta < 0.0015 && (positionError > 0.06 || lookError > 0.06)) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "post-fix",
          hypothesisId: "H1",
          location: "FirstPersonController.tsx:isSettled",
          message: "Camera still adjusting after settle window",
          data: {
            routeDelta,
            deltaT,
            positionError,
            lookError,
            overviewMix,
            titleMix
          },
          timestamp: Date.now()
        })
      }).catch(() => {})
      // #endregion agent log
    }

    const settleSnapThreshold = 0.06
    if (isSettled && positionError < settleSnapThreshold && lookError < settleSnapThreshold) {
      camera.position.copy(targetPosition.current)
      currentLookAt.current.copy(targetLookAt.current)
    } else {
      easing.damp3(camera.position, targetPosition.current, positionDamp, delta)
      easing.damp3(currentLookAt.current, targetLookAt.current, lookDamp, delta)
    }

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



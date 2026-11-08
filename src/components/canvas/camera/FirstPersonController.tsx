import { useEffect, useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { Vector3 } from "three"
import { easing } from "maath"
import { useWorldStore } from "@/store/worldStore"
import { EARTH_SECTION_T_STOPS, WORLD_CONFIG, cardPullbackAt } from "@/config"
import { getOverviewFraming } from "./overviewFraming"
import { REFLECTION_EXCLUDED_LAYER } from "@/config/renderLayers"
import { clamp01, fract, loopDelta } from "@/utils/math"

const CAMERA_BACK_OFFSET = 12
const CAMERA_LEFT_OFFSET = 1.2
const GROUND_EPSILON = 0.04
const EARTH_EYE_HEIGHT_BONUS = 0.7
const UP = new THREE.Vector3(0, 1, 0)

const LOOK_DISTANCE = 16
const LOOK_DOWN_OFFSET = 3.6
const TITLE_LIFT = 1.2

export function FirstPersonController() {
  const { camera, size } = useThree()

  useEffect(() => {
    camera.layers.enable(REFLECTION_EXCLUDED_LAYER)
  }, [camera])

  const fpTargetPosition = useRef(new Vector3())
  const fpTargetLookAt = useRef(new Vector3())
  const targetPosition = useRef(new Vector3())
  const targetLookAt = useRef(new Vector3())
  const currentLookAt = useRef(new Vector3())

  const prevPathT = useRef<number | null>(null)
  const prevTravelDir = useRef<1 | -1>(1)
  const lastMotionDir = useRef<1 | -1>(1)
  const motionLockUntilMs = useRef(0)

  const overviewScene = useWorldStore((state) => state.overviewScene)
  const overview = useMemo(
    () => (overviewScene ? getOverviewFraming(overviewScene, size.width, size.height, (camera as THREE.PerspectiveCamera).fov) : null),
    [overviewScene, camera, size.width, size.height]
  )

  const point = useRef(new Vector3())
  const tangent = useRef(new Vector3())
  const cameraGround = useRef(new Vector3())
  const pathForwardFlat = useRef(new Vector3())
  const look = useRef(new Vector3())
  const lookDir = useRef(new Vector3())
  const lastLookDir = useRef(new Vector3(0, 0, -1))
  const lastMousePos = useRef({ x: 0, y: 0 })
  const prevIsSettled = useRef(false)

  const smoothedRouteT = useRef(0)
  const smoothedOverviewBlend = useRef(0)
  const smoothedTitleBlend = useRef(0)
  const smoothedLookYaw = useRef(0)
  const hasOpened = useRef(false)

  useFrame((_, delta) => {
    const worldState = useWorldStore.getState()
    const routeT = worldState.routeT
    const overviewBlend = worldState.overviewBlend
    const titleCardBlend = worldState.titleCardBlend
    const travelDir = worldState.travelDir
    const mousePosition = worldState.mousePosition
    const groundHeightAt = worldState.groundHeightAt
    const route = worldState.walkRoute
    // Until the island has loaded there is no road to walk, and the frame loop waits for it.
    if (!route || !overview) return

    // The first frame is the overview itself, with no drift from the canvas's default pose: it opens behind the loader.
    if (!hasOpened.current) {
      hasOpened.current = true
      camera.position.copy(overview.position)
      currentLookAt.current.copy(overview.lookAt)
    }

    const routeTarget = clamp01(routeT)
    const overviewTarget = clamp01(overviewBlend)
    const titleTarget = clamp01(titleCardBlend)
    const firstSectionEnd = EARTH_SECTION_T_STOPS[2] ?? 1

    // The walk is a loop that starts and ends at the quay, so the camera eases towards the deck's route t
    // the short way round: on from the end of the road to the overview, never back along the whole ring.
    const routeGap = loopDelta(smoothedRouteT.current, routeTarget)
    smoothedRouteT.current = fract(smoothedRouteT.current + THREE.MathUtils.damp(0, routeGap, 10, delta))
    smoothedOverviewBlend.current = THREE.MathUtils.damp(smoothedOverviewBlend.current, overviewTarget, 10, delta)
    smoothedTitleBlend.current = THREE.MathUtils.damp(smoothedTitleBlend.current, titleTarget, 10, delta)
    smoothedLookYaw.current = THREE.MathUtils.damp(smoothedLookYaw.current, worldState.lookYaw, 6, delta)

    if (Math.abs(loopDelta(smoothedRouteT.current, routeTarget)) < 0.0006) {
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
    const isFirstTitle = titleMix > 0.6 && routeTarget <= firstSectionEnd + 0.001

    const baseDir: 1 | -1 = travelDir === -1 ? -1 : 1
    let walkDir: 1 | -1 = lastMotionDir.current

    const prevT = prevPathT.current
    prevPathT.current = pathT
    let deltaT = 0
    const routeDelta = Math.abs(loopDelta(pathT, routeTarget))

    if (prevT == null) {
      walkDir = baseDir
      lastMotionDir.current = baseDir
    } else {
      deltaT = loopDelta(prevT, pathT)
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
      prevIsSettled.current = isSettled
    }
    if (isFirstTitle && travelDir === 1 && titleMix > 0.25) {
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

    route.getPointAt(pathT, point.current)
    route.getTangentAt(pathT, tangent.current)

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
      const pullback = cardPullbackAt(routeTarget)
      desiredX += pathForwardFlat.current.x * (-pullback * titleMix)
      desiredZ += pathForwardFlat.current.z * (-pullback * titleMix)
    }

    // The camera stands on the road behind the walk's point, so it takes the road's own height there, which
    // carries it over the stone bridge's hump rather than down to the stream under it.
    const surfaceY = route.getPointAt(pathT - CAMERA_BACK_OFFSET / route.length, cameraGround.current).y
    const desiredY = surfaceY + WORLD_CONFIG.cameraHeight + EARTH_EYE_HEIGHT_BONUS + TITLE_LIFT * titleMix

    fpTargetPosition.current.set(desiredX, desiredY, desiredZ)

    lookDir.current.copy(tangent.current)
    if (lookDir.current.lengthSq() > 1e-8) {
      lookDir.current.normalize()
    } else {
      lookDir.current.set(0, 0, -1)
    }
    lookDir.current.multiplyScalar(walkDir)
    // Sideways look from horizontal wheel, trackpad, touch, or arrow keys; eases back to the road on travel.
    if (Math.abs(smoothedLookYaw.current) > 1e-4) lookDir.current.applyAxisAngle(UP, smoothedLookYaw.current)

    const hasMotion = (prevT != null && Math.abs(deltaT) > 2e-4) || routeDelta > 0.002
    const isTurning = Math.abs(smoothedLookYaw.current - worldState.lookYaw) > 1e-3 || Math.abs(smoothedLookYaw.current) > 1e-4
    if (hasMotion || isTurning || prevT == null || (isFirstTitle && travelDir === 1 && titleMix > 0.25)) {
      lastLookDir.current.copy(lookDir.current)
    }

    look.current.copy(lastLookDir.current).multiplyScalar(LOOK_DISTANCE)
    const lookDownOffset = LOOK_DOWN_OFFSET * (1 - titleMix)
    fpTargetLookAt.current.set(desiredX + look.current.x, desiredY - lookDownOffset, desiredZ + look.current.z)

    const allowMouseLook = performance.now() >= motionLockUntilMs.current && !isSettled
    if (allowMouseLook) {
      fpTargetLookAt.current.x += mousePosition.x * 6 * overviewMix
      fpTargetLookAt.current.y += mousePosition.y * 3 * overviewMix
    }

    targetPosition.current.copy(overview.position).lerp(fpTargetPosition.current, overviewMix)
    targetLookAt.current.copy(overview.lookAt).lerp(fpTargetLookAt.current, overviewMix)

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
    lastMousePos.current.x = mousePosition.x
    lastMousePos.current.y = mousePosition.y
    if (routeDelta < 0.0006 && Math.abs(deltaT) < 1e-5) {
      smoothedTitleBlend.current = titleTarget
    }

    const settleSnapThreshold = 0.06
    if (isSettled && positionError < settleSnapThreshold && lookError < settleSnapThreshold) {
      camera.position.copy(targetPosition.current)
      currentLookAt.current.copy(targetLookAt.current)
    } else {
      easing.damp3(camera.position, targetPosition.current, positionDamp, delta)
      easing.damp3(currentLookAt.current, targetLookAt.current, lookDamp, delta)
    }

    // The overview's lens shift moves the island beside the hero card; it eases out as the camera descends.
    const perspectiveCamera = camera as THREE.PerspectiveCamera
    const offsetX = overview.viewOffset.x * (1 - overviewMix)
    const offsetY = overview.viewOffset.y * (1 - overviewMix)
    const view = perspectiveCamera.view
    if (
      !view ||
      view.fullWidth !== size.width ||
      view.fullHeight !== size.height ||
      Math.abs(view.offsetX - offsetX) > 0.01 ||
      Math.abs(view.offsetY - offsetY) > 0.01
    ) {
      perspectiveCamera.setViewOffset(size.width, size.height, offsetX, offsetY, size.width, size.height)
    }

    if (groundHeightAt && overviewMix > 0.999) {
      const minY = groundHeightAt(camera.position.x, camera.position.z) + WORLD_CONFIG.cameraHeight + GROUND_EPSILON
      if (camera.position.y < minY) camera.position.y = minY
    }

    camera.lookAt(currentLookAt.current)
  })

  return null
}

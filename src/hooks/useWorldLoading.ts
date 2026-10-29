import { useEffect, useRef, useState } from "react"
import { useLoader } from "@react-three/fiber"
import { useProgress } from "@react-three/drei"
import * as THREE from "three"
import { useWorldStore } from "@/store/worldStore"
import { withBase } from "@/utils/assets"
import { clamp } from "@/utils/math"

/** Textures the first frame needs; preloaded so the water and clouds do not pop in after the island. */
const FIRST_FRAME_TEXTURES = [withBase("/textures/waternormals.jpg"), withBase("/textures/cloud.png")]
/** A download that sits at 99% or more for this long counts as finished. */
const STALL_AFTER_MS = 4000
const STALL_POLL_MS = 500
/** Phones keep the overlay up at least this long so a fast load does not flash. */
const MIN_OVERLAY_MS_MOBILE = 1200
const MIN_OVERLAY_MS_DESKTOP = 0
/** The overlay lifts at least this long after the scene is ready, so the last models can settle. */
const MIN_LIFT_DELAY_MS = 500
/** The displayed progress eases towards the real one by this fraction per frame, and snaps when closer than this. */
const PROGRESS_EASING = 0.12
const PROGRESS_SNAP = 0.2

/**
 * Drives the loading overlay: tracks drei's download progress, treats errors and stalled downloads
 * as done, lifts the overlay only when every download has finished and the island has drawn with
 * all of its models in place, and eases the displayed percentage so it never jumps.
 */
export function useWorldLoading({ isMobile }: { isMobile: boolean }) {
  const setLoaderBypassed = useWorldStore((state) => state.setLoaderBypassed)
  const isLoaderBypassed = useWorldStore((state) => state.isLoaderBypassed)
  const setLoadingOverlayVisible = useWorldStore((state) => state.setLoadingOverlayVisible)
  const isEarthSceneReady = useWorldStore((state) => state.isEarthSceneReady)
  const isLoadingActive = useProgress((state) => state.active)
  const loadingProgress = useProgress((state) => state.progress)
  const loadingLoaded = useProgress((state) => state.loaded)
  const loadingTotal = useProgress((state) => state.total)
  const loadingErrors = useProgress((state) => state.errors)

  const [forceReady, setForceReady] = useState(false)
  const lastProgressRef = useRef(0)
  const lastProgressTimeRef = useRef(0)
  const progressRef = useRef(0)
  const rafProgressRef = useRef<number | null>(null)
  const [displayProgress, setDisplayProgress] = useState(0)
  const [isFullyLoaded, setIsFullyLoaded] = useState(false)
  const fullyLoadedRef = useRef(false)
  const loadCompleteTimerRef = useRef<number | null>(null)
  const overlayStartRef = useRef<number | null>(null)
  const minOverlayMs = isMobile ? MIN_OVERLAY_MS_MOBILE : MIN_OVERLAY_MS_DESKTOP

  useEffect(() => {
    for (const tex of FIRST_FRAME_TEXTURES) {
      useLoader.preload(THREE.TextureLoader, tex)
    }
  }, [])

  useEffect(() => {
    if (!isLoadingActive) {
      if (isFullyLoaded) {
        setForceReady(false)
        setLoaderBypassed(false)
      }
      return
    }
    lastProgressTimeRef.current = performance.now()
    if (loadingProgress !== lastProgressRef.current) {
      lastProgressRef.current = loadingProgress
      lastProgressTimeRef.current = performance.now()
    }
  }, [isFullyLoaded, isLoadingActive, loadingProgress, setLoaderBypassed])

  useEffect(() => {
    if (loadingErrors.length === 0) return
    setForceReady(true)
    setLoaderBypassed(true)
  }, [loadingErrors.length, setLoaderBypassed])

  useEffect(() => {
    if (!isLoadingActive) return
    const intervalId = window.setInterval(() => {
      const stagnantMs = performance.now() - lastProgressTimeRef.current
      const isStalled = loadingProgress >= 99 && stagnantMs > STALL_AFTER_MS
      if (isStalled) {
        setForceReady(true)
        setLoaderBypassed(true)
      }
    }, STALL_POLL_MS)
    return () => window.clearInterval(intervalId)
  }, [isLoadingActive, isMobile, loadingProgress, setLoaderBypassed])

  const showOverlay = !isFullyLoaded
  const targetProgress = forceReady ? 100 : clamp(loadingProgress, 0, 100)

  useEffect(() => {
    if (!isLoadingActive) return
    progressRef.current = 0
    setDisplayProgress(0)
  }, [isLoadingActive])

  useEffect(() => {
    if (overlayStartRef.current == null) {
      overlayStartRef.current = performance.now()
    }
  }, [])

  // The overlay lifts only when every download has finished and the island has drawn with all of
  // its models in place, so nothing pops in afterwards. Errors or a stalled download still let the
  // page through rather than leaving the loader up forever.
  useEffect(() => {
    if (fullyLoadedRef.current) return
    const isLoadComplete =
      loadingTotal > 0 && loadingLoaded >= loadingTotal && !isLoadingActive && loadingProgress >= 100 && isEarthSceneReady
    const shouldForceComplete = isLoaderBypassed
    if (!isLoadComplete && !shouldForceComplete) {
      if (loadCompleteTimerRef.current != null) {
        window.clearTimeout(loadCompleteTimerRef.current)
        loadCompleteTimerRef.current = null
      }
      return
    }
    if (loadCompleteTimerRef.current != null) return
    const startAt = overlayStartRef.current ?? performance.now()
    const elapsed = performance.now() - startAt
    const delay = Math.max(MIN_LIFT_DELAY_MS, minOverlayMs - elapsed)
    loadCompleteTimerRef.current = window.setTimeout(() => {
      fullyLoadedRef.current = true
      setIsFullyLoaded(true)
      loadCompleteTimerRef.current = null
    }, delay)
  }, [isEarthSceneReady, isLoadingActive, isLoaderBypassed, loadingLoaded, loadingProgress, loadingTotal, minOverlayMs])

  useEffect(() => {
    setLoadingOverlayVisible(showOverlay)
  }, [setLoadingOverlayVisible, showOverlay])

  useEffect(() => {
    if (!showOverlay) {
      progressRef.current = targetProgress
      setDisplayProgress(targetProgress)
      return
    }

    const tick = () => {
      const current = progressRef.current
      const desired = isLoadingActive ? Math.max(targetProgress, current) : targetProgress
      const diff = desired - current
      if (Math.abs(diff) < PROGRESS_SNAP) {
        progressRef.current = desired
        setDisplayProgress(desired)
        rafProgressRef.current = null
        return
      }
      const next = current + diff * PROGRESS_EASING
      progressRef.current = next
      setDisplayProgress(next)
      rafProgressRef.current = requestAnimationFrame(tick)
    }

    if (rafProgressRef.current != null) {
      cancelAnimationFrame(rafProgressRef.current)
    }
    rafProgressRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafProgressRef.current != null) {
        cancelAnimationFrame(rafProgressRef.current)
        rafProgressRef.current = null
      }
    }
  }, [isLoadingActive, showOverlay, targetProgress])

  return { showOverlay, displayProgress }
}

import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { Canvas, useLoader, useThree } from "@react-three/fiber"
import { Cloud, Clouds, PerformanceMonitor, useGLTF, useProgress, useTexture } from "@react-three/drei"
import * as THREE from "three"
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js"
import { FirstPersonController, IslandTrail } from "./camera"
import { EarthIsland } from "./islands"
import { Ocean, ProceduralSky } from "./environment"
import { ModelErrorBoundary } from "./models/ModelErrorBoundary"
import { MODEL_PATHS } from "@/hooks/useIslandModels"
import { useIsMobile } from "@/hooks/useIsMobile"
import { supportsKtx2Textures, toKtx2Url } from "@/utils/textures"
import { useWorldStore } from "@/store/worldStore"
import { withBase } from "@/utils/assets"
import { clamp } from "@/utils/math"
import { scheduleIdleTask } from "@/utils/scheduling"
import { PostProcessing } from "./PostProcessing"

const PRELOAD_TEXTURES = [
  withBase("/textures/hq/cliff_side/cliff_side_diff_2k.jpg"),
  withBase("/textures/hq/cliff_side/cliff_side_nor_gl_2k.jpg"),
  withBase("/textures/hq/cliff_side/cliff_side_arm_2k.jpg"),
  withBase("/textures/hq/cobblestone_pavement/cobblestone_pavement_diff_2k.jpg"),
  withBase("/textures/hq/cobblestone_pavement/cobblestone_pavement_nor_gl_2k.jpg"),
  withBase("/textures/hq/cobblestone_pavement/cobblestone_pavement_arm_2k.jpg"),
  withBase("/textures/hq/sparse_grass/sparse_grass_diff_2k.jpg"),
  withBase("/textures/hq/sparse_grass/sparse_grass_nor_gl_2k.jpg"),
  withBase("/textures/hq/sparse_grass/sparse_grass_arm_2k.jpg")
]

const FIRST_FRAME_TEXTURES = [withBase("/textures/waternormals.jpg"), withBase("/textures/cloud.png")]

const PRELOAD_GLTFS = [
  MODEL_PATHS.earth.hqGrassMedium01,
  MODEL_PATHS.earth.hqTreeStump,
  MODEL_PATHS.earth.hqTree,
  MODEL_PATHS.earth.hqBoulder,
  MODEL_PATHS.earth.hqFern,
  MODEL_PATHS.earth.fantasyInn,
  MODEL_PATHS.earth.barracks,
  MODEL_PATHS.earth.sawmill,
  MODEL_PATHS.earth.stable,
  MODEL_PATHS.earth.house01,
  MODEL_PATHS.earth.house02,
  MODEL_PATHS.earth.house03,
  MODEL_PATHS.earth.bellTower,
  MODEL_PATHS.earth.mill,
  MODEL_PATHS.earth.blacksmith,
  MODEL_PATHS.earth.marketStand01,
  MODEL_PATHS.earth.marketStand02,
  MODEL_PATHS.earth.well,
  MODEL_PATHS.earth.cart,
  MODEL_PATHS.earth.barrel,
  MODEL_PATHS.earth.crate,
  MODEL_PATHS.earth.fence,
  MODEL_PATHS.earth.cypressTree,
  MODEL_PATHS.earth.flowerBushes,
  MODEL_PATHS.earth.flowers
]

const SUN_ELEVATION = 2
const SUN_AZIMUTH = 180
// The sky keeps its low sunset sun; the key light sits at a late-afternoon angle so roofs, terrain,
// and cliffs receive direct light and cast readable shadows. Fill lights stay low so shadows read.
const KEY_LIGHT_ELEVATION = 30

function RendererConfig({ exposure = 0.5 }: { exposure?: number }) {
  const { gl } = useThree()

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = exposure
    gl.outputColorSpace = THREE.SRGBColorSpace
    gl.info.autoReset = false
  }, [gl, exposure])

  return null
}

function EarthPreload({ enabled }: { enabled: boolean }) {
  const { gl } = useThree()

  useEffect(() => {
    if (!enabled) return

    return scheduleIdleTask(() => {
      const gltfs = Array.from(new Set(PRELOAD_GLTFS))
      const textures = Array.from(new Set(PRELOAD_TEXTURES))
      const useKtx2 = supportsKtx2Textures(gl)

      for (const tex of textures) {
        if (useKtx2) {
          useLoader.preload(KTX2Loader, toKtx2Url(tex), (loader) => {
            const ktx2 = loader as KTX2Loader
            ktx2.setTranscoderPath(withBase("/examples/jsm/libs/basis/"))
            ktx2.detectSupport(gl)
          })
        } else {
          useTexture.preload(tex)
        }
      }

      for (const gltf of gltfs) {
        useGLTF.preload(gltf)
      }
    }, 1600)
  }, [enabled, gl])

  return null
}

function WorldContent({ section }: { section: number }) {
  const overviewBlend = useWorldStore((state) => state.overviewBlend)
  const [shouldPreload, setShouldPreload] = useState(false)
  const shadowMapSize = 2048
  const lightDimming = section >= 5 ? 0.55 : section >= 4 ? 0.65 : section >= 3 ? 0.75 : 1
  const sunIntensity = 3.2 * lightDimming
  const ambientIntensity = 0.32 * Math.min(1, lightDimming + 0.2)
  const pointIntensity = 0.35 * Math.min(1, lightDimming + 0.15)
  const exposure = 0.52 - 0.12 * (1 - lightDimming)
  const sunLightPosition = useMemo<[number, number, number]>(() => {
    const phi = THREE.MathUtils.degToRad(90 - KEY_LIGHT_ELEVATION)
    const theta = THREE.MathUtils.degToRad(SUN_AZIMUTH)
    const sun = new THREE.Vector3().setFromSphericalCoords(1, phi, theta).normalize()
    const distance = 700
    return [sun.x * distance, sun.y * distance, sun.z * distance]
  }, [])

  useEffect(() => {
    return scheduleIdleTask(() => setShouldPreload(true), 1200)
  }, [])

  return (
    <>
      <ambientLight intensity={ambientIntensity} color="#b8c4e0" />

      <directionalLight
        position={sunLightPosition}
        intensity={sunIntensity}
        castShadow
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={300}
        shadow-camera-far={1100}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
        shadow-bias={-0.0002}
        shadow-normalBias={0.05}
        color="#fff5e6"
      />

      <directionalLight
        position={[-80, 100, -80]}
        intensity={0.3 * Math.min(1, lightDimming + 0.25)}
        color="#6080ff"
      />

      <hemisphereLight args={["#87ceeb", "#2a4a2a", 0.35]} />

      <pointLight
        position={[0, 50, 0]}
        intensity={pointIntensity}
        distance={300}
        color="#ffe0b0"
      />

      <EarthPreload enabled={shouldPreload} />

      <RendererConfig exposure={exposure} />

      <ProceduralSky elevation={SUN_ELEVATION} azimuth={SUN_AZIMUTH} mieCoefficient={0.0035} mieDirectionalG={0.74} />

      <Ocean
        sunElevation={SUN_ELEVATION}
        sunAzimuth={SUN_AZIMUTH}
        animationSpeed={0.85 + (1.15 - 0.85) * overviewBlend}
      />

      <FirstPersonController />

      <IslandTrail section={section} />

      <Suspense fallback={null}>
        <Clouds texture={withBase("/textures/cloud.png")} limit={600} frustumCulled={false}>
          <Cloud
            position={[0, 260, -120]}
            bounds={[260, 80, 220]}
            segments={40}
            volume={20}
            opacity={0.22}
            speed={0.12}
            growth={6}
            fade={420}
            color="#ffffff"
          />
          <Cloud
            position={[-180, 240, 40]}
            bounds={[240, 70, 200]}
            segments={35}
            volume={18}
            opacity={0.2}
            speed={0.1}
            growth={5}
            fade={400}
            color="#ffffff"
          />
          <Cloud
            position={[140, 220, 80]}
            bounds={[220, 60, 200]}
            segments={35}
            volume={16}
            opacity={0.18}
            speed={0.09}
            growth={4}
            fade={380}
            color="#ffffff"
          />
          <Cloud
            position={[0, 10, 0]}
            bounds={[520, 18, 520]}
            segments={22}
            volume={8}
            opacity={0.08}
            speed={0.04}
            growth={1.6}
            fade={260}
            color="#ffffff"
          />
        </Clouds>
      </Suspense>

      <EarthIsland />
    </>
  )
}

export function WorldScene({
  section,
}: {
  section: number
}) {
  const setLoaderBypassed = useWorldStore((state) => state.setLoaderBypassed)
  const isLoaderBypassed = useWorldStore((state) => state.isLoaderBypassed)
  const setLoadingOverlayVisible = useWorldStore((state) => state.setLoadingOverlayVisible)
  const isLoadingActive = useProgress((state) => state.active)
  const loadingProgress = useProgress((state) => state.progress)
  const loadingLoaded = useProgress((state) => state.loaded)
  const loadingTotal = useProgress((state) => state.total)
  const loadingErrors = useProgress((state) => state.errors)

  const [enableIntroVideo, setEnableIntroVideo] = useState(false)
  const [didVideoFail, setDidVideoFail] = useState(false)
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
  const isMobile = useIsMobile()
  const minOverlayMs = isMobile ? 1200 : 0
  // Render sharp by default and drop to 1x when the device cannot hold the frame rate.
  const sharpDpr = isMobile ? 1.25 : 1.5
  const [dpr, setDpr] = useState(sharpDpr)

  useEffect(() => {
    let cancelled = false

    const cancelIdleTask = scheduleIdleTask(() => {
      fetch(withBase("/intro/island-loop.mp4"), { method: "HEAD" })
        .then((res) => {
          if (cancelled) return
          const contentType = res.headers.get("content-type") ?? ""
          if (res.ok && contentType.startsWith("video/")) setEnableIntroVideo(true)
        })
        .catch(() => {
          if (!cancelled) setEnableIntroVideo(false)
        })
    }, 700)

    return () => {
      cancelled = true
      cancelIdleTask()
    }
  }, [])

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
    if (!isLoadingActive) return
    const intervalId = window.setInterval(() => {
      const now = performance.now()
      const stagnantMs = now - lastProgressTimeRef.current
      const hasErrors = loadingErrors.length > 0
      const isStalled = loadingProgress >= 99 && stagnantMs > 4000
      if (hasErrors || isStalled) {
        setForceReady(true)
        setLoaderBypassed(true)
      }
    }, 500)
    return () => window.clearInterval(intervalId)
  }, [isLoadingActive, isMobile, loadingErrors.length, loadingProgress, setLoaderBypassed])

  const showOverlay = !isFullyLoaded

  const clampedProgress = clamp(loadingProgress, 0, 100)
  const targetProgress = forceReady ? 100 : clampedProgress

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

  useEffect(() => {
    if (fullyLoadedRef.current) return
    const isLoadComplete =
      loadingTotal > 0 &&
      loadingLoaded >= loadingTotal &&
      !isLoadingActive &&
      loadingProgress >= 100
    const shouldForceComplete = isMobile && isLoaderBypassed
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
    const delay = Math.max(500, minOverlayMs - elapsed)
    loadCompleteTimerRef.current = window.setTimeout(() => {
      fullyLoadedRef.current = true
      setIsFullyLoaded(true)
      loadCompleteTimerRef.current = null
    }, delay)
  }, [isLoadingActive, isLoaderBypassed, isMobile, loadingLoaded, loadingProgress, loadingTotal, minOverlayMs])

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
      if (Math.abs(diff) < 0.2) {
        progressRef.current = desired
        setDisplayProgress(desired)
        rafProgressRef.current = null
        return
      }
      const next = current + diff * 0.12
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

  const progressLineStyle: CSSProperties = {
    ["--world-loader-progress" as string]: `${displayProgress}%`,
    ...(isMobile
      ? {
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)"
        }
      : {})
  }
  const progressLabel = `${Math.round(displayProgress)}%`
  const progressLabelStyle: CSSProperties | undefined = isMobile
    ? { bottom: "calc(env(safe-area-inset-bottom, 0px) + 44px)" }
    : undefined
  const progressLineClassName = isMobile
    ? "absolute left-6 right-6 world-loader-line-wrap"
    : "absolute left-6 right-6 sm:left-[46%] sm:right-[90px] top-[62%] sm:top-[44%] -translate-y-1/2 world-loader-line-wrap"
  const progressLabelClassName = isMobile
    ? "absolute left-6 right-6 text-center"
    : "absolute left-6 right-6 sm:left-[46%] sm:right-[90px] top-[54%] sm:top-[38%] -translate-y-1/2 text-center sm:text-right"

  return (
    <div className="fixed inset-0 w-full h-full">
      <Canvas
        shadows="soft"
        camera={{
          fov: 55,
          near: 0.1,
          far: 20000,
          position: [0, 300, 350]
        }}
        gl={{
          antialias: false,
          alpha: false,
          powerPreference: "high-performance",
          stencil: false,
          depth: true
        }}
        dpr={dpr}
      >
        <PerformanceMonitor
          onDecline={() => setDpr(1)}
          onIncline={() => setDpr(sharpDpr)}
          onFallback={() => setDpr(1)}
          flipflops={3}
        />
        <ModelErrorBoundary fallback={null}>
          <WorldContent section={section} />
          <PostProcessing />
        </ModelErrorBoundary>
      </Canvas>

      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-700 world-loader-overlay z-[360] sm:z-0"
        style={{ opacity: showOverlay ? 1 : 0 }}
        aria-hidden="true"
      >
        <div
          className="absolute inset-0 world-loader-backdrop"
        />

        <div className="absolute inset-0 world-loader-aurora" />
        <div className="absolute inset-0 world-loader-glow-field" />

        <img
          className="absolute inset-0 w-full h-full object-cover"
          src={withBase("/intro/island-loop-poster.svg")}
          alt=""
          style={{ filter: "brightness(1.1) saturate(1.1)" }}
        />

        {enableIntroVideo && !didVideoFail ? (
          <video
            className="absolute inset-0 w-full h-full object-cover"
            src={withBase("/intro/island-loop.mp4")}
            poster={withBase("/intro/island-loop-poster.svg")}
            muted
            playsInline
            autoPlay
            loop
            preload="metadata"
            onError={() => setDidVideoFail(true)}
          />
        ) : null}

        <div
          className={progressLineClassName}
          data-mode="determinate"
          style={progressLineStyle}
        >
          <div className="world-loader-line-track">
            <div className="world-loader-line-fill" />
          </div>
        </div>

        <div
          className={progressLabelClassName}
          style={progressLabelStyle}
        >
          <div className="world-loader-title">Initializing</div>
          <div className="world-loader-subtitle">{progressLabel}</div>
        </div>
      </div>
    </div>
  )
}

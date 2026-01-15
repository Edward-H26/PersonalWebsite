import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react"
import { Canvas, useLoader, useThree } from "@react-three/fiber"
import { Cloud, Clouds, Preload, useGLTF, useProgress, useTexture } from "@react-three/drei"
import * as THREE from "three"
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js"
import { FirstPersonController, IslandTrail } from "./camera"
import { EarthIsland } from "./islands"
import { Ocean, ProceduralSky } from "./environment"
import { ModelErrorBoundary } from "./models/ModelErrorBoundary"
import { PostProcessing } from "./PostProcessing"
import { MODEL_PATHS } from "@/hooks/useIslandModels"
import { useQualityTier, type QualityTier } from "@/hooks/useQualityTier"
import { supportsKtx2Textures, toKtx2Url } from "@/hooks/usePbrTextureSet"
import { useWorldStore } from "@/store/worldStore"

const PRELOAD_TEXTURES = [
  "/textures/hq/cliff_side/cliff_side_diff_2k.jpg",
  "/textures/hq/cliff_side/cliff_side_nor_gl_2k.jpg",
  "/textures/hq/cliff_side/cliff_side_arm_2k.jpg",
  "/textures/hq/cobblestone_pavement/cobblestone_pavement_diff_2k.jpg",
  "/textures/hq/cobblestone_pavement/cobblestone_pavement_nor_gl_2k.jpg",
  "/textures/hq/cobblestone_pavement/cobblestone_pavement_arm_2k.jpg",
  "/textures/hq/sparse_grass/sparse_grass_diff_2k.jpg",
  "/textures/hq/sparse_grass/sparse_grass_nor_gl_2k.jpg",
  "/textures/hq/sparse_grass/sparse_grass_arm_2k.jpg"
]

const FIRST_FRAME_TEXTURES = ["/textures/waternormals.jpg", "/textures/cloud.png"]

const PRELOAD_GLTFS = [
  MODEL_PATHS.earth.hqGrassMedium01,
  MODEL_PATHS.earth.hqTreeStump,
  MODEL_PATHS.earth.hqMoss,
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
  MODEL_PATHS.earth.flowers,
  MODEL_PATHS.earth.polypizzaPathRoundWide,
  MODEL_PATHS.earth.polypizzaPathSquareSmall
]

const SUN_ELEVATION = 2
const SUN_AZIMUTH = 180

function RendererConfig() {
  const { gl } = useThree()

  useEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping
    gl.toneMappingExposure = 0.5
    gl.outputColorSpace = THREE.SRGBColorSpace
    gl.info.autoReset = false
  }, [gl])

  return null
}

function EarthPreload({ qualityTier }: { qualityTier: QualityTier }) {
  const { gl } = useThree()

  useEffect(() => {
    const gltfs = qualityTier === "low" ? [] : Array.from(new Set(PRELOAD_GLTFS))
    const textures = Array.from(new Set(PRELOAD_TEXTURES))
    const useKtx2 = supportsKtx2Textures(gl)

    for (const tex of textures) {
      if (useKtx2) {
        useLoader.preload(KTX2Loader, toKtx2Url(tex), (loader) => {
          const ktx2 = loader as KTX2Loader
          ktx2.setTranscoderPath("/examples/jsm/libs/basis/")
          ktx2.detectSupport(gl)
        })
      } else {
        useTexture.preload(tex)
      }
    }

    for (const gltf of gltfs) {
      useGLTF.preload(gltf)
    }
  }, [gl, qualityTier])

  return null
}

function WorldContent({
  section,
  qualityTier
}: {
  section: number
  qualityTier: QualityTier
}) {
  const showProps = qualityTier !== "low"
  const overviewBlend = useWorldStore((state) => state.overviewBlend)
  const isEarthTexturedReady = useWorldStore((state) => state.isEarthTexturedReady)
  const isLoadingActive = useProgress((state) => state.active)
  const loadingProgress = useProgress((state) => state.progress)

  const shadowMapSize = qualityTier === "medium" ? 384 : 512
  const sunLightPosition = useMemo<[number, number, number]>(() => {
    const phi = THREE.MathUtils.degToRad(90 - SUN_ELEVATION)
    const theta = THREE.MathUtils.degToRad(SUN_AZIMUTH)
    const sun = new THREE.Vector3().setFromSphericalCoords(1, phi, theta).normalize()
    const distance = 700
    return [sun.x * distance, sun.y * distance, sun.z * distance]
  }, [])

  return (
    <>
      <ambientLight intensity={0.6} color="#b8c4e0" />

      <directionalLight
        position={sunLightPosition}
        intensity={2.0}
        castShadow
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-far={500}
        shadow-camera-left={-200}
        shadow-camera-right={200}
        shadow-camera-top={200}
        shadow-camera-bottom={-200}
        shadow-bias={-0.0001}
        color="#fff5e6"
      />

      <directionalLight
        position={[-80, 100, -80]}
        intensity={0.6}
        color="#6080ff"
      />

      <hemisphereLight args={["#87ceeb", "#2a4a2a", 0.5]} />

      <pointLight
        position={[0, 50, 0]}
        intensity={0.8}
        distance={300}
        color="#ffe0b0"
      />

      <EarthPreload qualityTier={qualityTier} />

      <RendererConfig />

      <ProceduralSky elevation={SUN_ELEVATION} azimuth={SUN_AZIMUTH} />

      <Ocean
        sunElevation={SUN_ELEVATION}
        sunAzimuth={SUN_AZIMUTH}
        animationSpeed={0.85 + (1.15 - 0.85) * overviewBlend}
      />

      <FirstPersonController />

      <IslandTrail section={section} />

      <Suspense fallback={null}>
        <Clouds texture="/textures/cloud.png" limit={600} frustumCulled={false}>
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

      <EarthIsland showProps={showProps} />

      {isEarthTexturedReady && loadingProgress >= 100 && !isLoadingActive ? <Preload all /> : null}
    </>
  )
}

export function WorldScene({
  section,
}: {
  section: number
}) {
  const qualityTier = useQualityTier()
  const maxDpr = qualityTier === "low" ? 1 : qualityTier === "medium" ? 1.1 : 1.25
  const enableShadows = qualityTier !== "low"
  const isEarthTexturedReady = useWorldStore((state) => state.isEarthTexturedReady)
  const isLoadingActive = useProgress((state) => state.active)
  const loadingProgress = useProgress((state) => state.progress)

  const [isFirstFrameReady, setIsFirstFrameReady] = useState(false)
  const hasReadyFiredRef = useRef(false)
  const [enableIntroVideo, setEnableIntroVideo] = useState(false)
  const [didVideoFail, setDidVideoFail] = useState(false)

  const markReady = useCallback(() => {
    if (hasReadyFiredRef.current) return
    hasReadyFiredRef.current = true
    setIsFirstFrameReady(true)
  }, [])

  useEffect(() => {
    let cancelled = false

    fetch("/intro/island-loop.mp4", { method: "HEAD" })
      .then((res) => {
        if (cancelled) return
        const contentType = res.headers.get("content-type") ?? ""
        if (res.ok && contentType.startsWith("video/")) setEnableIntroVideo(true)
      })
      .catch(() => {
        if (!cancelled) setEnableIntroVideo(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    for (const tex of FIRST_FRAME_TEXTURES) {
      useLoader.preload(THREE.TextureLoader, tex)
    }
  }, [qualityTier])

  useEffect(() => {
    if (!isEarthTexturedReady) return
    if (isLoadingActive) return
    markReady()
  }, [isEarthTexturedReady, isLoadingActive, markReady])

  const shouldHideOverlay = isFirstFrameReady
  const showOverlay = !shouldHideOverlay

  const clampedProgress = Math.max(0, Math.min(100, loadingProgress))
  const progressLineStyle: CSSProperties = {
    ["--world-loader-progress" as string]: `${clampedProgress}%`
  }
  const progressLabel = `${Math.round(clampedProgress)}%`

  return (
    <div className="fixed inset-0 w-full h-full">
      <Canvas
        shadows={enableShadows ? "soft" : false}
        camera={{
          fov: 55,
          near: 0.1,
          far: 20000,
          position: [0, 300, 350]
        }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: "high-performance",
          stencil: false,
          depth: true
        }}
        dpr={[1, maxDpr]}
      >
        <ModelErrorBoundary fallback={null}>
          <WorldContent section={section} qualityTier={qualityTier} />
          <PostProcessing />
        </ModelErrorBoundary>
      </Canvas>

      <div
        className="absolute inset-0 pointer-events-none transition-opacity duration-700 world-loader-overlay"
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
          src="/intro/island-loop-poster.svg"
          alt=""
          style={{ filter: "brightness(1.1) saturate(1.1)" }}
        />

        {enableIntroVideo && !didVideoFail ? (
          <video
            className="absolute inset-0 w-full h-full object-cover"
            src="/intro/island-loop.mp4"
            poster="/intro/island-loop-poster.svg"
            muted
            playsInline
            autoPlay
            loop
            preload="metadata"
            onError={() => setDidVideoFail(true)}
          />
        ) : null}

        <div
          className="absolute left-[46%] right-[90px] top-[44%] -translate-y-1/2 world-loader-line-wrap"
          data-mode="determinate"
          style={progressLineStyle}
        >
          <div className="world-loader-line-track">
            <div className="world-loader-line-fill" />
          </div>
        </div>

        <div className="absolute left-[46%] right-[90px] top-[38%] -translate-y-1/2 text-right">
          <div className="world-loader-title">Initializing</div>
          <div className="world-loader-subtitle">{progressLabel}</div>
        </div>
      </div>
    </div>
  )
}



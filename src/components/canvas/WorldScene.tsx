import { startTransition, useCallback, useEffect, useRef, useState } from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { PerformanceMonitor } from "@react-three/drei"
import { FirstPersonController, StillCamera, type StillShot } from "./camera"
import { EarthIsland } from "./islands"
import { type IslandAssets, MOUNTED_LOAD_SHARE, loadIslandAssets } from "./islands/assets/islandAssets"
import { ManuscriptClouds, Sea, SkyDome } from "./environment"
import { ModelErrorBoundary } from "./models/ModelErrorBoundary"
import { PostProcessing } from "./PostProcessing"
import { RendererConfig } from "./scene/RendererConfig"
import { WorldLighting } from "./scene/WorldLighting"
import { lightDimmingForSection, lightLevels } from "./scene/lighting"
import { warmUpScene } from "./scene/sceneWarmUp"
import { useFrameSteps } from "@/hooks/useFrameSteps"
import { useIsMobile } from "@/hooks/useIsMobile"
import { useWorldStore } from "@/store/worldStore"

// The near plane sets the depth buffer's precision: at 0.5 a beach meets the sea without flicker from the
// overview's distance, and nothing the walk passes comes nearer to the eye.
const CAMERA = { fov: 55, near: 0.5, far: 20000, position: [0, 300, 350] as [number, number, number] }
const GL_OPTIONS = { antialias: false, alpha: false, powerPreference: "high-performance" as const, stencil: false, depth: true }
// Render sharp by default and drop to 1x when the device cannot hold the frame rate.
const SHARP_DPR_DESKTOP = 1.5
const SHARP_DPR_MOBILE = 1.25
const FALLBACK_DPR = 1
const DPR_FLIPFLOPS = 3
/** Stills are rendered at twice the CSS size and downscaled by the capture script. */
const STILL_DPR = 2
/** Frames drawn with everything in place before the loader may lift. */
const FRAMES_BEFORE_READY = 2
/** Frames the page lays itself out in before the canvas takes the main thread to create its context. */
const CANVAS_STEPS = 2
/** The frames over which the sky, the clouds and the post-processing mount, each with a task to itself. */
const CONTENT_STEPS = 3

/**
 * The island's assets once all of them have arrived and the canvas is ready for them. They mount in a transition, so
 * React builds the island a slice at a time.
 */
function useArrivedIsland(isCanvasReady: boolean) {
  const [assets, setAssets] = useState<IslandAssets | null>(null)

  useEffect(() => {
    if (!isCanvasReady) return
    let isCurrent = true
    loadIslandAssets().then(
      (arrived) => {
        if (isCurrent) startTransition(() => setAssets(arrived))
      },
      () => useWorldStore.getState().setLoaderBypassed(true)
    )
    return () => {
      isCurrent = false
    }
  }, [isCanvasReady])

  return assets
}

/** Warms the mounted island up frame by frame and then says so; until then the frame loop stands still. */
function IslandWarmUp({ assets, onWarm }: { assets: IslandAssets; onWarm: () => void }) {
  const gl = useThree((state) => state.gl)
  const scene = useThree((state) => state.scene)

  useEffect(() => {
    let isCurrent = true
    const { reportLoadProgress } = useWorldStore.getState()
    reportLoadProgress(MOUNTED_LOAD_SHARE)
    const handOver = () => {
      if (isCurrent) onWarm()
    }
    // Even a warm-up that fails hands over to the frame loop, whose first frame then does the work in one go.
    warmUpScene(gl, scene, assets.textures.values(), (share) =>
      reportLoadProgress(MOUNTED_LOAD_SHARE + share * (1 - MOUNTED_LOAD_SHARE))
    ).then(handOver, handOver)
    return () => {
      isCurrent = false
    }
  }, [gl, scene, assets, onWarm])

  return null
}

/** Reports the island as ready after a few drawn frames; the loading screen waits for this flag. */
function SceneReadyBeacon() {
  const frames = useRef(0)

  useFrame(() => {
    if (frames.current >= FRAMES_BEFORE_READY) return
    frames.current += 1
    if (frames.current === FRAMES_BEFORE_READY) useWorldStore.getState().setEarthSceneReady(true)
  })

  return null
}

/**
 * Everything inside the canvas, in draw order: lights, renderer setup, camera, sky, clouds and post-processing, a frame
 * apart, then the sea and the island once they have arrived.
 */
function WorldContent({
  section,
  still,
  isLooping,
  onWarm
}: {
  section: number
  still: StillShot | null
  isLooping: boolean
  onWarm: () => void
}) {
  const levels = lightLevels(lightDimmingForSection(section))
  const step = useFrameSteps(CONTENT_STEPS)
  const assets = useArrivedIsland(step >= CONTENT_STEPS)

  return (
    <>
      <WorldLighting levels={levels} />

      <RendererConfig exposure={levels.exposure} />

      {still ? <StillCamera shot={still} /> : <FirstPersonController />}

      {step >= 1 ? <SkyDome /> : null}

      {step >= 2 ? <ManuscriptClouds /> : null}

      {step >= 3 ? <PostProcessing /> : null}

      {assets ? (
        <>
          <Sea plan={assets.sea} />
          <EarthIsland assets={assets} />
          <IslandWarmUp assets={assets} onWarm={onWarm} />
        </>
      ) : null}

      {isLooping ? <SceneReadyBeacon /> : null}
    </>
  )
}

/**
 * The fixed full-screen canvas behind the deck. Its frame loop waits until the island has mounted and warmed up, so the
 * load costs no frames of its own. With a still shot the camera holds that pose at a fixed 2x resolution instead of
 * walking the road.
 */
export function WorldScene({ section, still = null }: { section: number; still?: StillShot | null }) {
  const isMobile = useIsMobile()
  const sharpDpr = isMobile ? SHARP_DPR_MOBILE : SHARP_DPR_DESKTOP
  const [dpr, setDpr] = useState(sharpDpr)
  const [isWarm, setIsWarm] = useState(false)
  const isLoaderBypassed = useWorldStore((state) => state.isLoaderBypassed)
  const markWarm = useCallback(() => setIsWarm(true), [])
  const isLooping = isWarm || isLoaderBypassed
  const canvasStep = useFrameSteps(CANVAS_STEPS)

  // Every load starts here, before the canvas exists; useArrivedIsland deals with a failure when it takes the result.
  useEffect(() => {
    void loadIslandAssets().catch(() => {})
  }, [])

  return (
    <div className="fixed inset-0 w-full h-full">
      {canvasStep >= CANVAS_STEPS ? (
        <Canvas shadows="soft" camera={CAMERA} gl={GL_OPTIONS} dpr={still ? STILL_DPR : dpr} frameloop={isLooping ? "always" : "never"}>
          {still ? null : (
            <PerformanceMonitor
              onDecline={() => setDpr(FALLBACK_DPR)}
              onIncline={() => setDpr(sharpDpr)}
              onFallback={() => setDpr(FALLBACK_DPR)}
              flipflops={DPR_FLIPFLOPS}
            />
          )}
          <ModelErrorBoundary fallback={null}>
            <WorldContent section={section} still={still} isLooping={isLooping} onWarm={markWarm} />
          </ModelErrorBoundary>
        </Canvas>
      ) : null}
    </div>
  )
}

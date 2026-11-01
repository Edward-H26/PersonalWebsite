import { useState } from "react"
import { Canvas } from "@react-three/fiber"
import { PerformanceMonitor } from "@react-three/drei"
import { FirstPersonController, StillCamera, type StillShot } from "./camera"
import { EarthIsland } from "./islands"
import { ManuscriptClouds, Sea, SkyDome } from "./environment"
import { ModelErrorBoundary } from "./models/ModelErrorBoundary"
import { PostProcessing } from "./PostProcessing"
import { LoadingOverlay } from "./scene/LoadingOverlay"
import { RendererConfig } from "./scene/RendererConfig"
import { WorldLighting } from "./scene/WorldLighting"
import { lightDimmingForSection, lightLevels } from "./scene/lighting"
import { useIsMobile } from "@/hooks/useIsMobile"
import { useWorldLoading } from "@/hooks/useWorldLoading"

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

/** Everything inside the canvas, in draw order: lights, renderer setup, sky, sea, camera, clouds, island. */
function WorldContent({ section, still }: { section: number; still: StillShot | null }) {
  const levels = lightLevels(lightDimmingForSection(section))

  return (
    <>
      <WorldLighting levels={levels} />

      <RendererConfig exposure={levels.exposure} />

      <SkyDome />

      <Sea />

      {still ? <StillCamera shot={still} /> : <FirstPersonController />}

      <ManuscriptClouds />

      <EarthIsland />
    </>
  )
}

/**
 * The fixed full-screen canvas behind the deck, plus the loading overlay. The overlay is a sibling of the
 * canvas rather than a child so that its own stacking order puts it above the deck and the menu bar.
 * With a still shot the camera holds that pose at a fixed 2x resolution instead of walking the road.
 */
export function WorldScene({ section, still = null }: { section: number; still?: StillShot | null }) {
  const isMobile = useIsMobile()
  const { showOverlay, displayProgress } = useWorldLoading({ isMobile })
  const sharpDpr = isMobile ? SHARP_DPR_MOBILE : SHARP_DPR_DESKTOP
  const [dpr, setDpr] = useState(sharpDpr)

  return (
    <>
      <div className="fixed inset-0 w-full h-full">
        <Canvas shadows="soft" camera={CAMERA} gl={GL_OPTIONS} dpr={still ? STILL_DPR : dpr}>
          {still ? null : (
            <PerformanceMonitor
              onDecline={() => setDpr(FALLBACK_DPR)}
              onIncline={() => setDpr(sharpDpr)}
              onFallback={() => setDpr(FALLBACK_DPR)}
              flipflops={DPR_FLIPFLOPS}
            />
          )}
          <ModelErrorBoundary fallback={null}>
            <WorldContent section={section} still={still} />
            <PostProcessing />
          </ModelErrorBoundary>
        </Canvas>
      </div>

      <LoadingOverlay visible={showOverlay} progress={displayProgress} />
    </>
  )
}

import { Suspense, useState } from "react"
import { Canvas } from "@react-three/fiber"
import { PerformanceMonitor } from "@react-three/drei"
import { FirstPersonController } from "./camera"
import { EarthIsland } from "./islands"
import { Ocean, ProceduralSky } from "./environment"
import { ModelErrorBoundary } from "./models/ModelErrorBoundary"
import { PostProcessing } from "./PostProcessing"
import { LoadingOverlay } from "./scene/LoadingOverlay"
import { RendererConfig } from "./scene/RendererConfig"
import { SkyClouds } from "./scene/SkyClouds"
import { WorldLighting } from "./scene/WorldLighting"
import { SUN_AZIMUTH, SUN_ELEVATION, lightDimmingForSection, lightLevels } from "./scene/lighting"
import { useIsMobile } from "@/hooks/useIsMobile"
import { useWorldLoading } from "@/hooks/useWorldLoading"

const CAMERA = { fov: 55, near: 0.1, far: 20000, position: [0, 300, 350] as [number, number, number] }
const GL_OPTIONS = { antialias: false, alpha: false, powerPreference: "high-performance" as const, stencil: false, depth: true }
// Render sharp by default and drop to 1x when the device cannot hold the frame rate.
const SHARP_DPR_DESKTOP = 1.5
const SHARP_DPR_MOBILE = 1.25
const FALLBACK_DPR = 1
const DPR_FLIPFLOPS = 3

/** Everything inside the canvas, in draw order: lights, renderer setup, sky, sea, camera, clouds, island. */
function WorldContent({ section }: { section: number }) {
  const levels = lightLevels(lightDimmingForSection(section))

  return (
    <>
      <WorldLighting levels={levels} />

      <RendererConfig exposure={levels.exposure} />

      <ProceduralSky elevation={SUN_ELEVATION} azimuth={SUN_AZIMUTH} mieCoefficient={0.0035} mieDirectionalG={0.74} />

      <Ocean sunElevation={SUN_ELEVATION} sunAzimuth={SUN_AZIMUTH} />

      <FirstPersonController />

      <Suspense fallback={null}>
        <SkyClouds />
      </Suspense>

      <EarthIsland />
    </>
  )
}

/** The fixed full-screen canvas behind the deck, plus the loading overlay that covers it until the island is ready. */
export function WorldScene({ section }: { section: number }) {
  const isMobile = useIsMobile()
  const { showOverlay, displayProgress } = useWorldLoading({ isMobile })
  const sharpDpr = isMobile ? SHARP_DPR_MOBILE : SHARP_DPR_DESKTOP
  const [dpr, setDpr] = useState(sharpDpr)

  return (
    <div className="fixed inset-0 w-full h-full">
      <Canvas shadows="soft" camera={CAMERA} gl={GL_OPTIONS} dpr={dpr}>
        <PerformanceMonitor
          onDecline={() => setDpr(FALLBACK_DPR)}
          onIncline={() => setDpr(sharpDpr)}
          onFallback={() => setDpr(FALLBACK_DPR)}
          flipflops={DPR_FLIPFLOPS}
        />
        <ModelErrorBoundary fallback={null}>
          <WorldContent section={section} />
          <PostProcessing />
        </ModelErrorBoundary>
      </Canvas>

      <LoadingOverlay visible={showOverlay} progress={displayProgress} isMobile={isMobile} />
    </div>
  )
}

import { Suspense, lazy, useEffect } from "react"
import { LoadingOverlay } from "@/components/canvas/scene/LoadingOverlay"
import { Navigation, ScrollDeck, ParticleBackground, NoiseOverlay, SkipLink } from "@/components/ui"
import { useWorldStore } from "@/store/worldStore"
import { useScrollSnapNavigation } from "@/hooks/useScrollSnapNavigation"
import { useIsMobile } from "@/hooks/useIsMobile"

// three.js and the scene arrive behind the loader, which is why the loader lives out here.
const WorldScene = lazy(() => import("@/components/canvas/WorldScene").then(({ WorldScene }) => ({ default: WorldScene })))

function App() {
  const setMousePosition = useWorldStore((state) => state.setMousePosition)
  const isEarthSceneReady = useWorldStore((state) => state.isEarthSceneReady)
  const isLoadingOverlayVisible = useWorldStore((state) => state.isLoadingOverlayVisible)
  const isMobile = useIsMobile()
  const scrollLocked = isLoadingOverlayVisible || (!isEarthSceneReady && !isMobile)
  const { pages, section, containerRef, scrollToSection } = useScrollSnapNavigation({ scrollLocked })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1
      const y = -(e.clientY / window.innerHeight) * 2 + 1
      setMousePosition(x, y)
    }

    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [setMousePosition])

  return (
    <div className="w-full h-full overflow-hidden">
      <SkipLink />

      <ParticleBackground opacity={0.4} className="z-[50]" />

      <Suspense fallback={null}>
        <WorldScene section={section} />
      </Suspense>

      <LoadingOverlay />

      <NoiseOverlay opacity={0.025} blendMode="overlay" />

      <ScrollDeck ref={containerRef} pages={pages} scrollLocked={scrollLocked}>
        <Navigation scrollToSection={scrollToSection} activeSection={section} />
      </ScrollDeck>
    </div>
  )
}

export default App

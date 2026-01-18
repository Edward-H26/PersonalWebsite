import { useEffect } from "react"
import { useProgress } from "@react-three/drei"
import { WorldScene } from "@/components/canvas"
import {
  Navigation,
  ScrollDeck,
  SectionNav,
  ParticleBackground,
  NoiseOverlay,
  SkipLink,
} from "@/components/ui"
import { useWorldStore } from "@/store/worldStore"
import { useScrollSnapNavigation } from "@/hooks/useScrollSnapNavigation"

function App() {
  const setMousePosition = useWorldStore((state) => state.setMousePosition)
  const isEarthTexturedReady = useWorldStore((state) => state.isEarthTexturedReady)
  const isLoaderBypassed = useWorldStore((state) => state.isLoaderBypassed)
  const isLoadingActive = useProgress((state) => state.active)
  const { pages, section, containerRef, scrollToSection } = useScrollSnapNavigation()
  const scrollLocked = !isEarthTexturedReady || (!isLoaderBypassed && isLoadingActive)

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
      <SkipLink href="#main-content" />

      <ParticleBackground variant="minimal" opacity={0.4} className="z-[50]" />

      <WorldScene section={section} />

      <NoiseOverlay opacity={0.025} blendMode="overlay" />

      <ScrollDeck ref={containerRef} pages={pages} scrollLocked={scrollLocked}>
        <Navigation scrollToSection={scrollToSection} activeSection={section} />
        <SectionNav section={section} scrollToSection={scrollToSection} />
      </ScrollDeck>

      <div id="main-content" className="sr-only" aria-hidden="true" />
    </div>
  )
}

export default App

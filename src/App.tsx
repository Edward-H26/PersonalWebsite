import { useEffect } from "react"
import { useProgress } from "@react-three/drei"
import { WorldScene } from "@/components/canvas"
import {
  Navigation,
  ScrollDeck,
  SectionNav,
} from "@/components/ui"
import { useWorldStore } from "@/store/worldStore"
import { useScrollSnapNavigation } from "@/hooks/useScrollSnapNavigation"

function App() {
  const setMousePosition = useWorldStore((state) => state.setMousePosition)
  const isEarthTexturedReady = useWorldStore((state) => state.isEarthTexturedReady)
  const isLoadingActive = useProgress((state) => state.active)
  const { pages, section, containerRef, scrollToSection } = useScrollSnapNavigation()
  const scrollLocked = !isEarthTexturedReady || isLoadingActive

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
      <WorldScene section={section} />

      <ScrollDeck ref={containerRef} pages={pages} scrollLocked={scrollLocked}>
        <Navigation scrollToSection={scrollToSection} />
        <SectionNav section={section} scrollToSection={scrollToSection} />
      </ScrollDeck>
    </div>
  )
}

export default App

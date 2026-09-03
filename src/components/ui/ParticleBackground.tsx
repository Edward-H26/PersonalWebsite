import { useEffect, useMemo, useState } from "react"
import Particles, { initParticlesEngine } from "@tsparticles/react"
import { loadSlim } from "@tsparticles/slim"
import type { ISourceOptions } from "@tsparticles/engine"
import { useReducedMotion } from "@/hooks/useReducedMotion"
import { scheduleIdleTask } from "@/utils/scheduling"

interface ParticleBackgroundProps {
  className?: string
  opacity?: number
}

// A sparse drift of violet particles behind the deck; skipped entirely for reduced motion.
export function ParticleBackground({ className = "", opacity = 0.6 }: ParticleBackgroundProps) {
  const [init, setInit] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    let cancelled = false
    const cancelIdleTask = scheduleIdleTask(() => {
      initParticlesEngine(async (engine) => {
        await loadSlim(engine)
      }).then(() => {
        if (!cancelled) setInit(true)
      })
    }, 900)

    return () => {
      cancelled = true
      cancelIdleTask()
    }
  }, [])

  const options: ISourceOptions = useMemo(
    () => ({
      fullScreen: false,
      fpsLimit: 30,
      particles: {
        color: { value: "#8b5cf6" },
        number: { value: 30, density: { enable: true, width: 1920, height: 1080 } },
        opacity: { value: { min: 0.1, max: opacity * 0.5 } },
        size: { value: { min: 1, max: 3 } },
        move: {
          enable: true,
          speed: 0.3,
          direction: "top",
          random: true,
          straight: false,
          outModes: { default: "out" },
        },
      },
      detectRetina: true,
    }),
    [opacity]
  )

  if (!init || prefersReducedMotion) return null

  return <Particles id="tsparticles-bg" className={`fixed inset-0 pointer-events-none ${className}`} options={options} />
}

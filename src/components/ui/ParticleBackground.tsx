import { useEffect, useMemo, useState } from "react"
import Particles, { initParticlesEngine } from "@tsparticles/react"
import { loadSlim } from "@tsparticles/slim"
import type { ISourceOptions } from "@tsparticles/engine"
import { useReducedMotion } from "@/hooks/useReducedMotion"

interface ParticleBackgroundProps {
  className?: string
  variant?: "default" | "stars" | "connections" | "minimal"
  opacity?: number
}

export function ParticleBackground({
  className = "",
  variant = "default",
  opacity = 0.6,
}: ParticleBackgroundProps) {
  const [init, setInit] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      await loadSlim(engine)
    }).then(() => {
      setInit(true)
    })
  }, [])

  const options: ISourceOptions = useMemo(() => {
    if (prefersReducedMotion) {
      return getStaticOptions(variant, opacity)
    }
    return getAnimatedOptions(variant, opacity)
  }, [prefersReducedMotion, variant, opacity])

  if (!init) return null

  if (prefersReducedMotion && variant === "minimal") {
    return null
  }

  return (
    <Particles
      id="tsparticles-bg"
      className={`fixed inset-0 pointer-events-none ${className}`}
      options={options}
    />
  )
}

function getStaticOptions(variant: string, opacity: number): ISourceOptions {
  const baseColor = variant === "stars" ? "#ffffff" : "#8b5cf6"

  return {
    fullScreen: false,
    fpsLimit: 30,
    particles: {
      color: { value: baseColor },
      number: { value: variant === "stars" ? 80 : 40 },
      opacity: { value: opacity * 0.5 },
      size: { value: { min: 1, max: variant === "stars" ? 2 : 3 } },
      move: { enable: false },
      links: { enable: false },
    },
    detectRetina: true,
  }
}

function getAnimatedOptions(variant: string, opacity: number): ISourceOptions {
  switch (variant) {
    case "stars":
      return {
        fullScreen: false,
        fpsLimit: 60,
        particles: {
          color: { value: "#ffffff" },
          number: { value: 120, density: { enable: true, width: 1920, height: 1080 } },
          opacity: {
            value: { min: 0.1, max: opacity },
            animation: { enable: true, speed: 0.5, sync: false },
          },
          size: { value: { min: 0.5, max: 2.5 } },
          move: {
            enable: true,
            speed: 0.2,
            direction: "none",
            random: true,
            straight: false,
            outModes: { default: "out" },
          },
          twinkle: {
            particles: { enable: true, frequency: 0.02, opacity: 1 },
          },
        },
        detectRetina: true,
      }

    case "connections":
      return {
        fullScreen: false,
        fpsLimit: 60,
        particles: {
          color: { value: ["#8b5cf6", "#06b6d4", "#ec4899"] },
          number: { value: 60, density: { enable: true, width: 1920, height: 1080 } },
          opacity: { value: { min: 0.3, max: opacity } },
          size: { value: { min: 1, max: 4 } },
          move: {
            enable: true,
            speed: 1,
            direction: "none",
            random: false,
            straight: false,
            outModes: { default: "bounce" },
            attract: { enable: true, rotate: { x: 600, y: 1200 } },
          },
          links: {
            enable: true,
            distance: 150,
            color: "#8b5cf6",
            opacity: 0.2,
            width: 1,
          },
        },
        interactivity: {
          events: {
            onHover: { enable: true, mode: "grab" },
          },
          modes: {
            grab: { distance: 200, links: { opacity: 0.4 } },
          },
        },
        detectRetina: true,
      }

    case "minimal":
      return {
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
      }

    default:
      return {
        fullScreen: false,
        fpsLimit: 60,
        particles: {
          color: { value: ["#4f46e5", "#8b5cf6", "#06b6d4", "#ec4899"] },
          number: { value: 80, density: { enable: true, width: 1920, height: 1080 } },
          opacity: {
            value: { min: 0.2, max: opacity },
            animation: { enable: true, speed: 0.8, sync: false },
          },
          size: {
            value: { min: 1, max: 5 },
            animation: { enable: true, speed: 2, sync: false },
          },
          move: {
            enable: true,
            speed: 0.8,
            direction: "none",
            random: true,
            straight: false,
            outModes: { default: "out" },
            attract: { enable: true, rotate: { x: 600, y: 1200 } },
          },
          links: {
            enable: true,
            distance: 120,
            color: "#8b5cf6",
            opacity: 0.15,
            width: 1,
            triangles: { enable: true, opacity: 0.03 },
          },
        },
        interactivity: {
          events: {
            onHover: { enable: true, mode: "repulse" },
          },
          modes: {
            repulse: { distance: 100, duration: 0.4 },
          },
        },
        detectRetina: true,
      }
  }
}

import { useEffect, useRef } from "react"
import Lenis from "lenis"
import { useReducedMotion } from "./useReducedMotion"

interface UseSmoothScrollOptions {
  wrapper?: HTMLElement | null
  content?: HTMLElement | null
  duration?: number
  easing?: (t: number) => number
  orientation?: "vertical" | "horizontal"
  gestureOrientation?: "vertical" | "horizontal" | "both"
  smoothWheel?: boolean
  syncTouch?: boolean
  syncTouchLerp?: number
  touchInertiaMultiplier?: number
  infinite?: boolean
  autoResize?: boolean
}

const defaultEasing = (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t))

export function useSmoothScroll(options: UseSmoothScrollOptions = {}) {
  const lenisRef = useRef<Lenis | null>(null)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    if (prefersReducedMotion) {
      if (lenisRef.current) {
        lenisRef.current.destroy()
        lenisRef.current = null
      }
      return
    }

    const lenis = new Lenis({
      duration: options.duration ?? 1.2,
      easing: options.easing ?? defaultEasing,
      orientation: options.orientation ?? "vertical",
      gestureOrientation: options.gestureOrientation ?? "vertical",
      smoothWheel: options.smoothWheel ?? true,
      syncTouch: options.syncTouch ?? false,
      syncTouchLerp: options.syncTouchLerp ?? 0.075,
      touchInertiaMultiplier: options.touchInertiaMultiplier ?? 35,
      infinite: options.infinite ?? false,
      autoResize: options.autoResize ?? true,
      wrapper: options.wrapper ?? undefined,
      content: options.content ?? undefined,
    })

    lenisRef.current = lenis

    function raf(time: number) {
      lenis.raf(time)
      requestAnimationFrame(raf)
    }

    requestAnimationFrame(raf)

    return () => {
      lenis.destroy()
      lenisRef.current = null
    }
  }, [
    prefersReducedMotion,
    options.wrapper,
    options.content,
    options.duration,
    options.easing,
    options.orientation,
    options.gestureOrientation,
    options.smoothWheel,
    options.syncTouch,
    options.syncTouchLerp,
    options.touchInertiaMultiplier,
    options.infinite,
    options.autoResize,
  ])

  return lenisRef
}

export function useScrollProgress() {
  const progressRef = useRef(0)
  const directionRef = useRef<1 | -1>(1)

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight
      const newProgress = scrollHeight > 0 ? scrollTop / scrollHeight : 0

      if (newProgress > progressRef.current) {
        directionRef.current = 1
      } else if (newProgress < progressRef.current) {
        directionRef.current = -1
      }

      progressRef.current = newProgress
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return { progressRef, directionRef }
}

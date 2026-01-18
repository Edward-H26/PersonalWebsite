import { useCallback, useRef, type RefObject } from "react"
import { useReducedMotion } from "./useReducedMotion"

interface MagneticConfig {
  strength?: number
  radius?: number
  ease?: number
}

interface MagneticState {
  x: number
  y: number
  scale: number
}

export function useMagneticEffect<T extends HTMLElement>(
  config: MagneticConfig = {}
): {
  ref: RefObject<T | null>
  onMouseMove: (e: React.MouseEvent) => void
  onMouseLeave: () => void
  style: React.CSSProperties
} {
  const { strength = 0.35, radius = 100, ease = 0.15 } = config
  const ref = useRef<T | null>(null)
  const stateRef = useRef<MagneticState>({ x: 0, y: 0, scale: 1 })
  const targetRef = useRef<MagneticState>({ x: 0, y: 0, scale: 1 })
  const rafRef = useRef<number | null>(null)
  const prefersReducedMotion = useReducedMotion()

  const animate = useCallback(() => {
    const state = stateRef.current
    const target = targetRef.current

    state.x += (target.x - state.x) * ease
    state.y += (target.y - state.y) * ease
    state.scale += (target.scale - state.scale) * ease

    if (ref.current) {
      ref.current.style.transform = `translate3d(${state.x}px, ${state.y}px, 0) scale(${state.scale})`
    }

    const dx = Math.abs(target.x - state.x)
    const dy = Math.abs(target.y - state.y)
    const ds = Math.abs(target.scale - state.scale)

    if (dx > 0.01 || dy > 0.01 || ds > 0.001) {
      rafRef.current = requestAnimationFrame(animate)
    } else {
      rafRef.current = null
    }
  }, [ease])

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (prefersReducedMotion || !ref.current) return

      const rect = ref.current.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2

      const distX = e.clientX - centerX
      const distY = e.clientY - centerY
      const distance = Math.sqrt(distX * distX + distY * distY)

      if (distance < radius) {
        const factor = 1 - distance / radius
        targetRef.current = {
          x: distX * strength * factor,
          y: distY * strength * factor,
          scale: 1 + factor * 0.05,
        }
      } else {
        targetRef.current = { x: 0, y: 0, scale: 1 }
      }

      if (rafRef.current === null) {
        rafRef.current = requestAnimationFrame(animate)
      }
    },
    [prefersReducedMotion, strength, radius, animate]
  )

  const onMouseLeave = useCallback(() => {
    targetRef.current = { x: 0, y: 0, scale: 1 }
    if (rafRef.current === null) {
      rafRef.current = requestAnimationFrame(animate)
    }
  }, [animate])

  const style: React.CSSProperties = {
    willChange: prefersReducedMotion ? "auto" : "transform",
  }

  return { ref, onMouseMove, onMouseLeave, style }
}

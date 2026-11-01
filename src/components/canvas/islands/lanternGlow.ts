import { clamp01 } from "@/utils/math"

/** The material of lantern.glb that glows; every other part of the lantern stays as it is. */
export const LANTERN_GLASS_MATERIAL = "isl_lantern_glass"

/**
 * How far ahead of the walk, in route parameter, a road lantern lights: about 18 island units of the
 * 677-unit ring road, so the visitor sees the next lantern light up ahead as the deck carries the walk
 * towards it, and the first one, 21 units past the quay, is still dark at the start.
 */
export const LANTERN_LIGHT_LEAD = 0.027

/** Seconds a lantern takes to fade fully in or out. */
export const LANTERN_FADE_SECONDS = 0.3

/** Whether the lantern standing at `lanternT` along the route is lit while the walk is at `routeT`. */
export function isLanternLit(routeT: number, lanternT: number) {
  return lanternT <= routeT + LANTERN_LIGHT_LEAD
}

/**
 * One frame of a lantern's fade: its glow level (0 dark, 1 lit) steps towards the target so that a
 * full fade takes LANTERN_FADE_SECONDS. With reduced motion it jumps straight to the target.
 */
export function stepGlow(level: number, lit: boolean, deltaSeconds: number, reducedMotion: boolean) {
  const target = lit ? 1 : 0
  if (reducedMotion) return target
  return clamp01(level + Math.sign(target - level) * (deltaSeconds / LANTERN_FADE_SECONDS))
}

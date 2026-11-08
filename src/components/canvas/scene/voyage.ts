import { clamp, clamp01, lerp, smoothstep01 } from "@/utils/math"

/** Where the ship's centre sets out and where it reaches the pier, as shares of the screen width. */
export const VOYAGE_FROM = 0.08
export const VOYAGE_TO = 0.86

/** The ship's centre, as a share of the screen width, at a loading progress from 0 to 100. */
export function voyagePosition(progress: number) {
  return lerp(VOYAGE_FROM, VOYAGE_TO, clamp01(progress / 100))
}

/** The fog round the island: 1 while the ship sets out, easing to 0 as it reaches the pier. */
export function fogDensity(progress: number) {
  return 1 - smoothstep01(progress / 100)
}

/** The progress a screen reader hears, which moves only in steps of ten so the announcements stay sparse. */
export function announcedPercent(progress: number) {
  return Math.floor(clamp(progress, 0, 100) / 10) * 10
}

/**
 * The loader's sky and sea as CSS custom properties, the scene's sky at the hour the island opens at, so the loader
 * hands over to the island without a jump: its sky runs from the band twenty degrees up down to the haze on the
 * horizon, its sea starts in that haze, and the ship takes the fill that stands out more against the sky it sails in.
 * The loader draws before three.js has loaded, so these are written out; voyage.test.ts derives them from the palette.
 */
export const VOYAGE_COLOURS = {
  "--voyage-sky-upper": "#8aa0a2",
  "--voyage-sky-mid": "#a3a294",
  "--voyage-sky-horizon": "#958585",
  "--voyage-sky-haze": "#a39b93",
  "--voyage-sea": "#6c686b",
  "--voyage-ship": "#0b1e3f"
} as const

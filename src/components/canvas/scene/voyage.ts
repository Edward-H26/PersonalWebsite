import { Color } from "three"
import type { SkyPalette } from "@/components/canvas/environment/skyPalette"
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

/** The deep-sea navy the loader's sea runs down to (base.css --sea-night). */
const NIGHT_SEA = new Color("#0b1e3f")
/** How much of the night sea shows through the haze where the loader's sea meets its sky. */
const SEA_UNDER_HAZE = 0.6
/** The ship's moonlit fill, as loader.css drew it before the loader had the scene's sky. */
const SHIP_LIGHT = "rgba(226, 236, 255, 0.92)"
const SHIP_LIGHT_COLOUR = new Color("#e2ecff")

/** WCAG contrast ratio of two colours; Color holds linear RGB, which relative luminance is defined on. */
function contrastRatio(a: Color, b: Color) {
  const luminance = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

/**
 * The loader's sky and sea as CSS custom properties, taken from the scene's sky at the hour the island
 * opens at, so the loader hands over to the island without a jump: its sky runs from the band twenty
 * degrees up down to the haze on the horizon, its sea starts in that haze, and the ship takes whichever
 * fill stands out more against the sky it sails in.
 */
export function voyageColours(sky: SkyPalette): Record<string, string> {
  const hex = (c: Color) => `#${c.getHexString()}`
  const darkShipStandsOut = contrastRatio(NIGHT_SEA, sky.haze) > contrastRatio(SHIP_LIGHT_COLOUR, sky.haze)
  return {
    "--voyage-sky-upper": hex(sky.upper),
    "--voyage-sky-mid": hex(sky.mid),
    "--voyage-sky-horizon": hex(sky.horizon),
    "--voyage-sky-haze": hex(sky.haze),
    "--voyage-sea": hex(sky.haze.clone().lerp(NIGHT_SEA, SEA_UNDER_HAZE)),
    "--voyage-ship": darkShipStandsOut ? hex(NIGHT_SEA) : SHIP_LIGHT
  }
}

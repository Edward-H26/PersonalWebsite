import { Color, MathUtils, Vector3 } from "three"
import { SUN_AZIMUTH, SUN_ELEVATION } from "@/components/canvas/scene/lighting"

/** The colours of the sky dome, from the haze on the horizon up to the zenith, plus the sun's glow and disc. */
export type SkyPalette = {
  /** The sea haze along the horizon, where the sea and the sky meet. */
  haze: Color
  /** A few degrees up: the band just above the haze. */
  horizon: Color
  /** About eight degrees up. */
  mid: Color
  /** About twenty degrees up. */
  upper: Color
  zenith: Color
  /** The warm light low in the sky on the sun's side. */
  glow: Color
  sun: Color
}

/** The sky at one hour: its palette and where the sun stands, in degrees (azimuth as in lighting.ts). */
export type SkyState = SkyPalette & { sunElevation: number; sunAzimuth: number }

type SkyKey = { hour: number; sunElevation: number; sunAzimuth: number; colours: Record<keyof SkyPalette, string> }

/**
 * The hour whose sky is the island's dusk: the sun 2 degrees above the sea in the west, as the scene was
 * lit before the sky had a clock. The weather pass (DESIGN.md section 12) drives the hour from the
 * visitor's real time; until then the scene stays at this hour.
 */
export const DEFAULT_SKY_HOUR = 18.75

// Key hours of one day. The dusk key reproduces the old physical sky's look in the site's palette; the
// others are first values for the weather pass to tune, the sun rising in the east (90) and crossing
// the south (0) at noon. The night keys end in the loader's deep-sea navy (#06101F, #0B1E3F), so the
// island at night meets the loading screen.
const SKY_KEYS: readonly SkyKey[] = [
  {
    hour: 0,
    sunElevation: -35,
    sunAzimuth: 180,
    colours: { haze: "#1a3156", horizon: "#13294d", mid: "#0b1e3f", upper: "#08142a", zenith: "#06101f", glow: "#24375a", sun: "#8899bb" }
  },
  {
    hour: 5.5,
    sunElevation: -6,
    sunAzimuth: 105,
    colours: { haze: "#8f8590", horizon: "#8a7487", mid: "#5a5f7e", upper: "#2c3d5e", zenith: "#16223d", glow: "#c98b72", sun: "#ffd9b0" }
  },
  {
    hour: 7,
    sunElevation: 10,
    sunAzimuth: 75,
    colours: { haze: "#dccfc3", horizon: "#d8c9b8", mid: "#b9cbd2", upper: "#86a8bd", zenith: "#4d7a9f", glow: "#f0c68e", sun: "#fff1d6" }
  },
  {
    hour: 12.5,
    sunElevation: 58,
    sunAzimuth: 0,
    colours: { haze: "#cfe2ec", horizon: "#b9d9eb", mid: "#a2c4de", upper: "#6f9fcf", zenith: "#3f78b5", glow: "#fff1d6", sun: "#fffaf0" }
  },
  {
    hour: 17.25,
    sunElevation: 14,
    sunAzimuth: 282,
    colours: { haze: "#dcc4a8", horizon: "#e1b98e", mid: "#c4c0a8", upper: "#8aa7b3", zenith: "#4f7896", glow: "#f3b06b", sun: "#fff1d6" }
  },
  {
    hour: DEFAULT_SKY_HOUR,
    sunElevation: SUN_ELEVATION,
    sunAzimuth: SUN_AZIMUTH,
    colours: { haze: "#a39b93", horizon: "#958585", mid: "#a3a294", upper: "#8aa0a2", zenith: "#5b6f76", glow: "#e8a66f", sun: "#fff1d6" }
  },
  {
    hour: 19.75,
    sunElevation: -6,
    sunAzimuth: 262,
    colours: { haze: "#6f6880", horizon: "#8a6f82", mid: "#66678a", upper: "#3d4d6e", zenith: "#1f2c49", glow: "#b8735e", sun: "#ffc79a" }
  },
  {
    hour: 21.5,
    sunElevation: -25,
    sunAzimuth: 230,
    colours: { haze: "#1d3456", horizon: "#182f52", mid: "#0f2445", upper: "#0b1a33", zenith: "#071122", glow: "#2a3a5c", sun: "#8899bb" }
  }
]

const PALETTE_KEYS = Object.keys(SKY_KEYS[0].colours) as Array<keyof SkyPalette>

/** The shorter way round from one azimuth to another, so the sun never swings back across the sky. */
function lerpAngle(from: number, to: number, t: number) {
  const delta = ((((to - from) % 360) + 540) % 360) - 180
  return (((from + delta * t) % 360) + 360) % 360
}

/** The sky at an hour of the day (0 to 24, wrapping), blended between the key hours in linear colour. */
export function skyAt(hour: number): SkyState {
  const h = ((hour % 24) + 24) % 24
  const nextIndex = SKY_KEYS.findIndex((key) => key.hour > h)
  const next = nextIndex === -1 ? { ...SKY_KEYS[0], hour: 24 } : SKY_KEYS[nextIndex]
  const previous = nextIndex === -1 ? SKY_KEYS[SKY_KEYS.length - 1] : SKY_KEYS[(nextIndex - 1 + SKY_KEYS.length) % SKY_KEYS.length]
  const t = (h - previous.hour) / (next.hour - previous.hour)
  const palette = Object.fromEntries(
    PALETTE_KEYS.map((key) => [key, new Color(previous.colours[key]).lerp(new Color(next.colours[key]), t)])
  ) as SkyPalette
  return {
    ...palette,
    sunElevation: MathUtils.lerp(previous.sunElevation, next.sunElevation, t),
    sunAzimuth: lerpAngle(previous.sunAzimuth, next.sunAzimuth, t)
  }
}

/** The unit vector towards the sun, in the convention lighting.ts uses for the key light. */
export function sunDirection({ sunElevation, sunAzimuth }: Pick<SkyState, "sunElevation" | "sunAzimuth">, target = new Vector3()) {
  return target.setFromSphericalCoords(1, MathUtils.degToRad(90 - sunElevation), MathUtils.degToRad(sunAzimuth))
}

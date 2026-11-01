import { describe, expect, it } from "vitest"
import keyframesCss from "@/styles/keyframes.css?raw"
import notFoundHtml from "../../../../public/404.html?raw"
import { Color } from "three"
import { DEFAULT_SKY_HOUR, skyAt } from "@/components/canvas/environment/skyPalette"
import { VOYAGE_FROM, VOYAGE_TO, announcedPercent, fogDensity, voyageColours, voyagePosition } from "./voyage"

const PROGRESS_STEPS = Array.from({ length: 1001 }, (_, i) => i / 10)

// The CIS hop (Desktop/CIS/src/components/chessLoaderHop.ts) in seconds.
const HOP_S = 0.668
const RISE_S = 0.24
const FLOAT_S = 0.155
const FALL_S = HOP_S - RISE_S - FLOAT_S

/** The body of one @keyframes rule, with its braces balanced. */
function keyframes(source: string, name: string) {
  const start = source.indexOf(`@keyframes ${name} {`)
  expect(start, `@keyframes ${name}`).toBeGreaterThanOrEqual(0)
  let depth = 0
  for (let i = source.indexOf("{", start); i < source.length; i += 1) {
    if (source[i] === "{") depth += 1
    if (source[i] === "}") depth -= 1
    if (depth === 0) return source.slice(start, i + 1).replace(/\s+/g, " ")
  }
  throw new Error(`@keyframes ${name} is not closed`)
}

/** The keyframe offsets of a rule, as fractions of the cycle. */
function offsets(block: string) {
  return [...block.matchAll(/([\d.]+)%\s*[,{]/g)].map((match) => Number(match[1]) / 100)
}

describe("voyagePosition", () => {
  it("sets out at 8% of the track and reaches the pier at 86%", () => {
    expect(voyagePosition(0)).toBe(VOYAGE_FROM)
    expect(voyagePosition(100)).toBe(VOYAGE_TO)
    expect(VOYAGE_FROM).toBe(0.08)
    expect(VOYAGE_TO).toBe(0.86)
    expect(voyagePosition(50)).toBeCloseTo(0.47)
  })

  it("moves the ship forward with every step of progress and never past either end", () => {
    const positions = PROGRESS_STEPS.map(voyagePosition)
    for (let i = 1; i < positions.length; i += 1) expect(positions[i]).toBeGreaterThan(positions[i - 1])
    expect(voyagePosition(-20)).toBe(VOYAGE_FROM)
    expect(voyagePosition(140)).toBe(VOYAGE_TO)
  })
})

describe("fogDensity", () => {
  it("is thick while the ship sets out, gone at the pier, and only ever thins", () => {
    expect(fogDensity(0)).toBe(1)
    expect(fogDensity(50)).toBeCloseTo(0.5)
    expect(fogDensity(100)).toBe(0)
    const densities = PROGRESS_STEPS.map(fogDensity)
    for (let i = 1; i < densities.length; i += 1) expect(densities[i]).toBeLessThanOrEqual(densities[i - 1])
  })
})

describe("announcedPercent", () => {
  it("moves in steps of ten, rounding down, so a screen reader hears eleven announcements at most", () => {
    expect([0, 9.9, 10, 37, 99.9, 100].map(announcedPercent)).toEqual([0, 0, 10, 30, 90, 100])
    expect(announcedPercent(-5)).toBe(0)
    expect(announcedPercent(120)).toBe(100)
    expect(new Set(PROGRESS_STEPS.map(announcedPercent)).size).toBe(11)
  })
})

describe("voyageColours", () => {
  const relativeLuminance = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  const contrast = (a: Color, b: Color) => {
    const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
    return (light + 0.05) / (dark + 0.05)
  }

  it("paints the loader's sky in the scene's colours for the same hour", () => {
    const sky = skyAt(DEFAULT_SKY_HOUR)
    const colours = voyageColours(sky)
    expect(colours["--voyage-sky-upper"]).toBe(`#${sky.upper.getHexString()}`)
    expect(colours["--voyage-sky-mid"]).toBe(`#${sky.mid.getHexString()}`)
    expect(colours["--voyage-sky-horizon"]).toBe(`#${sky.horizon.getHexString()}`)
    expect(colours["--voyage-sky-haze"]).toBe(`#${sky.haze.getHexString()}`)
  })

  it("draws the ship in deep-sea navy against the dusk and in moonlit white against the night", () => {
    expect(voyageColours(skyAt(DEFAULT_SKY_HOUR))["--voyage-ship"]).toBe("#0b1e3f")
    expect(voyageColours(skyAt(0))["--voyage-ship"]).toBe("rgba(226, 236, 255, 0.92)")
  })

  it("keeps the ship at 3:1 or more against the sky behind it at every hour", () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      const sky = skyAt(hour)
      const fill = voyageColours(sky)["--voyage-ship"]
      const ship = new Color(fill.startsWith("#") ? fill : "#e2ecff")
      expect(contrast(ship, sky.haze), `hour ${hour}`).toBeGreaterThanOrEqual(3)
    }
  })
})

describe("the hop keyframes", () => {
  it("rise, float and fall on the CIS timings, with the apex at 0.62 of the sprite", () => {
    const lift = keyframes(keyframesCss, "hopLift")
    const expected = [0, RISE_S, RISE_S + FLOAT_S, RISE_S + FLOAT_S + FALL_S / 2, HOP_S].map((t) => t / HOP_S)
    offsets(lift).forEach((offset, i) => expect(offset).toBeCloseTo(expected[i], 4))
    expect(lift.match(/translateY\(-62%\)/g)).toHaveLength(2)
    // Halfway through the fall the CIS curve has covered 0.34 of the drop.
    expect(lift).toContain(`translateY(-${(62 * (1 - 0.34)).toFixed(2)}%)`)
  })

  it("squash to 0.73 on contact and stretch to 1.27 on take-off, about the base", () => {
    const squash = keyframes(keyframesCss, "hopSquash")
    expect(offsets(squash)).toHaveLength(5)
    expect(offsets(squash)[1]).toBeCloseTo(0.07 / HOP_S, 4)
    expect(offsets(squash)[3]).toBeCloseTo((HOP_S - 0.05) / HOP_S, 4)
    expect(squash.match(/scaleY\(0\.73\)/g)).toHaveLength(2)
    expect(squash).toContain("scaleY(1.27)")
  })

  it("are the same on the 404 page, whose buoy hops with the loader's ship", () => {
    for (const name of ["hopLift", "hopSquash", "hopGlow"]) {
      expect(keyframes(notFoundHtml, name)).toBe(keyframes(keyframesCss, name))
    }
  })
})

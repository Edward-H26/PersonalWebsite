// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import { buildScrollDeckPages } from "@/config/scrollDeckPages"
import { getDeckLayout } from "@/deck/deckLayout"
import { getRouteTAtPagePos, getSectionRanges } from "@/deck/deckMath"
import { createLayoutContext } from "./layout/context"
import { placeRoadLanterns } from "./layout/lanterns"
import { LANTERN_FADE_SECONDS, LANTERN_LIGHT_LEAD, isLanternLit, stepGlow } from "./lanternGlow"
import { loadIslandTerrain } from "./terrain/terrainFixture"
import { TerrainSite } from "./terrain/terrainSite"

const pages = buildScrollDeckPages()
const deck = getDeckLayout(pages)
const sectionRanges = getSectionRanges(pages)
/** Where along the ring each road lantern stands, in route t. */
let lanternTs: number[]

beforeAll(async () => {
  const site = new TerrainSite(await loadIslandTerrain())
  lanternTs = placeRoadLanterns(createLayoutContext(site)).instances.map((lantern) => lantern.routeT)
})

/** How many road lanterns are lit while the deck rests on the given slide. */
function litCountOnSlide(slide: number) {
  const routeT = getRouteTAtPagePos(slide, sectionRanges)
  return lanternTs.filter((t) => isLanternLit(routeT, t)).length
}

const slides = Array.from({ length: deck.lastRealIndex - deck.firstRealIndex + 1 }, (_, i) => deck.firstRealIndex + i)

describe("isLanternLit", () => {
  it("lights a lantern once the walk comes within the lead of it, and only then", () => {
    expect(isLanternLit(0.3, 0.5)).toBe(false)
    expect(isLanternLit(0.5 - LANTERN_LIGHT_LEAD, 0.5)).toBe(true)
    expect(isLanternLit(0.7, 0.5)).toBe(true)
  })
})

describe("road lanterns across the deck", () => {
  it("are all dark on the overview and all lit on the last slide", () => {
    expect(litCountOnSlide(deck.overviewIndex)).toBe(0)
    expect(litCountOnSlide(deck.lastRealIndex)).toBe(lanternTs.length)
  })

  it("light a few at a time as the visitor pages forward and go dark in reverse when paging back", () => {
    const counts = slides.map(litCountOnSlide)
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1])
      expect(counts[i] - counts[i - 1]).toBeLessThanOrEqual(2)
    }
    const reversed = [...counts].reverse()
    for (let i = 1; i < reversed.length; i += 1) expect(reversed[i]).toBeLessThanOrEqual(reversed[i - 1])
  })
})

describe("stepGlow", () => {
  it("fades a lantern fully in over the fade time and back out", () => {
    const frame = LANTERN_FADE_SECONDS / 10
    let level = 0
    for (let i = 0; i < 5; i += 1) level = stepGlow(level, true, frame, false)
    expect(level).toBeCloseTo(0.5)
    for (let i = 0; i < 5; i += 1) level = stepGlow(level, true, frame, false)
    expect(level).toBeCloseTo(1)
    expect(stepGlow(level, true, frame, false)).toBe(1)
    for (let i = 0; i < 10; i += 1) level = stepGlow(level, false, frame, false)
    expect(level).toBeCloseTo(0)
  })

  it("jumps straight to the final state under reduced motion", () => {
    expect(stepGlow(0, true, 0.001, true)).toBe(1)
    expect(stepGlow(1, false, 0.001, true)).toBe(0)
  })
})

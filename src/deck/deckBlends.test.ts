import { describe, expect, it } from "vitest"
import { buildScrollDeckPages } from "@/config/scrollDeckPages"
import { EARTH_SECTION_T_STOPS } from "@/config"
import { loopDelta } from "@/utils/math"
import { TITLE_CARD_WINDOW, getSlideBlends, getTitleCardBlend, getWrapZoneBlends } from "./deckBlends"
import { getDeckLayout } from "./deckLayout"
import { getRouteTAtPagePos, getSectionRanges } from "./deckMath"

const pages = buildScrollDeckPages()
const layout = getDeckLayout(pages)
const ranges = getSectionRanges(pages)

/** How far apart two route positions are round the ring loop. */
function loopDistance(a: number, b: number) {
  return Math.abs(loopDelta(a, b))
}

describe("getTitleCardBlend", () => {
  it("is full on a title slide and fades to nothing a window away", () => {
    expect(getTitleCardBlend(4, [4, 9])).toBe(1)
    expect(getTitleCardBlend(4 + TITLE_CARD_WINDOW, [4, 9])).toBeCloseTo(0, 10)
    expect(getTitleCardBlend(4 + 2 * TITLE_CARD_WINDOW, [4, 9])).toBe(0)
    expect(getTitleCardBlend(4.5, [4, 9])).toBeGreaterThan(0.5)
    expect(getTitleCardBlend(4.5, [4, 9])).toBeLessThan(1)
  })

  it("uses the nearest title and is zero without any", () => {
    expect(getTitleCardBlend(8.9, [4, 9])).toBe(getTitleCardBlend(9.1, [4, 9]))
    expect(getTitleCardBlend(3, [])).toBe(0)
  })
})

describe("getSlideBlends", () => {
  it("keeps the camera on the overview before the first title and descends by the title", () => {
    const start = getSlideBlends(layout.overviewIndex, layout, ranges)
    expect(start.overviewBlend).toBe(0)
    expect(start.routeT).toBe(EARTH_SECTION_T_STOPS[0])
    const title = getSlideBlends(layout.researchTitleIndex, layout, ranges)
    expect(title.overviewBlend).toBe(1)
    expect(title.titleCardBlend).toBe(1)
  })

  it("follows the route for fractional positions", () => {
    const pos = layout.researchTitleIndex + 2.5
    expect(getSlideBlends(pos, layout, ranges).routeT).toBe(getRouteTAtPagePos(pos, ranges))
  })

  it("treats a deck without an overview as fully descended", () => {
    const blends = getSlideBlends(0, { ...layout, overviewIndex: -1 }, ranges)
    expect(blends.overviewBlend).toBe(1)
  })
})

describe("getWrapZoneBlends", () => {
  it("runs from the end of the road to the overview across the bottom sentinel", () => {
    const atLast = getWrapZoneBlends(layout.lastRealIndex, false, layout, ranges)
    expect(atLast.routeT).toBeCloseTo(getRouteTAtPagePos(layout.lastRealIndex, ranges), 10)
    expect(atLast.overviewBlend).toBe(1)
    const atSentinel = getWrapZoneBlends(layout.sentinelBottomIndex, false, layout, ranges)
    expect(loopDistance(atSentinel.routeT, EARTH_SECTION_T_STOPS[0])).toBeLessThan(1e-9)
    expect(atSentinel.overviewBlend).toBe(0)
  })

  it("carries the walk on round the loop to the quay instead of back along the ring", () => {
    const lastT = getRouteTAtPagePos(layout.lastRealIndex, ranges)
    let previous = lastT
    let travelled = 0
    for (let pos = layout.lastRealIndex + 0.1; pos <= layout.sentinelBottomIndex + 1e-9; pos += 0.1) {
      const { routeT } = getWrapZoneBlends(pos, false, layout, ranges)
      expect(routeT).toBeGreaterThanOrEqual(0)
      expect(routeT).toBeLessThanOrEqual(1)
      const step = loopDelta(previous, routeT)
      expect(step).toBeGreaterThanOrEqual(0)
      travelled += step
      previous = routeT
    }
    expect(travelled).toBeCloseTo(1 - lastT, 10)
  })

  it("mirrors the same journey across the top sentinel", () => {
    const atTopSentinel = getWrapZoneBlends(layout.sentinelTopIndex, true, layout, ranges)
    expect(atTopSentinel.routeT).toBeCloseTo(getRouteTAtPagePos(layout.lastRealIndex, ranges), 10)
    expect(atTopSentinel.overviewBlend).toBe(1)
    const atFirst = getWrapZoneBlends(layout.firstRealIndex, true, layout, ranges)
    expect(atFirst.overviewBlend).toBe(0)
    expect(loopDistance(atFirst.routeT, EARTH_SECTION_T_STOPS[0])).toBeLessThan(1e-9)
    const halfway = getWrapZoneBlends(0.5, true, layout, ranges)
    expect(halfway.overviewBlend).toBeCloseTo(0.5, 10)
  })
})

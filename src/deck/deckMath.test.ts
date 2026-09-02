import { describe, expect, it } from "vitest"
import { buildScrollDeckPages } from "@/config/scrollDeckPages"
import { EARTH_SECTION_T_STOPS } from "@/config"
import {
  findIndexForSection,
  findInnerScroller,
  getPageHeight,
  getRouteTAtPagePos,
  getSectionRanges,
  isNearSnap
} from "./deckMath"

function makeDeck(slideHeight: number, containerHeight = slideHeight) {
  const deck = document.createElement("div")
  const slide = document.createElement("section")
  deck.appendChild(slide)
  Object.defineProperty(slide, "offsetHeight", { value: slideHeight, configurable: true })
  Object.defineProperty(deck, "clientHeight", { value: containerHeight, configurable: true })
  return deck
}

describe("getPageHeight", () => {
  it("uses the slide height, not the container height", () => {
    expect(getPageHeight(makeDeck(660, 740))).toBe(660)
  })

  it("falls back to the container height when the slide has no layout", () => {
    expect(getPageHeight(makeDeck(0, 740))).toBe(740)
  })

  it("never returns less than 1 so page math cannot divide by zero", () => {
    const deck = document.createElement("div")
    Object.defineProperty(deck, "clientHeight", { value: 0 })
    expect(getPageHeight(deck)).toBe(1)
  })
})

describe("isNearSnap", () => {
  it("accepts a few pixels of drift and rejects more", () => {
    expect(isNearSnap(1805, 2, 900)).toBe(true)
    expect(isNearSnap(1812, 2, 900)).toBe(false)
  })

  it("scales the tolerance down for short pages", () => {
    expect(isNearSnap(203, 1, 200)).toBe(true)
    expect(isNearSnap(205, 1, 200)).toBe(false)
  })
})

describe("section ranges and route mapping", () => {
  const pages = buildScrollDeckPages()
  const ranges = getSectionRanges(pages)

  it("has sentinels at both ends and an overview first", () => {
    expect(pages[0].kind).toBe("sentinel")
    expect(pages[pages.length - 1].kind).toBe("sentinel")
    expect(pages[1].kind).toBe("overview")
  })

  it("covers sections 1 to 5 in order without gaps", () => {
    for (let section = 1; section <= 5; section += 1) {
      expect(ranges.get(section as 1 | 2 | 3 | 4 | 5)).toBeDefined()
    }
    for (let section = 1; section < 5; section += 1) {
      const current = ranges.get(section as 1 | 2 | 3 | 4)!
      const next = ranges.get((section + 1) as 2 | 3 | 4 | 5)!
      expect(current.endIndex).toBe(next.startIndex)
    }
    expect(ranges.get(5)!.endIndex).toBe(pages.length - 1)
  })

  it("keeps the camera at the route start until the first section", () => {
    expect(getRouteTAtPagePos(0, ranges)).toBe(EARTH_SECTION_T_STOPS[0])
    expect(getRouteTAtPagePos(1, ranges)).toBe(EARTH_SECTION_T_STOPS[0])
  })

  it("is monotonic along the deck and ends at the last stop", () => {
    let previous = -1
    for (let pos = 0; pos <= pages.length - 1; pos += 0.25) {
      const t = getRouteTAtPagePos(pos, ranges)
      expect(t).toBeGreaterThanOrEqual(previous)
      expect(t).toBeLessThanOrEqual(EARTH_SECTION_T_STOPS[EARTH_SECTION_T_STOPS.length - 1])
      previous = t
    }
    expect(getRouteTAtPagePos(pages.length - 1, ranges)).toBe(EARTH_SECTION_T_STOPS[EARTH_SECTION_T_STOPS.length - 1])
  })

  it("hits each section stop exactly on its title slide", () => {
    for (let section = 1; section <= 5; section += 1) {
      const range = ranges.get(section as 1 | 2 | 3 | 4 | 5)!
      expect(getRouteTAtPagePos(range.startIndex, ranges)).toBeCloseTo(EARTH_SECTION_T_STOPS[section - 1], 10)
    }
  })

  it("clamps positions beyond the deck to the last stop", () => {
    expect(getRouteTAtPagePos(pages.length + 5, ranges)).toBe(EARTH_SECTION_T_STOPS[EARTH_SECTION_T_STOPS.length - 1])
  })

  it("finds the overview and every section title", () => {
    expect(findIndexForSection(pages, 0)).toBe(1)
    for (let section = 1; section <= 5; section += 1) {
      const index = findIndexForSection(pages, section as 1 | 2 | 3 | 4 | 5)
      expect(pages[index].kind).toBe("stage_title")
      expect(pages[index].section).toBe(section)
    }
  })
})

describe("findInnerScroller", () => {
  function scroller(scrollHeight: number, clientHeight: number, overflowY = "auto") {
    const el = document.createElement("div")
    el.style.overflowY = overflowY
    Object.defineProperty(el, "scrollHeight", { value: scrollHeight })
    Object.defineProperty(el, "clientHeight", { value: clientHeight })
    return el
  }

  it("returns the scrollable ancestor of the event target", () => {
    const deck = document.createElement("div")
    const card = scroller(800, 300)
    const text = document.createElement("span")
    card.appendChild(text)
    deck.appendChild(card)
    expect(findInnerScroller(text, deck)).toBe(card)
  })

  it("ignores overflow containers whose content already fits", () => {
    const deck = document.createElement("div")
    const card = scroller(300, 300)
    deck.appendChild(card)
    expect(findInnerScroller(card, deck)).toBeNull()
  })

  it("ignores non-scrolling overflow modes and stops at the deck", () => {
    const deck = scroller(5000, 900, "hidden")
    const card = scroller(800, 300, "visible")
    deck.appendChild(card)
    expect(findInnerScroller(card, deck)).toBeNull()
    expect(findInnerScroller(null, deck)).toBeNull()
  })
})

import type { ScrollDeckPage } from "@/config/scrollDeckPages"
import { EARTH_SECTION_T_STOPS } from "@/config"
import { clamp01 } from "@/utils/math"

export type DeckSection = 0 | 1 | 2 | 3 | 4 | 5

type SectionRange = { startIndex: number; endIndex: number }

// Slides are 100svh while the fixed container follows the dynamic viewport (mobile URL bar),
// so page math has to use the slide height rather than the container height.
export function getPageHeight(el: HTMLElement) {
  const slide = el.firstElementChild as HTMLElement | null
  const slideHeight = slide?.offsetHeight ?? 0
  return Math.max(1, slideHeight > 0 ? slideHeight : el.clientHeight)
}

export function isNearSnap(scrollTop: number, index: number, pageHeight: number) {
  const target = index * pageHeight
  const epsilon = Math.min(6, pageHeight * 0.015)
  return Math.abs(scrollTop - target) <= epsilon
}

// Maps a (possibly fractional) slide position onto the camera's route parameter, interpolating
// linearly inside each section between the configured stops.
export function getRouteTAtPagePos(
  pagePos: number,
  sectionRanges: Map<DeckSection, SectionRange>,
  stops: ReadonlyArray<number> = EARTH_SECTION_T_STOPS
) {
  const maxSegment = stops.length - 1
  const lastStop = stops[stops.length - 1]

  const firstRange = sectionRanges.get(1)
  if (firstRange && pagePos <= firstRange.startIndex) return stops[0]

  for (let segment = 1; segment <= maxSegment; segment += 1) {
    const range = sectionRanges.get(segment as DeckSection)
    if (!range) continue
    if (pagePos <= range.endIndex) {
      const denom = Math.max(1e-6, range.endIndex - range.startIndex)
      const local = clamp01((pagePos - range.startIndex) / denom)
      const startT = stops[segment - 1]
      const endT = stops[segment]
      return startT + (endT - startT) * local
    }
  }

  return lastStop
}

export function getSectionRanges(pages: ScrollDeckPage[]) {
  const ranges = new Map<DeckSection, SectionRange>()

  const titleIndexBySection = new Map<DeckSection, number>()
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i]
    if (page.kind !== "stage_title") continue
    titleIndexBySection.set(page.section, i)
  }

  const sentinelBottomIndex = pages.length - 1

  for (let section = 1; section <= 5; section += 1) {
    const startIndex = titleIndexBySection.get(section as DeckSection)
    if (startIndex == null) continue

    const endIndex =
      section === 5 ? sentinelBottomIndex : titleIndexBySection.get((section + 1) as DeckSection) ?? sentinelBottomIndex

    ranges.set(section as DeckSection, { startIndex, endIndex })
  }

  return ranges
}

export function findIndexForSection(pages: ScrollDeckPage[], section: DeckSection) {
  if (section === 0) {
    return pages.findIndex((p) => p.kind === "overview")
  }
  return pages.findIndex((p) => p.kind === "stage_title" && p.section === section)
}

// Walks up from an event target to the deck and returns the first ancestor that can actually
// scroll, so wheel input inside a card's text only scrolls the card.
export function findInnerScroller(target: EventTarget | null, deck: HTMLElement) {
  let node = target instanceof HTMLElement ? target : null
  while (node && node !== deck) {
    const overflowY = getComputedStyle(node).overflowY
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
      return node
    }
    node = node.parentElement
  }
  return null
}

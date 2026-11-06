import type { ScrollDeckPage } from "@/config/scrollDeckPages"
import { EARTH_SECTION_T_STOPS } from "@/config"
import { clamp01, lerp } from "@/utils/math"

export type DeckSection = 0 | 1 | 2 | 3 | 4 | 5 | 6
export const LAST_SECTION: DeckSection = 6

/** Slide index range of a section: its first slide, the overview or its title, up to the next section's first slide. */
export type SectionRange = { startIndex: number; endIndex: number }
export type SectionRanges = Map<DeckSection, SectionRange>

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

// Maps a (possibly fractional) slide position onto the camera's route parameter. Section k runs from
// stop k to stop k + 1 linearly by slide, so its slides split the road between two chapters evenly
// by length; the overview is section 0, and the last section runs on to the final stop.
export function getRouteTAtPagePos(pagePos: number, sectionRanges: SectionRanges, stops: ReadonlyArray<number> = EARTH_SECTION_T_STOPS) {
  for (let section = 0; section < stops.length - 1; section += 1) {
    const range = sectionRanges.get(section as DeckSection)
    if (!range || pagePos > range.endIndex) continue
    const local = clamp01((pagePos - range.startIndex) / Math.max(1e-6, range.endIndex - range.startIndex))
    return lerp(stops[section], stops[section + 1], local)
  }

  return stops[stops.length - 1]
}

export function getSectionRanges(pages: readonly ScrollDeckPage[]): SectionRanges {
  const ranges: SectionRanges = new Map()

  const firstIndexBySection = new Map<DeckSection, number>()
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i]
    if (page.kind !== "overview" && page.kind !== "stage_title") continue
    firstIndexBySection.set(page.section, i)
  }

  const sentinelBottomIndex = pages.length - 1

  for (let section = 0; section <= LAST_SECTION; section += 1) {
    const startIndex = firstIndexBySection.get(section as DeckSection)
    if (startIndex == null) continue

    const endIndex =
      section === LAST_SECTION ? sentinelBottomIndex : (firstIndexBySection.get((section + 1) as DeckSection) ?? sentinelBottomIndex)

    ranges.set(section as DeckSection, { startIndex, endIndex })
  }

  return ranges
}

export function findIndexForSection(pages: readonly ScrollDeckPage[], section: DeckSection) {
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

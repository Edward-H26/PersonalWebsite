import type { ScrollDeckPage } from "@/config/scrollDeckPages"
import { findIndexForSection } from "./deckMath"

/**
 * The fixed slide indices the navigation hook needs: where the sentinels, the first and last real
 * slides, the overview and every stage title sit. Derived once from the page list.
 */
export type DeckLayout = {
  readonly hasSentinels: boolean
  readonly sentinelTopIndex: number
  readonly sentinelBottomIndex: number
  readonly firstRealIndex: number
  readonly lastRealIndex: number
  /** Index of the overview slide, or -1 when the deck has none. */
  readonly overviewIndex: number
  /** Where a wrap from the end lands: the overview, or the first real slide without one. */
  readonly overviewTargetIndex: number
  /** Title slide of the first stage, which ends the overview blend. */
  readonly researchTitleIndex: number
  readonly stageTitleIndices: readonly number[]
}

/** Reads the deck layout from the page list. Sentinels count only when both ends have one. */
export function getDeckLayout(pages: readonly ScrollDeckPage[]): DeckLayout {
  const hasSentinels = pages.length > 2 && pages[0]?.kind === "sentinel" && pages[pages.length - 1]?.kind === "sentinel"
  const firstRealIndex = hasSentinels ? 1 : 0
  const lastRealIndex = hasSentinels ? pages.length - 2 : pages.length - 1
  const overviewIndex = pages.findIndex((page) => page.kind === "overview")

  return {
    hasSentinels,
    sentinelTopIndex: 0,
    sentinelBottomIndex: pages.length - 1,
    firstRealIndex,
    lastRealIndex,
    overviewIndex,
    overviewTargetIndex: overviewIndex >= 0 ? overviewIndex : firstRealIndex,
    researchTitleIndex: findIndexForSection(pages, 1),
    stageTitleIndices: pages.flatMap((page, index) => (page.kind === "stage_title" ? [index] : []))
  }
}

import { clamp01, fract, lerp, loopDelta, smoothstep01 } from "@/utils/math"
import type { DeckLayout } from "./deckLayout"
import { type SectionRanges, getRouteTAtPagePos } from "./deckMath"

/** Distance in slides from a stage title over which its title card fades in and out. */
export const TITLE_CARD_WINDOW = 1.35

/** The three world-store values the deck position drives. */
export type DeckBlends = {
  readonly routeT: number
  readonly overviewBlend: number
  readonly titleCardBlend: number
}

/** 1 on a stage title slide, easing to 0 a title window away from the nearest one. */
export function getTitleCardBlend(pagePos: number, stageTitleIndices: readonly number[]) {
  let nearestTitleDist = Number.POSITIVE_INFINITY
  for (const titleIndex of stageTitleIndices) {
    const dist = Math.abs(pagePos - titleIndex)
    if (dist < nearestTitleDist) nearestTitleDist = dist
  }
  return smoothstep01(clamp01(1 - nearestTitleDist / TITLE_CARD_WINDOW))
}

/**
 * Blends while the deck sits between a sentinel and the nearest real slide: the walk goes on round
 * the ring, the short way, from the last slide's stop to the overview's at the quay, while the camera
 * rises to the overview as the wrap progresses.
 */
export function getWrapZoneBlends(pagePos: number, isTopWrapZone: boolean, layout: DeckLayout, sectionRanges: SectionRanges): DeckBlends {
  const wrapT = isTopWrapZone
    ? clamp01((pagePos - layout.sentinelTopIndex) / Math.max(1e-6, layout.firstRealIndex - layout.sentinelTopIndex))
    : clamp01((pagePos - layout.lastRealIndex) / Math.max(1e-6, layout.sentinelBottomIndex - layout.lastRealIndex))
  const wrapEase = smoothstep01(wrapT)

  const routeTAtLastReal = getRouteTAtPagePos(layout.lastRealIndex, sectionRanges)
  const routeTAtOverview = getRouteTAtPagePos(layout.overviewTargetIndex, sectionRanges)
  const virtualPos = lerp(layout.lastRealIndex, layout.overviewTargetIndex, wrapEase)

  return {
    routeT: fract(routeTAtLastReal + loopDelta(routeTAtLastReal, routeTAtOverview) * wrapEase),
    overviewBlend: lerp(1, 0, wrapEase),
    titleCardBlend: getTitleCardBlend(virtualPos, layout.stageTitleIndices)
  }
}

/** Blends for an ordinary (possibly fractional) slide position inside the real slides. */
export function getSlideBlends(pagePos: number, layout: DeckLayout, sectionRanges: SectionRanges): DeckBlends {
  let overviewBlend = 1
  if (layout.overviewIndex >= 0 && layout.researchTitleIndex > layout.overviewIndex) {
    const denom = Math.max(1e-6, layout.researchTitleIndex - layout.overviewIndex)
    overviewBlend = smoothstep01(clamp01((pagePos - layout.overviewIndex) / denom))
  }

  return {
    routeT: getRouteTAtPagePos(pagePos, sectionRanges),
    overviewBlend,
    titleCardBlend: getTitleCardBlend(pagePos, layout.stageTitleIndices)
  }
}

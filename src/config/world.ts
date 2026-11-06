import { loopDelta } from "@/utils/math"

/** How far the camera stands back behind a title stop while the chapter's title card shows, in world units. */
export const DEFAULT_CARD_PULLBACK = 7

/**
 * Where the deck's walk stands on the ring road, in route t: on the overview, on each chapter's title slide
 * (Publications, Research, Projects, Experience, Service, Info) at the ring's t of that chapter's anchor in
 * DESIGN.md section 17, and at the end of the deck. The ring starts and ends at the quay, so the walk goes
 * once round the island and the deck wraps from the quay at night back to the overview. A stop's
 * `cardPullback` replaces DEFAULT_CARD_PULLBACK: at Projects the camera backs off only 3 units, so the market
 * stalls beside the gate stay out of the frame.
 */
export const EARTH_SECTION_STOPS: ReadonlyArray<{ t: number; cardPullback?: number }> = [
  { t: 0 },
  { t: 0.0721 },
  { t: 0.1501 },
  { t: 0.3024, cardPullback: 3 },
  { t: 0.4983 },
  { t: 0.7675 },
  { t: 0.8961 },
  { t: 1 }
]

/** The stops' route t alone, which the deck pages between. */
export const EARTH_SECTION_T_STOPS: readonly number[] = EARTH_SECTION_STOPS.map((stop) => stop.t)

/** The title card pullback of the stop nearest a route t, the walk being a loop. */
export function cardPullbackAt(routeT: number) {
  const distance = (t: number) => Math.abs(loopDelta(t, routeT))
  const nearest = EARTH_SECTION_STOPS.reduce((best, stop) => (distance(stop.t) < distance(best.t) ? stop : best))
  return nearest.cardPullback ?? DEFAULT_CARD_PULLBACK
}

export const WORLD_CONFIG = {
  cameraHeight: 5.5
} as const

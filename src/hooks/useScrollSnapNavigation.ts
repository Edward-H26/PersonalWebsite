import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { buildScrollDeckPages } from "@/config/scrollDeckPages"
import { useWorldStore } from "@/store/worldStore"
import { clampInt } from "@/utils/math"
import { getSlideBlends, getWrapZoneBlends } from "@/deck/deckBlends"
import { getDeckLayout } from "@/deck/deckLayout"
import { type DeckSection, LAST_SECTION, findIndexForSection, getPageHeight, getSectionRanges, isNearSnap } from "@/deck/deckMath"
import { OVERVIEW_WRAP_COOLDOWN_MS, beginWrap, createWrapState, easeScrollTowards, finishWrap, isWrapBlocked } from "@/deck/deckWrap"
import { createEdgeArmState, disarmEdges, hasFreshUserInput, resolveEdgeWrap, updateEdgeArming } from "@/deck/edgeWrap"
import { getTravelDirThresholdPx, lockScrollDirection } from "@/deck/scrollDirection"
import { createSnapDriftState, trackSnapDrift } from "@/deck/snapDrift"
import { createWheelPager } from "@/deck/wheelPager"
import { useDeckInput } from "./useDeckInput"

/** Scroll events stop for this long before the deck counts as settled and arms the edges. */
const SCROLL_END_MS = 140
/** Scroll positions this close to the end of the deck count as touching the bottom edge. */
const EDGE_EPSILON_PX = 3
/** Scroll positions within half a pixel of a slide count as aligned with it. */
const ALIGNED_EPSILON_PX = 0.5

/**
 * Drives the scroll deck: keeps the active slide and section in React state, maps the scroll
 * position onto the world store (route position, overview and title-card blends, travel
 * direction) on every frame, and makes the deck endless by wrapping between its two ends.
 * Input handling lives in useDeckInput; the pure pieces of the per-frame logic live in src/deck.
 */
export function useScrollSnapNavigation({ scrollLocked = false }: { scrollLocked?: boolean } = {}) {
  const pages = useMemo(() => buildScrollDeckPages(), [])
  const layout = useMemo(() => getDeckLayout(pages), [pages])
  const sectionRanges = useMemo(() => getSectionRanges(pages), [pages])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const rafId = useRef<number | null>(null)
  const scrollEndTimerRef = useRef<number | null>(null)
  const activeIndexRef = useRef<number>(1)
  const lastScrollTopRef = useRef<number | null>(null)
  const scrollDirLockRef = useRef<1 | -1 | null>(null)
  const isProgrammaticJumpRef = useRef(false)
  const didInitScrollRef = useRef(false)
  const wrapRef = useRef(createWrapState())
  const lastDeltaSignRef = useRef<number>(0)
  const snapDriftRef = useRef(createSnapDriftState())
  const edgeArmRef = useRef(createEdgeArmState())
  const lastUserScrollAtRef = useRef(0)
  const suppressTravelDirUpdateRef = useRef(false)
  const scrollLockedRef = useRef(scrollLocked)
  const wheelPagerRef = useRef(createWheelPager())
  const syncFromScrollRef = useRef<() => void>(() => {})
  const startWrapRef = useRef<(targetIndex: number) => void>(() => {})

  const [section, setSection] = useState<DeckSection>(0)
  const [activeIndex, setActiveIndex] = useState<number>(1)
  const sectionRef = useRef<DeckSection>(0)

  useEffect(() => {
    activeIndexRef.current = activeIndex
  }, [activeIndex])

  useEffect(() => {
    sectionRef.current = section
  }, [section])

  useEffect(() => {
    scrollLockedRef.current = scrollLocked
  }, [scrollLocked])

  useEffect(() => {
    const el = containerRef.current

    return () => {
      if (scrollEndTimerRef.current != null) {
        window.clearTimeout(scrollEndTimerRef.current)
      }

      if (el) el.classList.remove("scroll-snap-disabled")
    }
  }, [])

  // Jumps to the far end of the deck with snapping switched off, then resumes syncing a frame later.
  const startWrap = useCallback((targetIndex: number) => {
    const el = containerRef.current
    if (!el) return

    const now = performance.now()
    const wrap = wrapRef.current
    if (isWrapBlocked(wrap, now)) return

    beginWrap(wrap, targetIndex, now)
    suppressTravelDirUpdateRef.current = true

    el.classList.add("scroll-snap-disabled")

    requestAnimationFrame(() => {
      const height = getPageHeight(el)
      isProgrammaticJumpRef.current = true
      el.scrollTo({ top: targetIndex * height, behavior: "auto" })
      lastScrollTopRef.current = targetIndex * height
      requestAnimationFrame(() => {
        isProgrammaticJumpRef.current = false
        el.classList.remove("scroll-snap-disabled")
        wrap.inProgress = false
        if (rafId.current != null) cancelAnimationFrame(rafId.current)
        rafId.current = requestAnimationFrame(() => syncFromScrollRef.current())
      })
    })
  }, [])

  const syncFromScroll = useCallback(() => {
    rafId.current = null
    const el = containerRef.current
    if (!el) return

    const height = getPageHeight(el)
    const pagePos = el.scrollTop / height
    const now = performance.now()
    const wrap = wrapRef.current
    // While a wrap lands or cools down, the landing slide stays active whatever the scroll position says.
    const wrapLockedIndex = now < wrap.cooldownUntilMs ? wrap.lastTargetIndex : wrap.targetIndex
    const index =
      wrapLockedIndex != null ? clampInt(wrapLockedIndex, 0, pages.length - 1) : clampInt(Math.round(pagePos), 0, pages.length - 1)
    const page = pages[index]
    const targetTop = index * height

    const isSettledOnSnap = isNearSnap(el.scrollTop, index, height)
    const maxScrollTop = Math.max(0, el.scrollHeight - height)
    const isAtBottomEdge = el.scrollTop >= maxScrollTop - EDGE_EPSILON_PX

    const prevScrollTop = lastScrollTopRef.current
    const deltaScrollTop = prevScrollTop != null ? el.scrollTop - prevScrollTop : 0
    const distToSnap = Math.abs(el.scrollTop - targetTop)
    const isRecentOverviewWrap = index === layout.firstRealIndex && now - wrap.lastEndedAtMs < OVERVIEW_WRAP_COOLDOWN_MS
    if (isRecentOverviewWrap && distToSnap > ALIGNED_EPSILON_PX) {
      el.scrollTop = targetTop
      lastScrollTopRef.current = targetTop
    }
    const deltaSign = deltaScrollTop === 0 ? 0 : Math.sign(deltaScrollTop)
    if (deltaSign !== 0) lastDeltaSignRef.current = deltaSign

    const isResting = isSettledOnSnap && !isProgrammaticJumpRef.current && !wrap.inProgress
    const shouldCorrectDrift = trackSnapDrift(snapDriftRef.current, {
      isResting,
      index,
      deltaScrollTop,
      driftPx: Math.abs(el.scrollTop - targetTop),
      isCooldownOver: performance.now() > wrap.cooldownUntilMs
    })
    if (shouldCorrectDrift) {
      el.scrollTop = targetTop
      lastScrollTopRef.current = targetTop
    }

    updateEdgeArming(edgeArmRef.current, {
      isSettledOnSnap,
      index,
      firstRealIndex: layout.firstRealIndex,
      lastRealIndex: layout.lastRealIndex,
      now
    })

    lastScrollTopRef.current = el.scrollTop

    const shouldUpdateTravelDir = !isProgrammaticJumpRef.current && !suppressTravelDirUpdateRef.current
    if (shouldUpdateTravelDir && prevScrollTop != null && !isSettledOnSnap) {
      scrollDirLockRef.current = lockScrollDirection(scrollDirLockRef.current, deltaScrollTop, getTravelDirThresholdPx(height))
      if (scrollDirLockRef.current != null) useWorldStore.getState().setTravelDir(scrollDirLockRef.current)
    }

    if (isSettledOnSnap && scrollDirLockRef.current != null) {
      scrollDirLockRef.current = null
    }

    if (!isProgrammaticJumpRef.current && suppressTravelDirUpdateRef.current) {
      suppressTravelDirUpdateRef.current = false
    }

    if (index !== activeIndexRef.current) {
      activeIndexRef.current = index
      setActiveIndex(index)
    }

    const nextSection = page.section
    if (nextSection !== sectionRef.current) {
      sectionRef.current = nextSection
      setSection(nextSection)
    }

    const store = useWorldStore.getState()
    const isTopWrapZone = pagePos < layout.firstRealIndex
    const isBottomWrapZone = pagePos > layout.lastRealIndex
    const isWrapZone = layout.hasSentinels && (isTopWrapZone || isBottomWrapZone)
    if (layout.hasSentinels && !isProgrammaticJumpRef.current && !wrap.inProgress) {
      const edges = edgeArmRef.current
      const wrapDirection = resolveEdgeWrap({
        armed: edges,
        hasFreshInput: hasFreshUserInput(edges.armedAtMs, lastUserScrollAtRef.current, now),
        scrollDirLock: scrollDirLockRef.current,
        deltaScrollTop,
        lastDeltaSign: lastDeltaSignRef.current,
        pagePos,
        firstRealIndex: layout.firstRealIndex,
        lastRealIndex: layout.lastRealIndex
      })

      if (wrapDirection != null) {
        scrollDirLockRef.current = null
        disarmEdges(edges)
        store.setTravelDir(wrapDirection === "up" ? -1 : 1)
        startWrapRef.current(wrapDirection === "up" ? layout.lastRealIndex : layout.overviewTargetIndex)
        return
      }
    }
    if (!layout.hasSentinels && !isProgrammaticJumpRef.current && !wrap.inProgress) {
      const wantsWrapToOverview = index === layout.lastRealIndex && isAtBottomEdge && deltaScrollTop > 0
      if (wantsWrapToOverview) {
        scrollDirLockRef.current = null
        useWorldStore.getState().setTravelDir(1)
        startWrapRef.current(layout.overviewTargetIndex)
        return
      }
    }

    if (isWrapZone) {
      const blends = getWrapZoneBlends(pagePos, isTopWrapZone, layout, sectionRanges)
      store.setRouteT(blends.routeT)
      store.setOverviewBlend(blends.overviewBlend)
      store.setTitleCardBlend(blends.titleCardBlend)
    } else {
      const blends = getSlideBlends(isSettledOnSnap ? index : pagePos, layout, sectionRanges)
      store.setRouteT(blends.routeT)
      store.setTitleCardBlend(blends.titleCardBlend)
      store.setOverviewBlend(blends.overviewBlend)
    }
  }, [layout, pages, sectionRanges])

  syncFromScrollRef.current = syncFromScroll
  startWrapRef.current = startWrap

  const onScroll = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    const now = performance.now()
    const wrap = wrapRef.current
    if (now < wrap.cooldownUntilMs && wrap.lastTargetIndex != null) {
      const height = getPageHeight(el)
      const targetTop = wrap.lastTargetIndex * height
      if (Math.abs(el.scrollTop - targetTop) > ALIGNED_EPSILON_PX) {
        el.scrollTop = targetTop
        lastScrollTopRef.current = targetTop
      }
      if (rafId.current == null) {
        rafId.current = requestAnimationFrame(syncFromScroll)
      }
      return
    }
    if (wrap.targetIndex != null) {
      const height = getPageHeight(el)
      const targetTop = wrap.targetIndex * height
      const isNearTarget = isNearSnap(el.scrollTop, wrap.targetIndex, height)
      if (!isNearTarget) {
        isProgrammaticJumpRef.current = true
        const nextTop = easeScrollTowards(el.scrollTop, targetTop)
        el.scrollTop = nextTop
        lastScrollTopRef.current = nextTop
        if (rafId.current == null) {
          rafId.current = requestAnimationFrame(syncFromScroll)
        }
        return
      }
      isProgrammaticJumpRef.current = false
      finishWrap(wrap, performance.now(), layout.firstRealIndex)
    }
    if (rafId.current != null) return
    rafId.current = requestAnimationFrame(syncFromScroll)

    if (scrollEndTimerRef.current != null) {
      window.clearTimeout(scrollEndTimerRef.current)
    }
    scrollEndTimerRef.current = window.setTimeout(() => {
      scrollEndTimerRef.current = null
      edgeArmRef.current.armRequested = true
      syncFromScrollRef.current()
    }, SCROLL_END_MS)
  }, [layout.firstRealIndex, syncFromScroll])

  // One slide per wheel notch or key press; stepping past either end wraps around.
  const stepPage = useCallback(
    (direction: 1 | -1) => {
      const el = containerRef.current
      if (!el) return

      const now = performance.now()
      if (isWrapBlocked(wrapRef.current, now)) return

      const height = getPageHeight(el)
      const currentIndex = clampInt(Math.round(el.scrollTop / height), layout.firstRealIndex, layout.lastRealIndex)
      lastUserScrollAtRef.current = now
      scrollDirLockRef.current = null
      wheelPagerRef.current.markStepped(now)
      useWorldStore.getState().setLookYaw(0)

      if (direction === -1 && currentIndex === layout.firstRealIndex) {
        useWorldStore.getState().setTravelDir(-1)
        startWrap(layout.lastRealIndex)
        return
      }

      if (direction === 1 && currentIndex === layout.lastRealIndex) {
        useWorldStore.getState().setTravelDir(1)
        startWrap(layout.overviewTargetIndex)
        return
      }

      const targetIndex = clampInt(currentIndex + direction, layout.firstRealIndex, layout.lastRealIndex)
      if (targetIndex === currentIndex) return

      useWorldStore.getState().setTravelDir(direction)
      el.scrollTo({ top: targetIndex * height, behavior: "smooth" })
    },
    [layout, startWrap]
  )

  const turnLook = useCallback((deltaYaw: number) => {
    const store = useWorldStore.getState()
    store.setLookYaw(store.lookYaw + deltaYaw)
  }, [])

  const markUserInput = useCallback((now: number) => {
    lastUserScrollAtRef.current = now
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (didInitScrollRef.current) return
    didInitScrollRef.current = true

    const height = getPageHeight(el)
    el.scrollTo({ top: layout.firstRealIndex * height, behavior: "auto" })
    edgeArmRef.current.armRequested = true
    syncFromScroll()
  }, [layout.firstRealIndex, syncFromScroll])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [onScroll])

  useDeckInput({ containerRef, scrollLockedRef, wheelPagerRef, stepPage, turnLook, markUserInput })

  useEffect(() => {
    const handleResize = () => {
      const el = containerRef.current
      if (!el) return

      // Re-align the current slide with the new slide height instead of re-deriving the index
      // from the old scroll offset, which lands between slides after a height change.
      const height = getPageHeight(el)
      const targetTop = clampInt(activeIndexRef.current, 0, pages.length - 1) * height
      if (Math.abs(el.scrollTop - targetTop) > ALIGNED_EPSILON_PX) {
        el.scrollTo({ top: targetTop, behavior: "auto" })
        lastScrollTopRef.current = targetTop
      }
      syncFromScroll()
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [pages.length, syncFromScroll])

  const scrollToSection = useCallback(
    (nextSection: number, options?: { behavior?: ScrollBehavior }) => {
      const el = containerRef.current
      if (!el) return

      lastUserScrollAtRef.current = performance.now()
      useWorldStore.getState().setLookYaw(0)

      const clampedSection = clampInt(nextSection, 0, LAST_SECTION) as DeckSection
      const targetIndex = findIndexForSection(pages, clampedSection)
      if (targetIndex < 0) return

      const currentIndex = activeIndexRef.current
      if (targetIndex !== currentIndex) {
        useWorldStore.getState().setTravelDir(targetIndex > currentIndex ? 1 : -1)
      }

      const height = getPageHeight(el)
      el.scrollTo({ top: targetIndex * height, behavior: options?.behavior ?? "smooth" })
    },
    [pages]
  )

  return {
    pages,
    section,
    activeIndex,
    containerRef,
    scrollToSection
  }
}

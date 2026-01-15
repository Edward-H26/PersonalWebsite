import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { buildScrollDeckPages, type ScrollDeckPage } from "@/components/ui/ScrollDeck"
import { useWorldStore } from "@/store/worldStore"
import { EARTH_SECTION_T_STOPS } from "@/config"

type DeckSection = 0 | 1 | 2 | 3 | 4 | 5

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v))
}

function smoothstep01(t: number) {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function isNearSnap(scrollTop: number, index: number, pageHeight: number) {
  const target = index * pageHeight
  const epsilon = Math.min(18, pageHeight * 0.04)
  return Math.abs(scrollTop - target) <= epsilon
}

function getRouteTAtPagePos(
  pagePos: number,
  sectionRanges: Map<DeckSection, { startIndex: number; endIndex: number }>
) {
  const maxSegment = EARTH_SECTION_T_STOPS.length - 1
  const lastStop = EARTH_SECTION_T_STOPS[EARTH_SECTION_T_STOPS.length - 1]

  const firstRange = sectionRanges.get(1)
  if (firstRange && pagePos <= firstRange.startIndex) return EARTH_SECTION_T_STOPS[0]

  for (let segment = 1; segment <= maxSegment; segment += 1) {
    const range = sectionRanges.get(segment as DeckSection)
    if (!range) continue
    if (pagePos <= range.endIndex) {
      const denom = Math.max(1e-6, range.endIndex - range.startIndex)
      const local = clamp01((pagePos - range.startIndex) / denom)
      const startT = EARTH_SECTION_T_STOPS[segment - 1]
      const endT = EARTH_SECTION_T_STOPS[segment]
      return startT + (endT - startT) * local
    }
  }

  return lastStop
}

function getSectionRanges(pages: ScrollDeckPage[]) {
  const ranges = new Map<DeckSection, { startIndex: number; endIndex: number }>()

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

function findIndexForSection(pages: ScrollDeckPage[], section: DeckSection) {
  if (section === 0) {
    return pages.findIndex((p) => p.kind === "overview")
  }
  return pages.findIndex((p) => p.kind === "stage_title" && p.section === section)
}

export function useScrollSnapNavigation() {
  const pages = useMemo(() => buildScrollDeckPages(), [])
  const overviewIndex = useMemo(() => pages.findIndex((p) => p.kind === "overview"), [pages])
  const researchTitleIndex = useMemo(() => findIndexForSection(pages, 1), [pages])
  const stageTitleIndices = useMemo(() => pages.flatMap((p, i) => (p.kind === "stage_title" ? [i] : [])), [pages])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const rafId = useRef<number | null>(null)
  const scrollEndTimerRef = useRef<number | null>(null)
  const activeIndexRef = useRef<number>(1)
  const lastScrollTopRef = useRef<number | null>(null)
  const scrollDirLockRef = useRef<1 | -1 | null>(null)
  const isProgrammaticJumpRef = useRef(false)
  const didInitScrollRef = useRef(false)
  const wrapLockUntilMs = useRef(0)
  const wrapInProgressRef = useRef(false)
  const suppressTravelDirUpdateRef = useRef(false)
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

  const sentinelTopIndex = 0
  const sentinelBottomIndex = pages.length - 1
  const firstRealIndex = 1
  const lastRealIndex = pages.length - 2

  const sectionRanges = useMemo(() => getSectionRanges(pages), [pages])

  useEffect(() => {
    return () => {
      if (scrollEndTimerRef.current != null) {
        window.clearTimeout(scrollEndTimerRef.current)
      }

      const el = containerRef.current
      if (el) el.classList.remove("scroll-snap-disabled")
    }
  }, [])

  const startWrap = useCallback((targetIndex: number) => {
    const el = containerRef.current
    if (!el) return

    const now = performance.now()
    if (wrapInProgressRef.current) return
    if (now < wrapLockUntilMs.current) return

    wrapInProgressRef.current = true
    suppressTravelDirUpdateRef.current = true
    wrapLockUntilMs.current = now + 800

    el.classList.add("scroll-snap-disabled")

    requestAnimationFrame(() => {
      const height = Math.max(1, el.clientHeight)
      isProgrammaticJumpRef.current = true
      el.scrollTo({ top: targetIndex * height, behavior: "auto" })
      requestAnimationFrame(() => {
        isProgrammaticJumpRef.current = false
        el.classList.remove("scroll-snap-disabled")
        wrapInProgressRef.current = false
        if (rafId.current != null) cancelAnimationFrame(rafId.current)
        rafId.current = requestAnimationFrame(() => syncFromScrollRef.current())
      })
    })
  }, [])

  const syncFromScroll = useCallback(() => {
    rafId.current = null
    const el = containerRef.current
    if (!el) return

    const height = Math.max(1, el.clientHeight)
    const pagePos = el.scrollTop / height
    const index = clampInt(Math.round(pagePos), 0, pages.length - 1)
    const page = pages[index]

    const isSettledOnSnap = isNearSnap(el.scrollTop, index, height)
    const maxScrollTop = Math.max(0, el.scrollHeight - height)
    const edgeEpsilonPx = 3
    const isAtTopEdge = el.scrollTop <= edgeEpsilonPx
    const isAtBottomEdge = el.scrollTop >= maxScrollTop - edgeEpsilonPx

    const prevScrollTop = lastScrollTopRef.current
    lastScrollTopRef.current = el.scrollTop

    const shouldUpdateTravelDir = !isProgrammaticJumpRef.current && !suppressTravelDirUpdateRef.current
    if (shouldUpdateTravelDir && prevScrollTop != null && !isSettledOnSnap) {
      const deltaScrollTop = el.scrollTop - prevScrollTop
      const thresholdPx = Math.max(1.5, height * 0.003)
      if (scrollDirLockRef.current == null && Math.abs(deltaScrollTop) >= thresholdPx) {
        scrollDirLockRef.current = deltaScrollTop > 0 ? 1 : -1
        useWorldStore.getState().setTravelDir(scrollDirLockRef.current)
      } else if (scrollDirLockRef.current != null) {
        useWorldStore.getState().setTravelDir(scrollDirLockRef.current)
      }
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
    const isTopWrapZone = pagePos <= firstRealIndex
    const isBottomWrapZone = pagePos >= lastRealIndex
    const isWrapZone = isTopWrapZone || isBottomWrapZone
    const overviewPos = overviewIndex >= 0 ? overviewIndex : firstRealIndex

    if (isWrapZone) {
      const wrapT = isTopWrapZone
        ? clamp01((pagePos - sentinelTopIndex) / Math.max(1e-6, firstRealIndex - sentinelTopIndex))
        : clamp01((pagePos - lastRealIndex) / Math.max(1e-6, sentinelBottomIndex - lastRealIndex))
      const wrapEase = smoothstep01(wrapT)

      const routeTAtLastReal = getRouteTAtPagePos(lastRealIndex, sectionRanges)
      const routeTAtOverview = getRouteTAtPagePos(overviewPos, sectionRanges)
      store.setRouteT(lerp(routeTAtLastReal, routeTAtOverview, wrapEase))
      store.setOverviewBlend(lerp(1, 0, wrapEase))

      const virtualPos = lerp(lastRealIndex, overviewPos, wrapEase)
      let nearestTitleDist = Number.POSITIVE_INFINITY
      for (const titleIndex of stageTitleIndices) {
        const dist = Math.abs(virtualPos - titleIndex)
        if (dist < nearestTitleDist) nearestTitleDist = dist
      }

      const titleWindow = 1.35
      const titleBlend = smoothstep01(clamp01(1 - nearestTitleDist / titleWindow))
      store.setTitleCardBlend(titleBlend)
    } else {
      store.setRouteT(getRouteTAtPagePos(pagePos, sectionRanges))

      let nearestTitleDist = Number.POSITIVE_INFINITY
      for (const titleIndex of stageTitleIndices) {
        const dist = Math.abs(pagePos - titleIndex)
        if (dist < nearestTitleDist) nearestTitleDist = dist
      }

      const titleWindow = 1.35
      const titleBlend = smoothstep01(clamp01(1 - nearestTitleDist / titleWindow))
      store.setTitleCardBlend(titleBlend)

      if (overviewIndex >= 0 && researchTitleIndex > overviewIndex) {
        const denom = Math.max(1e-6, researchTitleIndex - overviewIndex)
        const t = clamp01((pagePos - overviewIndex) / denom)
        store.setOverviewBlend(smoothstep01(t))
      } else {
        store.setOverviewBlend(1)
      }
    }

    if (!isProgrammaticJumpRef.current) {
      const shouldWrapFromTop = index === sentinelTopIndex && (isSettledOnSnap || isAtTopEdge)
      if (shouldWrapFromTop) {
        scrollDirLockRef.current = null
        store.setTravelDir(-1)
        startWrapRef.current(lastRealIndex)
        return
      }

      const shouldWrapFromBottom = index === sentinelBottomIndex && (isSettledOnSnap || isAtBottomEdge)
      if (shouldWrapFromBottom) {
        scrollDirLockRef.current = null
        store.setTravelDir(1)
        startWrapRef.current(firstRealIndex)
        return
      }
    }
  }, [
    firstRealIndex,
    lastRealIndex,
    overviewIndex,
    pages,
    researchTitleIndex,
    sectionRanges,
    stageTitleIndices,
    sentinelBottomIndex,
    sentinelTopIndex
  ])

  syncFromScrollRef.current = syncFromScroll
  startWrapRef.current = startWrap

  const onScroll = useCallback(() => {
    if (rafId.current != null) return
    rafId.current = requestAnimationFrame(syncFromScroll)

    if (scrollEndTimerRef.current != null) {
      window.clearTimeout(scrollEndTimerRef.current)
    }
    scrollEndTimerRef.current = window.setTimeout(() => {
      scrollEndTimerRef.current = null
      syncFromScrollRef.current()
    }, 140)
  }, [syncFromScroll])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (didInitScrollRef.current) return
    didInitScrollRef.current = true

    const height = Math.max(1, el.clientHeight)
    el.scrollTo({ top: firstRealIndex * height, behavior: "auto" })
    syncFromScroll()
  }, [firstRealIndex, syncFromScroll])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [onScroll])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      if (isProgrammaticJumpRef.current) return
      if (wrapInProgressRef.current) return
      if (performance.now() < wrapLockUntilMs.current) return

      const height = Math.max(1, el.clientHeight)
      const idx = clampInt(Math.round(el.scrollTop / height), 0, pages.length - 1)
      const maxScrollTop = Math.max(0, el.scrollHeight - height)
      const edgeEpsilonPx = 3
      const isAtTopEdge = el.scrollTop <= edgeEpsilonPx
      const isAtBottomEdge = el.scrollTop >= maxScrollTop - edgeEpsilonPx

      if (idx === sentinelTopIndex && isAtTopEdge && e.deltaY < 0) {
        e.preventDefault()
        scrollDirLockRef.current = null
        useWorldStore.getState().setTravelDir(-1)
        startWrapRef.current(lastRealIndex)
        return
      }

      if (idx === sentinelBottomIndex && isAtBottomEdge && e.deltaY > 0) {
        e.preventDefault()
        scrollDirLockRef.current = null
        useWorldStore.getState().setTravelDir(1)
        startWrapRef.current(firstRealIndex)
      }
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [firstRealIndex, lastRealIndex, pages.length, sentinelBottomIndex, sentinelTopIndex])

  useEffect(() => {
    const handleResize = () => {
      const el = containerRef.current
      if (!el) return

      const height = Math.max(1, el.clientHeight)
      const idx = clampInt(activeIndexRef.current, 0, pages.length - 1)
      el.scrollTo({ top: idx * height, behavior: "auto" })
      syncFromScroll()
    }

    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [pages.length, syncFromScroll])

  const scrollToSection = useCallback(
    (nextSection: number, options?: { behavior?: ScrollBehavior }) => {
      const el = containerRef.current
      if (!el) return

      const clampedSection = clampInt(nextSection, 0, 5) as DeckSection
      const targetIndex = findIndexForSection(pages, clampedSection)
      if (targetIndex < 0) return

      const currentIndex = activeIndexRef.current
      if (targetIndex !== currentIndex) {
        useWorldStore.getState().setTravelDir(targetIndex > currentIndex ? 1 : -1)
      }

      const height = Math.max(1, el.clientHeight)
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



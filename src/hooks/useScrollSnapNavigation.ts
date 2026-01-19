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
  const epsilon = Math.min(6, pageHeight * 0.015)
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
  const wrapTargetIndexRef = useRef<number | null>(null)
  const lastWrapTargetIndexRef = useRef<number | null>(null)
  const lastWrapEndedAtMs = useRef(0)
  const wrapCooldownUntilMs = useRef(0)
  const lastDeltaSignRef = useRef<number>(0)
  const settledSnapCountRef = useRef(0)
  const lastSnapIndexRef = useRef<number | null>(null)
  const lastCorrectedIndexRef = useRef<number | null>(null)
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
    wrapTargetIndexRef.current = targetIndex
    lastWrapTargetIndexRef.current = targetIndex

    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "post-fix",
        hypothesisId: "H3",
        location: "useScrollSnapNavigation.ts:startWrap",
        message: "Start wrap invoked",
        data: {
          targetIndex,
          scrollTop: el.scrollTop,
          lockUntilMs: wrapLockUntilMs.current
        },
        timestamp: Date.now()
      })
    }).catch(() => {})
    // #endregion agent log
    if (targetIndex === firstRealIndex) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "post-fix",
          hypothesisId: "H32",
          location: "useScrollSnapNavigation.ts:startWrap",
          message: "Wrap to overview initiated",
          data: {
            targetIndex,
            scrollTop: el.scrollTop,
            lockUntilMs: wrapLockUntilMs.current
          },
          timestamp: Date.now()
        })
      }).catch(() => {})
      // #endregion agent log
    }

    el.classList.add("scroll-snap-disabled")

    requestAnimationFrame(() => {
      const height = Math.max(1, el.clientHeight)
      isProgrammaticJumpRef.current = true
      el.scrollTo({ top: targetIndex * height, behavior: "auto" })
      lastScrollTopRef.current = targetIndex * height
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
    let index = clampInt(Math.round(pagePos), 0, pages.length - 1)
    const now = performance.now()
    const wrapLockedIndex =
      now < wrapCooldownUntilMs.current ? lastWrapTargetIndexRef.current : wrapTargetIndexRef.current
    if (wrapLockedIndex != null) {
      index = clampInt(wrapLockedIndex, 0, pages.length - 1)
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "post-fix",
          hypothesisId: "H14",
          location: "useScrollSnapNavigation.ts:syncFromScroll",
          message: "Index locked during wrap cooldown",
          data: {
            pagePos,
            index,
            wrapLockedIndex
          },
          timestamp: Date.now()
        })
      }).catch(() => {})
      // #endregion agent log
    }
    const page = pages[index]
    if (index === sentinelTopIndex || index === firstRealIndex || index === lastRealIndex || index === sentinelBottomIndex) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "post-fix",
          hypothesisId: "H33",
          location: "useScrollSnapNavigation.ts:syncFromScroll",
          message: "Edge page snapshot",
          data: {
            index,
            pageKind: page.kind,
            renderAsKey: page.kind === "sentinel" ? page.renderAsKey : null,
            pagePos,
            scrollTop: el.scrollTop,
            isWrapZone
          },
          timestamp: Date.now()
        })
      }).catch(() => {})
      // #endregion agent log
    }

    const isSettledOnSnap = isNearSnap(el.scrollTop, index, height)
    const maxScrollTop = Math.max(0, el.scrollHeight - height)
    const edgeEpsilonPx = 3
    const isAtTopEdge = el.scrollTop <= edgeEpsilonPx
    const isAtBottomEdge = el.scrollTop >= maxScrollTop - edgeEpsilonPx

    const prevScrollTop = lastScrollTopRef.current
    const deltaScrollTop = prevScrollTop != null ? el.scrollTop - prevScrollTop : 0
    const distToSnap = Math.abs(el.scrollTop - index * height)
    if (isSettledOnSnap && Math.abs(deltaScrollTop) > 1.5) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "post-fix",
          hypothesisId: "H12",
          location: "useScrollSnapNavigation.ts:syncFromScroll",
          message: "Settled snap with high delta",
          data: {
            index,
            scrollTop: el.scrollTop,
            deltaScrollTop,
            distToSnap
          },
          timestamp: Date.now()
        })
      }).catch(() => {})
      // #endregion agent log
    }
    if (index === firstRealIndex && !isSettledOnSnap && distToSnap > 2) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "post-fix",
          hypothesisId: "H28",
          location: "useScrollSnapNavigation.ts:syncFromScroll",
          message: "Overview unsettled drift",
          data: {
            index,
            scrollTop: el.scrollTop,
            deltaScrollTop,
            distToSnap
          },
          timestamp: Date.now()
        })
      }).catch(() => {})
      // #endregion agent log
    }
    if (index === firstRealIndex && isSettledOnSnap && Math.abs(deltaScrollTop) > 0.6) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "post-fix",
          hypothesisId: "H25",
          location: "useScrollSnapNavigation.ts:syncFromScroll",
          message: "Overview snap jitter",
          data: {
            index,
            scrollTop: el.scrollTop,
            deltaScrollTop,
            distToSnap
          },
          timestamp: Date.now()
        })
      }).catch(() => {})
      // #endregion agent log
    }
    const deltaSign = deltaScrollTop === 0 ? 0 : Math.sign(deltaScrollTop)
    if (isSettledOnSnap && deltaSign !== 0 && lastDeltaSignRef.current !== 0 && deltaSign !== lastDeltaSignRef.current) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "post-fix",
          hypothesisId: "H10",
          location: "useScrollSnapNavigation.ts:syncFromScroll",
          message: "Scroll delta sign flip while settled",
          data: {
            index,
            scrollTop: el.scrollTop,
            deltaScrollTop,
            lastDeltaSign: lastDeltaSignRef.current,
            distToSnap
          },
          timestamp: Date.now()
        })
      }).catch(() => {})
      // #endregion agent log
    }
    if (deltaSign !== 0) lastDeltaSignRef.current = deltaSign

    if (isSettledOnSnap && !isProgrammaticJumpRef.current && !wrapInProgressRef.current) {
      if (lastSnapIndexRef.current !== index) {
        settledSnapCountRef.current = 0
        lastCorrectedIndexRef.current = null
        lastSnapIndexRef.current = index
      }
      if (Math.abs(deltaScrollTop) < 0.6) {
        settledSnapCountRef.current += 1
      } else {
        settledSnapCountRef.current = 0
      }
      const targetTop = index * height
      const canCorrect =
        settledSnapCountRef.current >= 5 &&
        lastCorrectedIndexRef.current !== index &&
        Math.abs(el.scrollTop - targetTop) > 6 &&
        performance.now() > wrapCooldownUntilMs.current
      if (canCorrect) {
        el.scrollTop = targetTop
        lastScrollTopRef.current = targetTop
        lastCorrectedIndexRef.current = index
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "post-fix",
            hypothesisId: "H11",
            location: "useScrollSnapNavigation.ts:syncFromScroll",
            message: "Snap correction applied",
            data: {
              index,
              scrollTop: el.scrollTop,
              targetTop,
              deltaScrollTop,
              settledSnapCount: settledSnapCountRef.current
            },
            timestamp: Date.now()
          })
        }).catch(() => {})
        // #endregion agent log
      }
    } else {
      settledSnapCountRef.current = 0
      lastSnapIndexRef.current = null
    }

    lastScrollTopRef.current = el.scrollTop

    const shouldUpdateTravelDir = !isProgrammaticJumpRef.current && !suppressTravelDirUpdateRef.current
    if (shouldUpdateTravelDir && prevScrollTop != null && !isSettledOnSnap) {
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
      if (performance.now() - lastWrapEndedAtMs.current < 1500) {
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "post-fix",
            hypothesisId: "H6",
            location: "useScrollSnapNavigation.ts:activeIndex",
            message: "Active index changed after wrap",
            data: {
              index,
              pagePos,
              lastWrapEndedAtMs: lastWrapEndedAtMs.current
            },
            timestamp: Date.now()
          })
        }).catch(() => {})
        // #endregion agent log
      }
    }

    if (index === lastRealIndex && isSettledOnSnap) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "post-fix",
          hypothesisId: "H16",
          location: "useScrollSnapNavigation.ts:syncFromScroll",
          message: "Settled on last card",
          data: {
            index,
            pagePos,
            deltaScrollTop
          },
          timestamp: Date.now()
        })
      }).catch(() => {})
      // #endregion agent log
    }

    if (index === firstRealIndex && isSettledOnSnap && sectionRef.current === 1) {
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "post-fix",
          hypothesisId: "H17",
          location: "useScrollSnapNavigation.ts:syncFromScroll",
          message: "Overview to research settled",
          data: {
            index,
            pagePos,
            deltaScrollTop
          },
          timestamp: Date.now()
        })
      }).catch(() => {})
      // #endregion agent log
    }

    const nextSection = page.section
    if (nextSection !== sectionRef.current) {
      const prevSection = sectionRef.current
      sectionRef.current = nextSection
      setSection(nextSection)
      if (prevSection === 0 && nextSection === 1) {
        const store = useWorldStore.getState()
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "post-fix",
            hypothesisId: "H22",
            location: "useScrollSnapNavigation.ts:sectionChange",
            message: "Section changed from overview to research",
            data: {
              prevSection,
              nextSection,
              index,
              pagePos,
              scrollTop: el.scrollTop,
              travelDir: store.travelDir
            },
            timestamp: Date.now()
          })
        }).catch(() => {})
        // #endregion agent log
      }
    }

    const store = useWorldStore.getState()
    const isTopWrapZone = pagePos < firstRealIndex
    const isBottomWrapZone = pagePos > lastRealIndex
    const isWrapZone = isTopWrapZone || isBottomWrapZone
    const overviewPos = overviewIndex >= 0 ? overviewIndex : firstRealIndex

    if (!isProgrammaticJumpRef.current && !wrapInProgressRef.current) {
      const preWrapThreshold = 0.08
      const wantsWrapUp =
        (scrollDirLockRef.current === -1 || deltaScrollTop < 0) &&
        (index === sentinelTopIndex || pagePos <= sentinelTopIndex + preWrapThreshold)
      const wantsWrapDown =
        (scrollDirLockRef.current === 1 || deltaScrollTop > 0) &&
        (index === sentinelBottomIndex || pagePos >= sentinelBottomIndex - preWrapThreshold)

      if (wantsWrapUp) {
        scrollDirLockRef.current = null
        store.setTravelDir(-1)
        startWrapRef.current(lastRealIndex)
        return
      }

      if (wantsWrapDown) {
        scrollDirLockRef.current = null
        store.setTravelDir(1)
        startWrapRef.current(firstRealIndex)
        return
      }
    }

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
      const snappedPagePos = isSettledOnSnap ? index : pagePos
      if (isSettledOnSnap) {
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "post-fix",
            hypothesisId: "H2",
            location: "useScrollSnapNavigation.ts:syncFromScroll",
            message: "Settled snap state",
            data: {
              index,
              pagePos,
              snappedPagePos,
              isAtTopEdge,
              isAtBottomEdge,
              deltaScrollTop
            },
            timestamp: Date.now()
          })
        }).catch(() => {})
        // #endregion agent log
      }
      store.setRouteT(getRouteTAtPagePos(snappedPagePos, sectionRanges))

      let nearestTitleDist = Number.POSITIVE_INFINITY
      for (const titleIndex of stageTitleIndices) {
        const dist = Math.abs(snappedPagePos - titleIndex)
        if (dist < nearestTitleDist) nearestTitleDist = dist
      }

      const titleWindow = 1.35
      const titleBlend = smoothstep01(clamp01(1 - nearestTitleDist / titleWindow))
      store.setTitleCardBlend(titleBlend)

      if (overviewIndex >= 0 && researchTitleIndex > overviewIndex) {
        const denom = Math.max(1e-6, researchTitleIndex - overviewIndex)
        const t = clamp01((snappedPagePos - overviewIndex) / denom)
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
    const el = containerRef.current
    if (!el) return
    const now = performance.now()
    if (now < wrapCooldownUntilMs.current && lastWrapTargetIndexRef.current != null) {
      const height = Math.max(1, el.clientHeight)
      const targetTop = lastWrapTargetIndexRef.current * height
      const prevScrollTop = lastScrollTopRef.current
      const deltaScrollTop = prevScrollTop != null ? el.scrollTop - prevScrollTop : 0
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "post-fix",
          hypothesisId: "H23",
          location: "useScrollSnapNavigation.ts:onScroll",
          message: "Cooldown scroll event",
          data: {
            scrollTop: el.scrollTop,
            targetTop,
            deltaScrollTop,
            wrapCooldownUntilMs: wrapCooldownUntilMs.current
          },
          timestamp: Date.now()
        })
      }).catch(() => {})
      // #endregion agent log
      if (Math.abs(el.scrollTop - targetTop) > 0.5) {
        el.scrollTop = targetTop
        lastScrollTopRef.current = targetTop
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "post-fix",
            hypothesisId: "H24",
            location: "useScrollSnapNavigation.ts:onScroll",
            message: "Cooldown clamp applied",
            data: {
              scrollTop: el.scrollTop,
              targetTop
            },
            timestamp: Date.now()
          })
        }).catch(() => {})
        // #endregion agent log
      }
      if (rafId.current == null) {
        rafId.current = requestAnimationFrame(syncFromScroll)
      }
      return
    }
    if (wrapTargetIndexRef.current != null) {
      const height = Math.max(1, el.clientHeight)
      const targetTop = wrapTargetIndexRef.current * height
      const isNearTarget = isNearSnap(el.scrollTop, wrapTargetIndexRef.current, height)
      if (!isNearTarget) {
        isProgrammaticJumpRef.current = true
        const nextTop = el.scrollTop + (targetTop - el.scrollTop) * 0.28
        el.scrollTop = nextTop
        lastScrollTopRef.current = nextTop
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "post-fix",
            hypothesisId: "H4",
            location: "useScrollSnapNavigation.ts:onScroll",
            message: "Wrap easing toward target",
            data: {
              targetTop,
              scrollTop: el.scrollTop,
              lockUntilMs: wrapLockUntilMs.current
            },
            timestamp: Date.now()
          })
        }).catch(() => {})
        // #endregion agent log
        if (rafId.current == null) {
          rafId.current = requestAnimationFrame(syncFromScroll)
        }
        return
      }
      isProgrammaticJumpRef.current = false
      wrapTargetIndexRef.current = null
      lastWrapEndedAtMs.current = performance.now()
      wrapCooldownUntilMs.current = lastWrapEndedAtMs.current + 380
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "post-fix",
          hypothesisId: "H7",
          location: "useScrollSnapNavigation.ts:onScroll",
          message: "Wrap lock released",
          data: {
            scrollTop: el.scrollTop,
            lastWrapEndedAtMs: lastWrapEndedAtMs.current,
            wrapCooldownUntilMs: wrapCooldownUntilMs.current
          },
          timestamp: Date.now()
        })
      }).catch(() => {})
      // #endregion agent log
    }
    if (rafId.current != null) return
    rafId.current = requestAnimationFrame(syncFromScroll)

    if (scrollEndTimerRef.current != null) {
      window.clearTimeout(scrollEndTimerRef.current)
    }
    scrollEndTimerRef.current = window.setTimeout(() => {
      scrollEndTimerRef.current = null
      // #region agent log
      fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "debug-session",
          runId: "post-fix",
          hypothesisId: "H26",
          location: "useScrollSnapNavigation.ts:onScroll",
          message: "Scroll end timer fired",
          data: {
            scrollTop: el.scrollTop,
            lastScrollTop: lastScrollTopRef.current,
            wrapCooldownUntilMs: wrapCooldownUntilMs.current
          },
          timestamp: Date.now()
        })
      }).catch(() => {})
      // #endregion agent log
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
      const now = performance.now()
      const wrapLockedIndex =
        now < wrapCooldownUntilMs.current ? lastWrapTargetIndexRef.current : wrapTargetIndexRef.current
      if ((wrapTargetIndexRef.current != null && now < wrapLockUntilMs.current) || now < wrapCooldownUntilMs.current) {
        e.preventDefault()
        const height = Math.max(1, el.clientHeight)
        const idx = wrapLockedIndex ?? clampInt(Math.round(el.scrollTop / height), 0, pages.length - 1)
        const targetTop = idx * height
        if (Math.abs(el.scrollTop - targetTop) > 0.5) {
          el.scrollTop = targetTop
          lastScrollTopRef.current = targetTop
        }
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "post-fix",
            hypothesisId: "H9",
            location: "useScrollSnapNavigation.ts:onWheel",
            message: "Wheel suppressed during wrap cooldown",
            data: {
              scrollTop: el.scrollTop,
              wrapLockedIndex,
              wrapCooldownUntilMs: wrapCooldownUntilMs.current
            },
            timestamp: Date.now()
          })
        }).catch(() => {})
        // #endregion agent log
        return
      }
      if (isProgrammaticJumpRef.current) return
      if (wrapInProgressRef.current) return
      if (performance.now() < wrapLockUntilMs.current) return

      const height = Math.max(1, el.clientHeight)
      const idx = clampInt(Math.round(el.scrollTop / height), 0, pages.length - 1)
      const recentWrap = now - lastWrapEndedAtMs.current < 650
      if (idx === firstRealIndex && recentWrap) {
        e.preventDefault()
        const targetTop = idx * height
        if (Math.abs(el.scrollTop - targetTop) > 0.5) {
          el.scrollTop = targetTop
          lastScrollTopRef.current = targetTop
        }
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "post-fix",
            hypothesisId: "H31",
            location: "useScrollSnapNavigation.ts:onWheel",
            message: "Wheel blocked after wrap at overview",
            data: {
              scrollTop: el.scrollTop,
              deltaY: e.deltaY,
              lastWrapEndedAtMs: lastWrapEndedAtMs.current
            },
            timestamp: Date.now()
          })
        }).catch(() => {})
        // #endregion agent log
        return
      }
      if (idx === firstRealIndex && Math.abs(e.deltaY) > 0.5 && now > wrapCooldownUntilMs.current) {
        // #region agent log
        fetch("http://127.0.0.1:7242/ingest/e30b3b2d-59aa-497a-a292-6833021a7057", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "debug-session",
            runId: "post-fix",
            hypothesisId: "H27",
            location: "useScrollSnapNavigation.ts:onWheel",
            message: "Wheel at overview index",
            data: {
              scrollTop: el.scrollTop,
              deltaY: e.deltaY,
              wrapCooldownUntilMs: wrapCooldownUntilMs.current
            },
            timestamp: Date.now()
          })
        }).catch(() => {})
        // #endregion agent log
      }
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



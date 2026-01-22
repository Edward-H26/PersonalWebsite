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
  const edgeArmedRef = useRef({ top: false, bottom: false })
  const edgeArmedAtMsRef = useRef<number | null>(null)
  const edgeArmRequestedRef = useRef(false)
  const overviewHoldRef = useRef(false)
  const lastUserScrollAtRef = useRef(0)
  const lastWheelEventAtRef = useRef(0)
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

  const hasSentinels =
    pages.length > 2 && pages[0]?.kind === "sentinel" && pages[pages.length - 1]?.kind === "sentinel"
  const sentinelTopIndex = 0
  const sentinelBottomIndex = pages.length - 1
  const firstRealIndex = hasSentinels ? 1 : 0
  const lastRealIndex = hasSentinels ? pages.length - 2 : pages.length - 1
  const defaultWrapCooldownMs = 380
  const overviewWrapCooldownMs = 650
  const wrapEasing = 0.2
  const recentUserInputWindowMs = 300

  const sectionRanges = useMemo(() => getSectionRanges(pages), [pages])
  const overviewTargetIndex = overviewIndex >= 0 ? overviewIndex : firstRealIndex

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
    }
    const page = pages[index]

    const isSettledOnSnap = isNearSnap(el.scrollTop, index, height)
    const maxScrollTop = Math.max(0, el.scrollHeight - height)
    const edgeEpsilonPx = 3
    const isAtBottomEdge = el.scrollTop >= maxScrollTop - edgeEpsilonPx

    const prevScrollTop = lastScrollTopRef.current
    const deltaScrollTop = prevScrollTop != null ? el.scrollTop - prevScrollTop : 0
    const distToSnap = Math.abs(el.scrollTop - index * height)
    const isRecentOverviewWrap = index === firstRealIndex && now - lastWrapEndedAtMs.current < overviewWrapCooldownMs
    if (isRecentOverviewWrap && distToSnap > 0.5) {
      const targetTop = index * height
      el.scrollTop = targetTop
      lastScrollTopRef.current = targetTop
    }
    const deltaSign = deltaScrollTop === 0 ? 0 : Math.sign(deltaScrollTop)
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
      }
    } else {
      settledSnapCountRef.current = 0
      lastSnapIndexRef.current = null
    }

    const edgeArmRequested = edgeArmRequestedRef.current
    if (isSettledOnSnap) {
      const atTopEdge = index === firstRealIndex
      const atBottomEdge = index === lastRealIndex
      edgeArmedRef.current.top = atTopEdge
      edgeArmedRef.current.bottom = atBottomEdge
      if (edgeArmRequested && (atTopEdge || atBottomEdge)) {
        edgeArmedAtMsRef.current = now
        edgeArmRequestedRef.current = false
      } else if (!atTopEdge && !atBottomEdge) {
        edgeArmedAtMsRef.current = null
        edgeArmRequestedRef.current = false
      }
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
    }
    if (index !== firstRealIndex && overviewHoldRef.current) {
      overviewHoldRef.current = false
    }


    const nextSection = page.section
    if (nextSection !== sectionRef.current) {
      sectionRef.current = nextSection
      setSection(nextSection)
    }

    const store = useWorldStore.getState()
    const isTopWrapZone = pagePos < firstRealIndex
    const isBottomWrapZone = pagePos > lastRealIndex
    const isWrapZone = hasSentinels && (isTopWrapZone || isBottomWrapZone)
    const overviewPos = overviewIndex >= 0 ? overviewIndex : firstRealIndex
    if (hasSentinels && !isProgrammaticJumpRef.current && !wrapInProgressRef.current) {
      const preWrapThreshold = 0.08
      const edgeArmedAtMs = edgeArmedAtMsRef.current
      const hasRecentUserInput = now - lastUserScrollAtRef.current < recentUserInputWindowMs
      const hasFreshUserInput =
        edgeArmedAtMs != null && lastUserScrollAtRef.current > edgeArmedAtMs && hasRecentUserInput
      const wantsWrapUp =
        edgeArmedRef.current.top &&
        hasFreshUserInput &&
        (scrollDirLockRef.current === -1 || deltaScrollTop < 0 || lastDeltaSignRef.current < 0) &&
        pagePos <= firstRealIndex - preWrapThreshold
      const wantsWrapDown =
        edgeArmedRef.current.bottom &&
        hasFreshUserInput &&
        (scrollDirLockRef.current === 1 || deltaScrollTop > 0 || lastDeltaSignRef.current > 0) &&
        pagePos >= lastRealIndex + preWrapThreshold

      if (wantsWrapUp) {
        scrollDirLockRef.current = null
        edgeArmedRef.current.top = false
        edgeArmedRef.current.bottom = false
        edgeArmedAtMsRef.current = null
        store.setTravelDir(-1)
        startWrapRef.current(lastRealIndex)
        return
      }

      if (wantsWrapDown) {
        scrollDirLockRef.current = null
        edgeArmedRef.current.top = false
        edgeArmedRef.current.bottom = false
        edgeArmedAtMsRef.current = null
        store.setTravelDir(1)
        startWrapRef.current(overviewTargetIndex)
        return
      }
    }
    if (!hasSentinels && !isProgrammaticJumpRef.current && !wrapInProgressRef.current) {
      const wantsWrapToOverview = index === lastRealIndex && isAtBottomEdge && deltaScrollTop > 0
      if (wantsWrapToOverview) {
        scrollDirLockRef.current = null
        useWorldStore.getState().setTravelDir(1)
        startWrapRef.current(overviewTargetIndex)
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

  }, [
    firstRealIndex,
    hasSentinels,
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
      if (Math.abs(el.scrollTop - targetTop) > 0.5) {
        el.scrollTop = targetTop
        lastScrollTopRef.current = targetTop
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
        const nextTop = el.scrollTop + (targetTop - el.scrollTop) * wrapEasing
        el.scrollTop = nextTop
        lastScrollTopRef.current = nextTop
        if (rafId.current == null) {
          rafId.current = requestAnimationFrame(syncFromScroll)
        }
        return
      }
      isProgrammaticJumpRef.current = false
      wrapTargetIndexRef.current = null
      lastWrapEndedAtMs.current = performance.now()
      const cooldownMs =
        lastWrapTargetIndexRef.current === firstRealIndex ? overviewWrapCooldownMs : defaultWrapCooldownMs
      wrapCooldownUntilMs.current = lastWrapEndedAtMs.current + cooldownMs
    }
    if (overviewHoldRef.current && !isProgrammaticJumpRef.current && wrapTargetIndexRef.current == null) {
      const height = Math.max(1, el.clientHeight)
      const targetTop = firstRealIndex * height
      const hasRecentInput =
        now - lastUserScrollAtRef.current < recentUserInputWindowMs ||
        now - lastWheelEventAtRef.current < recentUserInputWindowMs
      if (!hasRecentInput && Math.abs(el.scrollTop - targetTop) > 0.5) {
        el.scrollTop = targetTop
        lastScrollTopRef.current = targetTop
        if (rafId.current == null) {
          rafId.current = requestAnimationFrame(syncFromScroll)
        }
        return
      }
    }
    if (rafId.current != null) return
    rafId.current = requestAnimationFrame(syncFromScroll)

    if (scrollEndTimerRef.current != null) {
      window.clearTimeout(scrollEndTimerRef.current)
    }
    scrollEndTimerRef.current = window.setTimeout(() => {
      scrollEndTimerRef.current = null
      edgeArmRequestedRef.current = true
      syncFromScrollRef.current()
      overviewHoldRef.current = activeIndexRef.current === firstRealIndex
    }, 140)
  }, [firstRealIndex, recentUserInputWindowMs, syncFromScroll])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (didInitScrollRef.current) return
    didInitScrollRef.current = true

    const height = Math.max(1, el.clientHeight)
    el.scrollTo({ top: firstRealIndex * height, behavior: "auto" })
    edgeArmRequestedRef.current = true
    overviewHoldRef.current = true
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
      const prevWheelAt = lastWheelEventAtRef.current
      const isNewWheelBurst = now - prevWheelAt > 180
      lastWheelEventAtRef.current = now
      const wrapLockedIndex =
        now < wrapCooldownUntilMs.current ? lastWrapTargetIndexRef.current : wrapTargetIndexRef.current
      const isWrapLocked = wrapTargetIndexRef.current != null && now < wrapLockUntilMs.current
      const isInWrapCooldown = now < wrapCooldownUntilMs.current && lastWrapTargetIndexRef.current != null
      if (isWrapLocked || isInWrapCooldown) {
        const height = Math.max(1, el.clientHeight)
        const idx = wrapLockedIndex ?? clampInt(Math.round(el.scrollTop / height), 0, pages.length - 1)
        const canBreakCooldown =
          !isWrapLocked &&
          isInWrapCooldown &&
          isNewWheelBurst &&
          Math.abs(e.deltaY) > 0 &&
          idx === lastWrapTargetIndexRef.current
        if (canBreakCooldown) {
          wrapCooldownUntilMs.current = now
          lastWrapTargetIndexRef.current = null
        } else {
          e.preventDefault()
          const targetTop = idx * height
          if (Math.abs(el.scrollTop - targetTop) > 0.5) {
            el.scrollTop = targetTop
            lastScrollTopRef.current = targetTop
          }
          return
        }
      }
      if (isProgrammaticJumpRef.current) return
      if (wrapInProgressRef.current) return
      if (performance.now() < wrapLockUntilMs.current) return
      if (Math.abs(e.deltaY) > 0 && isNewWheelBurst) {
        lastUserScrollAtRef.current = now
      }

      const height = Math.max(1, el.clientHeight)
      const idx = clampInt(Math.round(el.scrollTop / height), 0, pages.length - 1)
      const recentWrap = now - lastWrapEndedAtMs.current < overviewWrapCooldownMs
      if (idx === firstRealIndex && recentWrap && !isNewWheelBurst) {
        e.preventDefault()
        const targetTop = idx * height
        if (Math.abs(el.scrollTop - targetTop) > 0.5) {
          el.scrollTop = targetTop
          lastScrollTopRef.current = targetTop
        }
        return
      }
      if (idx === firstRealIndex && Math.abs(e.deltaY) > 0.5 && now > wrapCooldownUntilMs.current) {
      }
      const isNearFirstReal = isNearSnap(el.scrollTop, firstRealIndex, height)
      const isNearLastReal = isNearSnap(el.scrollTop, lastRealIndex, height)
      if (overviewHoldRef.current && isNearFirstReal) {
        if (isNewWheelBurst) {
          overviewHoldRef.current = false
        } else {
          e.preventDefault()
          const targetTop = firstRealIndex * height
          if (Math.abs(el.scrollTop - targetTop) > 0.5) {
            el.scrollTop = targetTop
            lastScrollTopRef.current = targetTop
          }
          return
        }
      }
      const edgeArmedAtMs = edgeArmedAtMsRef.current
      const canEdgeWrap = edgeArmedAtMs != null && isNewWheelBurst && now >= edgeArmedAtMs
      if (isNearFirstReal && e.deltaY < 0 && canEdgeWrap) {
        e.preventDefault()
        scrollDirLockRef.current = null
        useWorldStore.getState().setTravelDir(-1)
        startWrapRef.current(lastRealIndex)
        return
      }
      if (isNearLastReal && e.deltaY > 0 && canEdgeWrap) {
        e.preventDefault()
        scrollDirLockRef.current = null
        useWorldStore.getState().setTravelDir(1)
        startWrapRef.current(overviewTargetIndex)
        return
      }
      const maxScrollTop = Math.max(0, el.scrollHeight - height)
      const edgeEpsilonPx = 3
      const isAtTopEdge = el.scrollTop <= edgeEpsilonPx
      const isAtBottomEdge = el.scrollTop >= maxScrollTop - edgeEpsilonPx

      if (hasSentinels && idx === sentinelTopIndex && isAtTopEdge && e.deltaY < 0) {
        e.preventDefault()
        scrollDirLockRef.current = null
        useWorldStore.getState().setTravelDir(-1)
        startWrapRef.current(lastRealIndex)
        return
      }

      if (hasSentinels && idx === sentinelBottomIndex && isAtBottomEdge && e.deltaY > 0) {
        e.preventDefault()
        scrollDirLockRef.current = null
        useWorldStore.getState().setTravelDir(1)
        startWrapRef.current(firstRealIndex)
      }
      if (!hasSentinels && idx === lastRealIndex && isAtBottomEdge && e.deltaY > 0) {
        e.preventDefault()
        scrollDirLockRef.current = null
        useWorldStore.getState().setTravelDir(1)
        startWrapRef.current(overviewTargetIndex)
      }
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [
    firstRealIndex,
    hasSentinels,
    lastRealIndex,
    overviewTargetIndex,
    pages.length,
    sentinelBottomIndex,
    sentinelTopIndex
  ])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onTouchStart = () => {
      lastUserScrollAtRef.current = performance.now()
      overviewHoldRef.current = false
    }

    const onTouchMove = () => {
      lastUserScrollAtRef.current = performance.now()
      overviewHoldRef.current = false
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: true })

    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
      const el = containerRef.current
      if (!el) return

      const height = Math.max(1, el.clientHeight)
      const idx = clampInt(Math.round(el.scrollTop / height), 0, pages.length - 1)
      const targetTop = idx * height
      if (Math.abs(el.scrollTop - targetTop) > 0.5) {
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
      overviewHoldRef.current = false

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

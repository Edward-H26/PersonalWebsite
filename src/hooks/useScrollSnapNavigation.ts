import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { buildScrollDeckPages } from "@/config/scrollDeckPages"
import { useWorldStore } from "@/store/worldStore"
import { clamp01, clampInt, lerp, smoothstep01 } from "@/utils/math"
import {
  type DeckSection,
  findIndexForSection,
  findInnerScroller,
  getPageHeight,
  getRouteTAtPagePos,
  getSectionRanges,
  isNearSnap
} from "@/deck/deckMath"
import { createWheelPager } from "@/deck/wheelPager"

// Radians of camera yaw per pixel of horizontal wheel/trackpad travel, per pixel of touch drag,
// and per arrow-key press.
const LOOK_YAW_PER_WHEEL_PX = 0.0025
const LOOK_YAW_PER_TOUCH_PX = 0.006
const LOOK_YAW_PER_KEY = 0.14
const TOUCH_LOOK_START_PX = 12

export function useScrollSnapNavigation({ scrollLocked = false }: { scrollLocked?: boolean } = {}) {
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
    const el = containerRef.current

    return () => {
      if (scrollEndTimerRef.current != null) {
        window.clearTimeout(scrollEndTimerRef.current)
      }

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
      const height = getPageHeight(el)
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

    const height = getPageHeight(el)
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
    overviewTargetIndex,
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
      const height = getPageHeight(el)
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
      const height = getPageHeight(el)
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
    if (rafId.current != null) return
    rafId.current = requestAnimationFrame(syncFromScroll)

    if (scrollEndTimerRef.current != null) {
      window.clearTimeout(scrollEndTimerRef.current)
    }
    scrollEndTimerRef.current = window.setTimeout(() => {
      scrollEndTimerRef.current = null
      edgeArmRequestedRef.current = true
      syncFromScrollRef.current()
    }, 140)
  }, [firstRealIndex, syncFromScroll])

  // Wheel and keyboard move whole slides instead of scrolling natively: with mandatory scroll
  // snapping a flick shorter than half a viewport snaps back to the nearest slide, which pulled
  // visitors back to the overview after the camera had started to descend.
  const stepPage = useCallback(
    (direction: 1 | -1) => {
      const el = containerRef.current
      if (!el) return

      const now = performance.now()
      if (wrapInProgressRef.current || now < wrapLockUntilMs.current) return

      const height = getPageHeight(el)
      const currentIndex = clampInt(Math.round(el.scrollTop / height), firstRealIndex, lastRealIndex)
      lastUserScrollAtRef.current = now
      scrollDirLockRef.current = null
      wheelPagerRef.current.markStepped(now)
      useWorldStore.getState().setLookYaw(0)

      if (direction === -1 && currentIndex === firstRealIndex) {
        useWorldStore.getState().setTravelDir(-1)
        startWrap(lastRealIndex)
        return
      }

      if (direction === 1 && currentIndex === lastRealIndex) {
        useWorldStore.getState().setTravelDir(1)
        startWrap(overviewTargetIndex)
        return
      }

      const targetIndex = clampInt(currentIndex + direction, firstRealIndex, lastRealIndex)
      if (targetIndex === currentIndex) return

      useWorldStore.getState().setTravelDir(direction)
      el.scrollTo({ top: targetIndex * height, behavior: "smooth" })
    },
    [firstRealIndex, lastRealIndex, overviewTargetIndex, startWrap]
  )

  const turnLook = useCallback((deltaYaw: number) => {
    const store = useWorldStore.getState()
    store.setLookYaw(store.lookYaw + deltaYaw)
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (didInitScrollRef.current) return
    didInitScrollRef.current = true

    const height = getPageHeight(el)
    el.scrollTo({ top: firstRealIndex * height, behavior: "auto" })
    edgeArmRequestedRef.current = true
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
      if (scrollLockedRef.current) return

      // Inside a card's scrollable text the wheel only scrolls the card, even at its ends.
      if (findInnerScroller(e.target, el)) return

      const absX = Math.abs(e.deltaX)
      const absY = Math.abs(e.deltaY)
      if (absX < 1 && absY < 1) return
      e.preventDefault()

      if (absX > absY) {
        turnLook(-e.deltaX * LOOK_YAW_PER_WHEEL_PX)
        return
      }

      const direction = wheelPagerRef.current.feed(e.deltaY, performance.now())
      if (direction !== 0) stepPage(direction)
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [stepPage, turnLook])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (scrollLockedRef.current) return
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return

      const target = e.target
      if (target instanceof HTMLElement) {
        const tag = target.tagName
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault()
        turnLook(e.key === "ArrowLeft" ? LOOK_YAW_PER_KEY : -LOOK_YAW_PER_KEY)
        return
      }

      let direction: 1 | -1 | null = null
      if (e.key === "ArrowDown" || e.key === "PageDown" || (e.key === " " && !e.shiftKey)) direction = 1
      else if (e.key === "ArrowUp" || e.key === "PageUp" || (e.key === " " && e.shiftKey)) direction = -1
      if (direction == null) return

      e.preventDefault()
      if (!wheelPagerRef.current.canStep(performance.now())) return
      stepPage(direction)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [stepPage, turnLook])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let startX = 0
    let startY = 0
    let lastX = 0
    let isLookGesture = false

    const onTouchStart = (e: TouchEvent) => {
      lastUserScrollAtRef.current = performance.now()
      const touch = e.touches[0]
      if (!touch) return
      startX = touch.clientX
      startY = touch.clientY
      lastX = startX
      isLookGesture = false
    }

    // A mostly horizontal drag turns the camera; vertical drags keep native slide scrolling.
    const onTouchMove = (e: TouchEvent) => {
      lastUserScrollAtRef.current = performance.now()
      const touch = e.touches[0]
      if (!touch) return
      if (!isLookGesture) {
        const dx = touch.clientX - startX
        const dy = touch.clientY - startY
        if (Math.abs(dx) < TOUCH_LOOK_START_PX || Math.abs(dx) <= Math.abs(dy)) return
        isLookGesture = true
      }
      turnLook((touch.clientX - lastX) * LOOK_YAW_PER_TOUCH_PX)
      lastX = touch.clientX
    }

    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: true })

    return () => {
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
    }
  }, [turnLook])

  useEffect(() => {
    const handleResize = () => {
      const el = containerRef.current
      if (!el) return

      // Re-align the current slide with the new slide height instead of re-deriving the index
      // from the old scroll offset, which lands between slides after a height change.
      const height = getPageHeight(el)
      const targetTop = clampInt(activeIndexRef.current, 0, pages.length - 1) * height
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
      useWorldStore.getState().setLookYaw(0)

      const clampedSection = clampInt(nextSection, 0, 5) as DeckSection
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

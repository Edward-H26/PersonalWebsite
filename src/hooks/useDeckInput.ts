import { useEffect, type MutableRefObject, type RefObject } from "react"
import { findInnerScroller } from "@/deck/deckMath"
import { LOOK_YAW_PER_TOUCH_PX, LOOK_YAW_PER_WHEEL_PX, classifyKey, classifyWheel, isLookDrag } from "@/deck/inputClassification"
import type { createWheelPager } from "@/deck/wheelPager"

type DeckInputOptions = {
  containerRef: RefObject<HTMLDivElement | null>
  /** Read at event time so a lock change needs no listener re-registration. */
  scrollLockedRef: RefObject<boolean>
  wheelPagerRef: MutableRefObject<ReturnType<typeof createWheelPager>>
  stepPage: (direction: 1 | -1) => void
  turnLook: (deltaYaw: number) => void
  /** Called on every touch so edge wrapping can tell a user drag from a programmatic scroll. */
  markUserInput: (now: number) => void
}

/**
 * Wires wheel, keyboard and touch input to the deck. Wheel and keyboard move whole slides instead
 * of scrolling natively: with mandatory scroll snapping a flick shorter than half a viewport snaps
 * back to the nearest slide, which pulled visitors back to the overview after the camera had
 * started to descend. Horizontal input turns the camera instead.
 */
export function useDeckInput({ containerRef, scrollLockedRef, wheelPagerRef, stepPage, turnLook, markUserInput }: DeckInputOptions) {
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (e: WheelEvent) => {
      if (scrollLockedRef.current) return

      // Inside a card's scrollable text the wheel only scrolls the card, even at its ends.
      if (findInnerScroller(e.target, el)) return

      const intent = classifyWheel(e.deltaX, e.deltaY)
      if (intent === "ignore") return
      e.preventDefault()

      if (intent === "look") {
        turnLook(-e.deltaX * LOOK_YAW_PER_WHEEL_PX)
        return
      }

      const direction = wheelPagerRef.current.feed(e.deltaY, performance.now())
      if (direction !== 0) stepPage(direction)
    }

    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [containerRef, scrollLockedRef, stepPage, turnLook, wheelPagerRef])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (scrollLockedRef.current) return

      const intent = classifyKey(e)
      if (intent == null) return
      e.preventDefault()

      if (intent.kind === "look") {
        turnLook(intent.deltaYaw)
        return
      }

      if (!wheelPagerRef.current.canStep(performance.now())) return
      stepPage(intent.direction)
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [scrollLockedRef, stepPage, turnLook, wheelPagerRef])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let startX = 0
    let startY = 0
    let lastX = 0
    let isLookGesture = false

    const onTouchStart = (e: TouchEvent) => {
      markUserInput(performance.now())
      const touch = e.touches[0]
      if (!touch) return
      startX = touch.clientX
      startY = touch.clientY
      lastX = startX
      isLookGesture = false
    }

    // A mostly horizontal drag turns the camera; vertical drags keep native slide scrolling.
    const onTouchMove = (e: TouchEvent) => {
      markUserInput(performance.now())
      const touch = e.touches[0]
      if (!touch) return
      if (!isLookGesture) {
        if (!isLookDrag(touch.clientX - startX, touch.clientY - startY)) return
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
  }, [containerRef, markUserInput, turnLook])
}

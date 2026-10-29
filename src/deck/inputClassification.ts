/**
 * Turns raw wheel, keyboard and touch input into deck intents. Pure: the hook applies the locks,
 * calls preventDefault and moves the deck.
 */

/** Radians of camera yaw per pixel of horizontal wheel or trackpad travel. */
export const LOOK_YAW_PER_WHEEL_PX = 0.0025
/** Radians of camera yaw per pixel of horizontal touch drag. */
export const LOOK_YAW_PER_TOUCH_PX = 0.006
/** Radians of camera yaw per left or right arrow press. */
export const LOOK_YAW_PER_KEY = 0.14
/** Horizontal travel before a touch drag counts as a look gesture rather than a scroll. */
export const TOUCH_LOOK_START_PX = 12
/** Wheel deltas smaller than this on both axes are noise and keep their default behaviour. */
export const WHEEL_DEAD_ZONE_PX = 1

export type WheelIntent = "ignore" | "look" | "page"

/** Mostly horizontal wheel input turns the camera; anything else pages the deck. */
export function classifyWheel(deltaX: number, deltaY: number): WheelIntent {
  const absX = Math.abs(deltaX)
  const absY = Math.abs(deltaY)
  if (absX < WHEEL_DEAD_ZONE_PX && absY < WHEEL_DEAD_ZONE_PX) return "ignore"
  return absX > absY ? "look" : "page"
}

export type KeyIntent = { kind: "look"; deltaYaw: number } | { kind: "page"; direction: 1 | -1 } | null

type KeyLike = Pick<KeyboardEvent, "key" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey" | "defaultPrevented" | "target">

/** Form fields keep their own arrow and space handling. */
export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable === true
}

/** Arrow keys look sideways or page; PageUp, PageDown and Space (Shift+Space) page. */
export function classifyKey(event: KeyLike): KeyIntent {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return null
  if (isEditableTarget(event.target)) return null

  if (event.key === "ArrowLeft") return { kind: "look", deltaYaw: LOOK_YAW_PER_KEY }
  if (event.key === "ArrowRight") return { kind: "look", deltaYaw: -LOOK_YAW_PER_KEY }

  if (event.key === "ArrowDown" || event.key === "PageDown" || (event.key === " " && !event.shiftKey)) {
    return { kind: "page", direction: 1 }
  }
  if (event.key === "ArrowUp" || event.key === "PageUp" || (event.key === " " && event.shiftKey)) {
    return { kind: "page", direction: -1 }
  }
  return null
}

/** A drag that has moved far enough sideways, and more sideways than vertically, turns the camera. */
export function isLookDrag(deltaX: number, deltaY: number) {
  return Math.abs(deltaX) >= TOUCH_LOOK_START_PX && Math.abs(deltaX) > Math.abs(deltaY)
}

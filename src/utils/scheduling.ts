type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
    cancelIdleCallback?: (handle: number) => void
  }

export function scheduleIdleTask(callback: () => void, timeout = 1200) {
  if (typeof window === "undefined") return () => {}

  const idleWindow = window as IdleWindow
  if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout })
    return () => idleWindow.cancelIdleCallback?.(handle)
  }

  const handle = setTimeout(callback, Math.min(timeout, 250))
  return () => clearTimeout(handle)
}

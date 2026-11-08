import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useFrameSteps } from "./useFrameSteps"

const FRAME_MS = 16

let root: Root | null = null
let shown: number[] = []

function Probe({ steps }: { steps: number }) {
  shown.push(useFrameSteps(steps))
  return null
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "cancelAnimationFrame", "performance"] })
  shown = []
  root = createRoot(document.createElement("div"))
})

afterEach(() => {
  act(() => root?.unmount())
  vi.useRealTimers()
})

describe("useFrameSteps", () => {
  it("counts up one step per frame and then stops", () => {
    act(() => root!.render(<Probe steps={3} />))
    expect(shown[shown.length - 1]).toBe(0)
    for (const expected of [1, 2, 3, 3, 3]) {
      act(() => vi.advanceTimersByTime(FRAME_MS))
      expect(shown[shown.length - 1]).toBe(expected)
    }
    expect(new Set(shown)).toEqual(new Set([0, 1, 2, 3]))
  })
})

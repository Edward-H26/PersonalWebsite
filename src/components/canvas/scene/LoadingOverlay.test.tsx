import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { DEFAULT_SKY_HOUR, skyAt } from "@/components/canvas/environment/skyPalette"
import { useWorldStore } from "@/store/worldStore"
import { LoadingOverlay } from "./LoadingOverlay"

const FRAME_MS = 16

let root: Root | null = null
let host: HTMLDivElement | null = null

function mount() {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root!.render(<LoadingOverlay />))
}

/** Lets the overlay's frame loop run for so many frames. */
function runFrames(frames: number) {
  act(() => vi.advanceTimersByTime(frames * FRAME_MS))
}

/** The load at a share done, with the displayed percentage given time to arrive there. */
function loadTo(share: number) {
  act(() => useWorldStore.getState().reportLoadProgress(share))
  runFrames(120)
}

beforeEach(() => {
  // jsdom has no media queries; a desktop keeps no minimum time on the overlay.
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] })
  useWorldStore.setState({ loadProgress: 0, isEarthSceneReady: false, isLoaderBypassed: false })
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("LoadingOverlay", () => {
  it("shows the exact percentage but announces it politely in steps of ten", () => {
    mount()
    loadTo(0.374)
    const status = host!.querySelector('[role="status"]')!
    expect(status.getAttribute("aria-live")).toBe("polite")
    expect(status.textContent).toBe("Sailing to the island, 30%")
    expect(host!.querySelector(".voyage-label")!.textContent).toBe("Sailing to the island37%")

    loadTo(0.398)
    expect(status.textContent).toBe("Sailing to the island, 30%")
    loadTo(0.402)
    expect(status.textContent).toBe("Sailing to the island, 40%")
  })

  it("keeps its pictures out of the accessibility tree", () => {
    mount()
    for (const svg of host!.querySelectorAll("svg")) expect(svg.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it("places the ship and the fog from the progress", () => {
    mount()
    loadTo(0.5)
    const overlay = host!.querySelector<HTMLElement>(".voyage")!
    expect(Number(overlay.style.getPropertyValue("--voyage"))).toBeCloseTo(0.47)
    expect(Number(overlay.style.getPropertyValue("--fog"))).toBeCloseTo(0.5)
  })

  it("opens on the scene's sky at the hour the island opens at", () => {
    mount()
    const overlay = host!.querySelector<HTMLElement>(".voyage")!
    expect(overlay.style.getPropertyValue("--voyage-sky-haze")).toBe(`#${skyAt(DEFAULT_SKY_HOUR).haze.getHexString()}`)
    expect(overlay.style.getPropertyValue("--voyage-ship")).toBe("#0b1e3f")
  })

  it("shows a percentage that never falls, whatever the load reports", () => {
    mount()
    const label = host!.querySelector(".voyage-label-percent")!
    const shown: number[] = []
    for (const share of [0.1, 0.05, 0.3, 0, 0.6, 0.2, 0.9]) {
      act(() => useWorldStore.getState().reportLoadProgress(share))
      for (let frame = 0; frame < 10; frame += 1) {
        runFrames(1)
        shown.push(Number(label.textContent!.replace("%", "")))
      }
    }
    for (let i = 1; i < shown.length; i += 1) expect(shown[i]).toBeGreaterThanOrEqual(shown[i - 1])
    expect(shown[shown.length - 1]).toBeGreaterThan(50)
  })

  it("stays up until the island is ready and the percentage has arrived at 100, then fades and leaves the page", () => {
    mount()
    loadTo(1)
    expect(host!.querySelector(".voyage")!.getAttribute("data-visible")).toBe("true")
    expect(useWorldStore.getState().isLoadingOverlayVisible).toBe(true)

    act(() => useWorldStore.getState().setEarthSceneReady(true))
    runFrames(2)
    expect(host!.querySelector(".voyage-label-percent")!.textContent).toBe("100%")
    expect(host!.querySelector(".voyage")!.getAttribute("data-visible")).toBe("false")
    expect(useWorldStore.getState().isLoadingOverlayVisible).toBe(false)

    act(() => vi.advanceTimersByTime(699))
    expect(host!.querySelector(".voyage")).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(host!.querySelector(".voyage")).toBeNull()
  })

  it("lifts for a load that has stalled at the very end", () => {
    mount()
    loadTo(0.995)
    expect(host!.querySelector(".voyage")!.getAttribute("data-visible")).toBe("true")
    runFrames(Math.ceil(4100 / FRAME_MS))
    expect(useWorldStore.getState().isLoaderBypassed).toBe(true)
    expect(useWorldStore.getState().isLoadingOverlayVisible).toBe(false)
  })
})

import { afterEach, describe, expect, it, vi } from "vitest"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { DEFAULT_SKY_HOUR, skyAt } from "@/components/canvas/environment/skyPalette"
import { LoadingOverlay } from "./LoadingOverlay"

let root: Root | null = null
let host: HTMLDivElement | null = null

function render(visible: boolean, progress: number) {
  if (!host) {
    host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  }
  act(() => root!.render(<LoadingOverlay visible={visible} progress={progress} />))
}

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
  vi.useRealTimers()
})

describe("LoadingOverlay", () => {
  it("shows the exact percentage but announces it politely in steps of ten", () => {
    render(true, 37.4)
    const status = host!.querySelector('[role="status"]')!
    expect(status.getAttribute("aria-live")).toBe("polite")
    expect(status.textContent).toBe("Sailing to the island, 30%")
    expect(host!.querySelector(".voyage-label")!.textContent).toBe("Sailing to the island37%")

    render(true, 39.8)
    expect(status.textContent).toBe("Sailing to the island, 30%")
    render(true, 40.2)
    expect(status.textContent).toBe("Sailing to the island, 40%")
  })

  it("keeps its pictures out of the accessibility tree", () => {
    render(true, 0)
    for (const svg of host!.querySelectorAll("svg")) expect(svg.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it("places the ship and the fog from the progress", () => {
    render(true, 50)
    const overlay = host!.querySelector<HTMLElement>(".voyage")!
    expect(Number(overlay.style.getPropertyValue("--voyage"))).toBeCloseTo(0.47)
    expect(Number(overlay.style.getPropertyValue("--fog"))).toBeCloseTo(0.5)
  })

  it("opens on the scene's sky at the hour the island opens at", () => {
    render(true, 0)
    const overlay = host!.querySelector<HTMLElement>(".voyage")!
    expect(overlay.style.getPropertyValue("--voyage-sky-haze")).toBe(`#${skyAt(DEFAULT_SKY_HOUR).haze.getHexString()}`)
    expect(overlay.style.getPropertyValue("--voyage-ship")).toBe("#0b1e3f")
  })

  it("fades out and leaves the page once the fade has run", () => {
    vi.useFakeTimers()
    render(true, 100)
    render(false, 100)
    expect(host!.querySelector(".voyage")!.getAttribute("data-visible")).toBe("false")
    act(() => vi.advanceTimersByTime(699))
    expect(host!.querySelector(".voyage")).not.toBeNull()
    act(() => vi.advanceTimersByTime(1))
    expect(host!.querySelector(".voyage")).toBeNull()
  })
})

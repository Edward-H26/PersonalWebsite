import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { useScrollSnapNavigation } from "./useScrollSnapNavigation"
import { useWorldStore } from "@/store/worldStore"

const SLIDE_HEIGHT = 900

function Harness({ locked = false }: { locked?: boolean }) {
  const { containerRef, pages, activeIndex } = useScrollSnapNavigation({ scrollLocked: locked })
  return (
    <div ref={containerRef} data-testid="deck" data-active={activeIndex}>
      {pages.map((page) => (
        <section key={page.key}>
          <div data-testid={`card-${page.key}`} className="card-text" style={{ overflowY: "auto" }}>
            {page.key}
          </div>
        </section>
      ))}
    </div>
  )
}

let root: Root | null = null
let host: HTMLDivElement | null = null
let deck: HTMLDivElement

function mount(locked = false) {
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => {
    root!.render(<Harness locked={locked} />)
  })
  deck = host.querySelector('[data-testid="deck"]') as HTMLDivElement
}

function wheel(target: Element, init: WheelEventInit) {
  const event = new WheelEvent("wheel", { bubbles: true, cancelable: true, ...init })
  act(() => {
    target.dispatchEvent(event)
  })
  return event
}

function key(k: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }))
  })
}

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      return (this as HTMLElement).tagName === "SECTION" ? SLIDE_HEIGHT : 0
    }
  })
  useWorldStore.getState().setLookYaw(0)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  host?.remove()
  root = null
  host = null
})

describe("useScrollSnapNavigation", () => {
  it("starts on the overview slide, just past the top sentinel", () => {
    mount()
    expect(deck.scrollTop).toBe(SLIDE_HEIGHT)
  })

  it("moves exactly one slide for a wheel notch and swallows the native scroll", () => {
    mount()
    const event = wheel(deck, { deltaY: 100 })
    expect(event.defaultPrevented).toBe(true)
    expect(deck.scrollTop).toBe(2 * SLIDE_HEIGHT)
  })

  it("does not skip slides when several notches arrive inside the cooldown", () => {
    mount()
    wheel(deck, { deltaY: 100 })
    wheel(deck, { deltaY: 100 })
    wheel(deck, { deltaY: 100 })
    expect(deck.scrollTop).toBe(2 * SLIDE_HEIGHT)
  })

  it("pages with the keyboard and recentres the sideways look", () => {
    mount()
    key("ArrowLeft")
    expect(useWorldStore.getState().lookYaw).toBeGreaterThan(0)
    key("ArrowDown")
    expect(deck.scrollTop).toBe(2 * SLIDE_HEIGHT)
    expect(useWorldStore.getState().lookYaw).toBe(0)
  })

  it("turns the camera instead of paging for horizontal wheel input", () => {
    mount()
    const event = wheel(deck, { deltaX: 80, deltaY: 4 })
    expect(event.defaultPrevented).toBe(true)
    expect(deck.scrollTop).toBe(SLIDE_HEIGHT)
    expect(useWorldStore.getState().lookYaw).toBeCloseTo(-0.2, 5)
  })

  it("clamps the sideways look to its limit", () => {
    mount()
    for (let i = 0; i < 40; i += 1) wheel(deck, { deltaX: 200, deltaY: 0 })
    expect(useWorldStore.getState().lookYaw).toBeCloseTo(-1.2, 5)
  })

  it("lets a scrollable card scroll without turning the page, even at its end", () => {
    mount()
    const card = deck.querySelector('[data-testid="card-overview"]') as HTMLElement
    Object.defineProperty(card, "scrollHeight", { value: 1200 })
    Object.defineProperty(card, "clientHeight", { value: 300 })
    card.scrollTop = 900
    const event = wheel(card, { deltaY: 100 })
    expect(event.defaultPrevented).toBe(false)
    expect(deck.scrollTop).toBe(SLIDE_HEIGHT)
  })

  it("pages normally when the card content fits without scrolling", () => {
    mount()
    const card = deck.querySelector('[data-testid="card-overview"]') as HTMLElement
    Object.defineProperty(card, "scrollHeight", { value: 300 })
    Object.defineProperty(card, "clientHeight", { value: 300 })
    wheel(card, { deltaY: 100 })
    expect(deck.scrollTop).toBe(2 * SLIDE_HEIGHT)
  })

  it("ignores wheel and keyboard input while the deck is locked", () => {
    mount(true)
    const event = wheel(deck, { deltaY: 100 })
    expect(event.defaultPrevented).toBe(false)
    key("ArrowDown")
    expect(deck.scrollTop).toBe(SLIDE_HEIGHT)
  })

  it("ignores keyboard input aimed at form fields", () => {
    mount()
    const input = document.createElement("input")
    document.body.appendChild(input)
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }))
    })
    expect(deck.scrollTop).toBe(SLIDE_HEIGHT)
    input.remove()
  })
})

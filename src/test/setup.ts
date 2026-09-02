// React only silences act() warnings when the environment opts in.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no layout engine and no animation frames; the deck code relies on both.
if (typeof window !== "undefined") {
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 16)
    window.cancelAnimationFrame = (id: number) => window.clearTimeout(id)
  }
  if (!Element.prototype.scrollTo) {
    Element.prototype.scrollTo = function (this: Element, options?: ScrollToOptions | number) {
      const top = typeof options === "number" ? options : options?.top
      if (typeof top === "number") this.scrollTop = top
    } as Element["scrollTo"]
  }
}

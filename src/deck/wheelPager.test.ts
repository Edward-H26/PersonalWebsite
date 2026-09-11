import { describe, expect, it } from "vitest"
import { createWheelPager } from "./wheelPager"

describe("createWheelPager", () => {
  it("steps once for a single mouse notch", () => {
    const pager = createWheelPager()
    expect(pager.feed(100, 1000)).toBe(1)
  })

  it("steps backwards for an upward notch", () => {
    const pager = createWheelPager()
    expect(pager.feed(-100, 1000)).toBe(-1)
  })

  it("ignores zero and NaN deltas", () => {
    const pager = createWheelPager()
    expect(pager.feed(0, 1000)).toBe(0)
    expect(pager.feed(Number.NaN, 1010)).toBe(0)
  })

  it("does not step again while the cooldown is running", () => {
    const pager = createWheelPager({ cooldownMs: 550 })
    expect(pager.feed(100, 1000)).toBe(1)
    expect(pager.feed(100, 1100)).toBe(0)
    expect(pager.feed(100, 1400)).toBe(0)
  })

  it("keeps stepping every cooldown while the wheel keeps turning", () => {
    const pager = createWheelPager({ cooldownMs: 550, burstGapMs: 180 })
    const steps: number[] = []
    for (let t = 1000; t < 3400; t += 100) steps.push(pager.feed(100, t))
    expect(steps.filter((s) => s === 1).length).toBe(4)
    expect(steps[0]).toBe(1)
    expect(steps[6]).toBe(1)
  })

  it("accumulates small trackpad deltas up to the threshold", () => {
    const pager = createWheelPager({ thresholdPx: 100 })
    const results = [20, 25, 30, 30].map((d, i) => pager.feed(d, 1000 + i * 16))
    expect(results).toEqual([0, 0, 0, 1])
  })

  it("never steps on a decaying momentum tail", () => {
    const pager = createWheelPager({ thresholdPx: 100, cooldownMs: 550 })
    expect(pager.feed(120, 1000)).toBe(1)
    const tail = [90, 70, 55, 40, 30, 22, 16, 12, 9, 6, 4, 3, 2, 1]
    const results = tail.map((d, i) => pager.feed(d, 1050 + i * 60))
    expect(results.every((r) => r === 0)).toBe(true)
  })

  // A macOS trackpad flick: the finger ramps the delta up, then the momentum tail decays. Chrome
  // rounds those deltas, so the tail repeats values instead of falling on every event.
  function trackpadFlick(peak: number, startAt = 1000) {
    const deltas: number[] = []
    for (let i = 1; i <= 7; i += 1) deltas.push(Math.max(1, Math.round((peak * i) / 7)))
    let velocity = peak
    for (;;) {
      velocity *= 0.955
      const delta = Math.round(velocity)
      if (delta < 1) break
      deltas.push(delta)
    }
    return deltas.map((delta, i) => ({ delta, at: startAt + i * 16 }))
  }

  it.each([60, 90, 160])("steps once for a whole trackpad flick peaking at %i", (peak) => {
    const pager = createWheelPager()
    const steps = trackpadFlick(peak).map((event) => pager.feed(event.delta, event.at))
    expect(steps.filter((step) => step !== 0)).toEqual([1])
  })

  it("never steps on a momentum tail that repeats the same delta", () => {
    const pager = createWheelPager({ thresholdPx: 100, cooldownMs: 550 })
    expect(pager.feed(120, 1000)).toBe(1)
    const tail = [60, 40, 20, 10, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2, 1, 1, 1, 1]
    const results = tail.map((delta, i) => pager.feed(delta, 1050 + i * 60))
    expect(results.every((result) => result === 0)).toBe(true)
  })

  it("steps again for a gentler flick that cuts the previous momentum short", () => {
    const pager = createWheelPager()
    const firstFlick = trackpadFlick(160).filter((event) => event.at <= 1700)
    const nudge = trackpadFlick(40, 1820)
    const stepsOf = (events: ReturnType<typeof trackpadFlick>) =>
      events.map((event) => pager.feed(event.delta, event.at)).filter((step) => step !== 0)
    expect(stepsOf(firstFlick)).toEqual([1])
    expect(stepsOf(nudge)).toEqual([1])
  })

  it("steps again after the cooldown when the finger keeps pushing", () => {
    const pager = createWheelPager({ thresholdPx: 100, cooldownMs: 550, burstGapMs: 180 })
    expect(pager.feed(120, 1000)).toBe(1)
    const push = Array.from({ length: 12 }, () => 30)
    const results = push.map((d, i) => pager.feed(d, 1050 + i * 60))
    expect(results.filter((r) => r === 1).length).toBe(1)
    expect(results.indexOf(1) * 60 + 1050).toBeGreaterThanOrEqual(1550)
  })

  it("resets the accumulator after silence longer than the burst gap", () => {
    const pager = createWheelPager({ thresholdPx: 100, burstGapMs: 180 })
    expect(pager.feed(60, 1000)).toBe(0)
    expect(pager.feed(60, 1400)).toBe(0)
    expect(pager.feed(60, 1420)).toBe(1)
  })

  it("resets the accumulator when the direction flips", () => {
    const pager = createWheelPager({ thresholdPx: 100 })
    expect(pager.feed(60, 1000)).toBe(0)
    expect(pager.feed(-60, 1020)).toBe(0)
    expect(pager.feed(-60, 1040)).toBe(-1)
  })

  it("shares the cooldown with steps triggered elsewhere", () => {
    const pager = createWheelPager({ cooldownMs: 550 })
    pager.markStepped(1000)
    expect(pager.canStep(1200)).toBe(false)
    expect(pager.feed(100, 1200)).toBe(0)
    expect(pager.canStep(1600)).toBe(true)
    expect(pager.feed(100, 1600)).toBe(1)
  })
})

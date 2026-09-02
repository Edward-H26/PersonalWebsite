export type WheelPagerOptions = {
  // Accumulated wheel distance that counts as one slide (a mouse notch is 100px in Chrome).
  thresholdPx: number
  // Minimum time between two slide steps, so continuous input pages at a readable pace.
  cooldownMs: number
  // Silence longer than this starts a new gesture and clears the accumulator.
  burstGapMs: number
}

export const DEFAULT_WHEEL_PAGER_OPTIONS: WheelPagerOptions = {
  thresholdPx: 100,
  cooldownMs: 550,
  burstGapMs: 180
}

export type StepDirection = -1 | 0 | 1

// Turns a stream of wheel deltas into slide steps. One mouse notch or 100px of trackpad travel
// steps once; holding the wheel or dragging on keeps stepping every cooldown; trackpad momentum
// (a decaying tail of deltas) never steps because a step requires the delta to be growing or
// steady relative to the previous event.
export function createWheelPager(options: Partial<WheelPagerOptions> = {}) {
  const { thresholdPx, cooldownMs, burstGapMs } = { ...DEFAULT_WHEEL_PAGER_OPTIONS, ...options }

  let accumulated = 0
  let lastEventAt = Number.NEGATIVE_INFINITY
  let lastStepAt = Number.NEGATIVE_INFINITY
  let lastSign: StepDirection = 0
  let lastMagnitude = 0

  return {
    feed(deltaY: number, now: number): StepDirection {
      const sign = (Math.sign(deltaY) || 0) as StepDirection
      if (sign === 0) return 0

      const magnitude = Math.abs(deltaY)
      const isNewGesture = now - lastEventAt > burstGapMs || sign !== lastSign
      lastEventAt = now
      if (isNewGesture) {
        accumulated = 0
        lastMagnitude = 0
      }
      lastSign = sign

      const previousMagnitude = lastMagnitude
      lastMagnitude = magnitude
      accumulated += magnitude

      if (now - lastStepAt < cooldownMs) return 0
      if (accumulated < thresholdPx) return 0
      if (magnitude < previousMagnitude) return 0

      accumulated = 0
      lastStepAt = now
      return sign
    },

    // Steps triggered elsewhere (keyboard, navigation) share the cooldown.
    markStepped(now: number) {
      lastStepAt = now
      accumulated = 0
    },

    canStep(now: number) {
      return now - lastStepAt >= cooldownMs
    }
  }
}

export type WheelPager = ReturnType<typeof createWheelPager>

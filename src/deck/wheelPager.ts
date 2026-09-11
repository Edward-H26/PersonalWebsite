type WheelPagerOptions = {
  // Accumulated wheel distance that counts as one slide (a mouse notch is 100px in Chrome).
  thresholdPx: number
  // Minimum time between two slide steps, so continuous input pages at a readable pace.
  cooldownMs: number
  // Silence longer than this starts a new gesture and clears the accumulator.
  burstGapMs: number
}

const DEFAULT_WHEEL_PAGER_OPTIONS: WheelPagerOptions = {
  thresholdPx: 100,
  cooldownMs: 550,
  burstGapMs: 180
}

type StepDirection = -1 | 0 | 1

// Turns a stream of wheel deltas into slide steps. One mouse notch or 100px of trackpad travel
// steps once; holding the wheel or dragging on keeps stepping every cooldown; trackpad momentum
// (a decaying tail of deltas) never steps because a step requires the delta to be at least as
// strong as the strongest one seen since the last step.
export function createWheelPager(options: Partial<WheelPagerOptions> = {}) {
  const { thresholdPx, cooldownMs, burstGapMs } = { ...DEFAULT_WHEEL_PAGER_OPTIONS, ...options }

  let accumulated = 0
  let lastEventAt = Number.NEGATIVE_INFINITY
  let lastStepAt = Number.NEGATIVE_INFINITY
  let lastSign: StepDirection = 0
  let lastMagnitude = 0
  let peakMagnitude = 0

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
        peakMagnitude = 0
      }
      lastSign = sign

      // Momentum deltas are rounded, so a decaying tail repeats values (3, 3, 2, 2, 2, 1, 1)
      // rather than falling every event. Only a finger can push a delta back up, so a rise starts
      // a fresh push and every other event keeps the running peak.
      const isRising = magnitude > lastMagnitude
      lastMagnitude = magnitude
      const previousPeak = peakMagnitude
      peakMagnitude = isRising ? magnitude : Math.max(peakMagnitude, magnitude)
      accumulated += magnitude

      if (now - lastStepAt < cooldownMs) return 0
      if (accumulated < thresholdPx) return 0
      if (magnitude < previousPeak) return 0

      accumulated = 0
      peakMagnitude = 0
      lastStepAt = now
      return sign
    },

    // Steps triggered elsewhere (keyboard, navigation) share the cooldown.
    markStepped(now: number) {
      lastStepAt = now
      accumulated = 0
      peakMagnitude = 0
    },

    canStep(now: number) {
      return now - lastStepAt >= cooldownMs
    }
  }
}

import { useEffect, useState } from "react"

/**
 * Counts up to `steps`, one step per animation frame, so a component can mount its heavy parts a frame apart and give
 * each one's setup a task of its own instead of one long one.
 */
export function useFrameSteps(steps: number) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (step >= steps) return
    const frame = requestAnimationFrame(() => setStep((current) => current + 1))
    return () => cancelAnimationFrame(frame)
  }, [step, steps])

  return step
}

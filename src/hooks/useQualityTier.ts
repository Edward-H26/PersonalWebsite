import { useMemo } from "react"

export type QualityTier = "low" | "medium" | "high"

export function useQualityTier(): QualityTier {
  return useMemo(() => {
    if (typeof window === "undefined") return "high"

    const isCoarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false
    if (isCoarsePointer) return "low"

    const nav = window.navigator as Navigator & { deviceMemory?: number }
    const deviceMemory = nav.deviceMemory
    const hardwareConcurrency = nav.hardwareConcurrency

    if (deviceMemory != null && deviceMemory <= 4) return "medium"
    if (hardwareConcurrency != null && hardwareConcurrency <= 4) return "medium"

    return "high"
  }, [])
}



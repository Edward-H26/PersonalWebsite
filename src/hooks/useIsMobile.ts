import { useEffect, useState } from "react"

function getIsMobile(breakpointPx: number) {
  if (typeof window === "undefined") return false

  return (
    window.matchMedia(`(max-width: ${breakpointPx}px)`).matches ||
    window.matchMedia("(pointer: coarse)").matches
  )
}

export function useIsMobile(breakpointPx = 768) {
  const [isMobile, setIsMobile] = useState(() => getIsMobile(breakpointPx))

  useEffect(() => {
    const widthQuery = window.matchMedia(`(max-width: ${breakpointPx}px)`)
    const pointerQuery = window.matchMedia("(pointer: coarse)")
    const update = () => setIsMobile(getIsMobile(breakpointPx))

    update()
    widthQuery.addEventListener("change", update)
    pointerQuery.addEventListener("change", update)

    return () => {
      widthQuery.removeEventListener("change", update)
      pointerQuery.removeEventListener("change", update)
    }
  }, [breakpointPx])

  return isMobile
}

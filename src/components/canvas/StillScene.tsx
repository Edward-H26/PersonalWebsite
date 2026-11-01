import { useEffect } from "react"
import { useWorldStore } from "@/store/worldStore"
import { WorldScene } from "./WorldScene"
import type { StillShot } from "./camera"

/**
 * The scene alone, without the deck, held at a still's camera pose, for scripts/capture-og-image.mjs.
 * It shows the warmest light the scene has: the overview's undimmed sun with every road lantern lit.
 */
export function StillScene({ shot }: { shot: StillShot }) {
  useEffect(() => useWorldStore.getState().setRouteT(1), [])

  return <WorldScene section={0} still={shot} />
}

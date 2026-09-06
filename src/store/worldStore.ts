import { create } from "zustand"
import { clamp01 } from "@/utils/math"

// Ground height in world units at a world-space x/z, published by the island once it is built.
type GroundHeightSampler = (x: number, z: number) => number

// Horizontal look-around limit in radians (about 70 degrees either side of the road).
const LOOK_YAW_LIMIT = 1.2

interface WorldState {
  routeT: number
  overviewBlend: number
  titleCardBlend: number
  lookYaw: number
  groundHeightAt: GroundHeightSampler | null
  isEarthSceneReady: boolean
  isLoaderBypassed: boolean
  isLoadingOverlayVisible: boolean
  travelDir: 1 | -1
  mousePosition: { x: number; y: number }
}

interface WorldActions {
  setRouteT: (t: number) => void
  setOverviewBlend: (t: number) => void
  setTitleCardBlend: (t: number) => void
  setLookYaw: (yaw: number) => void
  setGroundHeightSampler: (sampler: GroundHeightSampler | null) => void
  setEarthSceneReady: (ready: boolean) => void
  setLoaderBypassed: (bypassed: boolean) => void
  setLoadingOverlayVisible: (visible: boolean) => void
  setTravelDir: (dir: 1 | -1) => void
  setMousePosition: (x: number, y: number) => void
}

type WorldStore = WorldState & WorldActions

export const useWorldStore = create<WorldStore>((set) => ({
  routeT: 0,
  overviewBlend: 0,
  titleCardBlend: 0,
  lookYaw: 0,
  groundHeightAt: null,
  isEarthSceneReady: false,
  isLoaderBypassed: false,
  isLoadingOverlayVisible: true,
  travelDir: 1,
  mousePosition: { x: 0, y: 0 },

  setRouteT: (t) => {
    set({ routeT: clamp01(t) })
  },

  setOverviewBlend: (t) => {
    set({ overviewBlend: clamp01(t) })
  },

  setTitleCardBlend: (t) => {
    set({ titleCardBlend: clamp01(t) })
  },

  setLookYaw: (yaw) => {
    set({ lookYaw: Math.max(-LOOK_YAW_LIMIT, Math.min(LOOK_YAW_LIMIT, yaw)) })
  },

  setGroundHeightSampler: (sampler) => {
    set({ groundHeightAt: sampler })
  },

  setEarthSceneReady: (ready) => {
    set({ isEarthSceneReady: ready })
  },

  setLoaderBypassed: (bypassed) => {
    set({ isLoaderBypassed: bypassed })
  },

  setLoadingOverlayVisible: (visible) => {
    set({ isLoadingOverlayVisible: visible })
  },

  setTravelDir: (dir) => {
    set({ travelDir: dir === -1 ? -1 : 1 })
  },

  setMousePosition: (x, y) => {
    set({ mousePosition: { x, y } })
  }
}))
